import type { GameState, StrategyResult, StrategyMode, Opponent, DiscardRecommendation, RonPassAdvice, DealInAdvice, Wind } from '../types';
import { tilesToCounts, tileToIndex, tileDisplayName } from './tiles';
import { calcShanten, calcNormalShanten, calcChitoiShanten, findEffectiveTiles } from './shanten';
import { analyzeDiscards } from './efficiency';
import { estimateHandValue } from './handValue';
import { computePlacements } from '../store/gameStore';
import { evaluateWinValue, placementValue, getPlacement, simulateWin } from './placement';
import { estimateOpenHandValue } from './opponents';
import { evaluateRiichi } from './riichi';

// Main strategy engine: decides between attack, flexible, defense
export function calcStrategy(gameState: GameState): StrategyResult {
  const hand = [...gameState.myHand];
  if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);

  const openMentsuCount = gameState.myMelds.length;
  const counts = tilesToCounts(hand);
  const currentShanten = calcShanten(counts, openMentsuCount);

  // Get discard recommendations
  const discards = analyzeDiscards(gameState);

  // Check opponent states
  const riichiOpponents = gameState.opponents.filter(o => o.riichiTurn !== null);
  const dangerousOpponents = gameState.opponents.filter(o => o.dangerLevel === 'dangerous');
  const suspiciousOpponents = gameState.opponents.filter(o => o.dangerLevel === 'suspicious');

  // Estimate hand value
  const isDealer = gameState.seatWind === 'east';
  const handValue = estimateHandValue(
    hand,
    gameState.myMelds,
    gameState.roundWind,
    gameState.seatWind,
    gameState.doraIndicators,
    isDealer
  );

  // Estimate win probability based on shanten and turn
  const winProb = estimateWinProbability(currentShanten, gameState.turnNumber, openMentsuCount);

  // Expected value of winning
  const expectedValue = handValue * winProb;

  // Strategy decision logic — 2-of-3 push/fold framework (RiichiBooks)
  let mode: StrategyMode;
  let explanation: string;

  if (gameState.isRiichi) {
    // Already in riichi — just wait
    mode = 'attack';
    explanation = '已立直，等待和牌。注意摸牌后是否可以荣和。';
  } else {
    const pfResult = evalPushFold(
      currentShanten,
      handValue,
      discards,
      riichiOpponents,
      dangerousOpponents,
      suspiciousOpponents,
      winProb,
      gameState
    );
    mode = pfResult.mode;
    explanation = pfResult.explanation;
  }

  // Fix 3: Re-sort discards using weighted efficiency+safety scoring based on strategy mode.
  // Instead of efficiency-first with safety as tiebreaker (or vice versa for defense),
  // use a blended score where weights depend on the mode.
  let sortedDiscards = [...discards];
  {
    const effWeight = mode === 'attack' ? 0.8 : mode === 'flexible' ? 0.5 : mode === 'abandon' ? 0.4 : 0.2;
    const safetyWeight = mode === 'defense' ? 0.8 : mode === 'flexible' ? 0.5 : mode === 'abandon' ? 0.3 : 0.2;
    // Normalize: efficiency is 0-80ish, safety is 0-95. Scale efficiency to similar range.
    const maxEff = Math.max(1, ...sortedDiscards.map(d => d.effectiveTileCount));
    sortedDiscards.sort((a, b) => {
      // Shanten is still king — lower shanten always wins
      if (a.shantenAfter !== b.shantenAfter) return a.shantenAfter - b.shantenAfter;
      // Dora penalty still applies
      if (a.isDora !== b.isDora) return (a.isDora ? 1 : 0) - (b.isDora ? 1 : 0);
      // Weighted blend with connectivity bonus for isolated tiles
      // Low connectivity = isolated tile = bonus for discarding (subtract connectivity from score)
      const normEffA = (a.effectiveTileCount / maxEff) * 100;
      const normEffB = (b.effectiveTileCount / maxEff) * 100;
      const connPenaltyA = (a.connectivity ?? 0) * 3; // connected tiles penalized as discards
      const connPenaltyB = (b.connectivity ?? 0) * 3;
      const scoreA = normEffA * effWeight + a.safetyScore * safetyWeight - connPenaltyA;
      const scoreB = normEffB * effWeight + b.safetyScore * safetyWeight - connPenaltyB;
      return scoreB - scoreA;
    });
    sortedDiscards.forEach((d, i) => { d.rank = i + 1; });
  }

  // 電報 (intentional deal-in) check — only when in defense mode
  let dealInAdvice: DealInAdvice | undefined;
  if (mode === 'defense') {
    const dealIn = checkDealInStrategy(gameState);
    if (dealIn) {
      dealInAdvice = dealIn;
      if (dealIn.recommend) {
        const posNames: Record<Wind, string> = { east: '上家', south: '下家', west: '對家', north: '北家' };
        explanation += ` ⚡ 電報可行：考慮放銃給${posNames[dealIn.cheapTarget]}家（約${dealIn.cheapEstimate}點），避免${posNames[dealIn.dangerousTarget]}家的大牌（推定${dealIn.dangerousEstimate}點以上）`;

        // Mark tiles that are candidates for intentional deal-in:
        // dangerous to cheapTarget but genbutsu (or safer) for the dangerousTarget
        const cheapOpp = gameState.opponents.find(o => o.position === dealIn.cheapTarget);
        const dangerOpp = gameState.opponents.find(o => o.position === dealIn.dangerousTarget);
        if (cheapOpp && dangerOpp) {
          for (const d of sortedDiscards) {
            const safeForDangerous = d.safetyBreakdown.find(s => s.opponent === dangerOpp.position);
            const dangerForCheap = d.safetyBreakdown.find(s => s.opponent === cheapOpp.position);
            // Tile is genbutsu/safe for dangerous opponent but risky for cheap opponent = 電報 candidate
            if (safeForDangerous && safeForDangerous.score >= 90 &&
                dangerForCheap && dangerForCheap.score < 70) {
              d.safetyNote = `此牌對${posNames[dealIn.cheapTarget]}家危險但可接受（電報策略）`;
              d.dealInTarget = dealIn.cheapTarget;
            }
          }
        }
      }
    }
  }

  // Abandonment check: 七対子 transition and 型聽 pursuit
  const abandonOpts = checkAbandonmentOptions(gameState);

  // Override defense → abandon if chiitoi transition is viable
  if (mode === 'defense' && abandonOpts.shouldSwitchToAbandon) {
    mode = 'abandon';
    explanation = abandonOpts.explanation + '。' + explanation;
  }

  // 型聽 pursuit note for late rounds (shanten <= 1, S3/S4, turn >= 12)
  if (abandonOpts.tenpaiPursuitAdvice) {
    explanation = abandonOpts.tenpaiPursuitAdvice + explanation;
  }

  // Last-resort 聽牌料 note: deep in shanten in the final round
  const isLastRoundFinal = gameState.currentRound === 'S3' || gameState.currentRound === 'S4';
  if (gameState.turnNumber >= 14 && currentShanten >= 3 && isLastRoundFinal) {
    explanation = '殘局注意：即使聽牌難度大，仍建議朝聽牌方向努力，避免無聽罰分。' + explanation;
  }

  // For abandon mode (七対子 path), re-rank discards to prefer isolated tiles
  if (mode === 'abandon' && abandonOpts.chitoiShanten <= 2) {
    sortedDiscards = reRankDiscardForChiitoi(sortedDiscards, counts);
  }

  // Placement-awareness: evaluate whether winning would improve placement
  const scores = gameState.scores ?? [25000, 25000, 25000, 25000];
  const winEval = evaluateWinValue(scores, 0, handValue, null, isDealer);

  // At tenpai, prepend a placement change note
  if (currentShanten === 0) {
    let placementNote: string;
    if (winEval.placementDelta > 0) {
      const valBefore = placementValue(winEval.placementBefore);
      const valAfter = placementValue(winEval.placementAfter);
      const umaDiff = Math.abs(valAfter - valBefore);
      placementNote = `和了可從第${winEval.placementBefore}位升至第${winEval.placementAfter}位 (+${umaDiff} uma差)。`;
    } else {
      placementNote = `和了仍維持第${winEval.placementBefore}位。`;
    }
    explanation = placementNote + explanation;

    // Winning would change placement: upgrade flexible to attack
    if (winEval.placementDelta > 0 && mode === 'flexible') {
      mode = 'attack';
      explanation = '(昇位機會) ' + explanation;
    }
  }

  // Placement-awareness for final rounds
  const isLastRounds = gameState.currentRound === 'S3' || gameState.currentRound === 'S4';
  if (isLastRounds) {
    const placements = computePlacements(scores);
    const myPlacement = placements[0];
    let placementNote: string;
    if (myPlacement === 1) {
      // Check if we have a commanding lead (>12000 points ahead of 2nd place)
      const sortedScores = [...scores].sort((a, b) => b - a);
      const leadOver2nd = scores[0] - sortedScores[1];
      if (leadOver2nd > 12000) {
        placementNote = `大幅領先第1位，注意防守鞏固。`;
        if (mode === 'attack') mode = 'flexible';
      } else {
        placementNote = `目前第1位，注意防守保持領先。`;
      }
    } else if (myPlacement >= 3) {
      placementNote = `最終局，目前第${myPlacement}位，需要進攻追分。`;
      if (mode === 'flexible') mode = 'attack';
    } else {
      placementNote = `目前第2位，保持穩定爭取1位。`;
    }
    explanation = placementNote + explanation;
  }

  // Riichi vs dama advice: only for closed tenpai hands
  const riichiAdvice = currentShanten === 0 && gameState.myMelds.length === 0 && !gameState.isRiichi
    ? evaluateRiichi(gameState) ?? undefined
    : undefined;

  return {
    mode,
    explanation,
    discards: sortedDiscards,
    winProbability: winProb,
    expectedValue,
    dealInAdvice,
    riichiAdvice,
  };
}

