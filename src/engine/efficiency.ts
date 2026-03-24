import type { Tile, Meld, DiscardRecommendation, EffectiveTile, GameState, SafteyDetail } from '../types';
import { tileToIndex, tilesToCounts, indexToTile, createTile, tileDisplayName } from './tiles';
import { calcShanten, findEffectiveTiles, shantenLabel } from './shanten';
import { calcTileSafetyScore } from './safety';
import { estimateHandValue } from './handValue';
import { evaluateWinValue } from './placement';

// Check if a tile is a dora (matches doraIndicator + 1 in sequence)
function isDoraTile(tile: Tile, doraIndicators: Tile[]): boolean {
  const tileIdx = tileToIndex(tile);
  for (const indicator of doraIndicators) {
    const indIdx = tileToIndex(indicator);
    const doraIdx = (indIdx % 9) === 8 ? indIdx - 8 : indIdx + 1;
    if (tileIdx === doraIdx) return true;
  }
  return false;
}

// Count how many copies of each tile are visible (discards + melds + dora indicators)
export function countVisibleTiles(gameState: GameState): number[] {
  const visible = new Array(34).fill(0);

  // My discards
  for (const t of gameState.myDiscards) visible[tileToIndex(t)]++;
  // My melds
  for (const meld of gameState.myMelds) {
    for (const t of meld.tiles) visible[tileToIndex(t)]++;
  }
  // My hand (visible to me)
  for (const t of gameState.myHand) visible[tileToIndex(t)]++;
  if (gameState.lastDrawnTile) visible[tileToIndex(gameState.lastDrawnTile)]++;

  // Opponents discards
  for (const opp of gameState.opponents) {
    for (const d of opp.discards) visible[tileToIndex(d.tile)]++;
    for (const meld of opp.melds) {
      for (const t of meld.tiles) visible[tileToIndex(t)]++;
    }
  }

  // Dora indicators themselves are visible
  for (const d of gameState.doraIndicators) visible[tileToIndex(d)]++;

  return visible;
}

// Count remaining copies of each tile in the wall
export function countRemainingTiles(gameState: GameState): number[] {
  const visible = countVisibleTiles(gameState);
  const remaining = new Array(34).fill(0);
  for (let i = 0; i < 34; i++) {
    remaining[i] = Math.max(0, 4 - visible[i]);
  }
  return remaining;
}

// Get effective tiles info for a given hand (without a specific discard)
export function getEffectiveTilesInfo(
  counts: number[],
  remaining: number[],
  openMentsuCount: number
): EffectiveTile[] {
  const effectiveIndices = findEffectiveTiles(counts, openMentsuCount);
  return effectiveIndices
    .map(idx => {
      const { suit, value } = indexToTile(idx);
      return {
        tile: createTile(suit, value),
        remaining: remaining[idx],
      };
    })
    .filter(et => et.remaining > 0);
}

