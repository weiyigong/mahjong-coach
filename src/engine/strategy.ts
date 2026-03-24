import type { GameState, StrategyResult, StrategyMode, Opponent, DiscardRecommendation, RonPassAdvice } from '../types';
import { tilesToCounts, tileToIndex, tileDisplayName } from './tiles';
import { calcShanten, calcNormalShanten, calcChitoiShanten, findEffectiveTiles } from './shanten';
import { analyzeDiscards } from './efficiency';
import { estimateHandValue } from './handValue';
import { computePlacements } from '../store/gameStore';
import { evaluateWinValue, placementValue } from './placement';

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
      winProb
    );
    mode = pfResult.mode;
    explanation = pfResult.explanation;
  }

  // For defense mode, re-sort discards by safety (not efficiency)
  let sortedDiscards = [...discards];
  if (mode === 'defense') {
    sortedDiscards = sortedDiscards.sort((a, b) => b.safetyScore - a.safetyScore);
    sortedDiscards.forEach((d, i) => { d.rank = i + 1; });
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

  return {
    mode,
    explanation,
    discards: sortedDiscards,
    winProbability: winProb,
    expectedValue,
  };
}

// 2-of-3 push/fold framework (RiichiBooks):
// PUSH if 2+ of: (A) tenpai, (B) hand value >= 7700, (C) good wait (>=6 effective kinds)
// FOLD if 2+ of: (A) shanten>=1, (B) hand value <7700, (C) bad wait (<4 at tenpai, <3 pre-tenpai)
function evalPushFold(
  currentShanten: number,
  handValue: number,
  discards: ReturnType<typeof analyzeDiscards>,
  riichiOpponents: Opponent[],
  dangerousOpponents: Opponent[],
  suspiciousOpponents: Opponent[],
  winProb: number
): { mode: StrategyMode; explanation: string } {
  const hasAnyThreat = dangerousOpponents.length > 0 || riichiOpponents.length > 0;
  const allThreats = [...riichiOpponents, ...dangerousOpponents];

  // Determine effective kinds from best available discard
  const bestDiscard = discards[0];
  const bestTenpaiDiscard = discards.find(d => d.shantenAfter === 0);
  const effectiveKinds = currentShanten === 0
    ? (bestDiscard?.effectiveTileTypes ?? 0)
    : (bestTenpaiDiscard?.effectiveTileTypes ?? bestDiscard?.effectiveTileTypes ?? 0);

  // Push conditions
  const condPushA = currentShanten === 0;                // (A) tenpai
  const condPushB = handValue >= 7700;                   // (B) high value
  const condPushC = effectiveKinds >= 6;                 // (C) good wait

  // Fold conditions
  const condFoldA = currentShanten >= 1;                 // (A) not tenpai
  const condFoldB = handValue < 7700;                    // (B) low value
  const condFoldC = currentShanten === 0                 // (C) bad wait
    ? effectiveKinds < 4
    : effectiveKinds < 3;

  const pushScore = [condPushA, condPushB, condPushC].filter(Boolean).length;
  const foldScore = [condFoldA, condFoldB, condFoldC].filter(Boolean).length;

  // Without active threats: attack unless all 3 fold conditions are met
  if (!hasAnyThreat) {
    if (foldScore >= 3) {
      return {
        mode: 'defense',
        explanation: buildDefenseExplanation([], [], currentShanten),
      };
    }
    if (suspiciousOpponents.length > 0 && foldScore >= 2) {
      return {
        mode: 'flexible',
        explanation: buildFlexibleExplanation([], suspiciousOpponents, currentShanten, handValue),
      };
    }
    return {
      mode: 'attack',
      explanation: buildAttackExplanation(currentShanten, handValue, winProb),
    };
  }

  // With threats: apply 2-of-3 framework
  if (pushScore >= 2 && foldScore < 2) {
    return {
      mode: 'attack',
      explanation: buildPushExplanation(condPushA, condPushB, condPushC, handValue, effectiveKinds, allThreats),
    };
  }
  if (foldScore >= 2 && pushScore < 2) {
    return {
      mode: 'defense',
      explanation: buildFoldExplanation(condFoldA, condFoldB, condFoldC, allThreats, currentShanten),
    };
  }

  // Mixed / tie → flexible
  return {
    mode: 'flexible',
    explanation: buildFlexibleExplanation(
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
