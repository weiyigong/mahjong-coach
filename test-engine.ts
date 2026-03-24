/**
 * Engine test suite - validates shanten, safety, and strategy against known scenarios
 * Run with: npx tsx test-engine.ts
 */

import { calcShanten, calcChitoiShanten, calcKokushiShanten, findEffectiveTiles, shantenLabel } from './src/engine/shanten';
import { calcTileSafetyScore } from './src/engine/safety';
import { calcDangerScore } from './src/engine/opponents';
import { tileToIndex, createTile, indexToTile, tileDisplayName } from './src/engine/tiles';
import type { Tile, Opponent, GameState, DiscardInfo } from './src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${msg}`);
  }
}

function tilesToCounts(tiles: string[]): number[] {
  const counts = new Array(34).fill(0);
  for (const t of tiles) {
    const suit = t.slice(-1);
    const val = parseInt(t.slice(0, -1));
    let suitKey: 'man' | 'pin' | 'sou' | 'honor';
    if (suit === 'm') suitKey = 'man';
    else if (suit === 'p') suitKey = 'pin';
    else if (suit === 's') suitKey = 'sou';
    else suitKey = 'honor';
    counts[tileToIndex(createTile(suitKey, val))]++;
  }
  return counts;
}

function parseTile(s: string): Tile {
  const suit = s.slice(-1);
  const val = parseInt(s.slice(0, -1));
  const suitMap: Record<string, 'man' | 'pin' | 'sou' | 'honor'> = {
    'm': 'man', 'p': 'pin', 's': 'sou', 'z': 'honor'
  };
  return createTile(suitMap[suit], val);
}

// ============ SHANTEN TESTS ============
console.log('\n=== SHANTEN CALCULATOR TESTS ===\n');

// Test 1: Complete hand (和了)
console.log('Test 1: Complete hand');
{
  // 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5p5p
  const counts = tilesToCounts(['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','5p','5p']);
  const s = calcShanten(counts);
  assert(s === -1, `Complete hand should be -1, got ${s}`);
}

// Test 2: Tenpai (聴牌)
console.log('Test 2: Tenpai hand');
{
  // 1m2m3m 4m5m6m 7m8m9m 1p2p 5p5p (waiting for 3p)
  const counts = tilesToCounts(['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','5p','5p']);
  const s = calcShanten(counts);
  assert(s === 0, `Tenpai should be 0, got ${s}`);
}

// Test 3: Iishanten (一向聴)
console.log('Test 3: Iishanten');
{
  // 1m2m3m 5m6m 2p3p4p 6p7p 3s4s5s (3 complete + 2 partial = iishanten)
  const counts = tilesToCounts(['1m','2m','3m','5m','6m','2p','3p','4p','6p','7p','3s','4s','5s']);
  const s = calcShanten(counts);
  assert(s === 1, `Iishanten should be 1, got ${s}`);
}

// Test 4: Ryanshanten (两向聴)
console.log('Test 4: Ryanshanten');
{
  // 1m3m 5p7p 2s4s 1z2z3z 5z6z (scattered)
  const counts = tilesToCounts(['1m','3m','5p','7p','2s','4s','1z','2z','3z','5z','6z','7z','9s']);
  const s = calcShanten(counts);
  assert(s >= 2, `Scattered hand should be >=2, got ${s}`);
}

// Test 5: Chiitoi (七対子)
console.log('Test 5: Chiitoi tenpai');
{
  // 1m1m 3m3m 5m5m 7p7p 2s2s 4s4s 6z (need another 6z)
  const counts = tilesToCounts(['1m','1m','3m','3m','5m','5m','7p','7p','2s','2s','4s','4s','6z']);
  const s = calcChitoiShanten(counts);
  assert(s === 0, `Chiitoi tenpai should be 0, got ${s}`);
}

// Test 6: Kokushi (国士無双)
console.log('Test 6: Kokushi tenpai');
{
  // 1m 9m 1p 9p 1s 9s 1z 2z 3z 4z 5z 6z 7z (13 unique terminals+honors)
  const counts = tilesToCounts(['1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z']);
  const s = calcKokushiShanten(counts);
  assert(s === 0, `Kokushi 13-wait tenpai should be 0, got ${s}`);
}

