import type { Tile, Opponent, GameState, SafteyDetail } from '../types';
import { tileToIndex, isHonor } from './tiles';
import { calcSequentialDiscardBonus } from './opponents';

/**
 * Tile Safety Rating System
 *
 * Scores 0-100 (higher = safer)
 * - Genbutsu (現物): tile the opponent personally discarded → 95% safe
 * - Suji (筋): tiles on the suji line of opponent's discards → partial safety
 * - Kabe (壁): 3+ visible copies of a tile → safer for connected tiles
 * - Otherwise: estimate based on tile type and position
 */

// Suji groups: [1,4,7], [2,5,8], [3,6,9] (1-indexed tile values)
const SUJI_GROUPS = [
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
];

function getSujiGroup(value: number): number[] {
  for (const group of SUJI_GROUPS) {
    if (group.includes(value)) return group;
  }
  return [];
}

// Check if tile is genbutsu for a specific opponent (they discarded it)
function isGenbutsu(tile: Tile, opp: Opponent): boolean {
  return opp.discards.some(d => d.tile.suit === tile.suit && d.tile.value === tile.value);
}

// Check if opponent is in riichi
function oppIsRiichi(opp: Opponent): boolean {
  return opp.riichiTurn !== null;
}

// Calculate suji safety bonus for a tile against an opponent
// Applies timing discount: early discards (turns 1-6) = full bonus,
// mid-game (turns 7+) = 70%, riichi declaration tile = 0% (suji-trap).
function calcSujiBonus(tile: Tile, opp: Opponent): { bonus: number; reason: string } {
  if (tile.suit === 'honor') return { bonus: 0, reason: '' };

  const sujiGroup = getSujiGroup(tile.value);
  if (sujiGroup.length === 0) return { bonus: 0, reason: '' };

  const suitDiscards = opp.discards.filter(d => d.tile.suit === tile.suit);
  const oppDiscardValues = suitDiscards.map(d => d.tile.value);

  // Check how many suji partners have been discarded
  const discardedPartners = sujiGroup.filter(v => v !== tile.value && oppDiscardValues.includes(v));

  if (discardedPartners.length === 0) return { bonus: 0, reason: '' };

  // Determine raw bonus based on how many flanks are discarded
  const otherMembers = sujiGroup.filter(v => v !== tile.value);
  let rawBonus: number;
  let reason: string;

  if (otherMembers.every(v => oppDiscardValues.includes(v))) {
    rawBonus = 40; reason = '双筋';
  } else if (tile.value === 4 || tile.value === 5 || tile.value === 6) {
    rawBonus = 25; reason = '筋';
  } else {
    rawBonus = 30; reason = '筋';
  }

  // Apply timing discount based on earliest discarded partner turn
  let minTurn = Infinity;
  let isRiichiDeclTile = false;

  for (const partnerVal of discardedPartners) {
    const partnerDiscard = suitDiscards.find(d => d.tile.value === partnerVal);
    if (partnerDiscard) {
      // Riichi declaration tile suji = 0% bonus (suji-trap is common here)
      if (opp.riichiTurn !== null && partnerDiscard.turn === opp.riichiTurn) {
        isRiichiDeclTile = true;
      }
      minTurn = Math.min(minTurn, partnerDiscard.turn);
    }
  }

  if (isRiichiDeclTile) return { bonus: 0, reason: '' };

  // Turns 1-6: full bonus; turns 7+: 70%
  const multiplier = minTurn <= 6 ? 1.0 : 0.7;
  return { bonus: Math.round(rawBonus * multiplier), reason };
}

