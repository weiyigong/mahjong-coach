import type { GameState, StrategyResult, StrategyMode, Opponent } from '../types';
import { tilesToCounts } from './tiles';
import { calcShanten } from './shanten';
import { analyzeDiscards } from './efficiency';
import { estimateHandValue } from './handValue';

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

  const hasDangerousOpponent = dangerousOpponents.length > 0;
  const hasRiichiOpponent = riichiOpponents.length > 0;
  const multipleThreats = (dangerousOpponents.length + riichiOpponents.length) >= 2;

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

  // Risk assessment: average danger of tiles we'd need to discard
  const avgDanger = discards.length > 0
    ? discards.slice(0, 3).reduce((sum, d) => sum + (100 - d.safetyScore), 0) / Math.min(3, discards.length)
    : 50;

  // Strategy decision logic
  let mode: StrategyMode;
  let explanation: string;

  if (gameState.isRiichi) {
    // Already in riichi — just wait
    mode = 'attack';
    explanation = '已立直，等待和牌。注意摸牌后是否可以荣和。';
  } else if (hasRiichiOpponent && currentShanten >= 2) {
    // High shanten vs riichi = full defense
    mode = 'defense';
    explanation = buildDefenseExplanation(dangerousOpponents, riichiOpponents, currentShanten);
  } else if (hasRiichiOpponent && currentShanten >= 1) {
    // 1-2 shanten vs riichi = flexible, lean toward defense
    const safeDiscardExists = discards.some(d => d.safetyScore >= 80);
    if (safeDiscardExists) {
      mode = 'flexible';
      explanation = buildFlexibleExplanation(dangerousOpponents, riichiOpponents, currentShanten, handValue);
    } else {
      mode = 'defense';
      explanation = buildDefenseExplanation(dangerousOpponents, riichiOpponents, currentShanten);
    }
  } else if (multipleThreats && currentShanten >= 2) {
    mode = 'defense';
    explanation = '多家危险，形势不利，建议防守。';
  } else if (hasDangerousOpponent && currentShanten >= 3) {
    mode = 'defense';
    explanation = buildDefenseExplanation(dangerousOpponents, riichiOpponents, currentShanten);
  } else if (hasDangerousOpponent && currentShanten <= 1) {
    // We're close to tenpai but there's danger
    if (handValue >= 8000) {
      mode = 'flexible';
      explanation = `手牌价值高(约${handValue}点)，可考虑灵活应对。`;
    } else {
      mode = 'flexible';
      explanation = buildFlexibleExplanation(dangerousOpponents, riichiOpponents, currentShanten, handValue);
    }
  } else if (currentShanten <= 0) {
    // Tenpai or better
    mode = 'attack';
    explanation = buildAttackExplanation(currentShanten, handValue, winProb);
  } else if (currentShanten === 1) {
    if (suspiciousOpponents.length > 0) {
      mode = 'flexible';
      explanation = buildFlexibleExplanation(dangerousOpponents, suspiciousOpponents, currentShanten, handValue);
    } else {
      mode = 'attack';
      explanation = buildAttackExplanation(currentShanten, handValue, winProb);
    }
  } else {
    // High shanten, no major threats
    mode = 'attack';
    explanation = buildAttackExplanation(currentShanten, handValue, winProb);
  }

  // For defense mode, re-sort discards by safety (not efficiency)
  let sortedDiscards = [...discards];
  if (mode === 'defense') {
    sortedDiscards = sortedDiscards.sort((a, b) => b.safetyScore - a.safetyScore);
    sortedDiscards.forEach((d, i) => { d.rank = i + 1; });
  }

  return {
    mode,
    explanation,
    discards: sortedDiscards,
    winProbability: winProb,
    expectedValue,
  };
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
    return `已听牌，手牌价值约${handValue}点，积极进攻！`;
  }
  return `形势乐观，继续进攻。手牌价值约${handValue}点。`;
}

function buildFlexibleExplanation(
  dangerous: Opponent[],
  suspicious: Opponent[],
  shanten: number,
  handValue: number
): string {
  const threats = [...dangerous, ...suspicious];
  if (threats.length === 0) return `${shanten}向听，灵活应对。`;

  const threatNames = threats.slice(0, 2).map(o => {
    const posMap: Record<string, string> = { east: '上家', south: '下家', west: '对家', north: '北家' };
    return posMap[o.position] || o.position;
  }).join('、');

  return `${threatNames}有危险信号，优先打安全牌维持效率。手牌约${handValue}点，可考虑灵活路线。`;
}

function buildDefenseExplanation(
  dangerous: Opponent[],
  riichi: Opponent[],
  shanten: number
): string {
  const allThreats = [...riichi, ...dangerous];
  if (allThreats.length === 0) return '建议防守，打安全牌。';

  const names = allThreats.slice(0, 2).map(o => {
    const posMap: Record<string, string> = { east: '上家', south: '下家', west: '对家', north: '北家' };
    return posMap[o.position] || o.position;
  }).join('、');

  const reason = riichi.length > 0 ? '已立直' : '疑似听牌';
  return `${names}${reason}，形势危险。${shanten >= 2 ? '放铳风险过高，' : ''}建议打最安全的牌防守。`;
}

// Strategy mode labels and colors
export function strategyLabel(mode: StrategyMode): string {
  switch (mode) {
    case 'attack': return '全力进攻';
    case 'flexible': return '回し打ち';
    case 'defense': return 'ベタオリ';
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
