import type { GameState, StrategyResult, StrategyMode, Opponent } from '../types';
import { tilesToCounts } from './tiles';
import { calcShanten } from './shanten';
import { analyzeDiscards } from './efficiency';
import { estimateHandValue } from './handValue';
import { computePlacements } from '../store/gameStore';

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

  // Placement-awareness for final rounds
  const isLastRounds = gameState.currentRound === 'S3' || gameState.currentRound === 'S4';
  if (isLastRounds) {
    const placements = computePlacements(gameState.scores);
    const myPlacement = placements[0];
    let placementNote: string;
    if (myPlacement === 1) {
      placementNote = `目前第1位，注意防守保持領先。`;
    } else if (myPlacement >= 3) {
      placementNote = `最終局，目前第${myPlacement}位，需要進攻追分。`;
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

// Strategy mode labels and colors
export function strategyLabel(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '全力進攻';
    case 'flexible': return '靈活應對';
    case 'defense': return '完全防守';
  }
}

export function strategyEmoji(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '🟢';
    case 'flexible': return '🟡';
    case 'defense': return '🔴';
  }
}

export function strategyColor(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '#00b894';
    case 'flexible': return '#fdcb6e';
    case 'defense': return '#e17055';
  }
}