// Situational push/fold score adjustments based on game context (Suphx-style policy adaptation)
interface SituationalAdjustments {
  handValueThreshold: number; // adjusted from baseline 7700
  pushScoreBonus: number;     // fractional bonus added to pushScore
  foldScoreBonus: number;     // fractional bonus added to foldScore
  contextNote: string;        // Chinese explanation of why strategy shifted
}

function calcSituationalAdjustments(
  gameState: GameState,
  currentShanten: number
): SituationalAdjustments {
  const scores = gameState.scores ?? [25000, 25000, 25000, 25000];
  const isDealer = gameState.seatWind === 'east';
  const riichiOpponents = gameState.opponents.filter(o => o.riichiTurn !== null);

  let handValueThreshold = 7700;
  let pushScoreBonus = 0;
  let foldScoreBonus = 0;
  const notes: string[] = [];

  const isSouthRound = gameState.currentRound.startsWith('S');
  const roundNum = parseInt(gameState.currentRound[1] ?? '1', 10);
  const isLateGame = isSouthRound && roundNum >= 3; // S3/S4
  const isMidGame = isSouthRound && roundNum <= 2;  // S1/S2

  const myScore = scores[0];
  const sortedScores = [...scores].sort((a, b) => b - a);
  const placements = computePlacements(scores);
  const myPlacement = placements[0];

  // --- 1. Score-Differential Aware Thresholds (S3/S4) ---
  if (isLateGame) {
    const leadOver2nd = myScore - sortedScores[1];
    const trailBehind1st = sortedScores[0] - myScore;

    if (leadOver2nd >= 15000) {
      // Commanding lead: raise threshold (harder to push) → fold more aggressively to protect lead
      const ratio = Math.min(1.0, (leadOver2nd - 15000) / 10000);
      handValueThreshold = Math.round(9000 + ratio * 6000); // 9000..15000
      foldScoreBonus += 0.4 + ratio * 0.4;                   // 0.4..0.8
      notes.push(`領先${Math.round(leadOver2nd / 1000)}k，護航模式`);
    } else if (trailBehind1st >= 20000) {
      // Deep deficit: lower threshold (easier to push) → push aggressively to catch up
      const ratio = Math.min(1.0, (trailBehind1st - 20000) / 15000);
      handValueThreshold = Math.round(6000 - ratio * 2000); // 6000..4000
      pushScoreBonus += 0.5 + ratio * 0.5;                   // 0.5..1.0
      notes.push(`落後${Math.round(trailBehind1st / 1000)}k，終局追分`);
    } else if (leadOver2nd > 0) {
      // Modest lead: slight fold preference (interpolated)
      const ratio = Math.min(1.0, leadOver2nd / 15000);
      handValueThreshold = Math.round(7700 + ratio * 1300); // 7700..9000
      foldScoreBonus += ratio * 0.4;
    } else if (trailBehind1st > 0) {
      // Modest deficit: slight push preference (interpolated)
      const ratio = Math.min(1.0, trailBehind1st / 20000);
      handValueThreshold = Math.round(7700 - ratio * 1700); // 7700..6000
      pushScoreBonus += ratio * 0.5;
    }
  }

  // --- 2. Round-Aware Aggression Curve ---
  if (isLateGame) {
    if (myPlacement === 4) {
      // 4th in S3/S4: placement score dominates — push almost everything
      pushScoreBonus += 1.0;
      notes.push('末位全力進攻');
    } else if (myPlacement === 3) {
      pushScoreBonus += 0.5;
      notes.push('3位積極追分');
    } else if (myPlacement === 1 && !notes.some(n => n.includes('領先'))) {
      // Leading without commanding margin: mild fold preference
      foldScoreBonus += 0.2;
      notes.push('首位注意防守');
    }
  } else if (isMidGame && myPlacement >= 3) {
    // S1/S2, lower half: loosen push threshold
    pushScoreBonus += 0.3;
    notes.push('中盤下位追分');
  }

  // --- 3. Dealer Premium ---
  // Dealer wins pay 1.5×; winning extends round via ren-chan
  if (isDealer) {
    pushScoreBonus += 0.5;
    notes.push('莊家積極進攻');
  }

  // --- 4. Facing Dealer Riichi ---
  // Dealer ron is 1.5× damage — fold earlier
  const facingDealerRiichi = riichiOpponents.some(o => o.position === gameState.roundWind);
  if (facingDealerRiichi) {
    foldScoreBonus += 0.8;
    notes.push('對莊家立直加倍警戒');
  }

  // --- 4b. Facing ANY Riichi ---
  // Any riichi increases deal-in risk significantly
  if (riichiOpponents.length > 0) {
    foldScoreBonus += 0.3;
    notes.push('對立直加強警戒');
  }

  // --- 5. Oya Ren-chan (連荘) Value ---
  // Dealer tenpai in S3/S4 while leading: staying dealer stops opponents catching up,
  // even a cheap tenpai (1000-2000 pts) is strategically valuable
  if (isDealer && isLateGame && myPlacement === 1 && currentShanten === 0) {
    pushScoreBonus += 0.8;
    foldScoreBonus = Math.max(0, foldScoreBonus - 0.5); // counteract fold pressure
    notes.push('莊家聽牌連莊價值極高');
  }

  return {
    handValueThreshold,
    pushScoreBonus,
    foldScoreBonus,
    contextNote: notes.join('；'),
  };
}

