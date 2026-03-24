import { KOKUSHI_INDICES } from './tiles';

/**
 * Shanten calculator for Japanese Riichi Mahjong.
 *
 * Shanten = -1: complete hand (agari)
 * Shanten =  0: tenpai (one tile away)
 * Shanten =  n: n tiles needed to reach tenpai
 *
 * Tile index encoding:
 *   0-8:   man 1m-9m
 *   9-17:  pin 1p-9p
 *   18-26: sou 1s-9s
 *   27-33: honors (E,S,W,N,Haku,Hatsu,Chun)
 */

// Calculate minimum shanten across all hand types
export function calcShanten(counts: number[], openMentsuCount = 0): number {
  return Math.min(
    calcNormalShanten(counts, openMentsuCount),
    openMentsuCount === 0 ? calcChitoiShanten(counts) : 99,
    openMentsuCount === 0 ? calcKokushiShanten(counts) : 99
  );
}

// Standard hand: 4 sets + 1 pair
export function calcNormalShanten(counts: number[], openMentsuCount = 0): number {
  let best = 8;
  const c = counts.slice(); // mutable copy

  function dfs(i: number, mentsu: number, taatsu: number, jantai: number): void {
    // Cap taatsu at available mentsu slots
    const effT = Math.min(taatsu, 4 - mentsu);
    const shanten = 8 - (2 * mentsu + effT + jantai);
    if (shanten < best) best = shanten;

    if (i >= 34) return;

    // Skip tiles with 0 count
    if (c[i] === 0) {
      dfs(i + 1, mentsu, taatsu, jantai);
      return;
    }

    const isHonorTile = i >= 27;
    const posInSuit = i % 9;

    // When all group slots are filled, only scan for head
    if (mentsu + taatsu >= 4) {
      if (c[i] >= 2 && jantai === 0) {
        c[i] -= 2;
        const s2 = 8 - (2 * mentsu + Math.min(taatsu, 4 - mentsu) + 1);
        if (s2 < best) best = s2;
        dfs(i + 1, mentsu, taatsu, 1);
        c[i] += 2;
      }
      dfs(i + 1, mentsu, taatsu, jantai);
      return;
    }

    // Try complete triplet (kōtsu)
    if (c[i] >= 3) {
      c[i] -= 3;
      dfs(i, mentsu + 1, taatsu, jantai);
      c[i] += 3;
    }

    // Try complete sequence (shuntsu) — suited tiles only
    if (!isHonorTile && posInSuit <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      dfs(i, mentsu + 1, taatsu, jantai);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }

    // Try pair as head (jantai)
    if (c[i] >= 2 && jantai === 0) {
      c[i] -= 2;
      dfs(i, mentsu, taatsu, 1);
      c[i] += 2;
    }

    // Try pair as taatsu (kōtsu candidate)
    if (c[i] >= 2) {
      c[i] -= 2;
      dfs(i, mentsu, taatsu + 1, jantai);
      c[i] += 2;
    }

    // Try kanchan (gap sequence: x, _, z where z = x+2)
    if (!isHonorTile && posInSuit <= 6 && c[i + 2] > 0) {
      c[i]--; c[i + 2]--;
      dfs(i, mentsu, taatsu + 1, jantai);
      c[i]++; c[i + 2]++;
    }

    // Try ryanmen/penchan (adjacent: x, x+1)
    if (!isHonorTile && posInSuit <= 7 && c[i + 1] > 0) {
      c[i]--; c[i + 1]--;
      dfs(i, mentsu, taatsu + 1, jantai);
      c[i]++; c[i + 1]++;
    }

    // Move to next tile (treat remaining c[i] as isolated)
    dfs(i + 1, mentsu, taatsu, jantai);
  }

  dfs(0, openMentsuCount, 0, 0);
  return best;
}

// Chiitoi (七対子): 7 unique pairs
export function calcChitoiShanten(counts: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  // Need 7 pairs, all different kinds
  return Math.max(6 - pairs, 6 - pairs + Math.max(0, 7 - kinds));
}

// Kokushi musou (国士無双): one of each terminal/honor + one extra
export function calcKokushiShanten(counts: number[]): number {
  let kinds = 0;
  let hasPair = false;
  for (const i of KOKUSHI_INDICES) {
    if (counts[i] > 0) {
      kinds++;
      if (counts[i] >= 2) hasPair = true;
    }
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

// Shanten number for hand as array of tile indices (convenience)
export function shantenFromTileIndices(indices: number[], openMentsuCount = 0): number {
  const counts = new Array(34).fill(0);
  for (const i of indices) counts[i]++;
  return calcShanten(counts, openMentsuCount);
}

// Human-readable shanten label
export function shantenLabel(shanten: number): string {
  if (shanten === -1) return '和了！';
  if (shanten === 0) return '听牌';
  if (shanten === 1) return '一向听';
  if (shanten === 2) return '两向听';
  if (shanten === 3) return '三向听';
  return `${shanten}向听`;
}

// Find all tiles that reduce shanten (effective tiles / 有効牌)
export function findEffectiveTiles(counts: number[], openMentsuCount = 0): number[] {
  const currentShanten = calcShanten(counts, openMentsuCount);
  const effective: number[] = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 4) continue; // no more tiles available
    counts[i]++;
    const newShanten = calcShanten(counts, openMentsuCount);
    if (newShanten < currentShanten) effective.push(i);
    counts[i]--;
  }
  return effective;
}

// Find all waiting tiles when tenpai (shanten=0)
export function findWaitingTiles(counts: number[], openMentsuCount = 0): number[] {
  // Same as effective tiles when shanten = 0 (they would make shanten = -1)
  return findEffectiveTiles(counts, openMentsuCount);
}
