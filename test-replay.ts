/**
 * Replay a real MJAI game log through our engine and validate recommendations
 * Run with: npx tsx test-replay.ts
 */

import { calcShanten, findEffectiveTiles, shantenLabel } from './src/engine/shanten';
import { calcTileSafetyScore } from './src/engine/safety';
import { calcDangerScore } from './src/engine/opponents';
import { analyzeDiscards } from './src/engine/efficiency';
import { calcStrategy, strategyLabel } from './src/engine/strategy';
import { tileToIndex, createTile, indexToTile, tileDisplayName, tilesToCounts, sortTiles } from './src/engine/tiles';
import type { Tile, Opponent, GameState, DiscardInfo, Wind } from './src/types';
import * as fs from 'fs';

// Parse MJAI tile notation to our Tile type
function parseMjaiTile(s: string): Tile {
  // Handle honor tiles: E, S, W, N, P(白), F(発), C(中)
  const honorMap: Record<string, number> = { 'E': 1, 'S': 2, 'W': 3, 'N': 4, 'P': 5, 'F': 6, 'C': 7 };
  if (honorMap[s]) return createTile('honor', honorMap[s]);
  
  // Handle red fives
  const cleaned = s.replace('r', '');
  const val = parseInt(cleaned.slice(0, -1));
  const suit = cleaned.slice(-1);
  const suitMap: Record<string, 'man' | 'pin' | 'sou'> = { 'm': 'man', 'p': 'pin', 's': 'sou' };
  return createTile(suitMap[suit], val);
}

function windFromMjai(w: string): Wind {
  const map: Record<string, Wind> = { 'E': 'east', 'S': 'south', 'W': 'west', 'N': 'north' };
  return map[w] || 'east';
}

// Read and parse MJAI file
const logFile = process.argv[2] || '/tmp/tenhou-games/2026011621gm-00a9-0000-4b7af114.mjson';
console.log(`Loading: ${logFile}\n`);
const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
const events = lines.map(l => JSON.parse(l));

console.log('=== REPLAYING TENHOU PHOENIX ROOM GAME ===\n');

// Track game state for player 0 (our perspective)
const PLAYER = 0;
let hand: Tile[] = [];
let myDiscards: Tile[] = [];
let opponents: Opponent[] = [];
let roundWind: Wind = 'east';
let seatWind: Wind = 'east';
let turnNumber = 0;
let doraIndicators: Tile[] = [];

for (const event of events) {
  if (event.type === 'start_kyoku') {
    // Initialize round
    roundWind = windFromMjai(event.bakaze);
    seatWind = (['east', 'south', 'west', 'north'] as Wind[])[PLAYER];
    hand = event.tehais[PLAYER].map(parseMjaiTile);
    hand = sortTiles(hand);
    myDiscards = [];
    turnNumber = 0;
    doraIndicators = [parseMjaiTile(event.dora_marker)];
    
    // Initialize opponents
    const allWinds: Wind[] = ['east', 'south', 'west', 'north'];
    opponents = allWinds.filter(w => w !== seatWind).map(w => ({
      position: w,
      discards: [],
      melds: [],
      riichiTurn: null,
      dangerLevel: 'normal' as const,
      dangerScore: 0,
    }));
    
    console.log(`\n--- 東${event.kyoku}局 (Dora: ${tileDisplayName(doraIndicators[0])}) ---`);
    console.log(`Starting hand: ${hand.map(tileDisplayName).join(' ')}`);
    
    const counts = tilesToCounts(hand);
    const shanten = calcShanten(counts);
    console.log(`Initial 向听数: ${shantenLabel(shanten)}`);
    console.log('');
  }
  
  if (event.type === 'tsumo' && event.actor === PLAYER) {
    const drawn = parseMjaiTile(event.pai);
    turnNumber++;
    
    // Build game state for analysis
    const allTiles = [...hand, drawn];
    const gameState: GameState = {
      roundWind, seatWind, turnNumber, doraIndicators,
      myHand: hand,
      myMelds: [],
      myDiscards,
      isRiichi: false,
      riichiTurn: null,
      lastDrawnTile: drawn,
      opponents,
      pickTarget: 'hand',
    };
    
    const counts = tilesToCounts(allTiles);
    const shanten = calcShanten(counts);
    const strategy = calcStrategy(gameState);
    
    console.log(`Turn ${turnNumber}: Drew ${tileDisplayName(drawn)} | Hand: ${sortTiles(allTiles).map(tileDisplayName).join(' ')}`);
    console.log(`  向听数: ${shantenLabel(shanten)} | Strategy: ${strategyLabel(strategy.mode)}`);
    
    if (strategy.discards.length > 0) {
      const top3 = strategy.discards.slice(0, 3);
      console.log(`  Top recommendations:`);
      for (const d of top3) {
        const marker = d.rank === 1 ? '  ⭐' : '    ';
        console.log(`${marker} ${tileDisplayName(d.tile)} → ${shantenLabel(d.shantenAfter)}, ${d.effectiveTileCount}枚(${d.effectiveTileTypes}種), safety:${d.safetyScore}%`);
      }
    }
    
    // Check for danger level changes
    for (const opp of opponents) {
      if (opp.dangerLevel !== 'normal') {
        console.log(`  ⚠️ ${opp.position}家: ${opp.dangerLevel} (score: ${opp.dangerScore})`);
      }
    }
    console.log('');
  }
  
  if (event.type === 'dahai' && event.actor === PLAYER) {
    const discarded = parseMjaiTile(event.pai);
    // Remove from hand
    const idx = hand.findIndex(t => t.suit === discarded.suit && t.value === discarded.value);
    if (idx >= 0) {
      hand.splice(idx, 1);
    }
    myDiscards.push(discarded);
  }
  
  if (event.type === 'dahai' && event.actor !== PLAYER) {
    const discarded = parseMjaiTile(event.pai);
    const oppWind = (['east', 'south', 'west', 'north'] as Wind[])[event.actor];
    const opp = opponents.find(o => o.position === oppWind);
    if (opp) {
      const discardInfo: DiscardInfo = {
        tile: discarded,
        turn: turnNumber,
        isTsumogiri: event.tsumogiri || false,
      };
      opp.discards.push(discardInfo);
      const { score, level } = calcDangerScore(opp);
      opp.dangerScore = score;
      opp.dangerLevel = level;
    }
  }
  
  if (event.type === 'reach' || event.type === 'reach_accepted') {
    if (event.type === 'reach_accepted' && event.actor !== PLAYER) {
      const oppWind = (['east', 'south', 'west', 'north'] as Wind[])[event.actor];
      const opp = opponents.find(o => o.position === oppWind);
      if (opp) {
        opp.riichiTurn = turnNumber;
        const { score, level } = calcDangerScore(opp);
        opp.dangerScore = score;
        opp.dangerLevel = level;
        console.log(`🔴 ${oppWind}家 declared 立直! Danger: ${level} (${score})`);
        console.log('');
      }
    }
  }
}

// Final analysis
console.log('\n=== FINAL ANALYSIS ===');
console.log(`Hand at end: ${hand.map(tileDisplayName).join(' ')}`);
const finalCounts = tilesToCounts(hand);
const finalShanten = calcShanten(finalCounts);
console.log(`Final 向听数: ${shantenLabel(finalShanten)}`);

// Check each opponent's final danger status
for (const opp of opponents) {
  console.log(`${opp.position}家: ${opp.dangerLevel} (score: ${opp.dangerScore}), discards: ${opp.discards.map(d => tileDisplayName(d.tile)).join(' ')}`);
}

console.log('\n✅ Replay complete. All engine computations ran without errors.');