// 2-of-3 push/fold framework (RiichiBooks), with context-sensitive situational adjustments:
// PUSH if 2+ of: (A) tenpai, (B) hand value >= threshold, (C) good wait (>=6 effective kinds)
// FOLD if 2+ of: (A) shanten>=1, (B) hand value < threshold, (C) bad wait (<4 at tenpai, <3 pre-tenpai)
// threshold and bonus scores are adjusted by calcSituationalAdjustments()
function evalPushFold(
  currentShanten: number,
  handValue: number,
  discards: ReturnType<typeof analyzeDiscards>,
  riichiOpponents: Opponent[],
  dangerousOpponents: Opponent[],
  suspiciousOpponents: Opponent[],
  winProb: number,
  gameState: GameState
): { mode: StrategyMode; explanation: string } {
  // Fix 2: Only dangerous (score>=55) or riichi opponents are real threats.
  // Suspicious opponents (score 25-54) add a small safety preference to discard ranking
  // but do NOT change the strategy mode or trigger the push/fold framework.
  const hasAnyThreat = dangerousOpponents.length > 0 || riichiOpponents.length > 0;
  const allThreats = [...riichiOpponents, ...dangerousOpponents];

  // Determine effective kinds from best available discard
  const bestDiscard = discards[0];
  const bestTenpaiDiscard = discards.find(d => d.shantenAfter === 0);
  const effectiveKinds = currentShanten === 0
    ? (bestDiscard?.effectiveTileTypes ?? 0)
    : (bestTenpaiDiscard?.effectiveTileTypes ?? bestDiscard?.effectiveTileTypes ?? 0);

  // Compute situational adjustments
  const adj = calcSituationalAdjustments(gameState, currentShanten);
  const threshold = adj.handValueThreshold;
  const contextPrefix = adj.contextNote ? `${adj.contextNote}。` : '';

  // Push conditions (using context-adjusted threshold)
  const condPushA = currentShanten === 0;       // (A) tenpai
  const condPushB = handValue >= threshold;      // (B) high value
  const condPushC = effectiveKinds >= 6;         // (C) good wait

  // Fold conditions (using context-adjusted threshold)
  const condFoldA = currentShanten >= 1;         // (A) not tenpai
  const condFoldB = handValue < threshold;       // (B) low value
  const condFoldC = currentShanten === 0         // (C) bad wait
    ? effectiveKinds < 4
    : effectiveKinds < 3;

  // Apply fractional situational bonuses to the integer condition scores
  const pushScore = [condPushA, condPushB, condPushC].filter(Boolean).length + adj.pushScoreBonus;
  const foldScore = [condFoldA, condFoldB, condFoldC].filter(Boolean).length + adj.foldScoreBonus;

  // Fix 2: Without dangerous/riichi threats, stay in attack or flexible.
  // Suspicious opponents do NOT trigger defense — they only shift to flexible.
  if (!hasAnyThreat) {
    if (foldScore >= 3) {
      return {
        mode: 'defense',
        explanation: contextPrefix + buildDefenseExplanation([], [], currentShanten),
      };
    }
    // Flexible: suspicious opponents present + fold conditions lean that way,
    // OR strong fold conditions on their own (poor hand shape)
    if ((suspiciousOpponents.length > 0 && foldScore >= 2) || foldScore >= 2.5) {
      return {
        mode: 'flexible',
        explanation: contextPrefix + buildFlexibleExplanation([], suspiciousOpponents, currentShanten, handValue),
      };
    }
    return {
      mode: 'attack',
      explanation: contextPrefix + buildAttackExplanation(currentShanten, handValue, winProb),
    };
  }

  // With threats: apply 2-of-3 framework (scores are now context-adjusted floats)
  if (pushScore >= 2 && foldScore < 2) {
    return {
      mode: 'attack',
      explanation: contextPrefix + buildPushExplanation(condPushA, condPushB, condPushC, handValue, effectiveKinds, allThreats),
    };
  }
  if (foldScore >= 2 && pushScore < 2) {
    return {
      mode: 'defense',
      explanation: contextPrefix + buildFoldExplanation(condFoldA, condFoldB, condFoldC, allThreats, currentShanten),
    };
  }

  // Mixed / tie → flexible
  return {
    mode: 'flexible',
    explanation: contextPrefix + buildFlexibleExplanation(
      dangerousOpponents,
      [...riichiOpponents, ...suspiciousOpponents],
      currentShanten,
      handValue
    ),
  };
}

