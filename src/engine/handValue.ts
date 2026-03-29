import type { Tile, Meld, Wind } from '../types';
import { tileToIndex, tilesToCounts, isHonor, isTerminal, isSimple, windToHonorValue } from './tiles';
import { calcShanten, calcNormalShanten, findWaitingTiles } from './shanten';

// Rough yaku detection for hand value estimation
// We're NOT doing full scoring — just estimating for attack/defense decisions

interface YakuEstimate {
  name: string;
  han: number;
  closed: boolean; // some yaku require closed hand
}

export function estimateYaku(
  hand: Tile[],
  melds: Meld[],
  roundWind: Wind,
  seatWind: Wind,
  isRiichi: boolean,
  isTsumo: boolean
): YakuEstimate[] {
  const yakuList: YakuEstimate[] = [];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const isClosed = melds.length === 0;

  if (isRiichi) {
    yakuList.push({ name: '立直', han: 1, closed: true });
  }

  if (isTsumo && isClosed) {
    yakuList.push({ name: '門前清自摸', han: 1, closed: true });
  }

  // Tanyao (断么九): all simples
  if (allTiles.every(t => isSimple(t))) {
    yakuList.push({ name: '断幺九', han: 1, closed: false });
  }

  // Check for yakuhai (役牌): triplet of round wind, seat wind, or dragon
  const countMap = new Map<string, number>();
  for (const t of allTiles) {
    const k = `${t.suit}${t.value}`;
    countMap.set(k, (countMap.get(k) || 0) + 1);
  }

  // Dragons (value 5,6,7 = Haku,Hatsu,Chun)
  for (const dragonValue of [5, 6, 7]) {
    const k = `honor${dragonValue}`;
    if ((countMap.get(k) || 0) >= 3) {
      const dragonNames = ['', '', '', '', '白板', '发财', '红中'];
      yakuList.push({ name: `役牌(${dragonNames[dragonValue]})`, han: 1, closed: false });
    }
  }

  // Round wind yakuhai
  const roundWindValue = windToHonorValue(roundWind);
  if ((countMap.get(`honor${roundWindValue}`) || 0) >= 3) {
    yakuList.push({ name: '場風', han: 1, closed: false });
  }

  // Seat wind yakuhai (double if round == seat)
  const seatWindValue = windToHonorValue(seatWind);
  if (seatWindValue !== roundWindValue && (countMap.get(`honor${seatWindValue}`) || 0) >= 3) {
    yakuList.push({ name: '自風', han: 1, closed: false });
  } else if (seatWindValue === roundWindValue && (countMap.get(`honor${seatWindValue}`) || 0) >= 3) {
    // Double wind
    yakuList.push({ name: '連風牌', han: 2, closed: false });
  }

  // Chiitoi (七对子): 7 pairs
  if (isClosed) {
    const counts = tilesToCounts(hand);
    let pairs = 0;
    let singles = 0;
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 2) pairs++;
      else if (counts[i] === 1) singles++;
    }
    if (pairs === 7 && singles === 0) {
      yakuList.push({ name: '七对子', han: 2, closed: true });
    }
  }

  // Honitsu (混一色): only one suit + honors, or chinitsu (清一色): only one suit
  const suits = new Set(allTiles.filter(t => t.suit !== 'honor').map(t => t.suit));
  const hasHonors = allTiles.some(t => t.suit === 'honor');
  if (suits.size === 1) {
    if (!hasHonors) {
      yakuList.push({ name: '清一色', han: isClosed ? 6 : 5, closed: false });
    } else {
      yakuList.push({ name: '混一色', han: isClosed ? 3 : 2, closed: false });
    }
  }

  // Toitoi (対々和): all triplets
  const allCounts = tilesToCounts(allTiles);
  const tripletCount = allCounts.filter(c => c >= 3).length;
  const pairCount = allCounts.filter(c => c === 2).length;
  if (tripletCount === 4 && pairCount === 1) {
    yakuList.push({ name: '对对和', han: 2, closed: false });
  }

  // Sanshoku doukou (三色同刻): same value triplets in all 3 suits
  for (let v = 1; v <= 9; v++) {
    const manK = `man${v}`, pinK = `pin${v}`, souK = `sou${v}`;
    if ((countMap.get(manK) || 0) >= 3 &&
        (countMap.get(pinK) || 0) >= 3 &&
        (countMap.get(souK) || 0) >= 3) {
      yakuList.push({ name: '三色同刻', han: 2, closed: false });
    }
  }

  // Ittsu (一気通貫): 123, 456, 789 in same suit
  for (const suit of ['man', 'pin', 'sou'] as const) {
    const prefix = suit;
    if ((countMap.get(`${prefix}1`) || 0) > 0 &&
        (countMap.get(`${prefix}2`) || 0) > 0 &&
        (countMap.get(`${prefix}3`) || 0) > 0 &&
        (countMap.get(`${prefix}4`) || 0) > 0 &&
        (countMap.get(`${prefix}5`) || 0) > 0 &&
        (countMap.get(`${prefix}6`) || 0) > 0 &&
        (countMap.get(`${prefix}7`) || 0) > 0 &&
        (countMap.get(`${prefix}8`) || 0) > 0 &&
        (countMap.get(`${prefix}9`) || 0) > 0) {
      yakuList.push({ name: '一气通贯', han: isClosed ? 2 : 1, closed: false });
    }
  }

  // Tsumo-only bonus
  // (already handled above)

  return yakuList;
}