// One-chance / no-chance safety:
// If all 4 copies of an adjacent tile are visible, the tile cannot be part of
// a sequence using that adjacent tile → significant safety boost.
// If both sides are blocked (or tile is terminal), it's 100% safe for sequences.
function calcNoChanceBonus(tile: Tile, allVisible: number[]): { bonus: number; reason: string } {
  if (tile.suit === 'honor') return { bonus: 0, reason: '' };

  const suitOffset = tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9 : 18;

  const leftValue = tile.value - 1;
  const rightValue = tile.value + 1;

  const leftExhausted = leftValue >= 1 && allVisible[suitOffset + leftValue - 1] >= 4;
  const rightExhausted = rightValue <= 9 && allVisible[suitOffset + rightValue - 1] >= 4;
  const isLeftTerminal = tile.value === 1;  // no sequence to the left
  const isRightTerminal = tile.value === 9; // no sequence to the right

  const leftSafe = isLeftTerminal || leftExhausted;
  const rightSafe = isRightTerminal || rightExhausted;

  if (leftSafe && rightSafe) {
    // Can't be in any sequence from either side → 100% safe for sequences
    return { bonus: 100, reason: '無筋(完全壁)' };
  }
  if (leftExhausted || rightExhausted) {
    return { bonus: 35, reason: '無筋(片壁)' };
  }

  return { bonus: 0, reason: '' };
}

// Calculate kabe safety bonus
// If 3+ copies of a tile are visible, tiles that need it for sequences are safer
function calcKabeBonus(tile: Tile, allVisible: number[]): { bonus: number; reason: string } {
  if (tile.suit === 'honor') return { bonus: 0, reason: '' };

  let totalBonus = 0;
  let reason = '';

  // Check tiles adjacent to 'tile' for kabe
  // If tile.value - 1 or tile.value + 1 has 3+ visible copies,
  // then sequences using tile are less likely
  const checkAdjacent = (adjValue: number) => {
    if (adjValue < 1 || adjValue > 9) return;
    const adjIdx = adjValue - 1 + (tile.suit === 'pin' ? 9 : tile.suit === 'sou' ? 18 : 0);
    const visibleCount = allVisible[adjIdx];
    if (visibleCount >= 4) {
      totalBonus = Math.max(totalBonus, 55);
      reason = '完全壁';
    } else if (visibleCount >= 3) {
      totalBonus = Math.max(totalBonus, 30);
      reason = '壁';
    }
  };

  // Check for kabe on the tile itself (if 3 visible, 4th is "dead")
  const tileIdx = tileToIndex(tile);
  if (allVisible[tileIdx] >= 3) {
    totalBonus = Math.max(totalBonus, 50);
    reason = '壁(本张)';
  }

  checkAdjacent(tile.value - 1);
  checkAdjacent(tile.value + 1);
  // Also check 2 steps away for kanchan patterns
  checkAdjacent(tile.value - 2);
  checkAdjacent(tile.value + 2);

  return { bonus: totalBonus, reason };
}

// Base safety score by tile type (without considering specific opponent)
// Middle tiles (3-7) are most dangerous, terminals/honors safer in general
function baseSafetyByType(tile: Tile): number {
  if (tile.suit === 'honor') {
    if (tile.value >= 5) return 35; // dragons are often yakuhai = dangerous
    return 45; // winds: less commonly yakuhai
  }
  if (tile.value === 1 || tile.value === 9) return 50; // terminals
  if (tile.value === 2 || tile.value === 8) return 40;
  if (tile.value === 3 || tile.value === 7) return 30;
  return 20; // 4, 5, 6 — most dangerous (many sequences include them)
}