function buildPushExplanation(
  condA: boolean,
  condB: boolean,
  condC: boolean,
  handValue: number,
  effectiveKinds: number,
  threats: Opponent[]
): string {
  const parts: string[] = [];
  if (condA) parts.push('已聽牌');
  if (condB) parts.push(`手牌高(约${handValue}点)`);
  if (condC) parts.push(`等待良好(${effectiveKinds}种)`);

  const threatStr = threats.length > 0
    ? threats.slice(0, 2).map(o => {
        const posMap: Record<string, string> = { east: '上家', south: '下家', west: '對家', north: '北家' };
        return posMap[o.position] || o.position;
      }).join('、') + '有威脅，'
    : '';

  return `${parts.join('且')}，${threatStr}進攻價值高，建議繼續進攻！`;
}

function buildFoldExplanation(
  condA: boolean,
  condB: boolean,
  condC: boolean,
  threats: Opponent[],
  shanten: number
): string {
  const parts: string[] = [];
  if (condA) parts.push(`${shanten}向聽`);
  if (condB) parts.push('手牌價值低');
  if (condC) parts.push('等待較差');

  const names = threats.slice(0, 2).map(o => {
    const posMap: Record<string, string> = { east: '上家', south: '下家', west: '對家', north: '北家' };
    return posMap[o.position] || o.position;
  }).join('、');

  const threatStr = names ? `${names}威脅，` : '';
  return `${parts.join('且')}，${threatStr}放铳風險過高，建議打安全牌防守。`;
}