// Test 7: Effective tiles for tenpai
console.log('Test 7: Effective tiles (waiting tiles)');
{
  // 1m2m3m 4m5m6m 7m8m9m 1p2p 5p5p → waiting for 3p
  const counts = tilesToCounts(['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','5p','5p']);
  const effective = findEffectiveTiles(counts);
  const effectiveNames = effective.map(i => {
    const t = indexToTile(i);
    return tileDisplayName(t);
  });
  assert(effective.length > 0, `Should have waiting tiles, got: ${effectiveNames.join(', ')}`);
  // Should include 3p
  const has3p = effective.some(i => i === tileToIndex(createTile('pin', 3)));
  assert(has3p, `Should be waiting on 3筒`);
}

// ============ OPPONENT DANGER TESTS ============
console.log('\n=== OPPONENT DANGER TESTS ===\n');

// Test 8: Neutral opponent (honors/terminals early)
console.log('Test 8: Normal early discards');
{
  const opp: Opponent = {
    position: 'south',
    discards: [
      { tile: parseTile('1z'), turn: 1, isTsumogiri: false },
      { tile: parseTile('2z'), turn: 2, isTsumogiri: false },
      { tile: parseTile('9m'), turn: 3, isTsumogiri: false },
      { tile: parseTile('1p'), turn: 4, isTsumogiri: false },
    ],
    melds: [],
    riichiTurn: null,
    dangerLevel: 'normal',
    dangerScore: 0,
  };
  const { score, level } = calcDangerScore(opp);
  assert(level === 'normal', `Normal discards should be 'normal', got '${level}' (score: ${score})`);
}

// Test 9: Suspicious opponent (middle tiles early)
console.log('Test 9: Suspicious early middle tile discards');
{
  const opp: Opponent = {
    position: 'south',
    discards: [
      { tile: parseTile('5m'), turn: 1, isTsumogiri: false },
      { tile: parseTile('4p'), turn: 2, isTsumogiri: false },
      { tile: parseTile('6s'), turn: 3, isTsumogiri: false },
    ],
    melds: [],
    riichiTurn: null,
    dangerLevel: 'normal',
    dangerScore: 0,
  };
  const { score, level } = calcDangerScore(opp);
  assert(score >= 25, `3 middle tiles early should score >=25, got ${score}`);
  assert(level === 'suspicious' || level === 'dangerous', `Should be suspicious or dangerous, got '${level}'`);
}

// Test 10: Dangerous opponent (riichi)
console.log('Test 10: Riichi opponent');
{
  const opp: Opponent = {
    position: 'west',
    discards: [
      { tile: parseTile('1z'), turn: 1, isTsumogiri: false },
      { tile: parseTile('9m'), turn: 2, isTsumogiri: false },
    ],
    melds: [],
    riichiTurn: 6,
    dangerLevel: 'normal',
    dangerScore: 0,
  };
  const { score, level } = calcDangerScore(opp);
  assert(score >= 50, `Riichi opponent should score >=50, got ${score}`);
  assert(level === 'dangerous', `Riichi should be 'dangerous', got '${level}'`);
}

// ============ SAFETY TESTS ============
console.log('\n=== SAFETY RATING TESTS ===\n');

// Test 11: Genbutsu is safe
console.log('Test 11: Genbutsu (現物) safety');
{
  const tile = parseTile('5m');
  const state: GameState = {
    roundWind: 'east',
    seatWind: 'east',
    turnNumber: 8,
    doraIndicators: [],
    myHand: [parseTile('1m'), parseTile('2m'), parseTile('3m')],
    myMelds: [],
    myDiscards: [],
    isRiichi: false,
    riichiTurn: null,
    lastDrawnTile: null,
    opponents: [{
      position: 'south',
      discards: [
        { tile: parseTile('5m'), turn: 3, isTsumogiri: false }, // They discarded 5m
      ],
      melds: [],
      riichiTurn: 6,
      dangerLevel: 'dangerous',
      dangerScore: 60,
    }],
    pickTarget: 'hand',
  };
  const { score, breakdown } = calcTileSafetyScore(tile, state);
  assert(score >= 90, `Genbutsu should be >=90 safe, got ${score}`);
}