// Estimate total han count
export function estimateTotalHan(
  hand: Tile[],
  melds: Meld[],
  roundWind: Wind,
  seatWind: Wind,
  isRiichi: boolean,
  isTsumo: boolean,
  doraCount: number
): number {
  const yaku = estimateYaku(hand, melds, roundWind, seatWind, isRiichi, isTsumo);
  const baseHan = yaku.reduce((sum, y) => sum + y.han, 0);
  return baseHan + doraCount;
}

// Basic fu estimation
export function estimateFu(
  hand: Tile[],
  melds: Meld[],
  isTsumo: boolean,
  seatWind: Wind,
  roundWind: Wind
): number {
  let fu = 30; // base fu for most hands

  // Pinfu tsumo = 20
  // This is a rough estimate
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  if (melds.length === 0 && !allTiles.some(t => isHonor(t) || isTerminal(t))) {
    fu = isTsumo ? 20 : 30;
  }

  // Additional fu for melds
  for (const meld of melds) {
    if (meld.type === 'pon') {
      const t = meld.tiles[0];
      const isValuable = t.suit === 'honor';
      const isTerminalOrHonor = isTerminal(t) || isHonor(t);
      fu += isTerminalOrHonor ? 4 : 2;
    }
    if (meld.type === 'kan' || meld.type === 'closedKan') {
      const t = meld.tiles[0];
      const isTerminalOrHonor = isTerminal(t) || isHonor(t);
      fu += isTerminalOrHonor ? 16 : 8;
      if (meld.type === 'closedKan') fu *= 2;
    }
  }

  // Round up to nearest 10
  return Math.ceil(fu / 10) * 10;
}

// Point table for standard scoring
const POINT_TABLE: { [han: number]: { dealer: number; nonDealer: number } } = {
  1: { dealer: 1500, nonDealer: 1000 },
  2: { dealer: 2900, nonDealer: 2000 },
  3: { dealer: 5800, nonDealer: 3900 },
  4: { dealer: 8000, nonDealer: 8000 }, // mangan
  5: { dealer: 12000, nonDealer: 8000 }, // mangan
  6: { dealer: 18000, nonDealer: 12000 }, // haneman
  7: { dealer: 18000, nonDealer: 12000 }, // haneman
  8: { dealer: 24000, nonDealer: 16000 }, // baiman
  9: { dealer: 24000, nonDealer: 16000 },
  10: { dealer: 24000, nonDealer: 16000 },
  11: { dealer: 36000, nonDealer: 24000 }, // sanbaiman
  12: { dealer: 36000, nonDealer: 24000 },
  13: { dealer: 48000, nonDealer: 32000 }, // yakuman
};