function estimateWinProbability(shanten: number, turn: number, openMentsuCount: number): number {
  if (shanten === -1) return 1.0;

  // Rough estimation: depends on shanten and remaining turns
  // Average game: 18 turns total
  const remainingTurns = Math.max(1, 18 - turn);
  const tilesNeeded = shanten + 1;

  // Probability that we draw the needed tiles in remaining turns
  // Simplified: ~30% effective tiles in wall, need to hit 'tilesNeeded' of them
  const drawsNeeded = tilesNeeded;
  const successProb = Math.pow(0.4, drawsNeeded) * Math.min(1, remainingTurns / (drawsNeeded * 2));

  return Math.min(0.95, Math.max(0.02, successProb));
}

function buildAttackExplanation(shanten: number, handValue: number, winProb: number): string {
  if (shanten === -1) return '已和牌！';
  if (shanten === 0) {
    const probPct = Math.round(winProb * 100);
    return `已聽牌，手牌價值约${handValue}点，積極進攻！`;
  }
  return `形势樂觀，繼續進攻。手牌價值约${handValue}点。`;
}

function buildFlexibleExplanation(
  dangerous: Opponent[],
  suspicious: Opponent[],
  shanten: number,
  handValue: number
): string {
  const threats = [...dangerous, ...suspicious];
  if (threats.length === 0) return `${shanten}向聽，靈活應對。`;

  const threatNames = threats.slice(0, 2).map(o => {
    const posMap: Record<string, string> = { east: '上家', south: '下家', west: '對家', north: '北家' };
    return posMap[o.position] || o.position;
  }).join('、');

  return `${threatNames}有危險信号，優先打安全牌維持效率。手牌约${handValue}点，可考虑靈活路线。`;
}

function buildDefenseExplanation(
  dangerous: Opponent[],
  riichi: Opponent[],
  shanten: number
): string {
  const allThreats = [...riichi, ...dangerous];
  if (allThreats.length === 0) return '建議防守，打安全牌。';

  const names = allThreats.slice(0, 2).map(o => {
    const posMap: Record<string, string> = { east: '上家', south: '下家', west: '對家', north: '北家' };
    return posMap[o.position] || o.position;
  }).join('、');

  const reason = riichi.length > 0 ? '已立直' : '疑似聽牌';
  return `${names}${reason}，形势危險。${shanten >= 2 ? '放铳風險过高，' : ''}建議打最安全的牌防守。`;
}

// Evaluate abandonment / transition options
interface AbandonmentCheck {
  shouldSwitchToAbandon: boolean;
  chitoiShanten: number;
  normalShanten: number;
  pairCount: number;
  explanation: string;
  tenpaiPursuitAdvice: string;
}