// Test 12: Suji safety
console.log('Test 12: Suji (筋) safety');
{
  const tile = parseTile('4m');
  const state: GameState = {
    roundWind: 'east',
    seatWind: 'east',
    turnNumber: 10,
    doraIndicators: [],
    myHand: [],
    myMelds: [],
    myDiscards: [],
    isRiichi: false,
    riichiTurn: null,
    lastDrawnTile: null,
    opponents: [{
      position: 'south',
      discards: [
        { tile: parseTile('1m'), turn: 2, isTsumogiri: false }, // 1m discarded → 4m is suji
        { tile: parseTile('7m'), turn: 4, isTsumogiri: false }, // 7m discarded → 4m is double suji
      ],
      melds: [],
      riichiTurn: null,
      dangerLevel: 'normal',
      dangerScore: 0,
    }],
    pickTarget: 'hand',
  };
  const { score } = calcTileSafetyScore(tile, state);
  // 4m is double suji (both 1 and 7 discarded)
  assert(score >= 60, `Double suji should be >=60 safe, got ${score}`);
}

// Test 13: Dangerous middle tile against riichi
console.log('Test 13: Dangerous tile against riichi');
{
  const tile = parseTile('5p');
  const state: GameState = {
    roundWind: 'east',
    seatWind: 'east',
    turnNumber: 10,
    doraIndicators: [],
    myHand: [],
    myMelds: [],
    myDiscards: [],
    isRiichi: false,
    riichiTurn: null,
    lastDrawnTile: null,
    opponents: [{
      position: 'west',
      discards: [
        { tile: parseTile('1z'), turn: 1, isTsumogiri: false },
      ],
      melds: [],
      riichiTurn: 7,
      dangerLevel: 'dangerous',
      dangerScore: 55,
    }],
    pickTarget: 'hand',
  };
  const { score } = calcTileSafetyScore(tile, state);
  assert(score <= 40, `5p against riichi with no suji should be <=40 safe, got ${score}`);
}

// ============ REAL GAME SCENARIO ============
console.log('\n=== REAL GAME SCENARIO TEST ===\n');

// Scenario from a classic tenhou game:
// East round 1, you are South (seat wind)
// Turn 8. Your hand: 2m3m4m 6m7m 3p4p 7p8p 3s4s5s + draw 8m
// Opponent (West) has been discarding middle tiles and just declared riichi
// What should you do?
console.log('Scenario: Mid-game, 一向聴, opponent riichi');
{
  const hand = ['2m','3m','4m','6m','7m','3p','4p','7p','8p','3s','4s','5s'].map(parseTile);
  const draw = parseTile('8m');
  const allTiles = [...hand, draw];
  
  const counts = new Array(34).fill(0);
  for (const t of allTiles) counts[tileToIndex(t)]++;
  
  const shanten = calcShanten(counts);
  console.log(`  Hand shanten: ${shanten} (${shantenLabel(shanten)})`);
  assert(shanten <= 1, `Should be <=1 shanten with draw, got ${shanten}`);
  
  // Find best discard
  const discardOptions: Array<{tile: string, shanten: number, effective: number}> = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue;
    counts[i]--;
    const newShanten = calcShanten(counts);
    const effective = findEffectiveTiles(counts);
    const remaining = effective.reduce((sum, idx) => sum + (4 - counts[idx]), 0); // rough remaining
    const t = indexToTile(i);
    discardOptions.push({
      tile: tileDisplayName(t),
      shanten: newShanten,
      effective: effective.length,
    });
    counts[i]++;
  }
  
  discardOptions.sort((a, b) => a.shanten - b.shanten || b.effective - a.effective);
  console.log('  Top 5 discard options:');
  for (const opt of discardOptions.slice(0, 5)) {
    console.log(`    ${opt.tile}: ${opt.shanten}向聴, ${opt.effective}種有効`);
  }
  
  // With 8m draw, we have 6m7m8m complete. Best discards should keep this.
  // 2p or 5p (if we had them) would be tenpai candidates.
  // The hand is: 2m3m4m 6m7m8m 3p4p 7p8p 3s4s5s → tenpai! waiting on 2p/5p and 6p/9p
  // Hand is actually iishanten: 2m3m4m 6m7m8m are 2 complete sequences, 
  // 3p4p and 7p8p are 2 partial sequences, 3s4s5s is 1 complete = 3 sets + 2 partial + no pair = iishanten
  assert(discardOptions[0].shanten <= 1, `Best discard should maintain iishanten (<=1), got ${discardOptions[0].shanten}`);
}

// ============ RESULTS ============
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log(`${'='.repeat(40)}\n`);

if (failed > 0) process.exit(1);