// Main safety calculation for a tile against one opponent
function calcSafetyVsOpponent(
  tile: Tile,
  opp: Opponent,
  allVisible: number[],
  turnNumber: number
): { score: number; label: string } {
  // Genbutsu: opponent personally discarded this tile → max safety
  if (isGenbutsu(tile, opp)) {
    // If they declared riichi AFTER discarding this tile, it's still safe
    if (opp.riichiTurn !== null) {
      const genDiscard = opp.discards.find(d => d.tile.suit === tile.suit && d.tile.value === tile.value);
      if (genDiscard && genDiscard.turn <= opp.riichiTurn) {
        return { score: 95, label: '現物' };
      }
    }
    return { score: 95, label: '現物' };
  }

  // One-chance / no-chance: all 4 copies of adjacent tile visible → can't be in that sequence
  const { bonus: noChanceBonus, reason: noChanceReason } = calcNoChanceBonus(tile, allVisible);
  if (noChanceBonus >= 100) {
    return { score: 95, label: noChanceReason };
  }

  // If opponent is in riichi, use strict suji/kabe reasoning
  if (oppIsRiichi(opp)) {
    // Check suji
    const { bonus: sujiBonus, reason: sujiReason } = calcSujiBonus(tile, opp);
    const { bonus: kabeBonus, reason: kabeReason } = calcKabeBonus(tile, allVisible);
    const seqBonus = calcSequentialDiscardBonus(tile, opp);

    const base = baseSafetyByType(tile);
    const maxBonus = Math.max(sujiBonus, kabeBonus, seqBonus, noChanceBonus);
    // Cap non-genbutsu safety at 70% vs riichi opponent
    const score = Math.min(70, base + maxBonus);
    const topReason = noChanceBonus > 0 ? noChanceReason
      : kabeBonus > sujiBonus ? kabeReason : sujiReason;
    return { score, label: topReason || '立直危險' };
  }

  // Non-riichi opponent: use general safety heuristics
  const base = baseSafetyByType(tile);
  const { bonus: sujiBonus, reason: sujiReason } = calcSujiBonus(tile, opp);
  const { bonus: kabeBonus, reason: kabeReason } = calcKabeBonus(tile, allVisible);
  const seqBonus = calcSequentialDiscardBonus(tile, opp);

  // Danger level adjustment with late-game escalation
  let dangerPenalty = opp.dangerLevel === 'dangerous' ? 15
    : opp.dangerLevel === 'suspicious' ? 8 : 0;
  if (opp.dangerLevel === 'dangerous') {
    if (turnNumber >= 15) dangerPenalty = Math.round(dangerPenalty * 2);
    else if (turnNumber >= 12) dangerPenalty = Math.round(dangerPenalty * 1.5);
  }

  const maxBonus = Math.max(sujiBonus, kabeBonus, seqBonus, noChanceBonus);
  const score = Math.max(10, Math.min(90, base + maxBonus - dangerPenalty));

  const topReason = noChanceBonus > 0 ? noChanceReason
    : (sujiReason || kabeReason);
  const label = opp.dangerLevel === 'dangerous'
    ? `危險(${topReason || '注意'})`
    : (topReason || (opp.dangerLevel === 'suspicious' ? '注意' : '較安全'));

  return { score, label };
}

// Combined safety score across all opponents
export function calcTileSafetyScore(
  tile: Tile,
  gameState: GameState
): { score: number; breakdown: SafteyDetail[] } {
  if (gameState.opponents.length === 0) {
    return { score: 70, breakdown: [] };
  }

  // Count all visible tiles for kabe calculation
  const allVisible = new Array(34).fill(0);
  for (const opp of gameState.opponents) {
    for (const d of opp.discards) allVisible[tileToIndex(d.tile)]++;
    for (const m of opp.melds) for (const t of m.tiles) allVisible[tileToIndex(t)]++;
  }
  for (const d of gameState.myDiscards) allVisible[tileToIndex(d)]++;
  for (const m of gameState.myMelds) for (const t of m.tiles) allVisible[tileToIndex(t)]++;
  for (const t of gameState.myHand) allVisible[tileToIndex(t)]++;
  if (gameState.lastDrawnTile) allVisible[tileToIndex(gameState.lastDrawnTile)]++;

  const breakdown: SafteyDetail[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const opp of gameState.opponents) {
    const { score, label } = calcSafetyVsOpponent(tile, opp, allVisible, gameState.turnNumber);

    // Weight: dangerous opponents matter more
    const weight = opp.dangerLevel === 'dangerous' ? 3
      : opp.dangerLevel === 'suspicious' ? 2 : 1;

    // Riichi opponents also get extra weight
    const riichiWeight = opp.riichiTurn !== null ? 2 : 1;
    const finalWeight = weight * riichiWeight;

    weightedSum += score * finalWeight;
    totalWeight += finalWeight;

    breakdown.push({
      opponent: opp.position,
      score,
      label,
    });
  }

  const combined = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 70;
  return { score: combined, breakdown };
}

// Get safety scores for all tiles in hand (for display)
export function getAllHandSafetyScores(
  tiles: Tile[],
  gameState: GameState
): Map<string, number> {
  const map = new Map<string, number>();
  const seen = new Set<string>();
  for (const tile of tiles) {
    const key = `${tile.suit}${tile.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { score } = calcTileSafetyScore(tile, gameState);
    map.set(key, score);
  }
  return map;
}