function checkAbandonmentOptions(gameState: GameState): AbandonmentCheck {
  const hand = [...gameState.myHand];
  if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);
  const openMentsuCount = gameState.myMelds.length;
  const counts = tilesToCounts(hand);

  const normalShanten = calcNormalShanten(counts, openMentsuCount);
  const chitoiShanten = openMentsuCount === 0 ? calcChitoiShanten(counts) : 99;
  const currentShanten = Math.min(normalShanten, chitoiShanten);

  let pairCount = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 2) pairCount++;
  }

  let explanation = '';
  let shouldSwitchToAbandon = false;

  // a. 七対子 transition: chiitoi is at least as good as normal AND within reach
  if (chitoiShanten <= normalShanten && chitoiShanten <= 2) {
    explanation = `配弃：七対子轉換可行（${chitoiShanten}向聽），建議保留對子打單張`;
    shouldSwitchToAbandon = true;
  }

  // b. 型聽 pursuit: S3/S4, shanten <= 1, turn >= 12 — noten penalty matters
  let tenpaiPursuitAdvice = '';
  const isLastRounds = gameState.currentRound === 'S3' || gameState.currentRound === 'S4';
  if (isLastRounds && gameState.turnNumber >= 12 && currentShanten <= 1) {
    tenpaiPursuitAdvice = `終局倒數，距聽牌僅${currentShanten + 1}步，優先追求聽牌料（各無聽家-1000罰分）。`;
  }

  // c. Full fold with pair hoarding: 4+ pairs, note chiitoi as backup
  if (pairCount >= 4 && chitoiShanten <= 3 && !shouldSwitchToAbandon) {
    explanation = `手中已有${pairCount}對，七対子（${chitoiShanten}向聽）可作防守備案。`;
  }

  return { shouldSwitchToAbandon, chitoiShanten, normalShanten, pairCount, explanation, tenpaiPursuitAdvice };
}

// Re-rank discards for 七対子 path: prefer discarding isolated tiles over pairs
function reRankDiscardForChiitoi(
  discards: DiscardRecommendation[],
  counts: number[]
): DiscardRecommendation[] {
  const sorted = [...discards].sort((a, b) => {
    const aIsolated = counts[tileToIndex(a.tile)] < 2;
    const bIsolated = counts[tileToIndex(b.tile)] < 2;
    // Isolated tiles (non-pairs) should be discarded first
    if (aIsolated !== bIsolated) return aIsolated ? -1 : 1;
    // Among same category, prefer safer tiles
    return b.safetyScore - a.safetyScore;
  });

  sorted.forEach((d, i) => {
    d.rank = i + 1;
    if (counts[tileToIndex(d.tile)] < 2) {
      d.reason = `七対子路線：保留對子，優先打出單張${tileDisplayName(d.tile)}`;
    }
  });

  return sorted;
}

// Map opponent Wind position to score array index (scores = [self, south, west, north])
function oppPositionToScoreIndex(position: Wind): number {
  switch (position) {
    case 'south': return 1;
    case 'west': return 2;
    case 'north': return 3;
    default: return 1;
  }
}

// Count visible dora among an opponent's melds and our hand
function countVisibleDora(gameState: GameState): number {
  if (gameState.doraIndicators.length === 0) return 0;
  // A simple approximation: count doraIndicators as proxy for exposed dora count
  return gameState.doraIndicators.length;
}

/**
 * Phase 5 — 電報 (intentional deal-in) check.
 *
 * Returns advice when it's strategically correct to intentionally deal into
 * a cheap hand to prevent a dangerous opponent from winning big.
 */
