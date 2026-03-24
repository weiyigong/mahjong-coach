/**
 * Placement evaluation module for Japanese Riichi Mahjong
 * Provides functions to calculate placement, simulate wins, and evaluate placement value.
 */

// Standard uma+oka values (in thousands of points), for 1st through 4th
const PLACEMENT_VALUES = [45, 5, -15, -45];

/**
 * Returns placement (1-4) for each player.
 * Ties are broken by seat order: lower index wins the tie (earlier seat = better placement).
 */
export function getPlacement(scores: number[]): number[] {
  return scores.map((s, i) => {
    let place = 1;
    for (let j = 0; j < scores.length; j++) {
      if (j === i) continue;
      // Another player beats us if they have a strictly higher score,
      // or the same score but a lower seat index (earlier seat wins tie).
      if (scores[j] > s || (scores[j] === s && j < i)) {
        place++;
      }
    }
    return place;
  });
}

/**
 * Returns new scores after a win.
 *
 * Ron (loser !== null): loser pays all points to winner.
 *
 * Tsumo (loser === null):
 *   - Dealer tsumo (isDealer=true): all 3 non-dealers pay equally (≈ points/3 each).
 *   - Non-dealer tsumo (isDealer=false): dealer pays double (≈ points/2),
 *     each of the other two non-dealers pays single (≈ points/4).
 *
 * @param scores      Current scores array (length 4)
 * @param winner      Index of the winning player
 * @param loser       Index of the paying player (null for tsumo)
 * @param points      Total points won (hand value)
 * @param isDealer    Whether the winner is the current dealer
 * @param dealerIndex Index of the current dealer among all players (default 0)
 */
export function simulateWin(
  scores: number[],
  winner: number,
  loser: number | null,
  points: number,
  isDealer: boolean,
  dealerIndex: number = 0
): number[] {
  const newScores = [...scores];

  if (loser !== null) {
    // Ron: loser pays all
    newScores[winner] += points;
    newScores[loser] -= points;
  } else if (isDealer) {
    // Dealer tsumo: split equally among non-dealers
    const perPlayer = Math.round(points / 3);
    for (let i = 0; i < scores.length; i++) {
      if (i !== winner) {
        newScores[i] -= perPlayer;
        newScores[winner] += perPlayer;
      }
    }
  } else {
    // Non-dealer tsumo: dealer pays double, each other non-dealer pays single
    const singlePayment = Math.round(points / 4);
    const doublePayment = Math.round(points / 2);
    for (let i = 0; i < scores.length; i++) {
      if (i === winner) continue;
      const payment = i === dealerIndex ? doublePayment : singlePayment;
      newScores[i] -= payment;
      newScores[winner] += payment;
    }
  }

  return newScores;
}

/**
 * Returns the uma+oka value for a given placement (1-4).
 * Standard values: 1st=+45, 2nd=+5, 3rd=-15, 4th=-45.
 */
export function placementValue(placement: number): number {
  return PLACEMENT_VALUES[Math.min(Math.max(placement, 1), 4) - 1];
}

export interface WinValueResult {
  /** Placement before winning (1-4) */
  placementBefore: number;
  /** Placement after winning (1-4) */
  placementAfter: number;
  /** Positive means placement improved (e.g. 3→2 gives +1) */
  placementDelta: number;
  /** True if the win improves placement or prevents/escapes last place */
  worthIt: boolean;
}

/**
 * Evaluates whether winning this hand improves your placement.
 *
 * Uses tsumo simulation (null loser) for conservative evaluation when targetIndex is null.
 *
 * @param scores       Current scores for all players
 * @param myIndex      Index of the local player (usually 0)
 * @param handPoints   Estimated points this hand is worth
 * @param targetIndex  Who pays (null = tsumo)
 * @param isDealer     Whether the local player is the dealer
 */
export function evaluateWinValue(
  scores: number[],
  myIndex: number,
  handPoints: number,
  targetIndex: number | null,
  isDealer: boolean
): WinValueResult {
  const placementsBefore = getPlacement(scores);
  const placementBefore = placementsBefore[myIndex];

  const newScores = simulateWin(scores, myIndex, targetIndex, handPoints, isDealer);
  const placementsAfter = getPlacement(newScores);
  const placementAfter = placementsAfter[myIndex];

  // Positive delta = placement number decreased = moved up the rankings
  const placementDelta = placementBefore - placementAfter;

  // Worth pursuing if placement improves, or if already in last place (nothing to lose)
  const worthIt = placementDelta > 0 || placementBefore >= 4;

  return { placementBefore, placementAfter, placementDelta, worthIt };
}
