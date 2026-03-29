import type { Tile, Meld, Wind } from '../types';
import { tileToIndex, tilesToCounts, isHonor, isTerminal, isSimple, windToHonorValue } from './tiles';
import { calcShanten, calcNormalShanten, findWaitingTiles } from './shanten';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface YakuEstimate {
  name: string;
  han: number;
  closed: boolean;
}

export interface SituationalFlags {
  isIppatsu?: boolean;
  isHaitei?: boolean;
  isHoutei?: boolean;
  isRinshan?: boolean;
  isDoubleRiichi?: boolean;
  isTenhou?: boolean;
  isChiihou?: boolean;
}

export interface HandDecomposition {
  head: number;
  mentsu: Array<{
    type: 'shuntsu' | 'koutsu';
    tiles: number[];
    isClosed: boolean;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tile helpers (index-based)
// ──────────────────────────────────────────────────────────────────────────────

const TERMINAL_INDICES = new Set([0, 8, 9, 17, 18, 26]); // 1m,9m,1p,9p,1s,9s
const GREEN_INDICES = new Set([19, 20, 21, 23, 25, 32]); // 2s,3s,4s,6s,8s,hatsu
const KOKUSHI_INDICES_SET = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

function isTerminalIdx(i: number): boolean { return i < 27 && (i % 9 === 0 || i % 9 === 8); }
function isHonorIdx(i: number): boolean { return i >= 27; }
function isTerminalOrHonorIdx(i: number): boolean { return isTerminalIdx(i) || isHonorIdx(i); }
function isDragonIdx(i: number): boolean { return i >= 31 && i <= 33; }
function isWindIdx(i: number): boolean { return i >= 27 && i <= 30; }

function windToIdx(w: Wind): number {
  return w === 'east' ? 27 : w === 'south' ? 28 : w === 'west' ? 29 : 30;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hand Decomposition (DFS)
// ──────────────────────────────────────────────────────────────────────────────

export function decomposeHand(
  counts: number[],
  openMelds?: Array<{ type: string; tiles: number[] }>
): HandDecomposition[] {
  const results: HandDecomposition[] = [];
  const openCount = openMelds ? openMelds.length : 0;
  const neededMentsu = 4 - openCount;

  const openMentsuDescs: HandDecomposition['mentsu'] = openMelds
    ? openMelds.map(m => ({
        type: (m.type === 'chi' ? 'shuntsu' : 'koutsu') as 'shuntsu' | 'koutsu',
        tiles: m.tiles.slice(),
        isClosed: false,
      }))
    : [];

  const c = counts.slice();
  const stack: HandDecomposition['mentsu'][number][] = [];

  function dfs(i: number): void {
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) {
      results.push({ head: currentHead, mentsu: [...stack, ...openMentsuDescs] });
      return;
    }
    if (stack.length >= neededMentsu) return;

    // Try koutsu
    if (c[i] >= 3) {
      c[i] -= 3;
      stack.push({ type: 'koutsu', tiles: [i, i, i], isClosed: true });
      dfs(i);
      stack.pop();
      c[i] += 3;
    }
    // Try shuntsu
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      stack.push({ type: 'shuntsu', tiles: [i, i + 1, i + 2], isClosed: true });
      dfs(i);
      stack.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  }

  let currentHead = -1;
  for (let h = 0; h < 34; h++) {
    if (c[h] < 2) continue;
    currentHead = h;
    c[h] -= 2;
    dfs(0);
    c[h] += 2;
  }
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Yakuman checks (return han = 13 per yakuman)
// ──────────────────────────────────────────────────────────────────────────────

function checkYakuman(
  allCounts: number[],
  isClosed: boolean,
  decomps: HandDecomposition[],
  situational?: SituationalFlags
): YakuEstimate[] {
  const yaku: YakuEstimate[] = [];

  // Tenhou / Chiihou
  if (situational?.isTenhou) {
    yaku.push({ name: '天和', han: 13, closed: true });
    return yaku;
  }
  if (situational?.isChiihou) {
    yaku.push({ name: '地和', han: 13, closed: true });
    return yaku;
  }

  // Kokushi (13 orphans)
  if (isClosed) {
    let hasAll = true;
    let hasPair = false;
    for (const idx of KOKUSHI_INDICES_SET) {
      if (allCounts[idx] === 0) { hasAll = false; break; }
      if (allCounts[idx] >= 2) hasPair = true;
    }
    if (hasAll && hasPair) {
      let totalKokushi = 0;
      for (const idx of KOKUSHI_INDICES_SET) totalKokushi += allCounts[idx];
      if (totalKokushi === 14) {
        yaku.push({ name: '国士無双', han: 13, closed: true });
        return yaku;
      }
    }
  }

  // Tsuuiisou (all honors)
  {
    let total = 0;
    for (let i = 27; i < 34; i++) total += allCounts[i];
    if (total === 14) {
      yaku.push({ name: '字一色', han: 13, closed: false });
      return yaku;
    }
  }

  // Chinroutou (all terminals, no honors)
  {
    let total = 0;
    for (const idx of TERMINAL_INDICES) total += allCounts[idx];
    const honorTotal = allCounts.slice(27).reduce((a, b) => a + b, 0);
    if (total === 14 && honorTotal === 0) {
      yaku.push({ name: '清老頭', han: 13, closed: false });
      return yaku;
    }
  }

  // Ryuuiisou (all green)
  {
    let total = 0;
    for (let i = 0; i < 34; i++) {
      if (allCounts[i] > 0 && !GREEN_INDICES.has(i)) { total = -1; break; }
      total += allCounts[i];
    }
    if (total === 14) {
      yaku.push({ name: '緑一色', han: 13, closed: false });
      return yaku;
    }
  }

  // Chuuren Poutou (nine gates) - closed, single suit, 1112345678999 + 1 extra
  if (isClosed) {
    for (let suitStart = 0; suitStart < 27; suitStart += 9) {
      let nonSuit = false;
      for (let i = 0; i < 34; i++) {
        if (i >= suitStart && i < suitStart + 9) continue;
        if (allCounts[i] > 0) { nonSuit = true; break; }
      }
      if (nonSuit) continue;

      // Check base pattern: 1112345678999 = counts [3,1,1,1,1,1,1,1,3]
      const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      let extra = 0;
      let valid = true;
      for (let j = 0; j < 9; j++) {
        const diff = allCounts[suitStart + j] - base[j];
        if (diff < 0) { valid = false; break; }
        extra += diff;
      }
      if (valid && extra === 1) {
        yaku.push({ name: '九蓮宝燈', han: 13, closed: true });
        return yaku;
      }
    }
  }

  // Decomposition-based yakuman
  for (const d of decomps) {
    const koutsuIndices = d.mentsu.filter(m => m.type === 'koutsu').map(m => m.tiles[0]);
    const closedKoutsu = d.mentsu.filter(m => m.type === 'koutsu' && m.isClosed);

    // Suuankou (4 closed koutsu)
    if (isClosed && closedKoutsu.length === 4) {
      yaku.push({ name: '四暗刻', han: 13, closed: true });
      return yaku;
    }

    // Daisangen (3 dragon koutsu)
    if (koutsuIndices.includes(31) && koutsuIndices.includes(32) && koutsuIndices.includes(33)) {
      yaku.push({ name: '大三元', han: 13, closed: false });
      return yaku;
    }

    // Daisuushii (4 wind koutsu)
    const windKoutsu = koutsuIndices.filter(i => isWindIdx(i));
    if (windKoutsu.length === 4) {
      yaku.push({ name: '大四喜', han: 26, closed: false }); // double yakuman
      return yaku;
    }

    // Shousuushii (3 wind koutsu + wind pair)
    if (windKoutsu.length === 3 && isWindIdx(d.head)) {
      yaku.push({ name: '小四喜', han: 13, closed: false });
      return yaku;
    }
  }

  return yaku; // empty = no yakuman
}

// ──────────────────────────────────────────────────────────────────────────────
// Decomposition-based yaku evaluation
// ──────────────────────────────────────────────────────────────────────────────

function evaluateDecomposition(
  d: HandDecomposition,
  isClosed: boolean,
  allCounts: number[],
  roundWindIdx: number,
  seatWindIdx: number
): YakuEstimate[] {
  const yaku: YakuEstimate[] = [];
  const head = d.head;
  const mentsu = d.mentsu;
  const shuntsu = mentsu.filter(m => m.type === 'shuntsu');
  const koutsu = mentsu.filter(m => m.type === 'koutsu');
  const closedKoutsu = koutsu.filter(m => m.isClosed);
  const closedShuntsu = shuntsu.filter(m => m.isClosed);

  // ── Yakuhai (dragons, winds) ──
  for (const k of koutsu) {
    const idx = k.tiles[0];
    if (idx === 31) yaku.push({ name: '役牌(白)', han: 1, closed: false });
    else if (idx === 32) yaku.push({ name: '役牌(發)', han: 1, closed: false });
    else if (idx === 33) yaku.push({ name: '役牌(中)', han: 1, closed: false });
    else if (idx === roundWindIdx && idx === seatWindIdx) {
      yaku.push({ name: '連風牌', han: 2, closed: false });
    } else {
      if (idx === roundWindIdx) yaku.push({ name: '場風', han: 1, closed: false });
      if (idx === seatWindIdx) yaku.push({ name: '自風', han: 1, closed: false });
    }
  }

  // ── Pinfu (平和) ──
  // Closed, all 4 mentsu shuntsu, head not yakuhai, assume ryanmen wait
  if (isClosed && shuntsu.length === 4) {
    const headIsYakuhai = isDragonIdx(head) || head === roundWindIdx || head === seatWindIdx;
    if (!headIsYakuhai) {
      yaku.push({ name: '平和', han: 1, closed: true });
    }
  }

  // ── Tanyao (断幺九) ──
  {
    let allSimple = true;
    for (let i = 0; i < 34; i++) {
      if (allCounts[i] > 0 && isTerminalOrHonorIdx(i)) { allSimple = false; break; }
    }
    if (allSimple) yaku.push({ name: '断幺九', han: 1, closed: false });
  }

  // ── Iipeiko / Ryanpeikou ──
  if (isClosed) {
    // Count identical closed shuntsu pairs
    const shuntsuKeys = closedShuntsu.map(s => s.tiles[0]);
    const keyCounts = new Map<number, number>();
    for (const k of shuntsuKeys) keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
    let identicalPairs = 0;
    for (const [, count] of keyCounts) {
      identicalPairs += Math.floor(count / 2);
    }
    if (identicalPairs >= 2) {
      yaku.push({ name: '二盃口', han: 3, closed: true });
    } else if (identicalPairs === 1) {
      yaku.push({ name: '一盃口', han: 1, closed: true });
    }
  }

  // ── Sanshoku Doujun (三色同順) ──
  {
    const shuntsuStarts = shuntsu.map(s => s.tiles[0]);
    for (const start of shuntsuStarts) {
      if (start >= 27) continue;
      const posInSuit = start % 9;
      const manStart = posInSuit;
      const pinStart = 9 + posInSuit;
      const souStart = 18 + posInSuit;
      if (shuntsuStarts.includes(manStart) && shuntsuStarts.includes(pinStart) && shuntsuStarts.includes(souStart)) {
        yaku.push({ name: '三色同順', han: isClosed ? 2 : 1, closed: false });
        break;
      }
    }
  }

  // ── Ittsu (一気通貫) ──
  {
    const shuntsuStarts = new Set(shuntsu.map(s => s.tiles[0]));
    for (let suitStart = 0; suitStart < 27; suitStart += 9) {
      if (shuntsuStarts.has(suitStart) && shuntsuStarts.has(suitStart + 3) && shuntsuStarts.has(suitStart + 6)) {
        yaku.push({ name: '一気通貫', han: isClosed ? 2 : 1, closed: false });
        break;
      }
    }
  }

  // ── Toitoi (対々和) ──
  if (koutsu.length === 4) {
    yaku.push({ name: '対々和', han: 2, closed: false });
  }

  // ── San Ankou (三暗刻) ──
  if (closedKoutsu.length === 3) {
    yaku.push({ name: '三暗刻', han: 2, closed: false });
  }

  // ── Sanshoku Doukou (三色同刻) ──
  {
    const koutsuIdxs = koutsu.map(k => k.tiles[0]);
    for (const idx of koutsuIdxs) {
      if (idx >= 27) continue;
      const posInSuit = idx % 9;
      if (koutsuIdxs.includes(posInSuit) && koutsuIdxs.includes(9 + posInSuit) && koutsuIdxs.includes(18 + posInSuit)) {
        yaku.push({ name: '三色同刻', han: 2, closed: false });
        break;
      }
    }
  }

  // ── Chanta / Junchan ──
  {
    let allGroupsHaveTermOrHonor = true;
    let hasHonor = isHonorIdx(head);
    let headHasTermOrHonor = isTerminalOrHonorIdx(head);

    if (!headHasTermOrHonor) {
      allGroupsHaveTermOrHonor = false;
    } else {
      for (const m of mentsu) {
        if (m.type === 'koutsu') {
          const idx = m.tiles[0];
          if (!isTerminalOrHonorIdx(idx)) { allGroupsHaveTermOrHonor = false; break; }
          if (isHonorIdx(idx)) hasHonor = true;
        } else {
          // Shuntsu: must contain 1 or 9 (start%9==0 for 123, or start%9==6 for 789)
          const start = m.tiles[0];
          if (start % 9 !== 0 && start % 9 !== 6) { allGroupsHaveTermOrHonor = false; break; }
        }
      }
    }

    if (allGroupsHaveTermOrHonor && mentsu.length === 4) {
      if (!hasHonor) {
        // Junchan: no honors, all groups have terminals
        yaku.push({ name: '純チャン', han: isClosed ? 3 : 2, closed: false });
      } else {
        // Chanta: has honors
        yaku.push({ name: 'チャンタ', han: isClosed ? 2 : 1, closed: false });
      }
    }
  }

  // ── Honroutou (混老頭) ──
  {
    let allTermOrHonor = true;
    for (let i = 0; i < 34; i++) {
      if (allCounts[i] > 0 && !isTerminalOrHonorIdx(i)) { allTermOrHonor = false; break; }
    }
    const hasHonors = allCounts.slice(27).some(c => c > 0);
    if (allTermOrHonor && hasHonors) {
      yaku.push({ name: '混老頭', han: 2, closed: false });
    }
  }

  // ── Shousangen (小三元) ──
  {
    const dragonKoutsu = koutsu.filter(k => isDragonIdx(k.tiles[0]));
    if (dragonKoutsu.length === 2 && isDragonIdx(head)) {
      yaku.push({ name: '小三元', han: 2, closed: false });
    }
  }

  // ── Honitsu (混一色) / Chinitsu (清一色) ──
  {
    let suitFound = -1;
    let hasHonors = false;
    let multiSuit = false;
    for (let i = 0; i < 34; i++) {
      if (allCounts[i] === 0) continue;
      if (i >= 27) { hasHonors = true; continue; }
      const suit = Math.floor(i / 9);
      if (suitFound === -1) suitFound = suit;
      else if (suit !== suitFound) { multiSuit = true; break; }
    }
    if (!multiSuit && suitFound >= 0) {
      if (!hasHonors) {
        yaku.push({ name: '清一色', han: isClosed ? 6 : 5, closed: false });
      } else {
        yaku.push({ name: '混一色', han: isClosed ? 3 : 2, closed: false });
      }
    }
  }

  return yaku;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main estimateYaku
// ──────────────────────────────────────────────────────────────────────────────

export function estimateYaku(
  hand: Tile[],
  melds: Meld[],
  roundWind: Wind,
  seatWind: Wind,
  isRiichi: boolean,
  isTsumo: boolean,
  situational?: SituationalFlags
): YakuEstimate[] {
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const allCounts = tilesToCounts(allTiles);
  const isClosed = melds.every(m => m.type === 'closedKan') || melds.length === 0;
  const roundWindIdx = windToIdx(roundWind);
  const seatWindIdx = windToIdx(seatWind);

  // Convert open melds to index-based for decomposition
  const openMeldsIdx = melds.filter(m => m.type !== 'closedKan').map(m => ({
    type: m.type,
    tiles: m.tiles.map(t => tileToIndex(t)),
  }));

  // Get closed hand counts (exclude open meld tiles)
  const closedCounts = tilesToCounts(hand);

  // Decompose hand
  const decomps = decomposeHand(closedCounts, openMeldsIdx);

  // ── Check yakuman first ──
  const yakumanResult = checkYakuman(allCounts, isClosed, decomps, situational);
  if (yakumanResult.length > 0) return yakumanResult;

  // ── Chiitoitsu (7 pairs) — special form, no decomposition ──
  let chiitoiYaku: YakuEstimate[] | null = null;
  if (isClosed && melds.length === 0) {
    let pairs = 0;
    let uniquePairs = true;
    const pairIndices: number[] = [];
    for (let i = 0; i < 34; i++) {
      if (closedCounts[i] === 2) { pairs++; pairIndices.push(i); }
      else if (closedCounts[i] === 4) { uniquePairs = false; } // 4 of same = not valid chiitoitsu
      else if (closedCounts[i] !== 0) { pairs = -1; break; }
    }
    if (pairs === 7 && uniquePairs) {
      chiitoiYaku = [{ name: '七対子', han: 2, closed: true }];
      // Can combine with: tanyao, honitsu, chinitsu, honroutou
      let allSimple = true;
      for (const idx of pairIndices) {
        if (isTerminalOrHonorIdx(idx)) allSimple = false;
      }
      if (allSimple) chiitoiYaku.push({ name: '断幺九', han: 1, closed: false });

      let suitFound = -1;
      let hasHonors = false;
      let multiSuit = false;
      for (const idx of pairIndices) {
        if (idx >= 27) { hasHonors = true; continue; }
        const suit = Math.floor(idx / 9);
        if (suitFound === -1) suitFound = suit;
        else if (suit !== suitFound) multiSuit = true;
      }
      if (!multiSuit && suitFound >= 0) {
        if (!hasHonors) chiitoiYaku.push({ name: '清一色', han: 6, closed: false });
        else chiitoiYaku.push({ name: '混一色', han: 3, closed: false });
      }

      let allTermOrHonor = true;
      for (const idx of pairIndices) {
        if (!isTerminalOrHonorIdx(idx)) { allTermOrHonor = false; break; }
      }
      if (allTermOrHonor && hasHonors) {
        chiitoiYaku.push({ name: '混老頭', han: 2, closed: false });
      }
    }
  }

  // ── Evaluate each decomposition ──
  let bestYaku: YakuEstimate[] = [];
  let bestHan = 0;

  for (const d of decomps) {
    const dYaku = evaluateDecomposition(d, isClosed, allCounts, roundWindIdx, seatWindIdx);
    const totalHan = dYaku.reduce((sum, y) => sum + y.han, 0);
    if (totalHan > bestHan) {
      bestHan = totalHan;
      bestYaku = dYaku;
    }
  }

  // Compare with chiitoitsu
  if (chiitoiYaku) {
    const chiitoiHan = chiitoiYaku.reduce((sum, y) => sum + y.han, 0);
    if (chiitoiHan > bestHan) {
      bestHan = chiitoiHan;
      bestYaku = chiitoiYaku;
    }
  }

  // If no decomposition found (incomplete hand), fall back to tile-counting heuristics
  if (decomps.length === 0 && !chiitoiYaku) {
    bestYaku = estimateYakuFallback(allTiles, allCounts, isClosed, roundWindIdx, seatWindIdx);
    bestHan = bestYaku.reduce((sum, y) => sum + y.han, 0);
  }

  // ── Add non-decomposition yaku ──
  if (isRiichi) {
    if (situational?.isDoubleRiichi) {
      bestYaku.push({ name: 'ダブル立直', han: 2, closed: true });
    } else {
      bestYaku.push({ name: '立直', han: 1, closed: true });
    }
  }

  if (isTsumo && isClosed) {
    bestYaku.push({ name: '門前清自摸', han: 1, closed: true });
  }

  // Situational
  if (situational?.isIppatsu) bestYaku.push({ name: '一発', han: 1, closed: true });
  if (situational?.isHaitei) bestYaku.push({ name: '海底摸月', han: 1, closed: false });
  if (situational?.isHoutei) bestYaku.push({ name: '河底撈魚', han: 1, closed: false });
  if (situational?.isRinshan) bestYaku.push({ name: '嶺上開花', han: 1, closed: false });

  return bestYaku;
}

// ──────────────────────────────────────────────────────────────────────────────
// Fallback: heuristic yaku for incomplete hands (used for estimation during play)
// ──────────────────────────────────────────────────────────────────────────────

function estimateYakuFallback(
  allTiles: Tile[],
  allCounts: number[],
  isClosed: boolean,
  roundWindIdx: number,
  seatWindIdx: number
): YakuEstimate[] {
  const yaku: YakuEstimate[] = [];

  // Tanyao
  let allSimple = true;
  for (let i = 0; i < 34; i++) {
    if (allCounts[i] > 0 && isTerminalOrHonorIdx(i)) { allSimple = false; break; }
  }
  if (allSimple) yaku.push({ name: '断幺九', han: 1, closed: false });

  // Yakuhai
  for (let d = 31; d <= 33; d++) {
    if (allCounts[d] >= 3) {
      const names = { 31: '白', 32: '發', 33: '中' };
      yaku.push({ name: `役牌(${names[d as 31 | 32 | 33]})`, han: 1, closed: false });
    }
  }
  if (roundWindIdx === seatWindIdx) {
    if (allCounts[roundWindIdx] >= 3) yaku.push({ name: '連風牌', han: 2, closed: false });
  } else {
    if (allCounts[roundWindIdx] >= 3) yaku.push({ name: '場風', han: 1, closed: false });
    if (allCounts[seatWindIdx] >= 3) yaku.push({ name: '自風', han: 1, closed: false });
  }

  // Honitsu / Chinitsu
  let suitFound = -1;
  let hasHonors = false;
  let multiSuit = false;
  for (let i = 0; i < 34; i++) {
    if (allCounts[i] === 0) continue;
    if (i >= 27) { hasHonors = true; continue; }
    const suit = Math.floor(i / 9);
    if (suitFound === -1) suitFound = suit;
    else if (suit !== suitFound) { multiSuit = true; break; }
  }
  if (!multiSuit && suitFound >= 0) {
    if (!hasHonors) yaku.push({ name: '清一色', han: isClosed ? 6 : 5, closed: false });
    else yaku.push({ name: '混一色', han: isClosed ? 3 : 2, closed: false });
  }

  // Toitoi
  const triplets = allCounts.filter(c => c >= 3).length;
  const pairs = allCounts.filter(c => c === 2).length;
  if (triplets === 4 && pairs === 1) {
    yaku.push({ name: '対々和', han: 2, closed: false });
  }

  return yaku;
}

// ──────────────────────────────────────────────────────────────────────────────
// Scoring: han, fu, points
// ──────────────────────────────────────────────────────────────────────────────

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

export function estimateFu(
  hand: Tile[],
  melds: Meld[],
  isTsumo: boolean,
  seatWind: Wind,
  roundWind: Wind
): number {
  const closedCounts = tilesToCounts(hand);
  const isClosed = melds.every(m => m.type === 'closedKan') || melds.length === 0;
  const roundWindIdx = windToIdx(roundWind);
  const seatWindIdx = windToIdx(seatWind);

  const openMeldsIdx = melds.filter(m => m.type !== 'closedKan').map(m => ({
    type: m.type,
    tiles: m.tiles.map(t => tileToIndex(t)),
  }));

  const decomps = decomposeHand(closedCounts, openMeldsIdx);

  // Check chiitoitsu: always 25 fu
  if (isClosed && melds.length === 0) {
    let pairs = 0;
    for (let i = 0; i < 34; i++) {
      if (closedCounts[i] === 2) pairs++;
      else if (closedCounts[i] !== 0) { pairs = -1; break; }
    }
    if (pairs === 7) return 25;
  }

  if (decomps.length === 0) {
    // Fallback
    return 30;
  }

  // Evaluate fu for each decomposition, pick the one that produces the best score
  let bestFu = 30;

  for (const d of decomps) {
    let fu = 30; // base for ron (closed or open)

    // Check if pinfu (all shuntsu, non-yakuhai head)
    const allShuntsu = d.mentsu.every(m => m.type === 'shuntsu');
    const headIsYakuhai = isDragonIdx(d.head) || d.head === roundWindIdx || d.head === seatWindIdx;
    const isPinfu = isClosed && allShuntsu && !headIsYakuhai;

    if (isPinfu && isTsumo) {
      fu = 20; // pinfu tsumo special
    } else {
      // Tsumo bonus (non-pinfu)
      if (isTsumo) fu += 2;

      // Closed ron bonus
      if (isClosed && !isTsumo) fu += 10;
    }

    // Pair fu
    if (isDragonIdx(d.head)) fu += 2;
    if (d.head === roundWindIdx) fu += 2;
    if (d.head === seatWindIdx) fu += 2;

    // Mentsu fu
    for (const m of d.mentsu) {
      if (m.type === 'koutsu') {
        const idx = m.tiles[0];
        const isYaochu = isTerminalOrHonorIdx(idx);
        if (m.isClosed) {
          fu += isYaochu ? 8 : 4;
        } else {
          fu += isYaochu ? 4 : 2;
        }
      }
      // Shuntsu = 0 fu
    }

    // Open kan / closed kan fu from melds
    for (const meld of melds) {
      if (meld.type === 'kan') {
        const idx = tileToIndex(meld.tiles[0]);
        fu += isTerminalOrHonorIdx(idx) ? 16 : 8;
      } else if (meld.type === 'closedKan') {
        const idx = tileToIndex(meld.tiles[0]);
        fu += isTerminalOrHonorIdx(idx) ? 32 : 16;
      }
    }

    // Wait fu: assume ryanmen (0) for pinfu, otherwise +2 average
    if (!isPinfu) {
      fu += 2; // conservative estimate for non-ryanmen waits
    }

    // Round up to nearest 10
    fu = Math.ceil(fu / 10) * 10;

    // Open hand minimum 30
    if (!isClosed && fu < 30) fu = 30;

    if (fu > bestFu) bestFu = fu;
  }

  return bestFu;
}

export function estimatePoints(han: number, fu: number, isDealer: boolean): number {
  if (han >= 5 || (han === 4 && fu >= 30) || (han === 3 && fu >= 70)) {
    if (han >= 13) return isDealer ? 48000 : 32000;
    if (han >= 11) return isDealer ? 36000 : 24000;
    if (han >= 8) return isDealer ? 24000 : 16000;
    if (han >= 6) return isDealer ? 18000 : 12000;
    return isDealer ? 12000 : 8000; // mangan
  }

  const basicPoints = fu * Math.pow(2, han + 2);
  if (isDealer) {
    return Math.ceil(basicPoints * 6 / 100) * 100;
  } else {
    return Math.ceil(basicPoints * 4 / 100) * 100;
  }
}

export function estimateHandValue(
  hand: Tile[],
  melds: Meld[],
  roundWind: Wind,
  seatWind: Wind,
  doraIndicators: Tile[],
  isDealer: boolean
): number {
  let doraCount = 0;
  for (const indicator of doraIndicators) {
    const doraIdx = tileToIndex(indicator);
    const doraValue = (doraIdx % 9) === 8 ? doraIdx - 8 : doraIdx + 1;
    const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
    doraCount += allTiles.filter(t => tileToIndex(t) === doraValue).length;
  }

  const han = estimateTotalHan(hand, melds, roundWind, seatWind, false, false, doraCount);
  const fu = estimateFu(hand, melds, false, seatWind, roundWind);
  return estimatePoints(Math.max(1, han), fu, isDealer);
}
