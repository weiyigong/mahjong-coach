import type { Tile, Opponent, DiscardInfo, DangerLevel, Wind } from '../types';
import { isHonor, isTerminal, isSimple, windToHonorValue } from './tiles';

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
  if (opp.riichiTurn !== null) return 60;
  return 0;
}

// Danger from meld pattern
// 3+ open melds = likely tenpai; 4 open melds = definitely tenpai
function calcMeldDanger(opp: Opponent): number {
  if (opp.melds.length === 0) return 0;
  if (opp.melds.length >= 4) return 30; // definitely tenpai
  if (opp.melds.length >= 3) return 15; // likely tenpai
  if (opp.melds.length >= 2) return 12;
  return 5;
}

// Dama (silent tenpai) detection:
// 3+ consecutive tsumogiri (draw-and-discard) = hand is complete, possibly dama
function calcDamaDanger(opp: Opponent): number {
  const discards = opp.discards;
  if (discards.length < 3) return 0;

  // Count consecutive tsumogiri from the most recent discard backwards
  let consecutive = 0;
  for (let i = discards.length - 1; i >= 0; i--) {
    if (discards[i].isTsumogiri) consecutive++;
    else break;
  }

  return consecutive >= 3 ? 20 : 0;
}

// Honitsu/chinitsu detection: open melds all in one suit + few discards of that suit
function calcHonitsuDanger(opp: Opponent): number {
  if (opp.melds.length === 0) return 0;

  // Collect non-honor suits used in melds
  const meldSuits = new Set<string>();
  for (const meld of opp.melds) {
    for (const tile of meld.tiles) {
      if (tile.suit !== 'honor') meldSuits.add(tile.suit);
    }
  }

  if (meldSuits.size !== 1) return 0; // melds span multiple suits, not honitsu
  const targetSuit = [...meldSuits][0];

  const totalDiscards = opp.discards.length;
  if (totalDiscards === 0) return 0;

  const suitDiscards = opp.discards.filter(d => d.tile.suit === targetSuit).length;
  const suitDiscardRatio = suitDiscards / totalDiscards;

  // All melds in one suit AND barely discarding that suit → likely honitsu/chinitsu
  if (suitDiscardRatio <= 0.1) return 15;

  return 0;
}

// Sequential discard pattern: tiles in ascending/descending order within same suit
// indicates broken connections → nearby tiles in that suit are safer.
// Returns a safety bonus (0-20) for a specific tile against this opponent.
export function calcSequentialDiscardBonus(tile: Tile, opp: Opponent): number {
  if (tile.suit === 'honor') return 0;

  // Get discards in this suit sorted by turn
  const suitDiscards = opp.discards
    .filter(d => d.tile.suit === tile.suit)
    .sort((a, b) => a.turn - b.turn)
    .map(d => d.tile.value);

  if (suitDiscards.length < 3) return 0;

  // Check for ascending or descending sequence (gaps of at most 3 between consecutive discards)
  let ascending = true;
  let descending = true;
  for (let i = 1; i < suitDiscards.length; i++) {
    const diff = suitDiscards[i] - suitDiscards[i - 1];
    if (diff <= 0 || diff > 3) ascending = false;
    if (diff >= 0 || diff < -3) descending = false;
  }

  if (!ascending && !descending) return 0;

  // Tile is near the discarded range → connections in this area are broken → safer
  const minVal = Math.min(...suitDiscards);
  const maxVal = Math.max(...suitDiscards);
  if (tile.value >= minVal - 1 && tile.value <= maxVal + 1) {
    return 20;
  }

  return 0;
}

// Calculate total danger score (0-100) and level
export function calcDangerScore(opp: Opponent): { score: number; level: DangerLevel } {
  let score = 0;

  score += calcRiichiDanger(opp);
  score += calcDiscardPatternDanger(opp.discards);
  score += calcSpeedDanger(opp);
  score += calcMeldDanger(opp);
  score += calcHonitsuDanger(opp);
  score += calcDamaDanger(opp);

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
    case 'dangerous': return '危險！';
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

/**
 * Estimate the minimum and maximum point value of an opponent's hand
 * based on their visible melds, riichi status, and dora count.
 */
export function estimateOpenHandValue(
  opponent: Opponent,
  roundWind: Wind,
  doraCount: number = 0
): { minValue: number; maxValue: number } {
  // Riichi (closed hand): base 2600, scales with dora
  if (opponent.riichiTurn !== null) {
    const minVal = 2600;
    const maxVal = 8000 + doraCount * 3900;
    return { minValue: minVal, maxValue: maxVal };
  }

  // No open melds: estimate as cheap/flexible hand
  if (opponent.melds.length === 0) {
    return { minValue: 1000, maxValue: 3900 };
  }

  // Count yakuhai among open melds (one per meld that contains a yakuhai tile)
  let yakuhaiCount = 0;
  const roundWindVal = windToHonorValue(roundWind);
  const seatWindVal = windToHonorValue(opponent.position);

  for (const meld of opponent.melds) {
    let meldHasYakuhai = false;
    for (const tile of meld.tiles) {
      if (tile.suit === 'honor') {
        // Dragons (value 5=Haku, 6=Hatsu, 7=Chun) are always yakuhai
        if (tile.value >= 5) { meldHasYakuhai = true; break; }
        // Round wind or seat wind
        if (tile.value === roundWindVal || tile.value === seatWindVal) {
          meldHasYakuhai = true; break;
        }
      }
    }
    if (meldHasYakuhai) yakuhaiCount++;
  }

  // Dora multiplier: each visible dora roughly doubles value
  const doraMultiplier = 1 + doraCount * 0.5;

  if (yakuhaiCount === 0) {
    // No yakuhai → likely tanyao or low-value hand
    return {
      minValue: Math.round(1000 * doraMultiplier),
      maxValue: Math.round(2000 * doraMultiplier),
    };
  } else if (yakuhaiCount === 1) {
    return {
      minValue: Math.round(1300 * doraMultiplier),
      maxValue: Math.round(3900 * doraMultiplier),
    };
  } else {
    // 2+ yakuhai melds: significant hand
    return {
      minValue: Math.round(2600 * doraMultiplier),
      maxValue: Math.round(7700 * doraMultiplier),
    };
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