export function checkDealInStrategy(gameState: GameState): DealInAdvice | null {
  const { opponents, scores } = gameState;

  // Need at least 2 opponents with meaningful info
  if (opponents.length < 2) return null;

  // --- Find the MOST dangerous opponent ---
  const sortedByDanger = [...opponents].sort((a, b) => {
    // Riichi always tops the danger list
    const aRiichi = a.riichiTurn !== null ? 1 : 0;
    const bRiichi = b.riichiTurn !== null ? 1 : 0;
    if (aRiichi !== bRiichi) return bRiichi - aRiichi;
    return b.dangerScore - a.dangerScore;
  });

  const mostDangerous = sortedByDanger[0];
  // Only proceed if the most dangerous opponent is actually threatening
  if (mostDangerous.dangerLevel === 'normal' && mostDangerous.riichiTurn === null) return null;

  // --- Estimate dangerous hand value ---
  const doraCount = countVisibleDora(gameState);
  const { minValue: dangerMin, maxValue: dangerMax } = estimateOpenHandValue(
    mostDangerous,
    gameState.roundWind,
    doraCount
  );
  // Use a pessimistic estimate for the dangerous hand
  const dangerousEstimate = mostDangerous.riichiTurn !== null
    ? Math.round((dangerMin + dangerMax) / 2)
    : dangerMax;

  // If dangerous hand isn't threatening enough, skip
  if (dangerousEstimate < 3900) return null;

  // --- Find a CHEAP target opponent ---
  // Criteria: 2+ open melds with no yakuhai → likely cheap hand
  const cheapCandidates = opponents.filter(opp => {
    if (opp === mostDangerous) return false;
    if (opp.riichiTurn !== null) return false; // riichi is never "cheap"
    if (opp.melds.length < 2) return false;    // need 2+ open melds

    // Check if ANY meld contains yakuhai
    const roundWindVal = getWindHonorValue(gameState.roundWind);
    const seatWindVal = getWindHonorValue(opp.position);
    for (const meld of opp.melds) {
      for (const tile of meld.tiles) {
        if (tile.suit === 'honor') {
          if (tile.value >= 5) return false;                                      // dragon yakuhai
          if (tile.value === roundWindVal || tile.value === seatWindVal) return false; // wind yakuhai
        }
      }
    }
    return true;
  });

  if (cheapCandidates.length === 0) return null;

  // Pick the cheapest candidate (fewest melds, or lowest danger score)
  const cheapTarget = cheapCandidates.sort((a, b) => {
    const { maxValue: aMax } = estimateOpenHandValue(a, gameState.roundWind, 0);
    const { maxValue: bMax } = estimateOpenHandValue(b, gameState.roundWind, 0);
    return aMax - bMax;
  })[0];

  const { maxValue: cheapMax } = estimateOpenHandValue(cheapTarget, gameState.roundWind, 0);
  const cheapEstimate = cheapMax;

  // --- Check the 2x threshold: deal-in must be at least 2x cheaper ---
  if (cheapEstimate >= dangerousEstimate * 0.5) return null;

  // --- Placement impact analysis ---
  const myScoreIndex = 0;
  const cheapScoreIndex = oppPositionToScoreIndex(cheapTarget.position);
  const dangerScoreIndex = oppPositionToScoreIndex(mostDangerous.position);

  const currentPlacements = getPlacement(scores as number[]);
  const myCurrentPlacement = currentPlacements[myScoreIndex];

  // Simulate dealing into cheap hand (I lose cheapEstimate, cheapTarget gains it)
  const scoresAfterCheap = simulateWin(
    scores as number[], cheapScoreIndex, myScoreIndex, cheapEstimate, false
  );
  const placementsAfterCheap = getPlacement(scoresAfterCheap);
  const myPlacementAfterCheap = placementsAfterCheap[myScoreIndex];

  // Simulate dangerous opponent winning via tsumo (I pay roughly 1/4 of value for non-dealer tsumo)
  const dangerOppIsDealer = mostDangerous.position === gameState.roundWind;
  const myTsumoPay = dangerOppIsDealer
    ? Math.round(dangerousEstimate / 3)
    : Math.round(dangerousEstimate / 4);
  const scoresAfterDangerous = [...scores as number[]];
  scoresAfterDangerous[myScoreIndex] -= myTsumoPay;
  scoresAfterDangerous[dangerScoreIndex] += myTsumoPay;
  const placementsAfterDangerous = getPlacement(scoresAfterDangerous);
  const myPlacementAfterDangerous = placementsAfterDangerous[myScoreIndex];

  const posNames: Record<Wind, string> = { east: '上家', south: '下家', west: '對家', north: '北家' };

  const placementImpactCheap = myPlacementAfterCheap === myCurrentPlacement
    ? `仍維持第${myCurrentPlacement}位`
    : `從第${myCurrentPlacement}位變為第${myPlacementAfterCheap}位`;

  const placementImpactDangerous = myPlacementAfterDangerous === myCurrentPlacement
    ? `仍維持第${myCurrentPlacement}位`
    : `從第${myCurrentPlacement}位變為第${myPlacementAfterDangerous}位`;

  // Only recommend deal-in if placement impact favors it:
  // cheap deal-in keeps same or better placement, AND dangerous win is worse placement
  const placementFavors = myPlacementAfterCheap <= myCurrentPlacement
    && myPlacementAfterDangerous >= myCurrentPlacement;

  const recommend = placementFavors;

  const reason = recommend
    ? `放銃${posNames[cheapTarget.position]}（約${cheapEstimate}點）可防止${posNames[mostDangerous.position]}的大牌（推定${dangerousEstimate}點以上）`
    : `電報條件未完全滿足，僅供参考`;

  return {
    recommend,
    cheapTarget: cheapTarget.position,
    cheapEstimate,
    dangerousTarget: mostDangerous.position,
    dangerousEstimate,
    placementImpactCheap,
    placementImpactDangerous,
    reason,
  };
}

// Helper: convert Wind to honor tile value (matching tiles.ts windToHonorValue)
function getWindHonorValue(wind: Wind): number {
  switch (wind) {
    case 'east': return 1;
    case 'south': return 2;
    case 'west': return 3;
    case 'north': return 4;
  }
}