export function estimatePoints(han: number, fu: number, isDealer: boolean): number {
  // Mangan cutoff
  if (han >= 5 || (han === 4 && fu >= 30) || (han === 3 && fu >= 70)) {
    const manganBase = isDealer ? 12000 : 8000;
    if (han >= 13) return isDealer ? 48000 : 32000; // yakuman
    if (han >= 11) return isDealer ? 36000 : 24000; // sanbaiman
    if (han >= 8) return isDealer ? 24000 : 16000; // baiman
    if (han >= 6) return isDealer ? 18000 : 12000; // haneman
    return manganBase;
  }

  // Normal scoring: basic points = fu * 2^(han+2), then * 4 (dealer) or * 2+* 1+* 1 (non-dealer)
  const basicPoints = fu * Math.pow(2, han + 2);
  if (isDealer) {
    return Math.ceil(basicPoints * 6 / 100) * 100;
  } else {
    return Math.ceil(basicPoints * 4 / 100) * 100;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Hand Decomposition
// ──────────────────────────────────────────────────────────────────────────────

export interface HandDecomposition {
  head: number; // tile index (0-33) of the pair
  mentsu: Array<{
    type: 'shuntsu' | 'koutsu';
    tiles: number[]; // tile indices
    isClosed: boolean;
  }>;
}

/**
 * Enumerate all valid decompositions of a complete hand into 1 pair + N mentsu.
 * @param counts  34-length tile count array (closed hand tiles only)
 * @param openMelds  already-called open melds (pre-removed from counts)
 */
export function decomposeHand(
  counts: number[],
  openMelds?: Array<{ type: string; tiles: number[] }>
): HandDecomposition[] {
  const results: HandDecomposition[] = [];
  const openCount = openMelds ? openMelds.length : 0;
  const neededMentsu = 4 - openCount;

  // Describe open melds once
  const openMentsuDescs: HandDecomposition['mentsu'] = openMelds
    ? openMelds.map(m => ({
        type: (m.type === 'chi' ? 'shuntsu' : 'koutsu') as 'shuntsu' | 'koutsu',
        tiles: m.tiles.slice(),
        isClosed: false,
      }))
    : [];

  const c = counts.slice(); // mutable working copy
  const stack: HandDecomposition['mentsu'][number][] = [];

  function dfs(i: number): void {
    // Advance to first non-empty tile
    while (i < 34 && c[i] === 0) i++;

    if (i === 34) {
      // All closed tiles consumed → valid decomposition
      results.push({ head: currentHead, mentsu: [...stack, ...openMentsuDescs] });
      return;
    }

    if (stack.length >= neededMentsu) return; // tiles remain but no slots left

    const isHonorTile = i >= 27;
    const posInSuit = i % 9;

    // Try koutsu (triplet)
    if (c[i] >= 3) {
      c[i] -= 3;
      stack.push({ type: 'koutsu', tiles: [i, i, i], isClosed: true });
      dfs(i);
      stack.pop();
      c[i] += 3;
    }

    // Try shuntsu (sequence) — suited tiles only, no suit wrap
    if (!isHonorTile && posInSuit <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      stack.push({ type: 'shuntsu', tiles: [i, i + 1, i + 2], isClosed: true });
      dfs(i);
      stack.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    // If neither applies, branch is dead (tile i can't be consumed → not a valid decomposition)
  }

  let currentHead = -1;

  // Try every possible pair as the head
  for (let h = 0; h < 34; h++) {
    if (c[h] < 2) continue;
    currentHead = h;
    c[h] -= 2;
    dfs(0);
    c[h] += 2;
  }

  return results;
}

// Quick estimate of hand potential value
export function estimateHandValue(
  hand: Tile[],
  melds: Meld[],
  roundWind: Wind,
  seatWind: Wind,
  doraIndicators: Tile[],
  isDealer: boolean
): number {
  // Count dora
  let doraCount = 0;
  for (const indicator of doraIndicators) {
    const doraIdx = tileToIndex(indicator);
    // Dora is next tile after indicator
    const doraValue = (doraIdx % 9) === 8 ? doraIdx - 8 : doraIdx + 1;
    const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
    doraCount += allTiles.filter(t => tileToIndex(t) === doraValue).length;
  }

  const han = estimateTotalHan(hand, melds, roundWind, seatWind, false, false, doraCount);
  const fu = estimateFu(hand, melds, false, seatWind, roundWind);
  return estimatePoints(Math.max(1, han), fu, isDealer);
}