// Core discard analysis: for each tile in hand, evaluate discarding it
export function analyzeDiscards(gameState: GameState): DiscardRecommendation[] {
  const hand = [...gameState.myHand];
  if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);

  if (hand.length < 2) return [];

  const openMentsuCount = gameState.myMelds.length;
  const remaining = countRemainingTiles(gameState);

  // Compute base hand counts (hand + drawn tile)
  const baseCounts = tilesToCounts(hand);

  // Extended internal type to carry extra sort data
  interface DiscardResult extends DiscardRecommendation {
    handValue: number;
    isDora: boolean;
    waitQualityBonus: number; // bonus applied to tenpai discard ranking
    placementBonus: number;   // extra bonus when winning this tenpai would change placement
  }

  const results: DiscardResult[] = [];
  const seenTypes = new Set<string>();
  const isDealer = gameState.seatWind === 'east';
  const scores = gameState.scores ?? [25000, 25000, 25000, 25000];

  for (let i = 0; i < hand.length; i++) {
    const tile = hand[i];
    const key = `${tile.suit}${tile.value}`;
    if (seenTypes.has(key)) continue; // skip duplicates
    seenTypes.add(key);

    const idx = tileToIndex(tile);
    baseCounts[idx]--;

    const shantenAfter = calcShanten(baseCounts, openMentsuCount);
    const effectiveIndices = findEffectiveTiles(baseCounts, openMentsuCount);

    // Count effective tiles considering remaining supply
    let effectiveTileCount = 0;
    let effectiveTileTypes = 0;
    for (const eIdx of effectiveIndices) {
      const rem = remaining[eIdx];
      if (rem > 0) {
        effectiveTileCount += rem;
        effectiveTileTypes++;
      }
    }

    // Safety score
    const { score: safetyScore, breakdown } = calcTileSafetyScore(tile, gameState);

    // Hand value after discarding this tile (for ranking when shanten is equal)
    const handAfterDiscard = hand.filter((_, j) => j !== i);
    const handValue = estimateHandValue(
      handAfterDiscard,
      gameState.myMelds,
      gameState.roundWind,
      gameState.seatWind,
      gameState.doraIndicators,
      isDealer
    );

    // Dora awareness: flag tiles that are dora (should penalize discarding them)
    const isDora = isDoraTile(tile, gameState.doraIndicators);

    // Wait quality bonus: applied when this discard reaches tenpai (shantenAfter=0)
    // Side wait (>=2 kinds): +20; triple+ wait (>=3 kinds): +30; single/edge/closed (1 kind): -10
    let waitQualityBonus = 0;
    if (shantenAfter === 0) {
      if (effectiveTileTypes >= 3) waitQualityBonus = 30;
      else if (effectiveTileTypes >= 2) waitQualityBonus = 20;
      else waitQualityBonus = -10;
    }

    // Placement bonus: at tenpai, boost priority if winning with this hand value changes placement
    let placementBonus = 0;
    if (shantenAfter === 0) {
      const winEval = evaluateWinValue(scores, 0, handValue, null, isDealer);
      if (winEval.placementDelta >= 2) placementBonus = 35;
      else if (winEval.placementDelta === 1) placementBonus = 20;
    }

    const reason = buildDiscardReason(
      tile,
      shantenAfter,
      effectiveTileCount,
      effectiveTileTypes,
      safetyScore,
      breakdown
    );

    results.push({
      tile,
      shantenAfter,
      effectiveTileCount,
      effectiveTileTypes,
      safetyScore,
      safetyBreakdown: breakdown,
      reason,
      rank: 0, // assigned after sorting
      handValue,
      isDora,
      waitQualityBonus,
      placementBonus,
    });

    baseCounts[idx]++;
  }

  // Sort: shanten (lower = better) → dora penalty (non-dora first) →
  //       at tenpai (shantenAfter=0): wait-quality-adjusted priority (effectiveTileCount + waitQualityBonus)
  //       otherwise: effective tile count (higher = better) →
  //       hand value (higher = better) → safety (higher = better)
  results.sort((a, b) => {
    if (a.shantenAfter !== b.shantenAfter) return a.shantenAfter - b.shantenAfter;
    if (a.isDora !== b.isDora) return a.isDora ? 1 : -1; // non-dora discards rank higher
    if (a.shantenAfter === 0 && b.shantenAfter === 0) {
      const prioA = a.effectiveTileCount + a.waitQualityBonus + a.placementBonus;
      const prioB = b.effectiveTileCount + b.waitQualityBonus + b.placementBonus;
      if (prioA !== prioB) return prioB - prioA;
    } else {
      if (b.effectiveTileCount !== a.effectiveTileCount) return b.effectiveTileCount - a.effectiveTileCount;
    }
    if (b.handValue !== a.handValue) return b.handValue - a.handValue;
    return b.safetyScore - a.safetyScore;
  });

  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

function buildDiscardReason(
  tile: Tile,
  shantenAfter: number,
  effectiveTileCount: number,
  effectiveTileTypes: number,
  safetyScore: number,
  breakdown: SafteyDetail[]
): string {
  const parts: string[] = [];

  const shantenStr = shantenLabel(shantenAfter);
  parts.push(`打${tileDisplayName(tile)}后${shantenStr}`);

  if (shantenAfter <= 0) {
    if (shantenAfter === -1) {
      parts.push('直接和了！');
    } else {
      parts.push(`有效進張${effectiveTileCount}张(${effectiveTileTypes}种)`);
    }
  } else {
    parts.push(`有效進張${effectiveTileCount}张`);
  }

  // Safety comment
  const genbutsuOpp = breakdown.find(b => b.label === '現物');
  const hasRiichi = breakdown.some(b => b.label === '立直危險');

  if (safetyScore >= 90 && genbutsuOpp) {
    parts.push('是現物，极安全');
  } else if (safetyScore >= 75) {
    parts.push('安全度較高');
  } else if (safetyScore < 40 && hasRiichi) {
    parts.push('⚠️立直對手危險，謹慎');
  } else if (safetyScore < 50) {
    parts.push('有一定危險度');
  }

  return parts.join('，');
}
