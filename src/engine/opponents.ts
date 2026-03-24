import type { Opponent, DiscardInfo, DangerLevel } from '../types';
import { isHonor, isTerminal, isSimple } from './tiles';

/**
 * Bayesian Opponent Modeling
 *
 * Models opponent danger level based on discard patterns.
 *
 * Prior expectation for normal hand-building:
 * - Turns 1-5: discard honors and terminals (they don't fit sequences)
 * - Turns 6-9: discard near-terminal tiles (1,2,8,9) if not useful
 * - Turns 10+: anything; if still discarding honors, likely stuck
 *
 * Deviations from this pattern suggest the opponent already has
 * a good hand shape or is pursuing a specific strategy.
 */

// Base danger from discard pattern
function calcDiscardPatternDanger(discards: DiscardInfo[]): number {
  if (discards.length === 0) return 0;

  let danger = 0;

  for (let i = 0; i < discards.length; i++) {
    const { tile, turn } = discards[i];
    const isEarly = turn <= 5;
    const isMid = turn > 5 && turn <= 9;

    // Early middle tile discard = suspicious (they don't need it = hand already shaped)
    if (isEarly && isSimple(tile) && !isHonor(tile)) {
      // 4,5,6 are most suspicious
      if (tile.value >= 4 && tile.value <= 6) {
        danger += 15;
      } else {
        // 3, 7 also suspicious but less so
        danger += 8;
      }
    }

    // Mid-game discarding honors = still building = less dangerous
    if (isMid && isHonor(tile)) {
      danger -= 3; // still in construction, slightly less dangerous
    }

    // Late-game discarding terminals = suspicious (making room for a tight hand)
    if (turn > 9 && isTerminal(tile)) {
      danger += 5;
    }
  }

  // Tsumogiri (draw-and-discard): if opponent seems to be discarding drawn tiles
  // We track this partially via the isTsumogiri flag
  const tsumogiriCount = discards.filter(d => d.isTsumogiri).length;
  if (tsumogiriCount > 3) {
    // Many tsumogiri = hand is mostly complete, just waiting
    danger += tsumogiriCount * 3;
  }

  return Math.max(0, danger);
}

// Danger from hand speed (how many discards without melds → menzen tendency)
function calcSpeedDanger(opp: Opponent): number {
  const discardCount = opp.discards.length;
  if (discardCount < 6) return 0;

  // Many discards with no melds = possibly building menzen riichi
  if (opp.melds.length === 0 && discardCount >= 8) {
    return 10 + (discardCount - 8) * 2;
  }

  return 0;
}

// Danger from riichi
function calcRiichiDanger(opp: Opponent): number {
  if (opp.riichiTurn !== null) return 50;
  return 0;
}

// Danger from meld pattern
function calcMeldDanger(opp: Opponent): number {
  if (opp.melds.length === 0) return 0;
  // Open melds = committed to specific tiles, but easier to see
  // Many melds close to tenpai = dangerous
  if (opp.melds.length >= 3) return 25;
  if (opp.melds.length >= 2) return 12;
  return 5;
}

// Calculate total danger score (0-100) and level
export function calcDangerScore(opp: Opponent): { score: number; level: DangerLevel } {
  let score = 0;

  score += calcRiichiDanger(opp);
  score += calcDiscardPatternDanger(opp.discards);
  score += calcSpeedDanger(opp);
  score += calcMeldDanger(opp);

  // Clamp 0-100
  score = Math.min(100, Math.max(0, score));

  const level: DangerLevel =
    score >= 55 ? 'dangerous' :
    score >= 25 ? 'suspicious' :
    'normal';

  return { score, level };
}

// Update all opponents' danger levels
export function updateOpponentDanger(opponents: Opponent[]): Opponent[] {
  return opponents.map(opp => {
    const { score, level } = calcDangerScore(opp);
    return { ...opp, dangerScore: score, dangerLevel: level };
  });
}

// Detect if opponent skipped a chi/pon opportunity (external observation)
export function recordSkippedOpportunity(opp: Opponent): Opponent {
  // When we note an opponent skipped chi/pon, add to danger
  const newScore = Math.min(100, opp.dangerScore + 8);
  const level: DangerLevel =
    newScore >= 55 ? 'dangerous' :
    newScore >= 25 ? 'suspicious' : 'normal';
  return { ...opp, dangerScore: newScore, dangerLevel: level };
}

// Get danger label in Chinese
export function dangerLevelLabel(level: DangerLevel): string {
  switch (level) {
    case 'normal': return '整理中';
    case 'suspicious': return '注意';
    case 'dangerous': return '危险！';
  }
}

// Get color for danger level
export function dangerLevelColor(level: DangerLevel): string {
  switch (level) {
    case 'normal': return '#00b894';
    case 'suspicious': return '#fdcb6e';
    case 'dangerous': return '#e17055';
  }
}

// Get emoji for danger level
export function dangerLevelEmoji(level: DangerLevel): string {
  switch (level) {
    case 'normal': return '🟢';
    case 'suspicious': return '🟡';
    case 'dangerous': return '🔴';
  }
}