// Evaluate whether to ron or pass (見逃) for tsumo
export function evaluateRonPass(gameState: GameState): RonPassAdvice {
  const isDealer = gameState.seatWind === 'east';
  const scores = gameState.scores ?? [25000, 25000, 25000, 25000];

  const hand = [...gameState.myHand];
  if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);

  const ronValue = estimateHandValue(
    hand,
    gameState.myMelds,
    gameState.roundWind,
    gameState.seatWind,
    gameState.doraIndicators,
    isDealer
  );

  // Tsumo gets 門前清自摸 (+1翻) if closed hand (no open non-kan melds)
  const isClosed = gameState.myMelds.filter(m => m.type !== 'closedKan').length === 0;
  const tsumoValue = isClosed ? Math.round(ronValue * 1.25) : ronValue;

  // Tiles left in wall: starts at 70, decreases ~4 per turn (4 players each draw)
  const tilesLeftInWall = Math.max(4, 70 - gameState.turnNumber * 4);

  // Count remaining winning tiles across all visible tiles
  const handForCalc = [...gameState.myHand];
  const openMentsuCount = gameState.myMelds.length;
  const counts = tilesToCounts(handForCalc);
  const effectiveTileIndices = findEffectiveTiles(counts, openMentsuCount);

  // Build visible tile counts to estimate remaining
  const allVisible: number[] = new Array(34).fill(0);
  for (const t of gameState.myHand) allVisible[tileToIndex(t)]++;
  if (gameState.lastDrawnTile) allVisible[tileToIndex(gameState.lastDrawnTile)]++;
  for (const t of gameState.myDiscards) allVisible[tileToIndex(t)]++;
  for (const m of gameState.myMelds) for (const t of m.tiles) allVisible[tileToIndex(t)]++;
  for (const opp of gameState.opponents) {
    for (const d of opp.discards) allVisible[tileToIndex(d.tile)]++;
    for (const m of opp.melds) for (const t of m.tiles) allVisible[tileToIndex(t)]++;
  }

  let winningTilesRemaining = 0;
  for (const idx of effectiveTileIndices) {
    winningTilesRemaining += Math.max(0, 4 - allVisible[idx]);
  }

  const tsumoProb = Math.min(0.95, winningTilesRemaining / tilesLeftInWall);

  // Placement impact for ron vs tsumo
  let loserScoreIndex: number | null = null;
  if (gameState.winningTileFrom) {
    const loserOppIndex = gameState.opponents.findIndex(o => o.position === gameState.winningTileFrom);
    if (loserOppIndex >= 0) loserScoreIndex = loserOppIndex + 1;
  }

  const ronEval = evaluateWinValue(scores, 0, ronValue, loserScoreIndex, isDealer);
  const tsumoEval = evaluateWinValue(scores, 0, tsumoValue, null, isDealer);

  const dangerousOpponents = gameState.opponents.filter(
    o => o.dangerLevel === 'dangerous' || o.riichiTurn !== null
  );

  const ronChangesPlacement = ronEval.placementDelta > 0;
  const tsumoChangesPlacement = tsumoEval.placementDelta > 0;
  const expectedValuePassing = tsumoValue * tsumoProb;

  let shouldRon = true;
  let reason = '';

  if (gameState.turnNumber >= 14) {
    shouldRon = true;
    reason = `局末（第${gameState.turnNumber}巡），剩余牌少，立即榮和保穩。`;
  } else if (dangerousOpponents.length >= 2) {
    shouldRon = true;
    reason = `${dangerousOpponents.length}家危險，見逃後放铳風險過高，建議立即榮和。`;
  } else if (ronChangesPlacement) {
    shouldRon = true;
    reason = `榮和可從第${ronEval.placementBefore}位升至第${ronEval.placementAfter}位，立即榮和！`;
  } else if (tsumoChangesPlacement && !ronChangesPlacement && tsumoProb > 0.15) {
    shouldRon = false;
    reason = `摸牌勝可從第${tsumoEval.placementBefore}位升至第${tsumoEval.placementAfter}位，而榮和無法昇位。摸牌概率${Math.round(tsumoProb * 100)}%，建議見逃等摸牌。`;
  } else if (expectedValuePassing < ronValue) {
    shouldRon = true;
    reason = `期望值：榮和${ronValue}点 > 見逃期望${Math.round(expectedValuePassing)}点，建議榮和。`;
  } else {
    shouldRon = true;
    reason = `摸牌概率偏低（${Math.round(tsumoProb * 100)}%），進攻價值高，建議榮和。`;
  }

  return {
    shouldRon,
    ronValue,
    tsumoValue,
    ronPlacement: ronEval.placementAfter,
    tsumoPlacement: tsumoEval.placementAfter,
    tsumoProb,
    reason,
  };
}

// Strategy mode labels and colors
export function strategyLabel(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '全力進攻';
    case 'flexible': return '靈活應對';
    case 'defense': return '完全防守';
    case 'abandon': return '配弃轉換';
  }
}

export function strategyEmoji(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '🟢';
    case 'flexible': return '🟡';
    case 'defense': return '🔴';
    case 'abandon': return '🔄';
  }
}

export function strategyColor(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '#00b894';
    case 'flexible': return '#fdcb6e';
    case 'defense': return '#e17055';
    case 'abandon': return '#a29bfe';
  }
}
