/**
 * Accuracy test: Compare our engine's top recommendation against
 * what real 鳳凰卓 players actually discarded.
 * 
 * Metric: agreement rate = (times our #1 matches player's actual discard) / (total discard decisions)
 * Also track: top-3 agreement (was the player's choice in our top 3?)
 * 
 * Run: npx tsx test-accuracy.ts [game_file_or_directory]
 */

import { calcShanten, findEffectiveTiles } from './src/engine/shanten';
import { analyzeDiscards } from './src/engine/efficiency';
import { calcStrategy } from './src/engine/strategy';
import { calcDangerScore } from './src/engine/opponents';
import { tileToIndex, createTile, tileDisplayName, tilesToCounts, sortTiles } from './src/engine/tiles';
import type { Tile, Opponent, GameState, DiscardInfo, Wind } from './src/types';
import * as fs from 'fs';
import * as path from 'path';

function parseMjaiTile(s: string): Tile {
  const honorMap: Record<string, number> = { 'E': 1, 'S': 2, 'W': 3, 'N': 4, 'P': 5, 'F': 6, 'C': 7 };
  if (honorMap[s]) return createTile('honor', honorMap[s]);
  const cleaned = s.replace('r', '');
  const val = parseInt(cleaned.slice(0, -1));
  const suit = cleaned.slice(-1);
  const suitMap: Record<string, 'man' | 'pin' | 'sou'> = { 'm': 'man', 'p': 'pin', 's': 'sou' };
  return createTile(suitMap[suit], val);
}

function tileKey(t: Tile): string {
  return `${t.suit}${t.value}`;
}

interface AccuracyResult {
  file: string;
  totalDecisions: number;
  top1Matches: number;
  top3Matches: number;
  top5Matches: number;
  attackDecisions: number;
  attackTop1: number;
  defenseDecisions: number;
  defenseTop1: number;
}

function analyzeGame(filePath: string): AccuracyResult {
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
  const events = lines.map(l => JSON.parse(l));
  const fileName = path.basename(filePath);

  const result: AccuracyResult = {
    file: fileName,
    totalDecisions: 0,
    top1Matches: 0,
    top3Matches: 0,
    top5Matches: 0,
    attackDecisions: 0,
    attackTop1: 0,
    defenseDecisions: 0,
    defenseTop1: 0,
  };

  // We analyze from player 0's perspective
  const PLAYER = 0;
  let hand: Tile[] = [];
  let myDiscards: Tile[] = [];
  let myMelds: any[] = [];
  let opponents: Opponent[] = [];
  let roundWind: Wind = 'east';
  let seatWind: Wind = 'east';
  let turnNumber = 0;
  let doraIndicators: Tile[] = [];
  let isRiichi = false;
  let drawnTile: Tile | null = null;
  let pendingDiscard = false;

  for (const event of events) {
    if (event.type === 'start_kyoku') {
      roundWind = event.bakaze === 'E' ? 'east' : event.bakaze === 'S' ? 'south' : event.bakaze === 'W' ? 'west' : 'north';
      const playerWinds: Wind[] = ['east', 'south', 'west', 'north'];
      // Oya (dealer) is east, then rotate
      const oyaOffset = event.oya;
      seatWind = playerWinds[(PLAYER - oyaOffset + 4) % 4];
      
      hand = event.tehais[PLAYER].map(parseMjaiTile);
      myDiscards = [];
      myMelds = [];
      turnNumber = 0;
      doraIndicators = [parseMjaiTile(event.dora_marker)];
      isRiichi = false;
      drawnTile = null;
      pendingDiscard = false;

      const allWinds: Wind[] = ['east', 'south', 'west', 'north'];
      opponents = allWinds.filter(w => w !== seatWind).map(w => ({
        position: w,
        discards: [],
        melds: [],
        riichiTurn: null,
        dangerLevel: 'normal' as const,
        dangerScore: 0,
      }));
    }

    if (event.type === 'tsumo' && event.actor === PLAYER) {
      drawnTile = parseMjaiTile(event.pai);
      turnNumber++;
      pendingDiscard = true;
    }

    if (event.type === 'dahai' && event.actor === PLAYER && pendingDiscard && drawnTile) {
      // This is a decision point — compare our recommendation to what they did
      const actualDiscard = parseMjaiTile(event.pai);
      const actualKey = tileKey(actualDiscard);

      // Skip if in riichi (no choice)
      if (isRiichi) {
        pendingDiscard = false;
        // Still update hand
        if (event.tsumogiri) {
          // Discarded the drawn tile
        } else {
          const idx = hand.findIndex(t => tileKey(t) === actualKey);
          if (idx >= 0) {
            hand.splice(idx, 1);
            hand.push(drawnTile);
            hand = sortTiles(hand);
          }
        }
        myDiscards.push(actualDiscard);
        drawnTile = null;
        continue;
      }

      // Build game state
      const gameState: GameState = {
        roundWind, seatWind, turnNumber, doraIndicators,
        myHand: hand,
        myMelds,
        myDiscards,
        isRiichi: false,
        riichiTurn: null,
        lastDrawnTile: drawnTile,
        opponents,
        pickTarget: 'hand',
        scores: [25000, 25000, 25000, 25000] as [number, number, number, number],
        currentRound: 'E1',
        winningTileAppeared: null,
        winningTileFrom: null,
      };

      // Get our recommendations
      const strategy = calcStrategy(gameState);
      const recs = strategy.discards;

      if (recs.length > 0) {
        result.totalDecisions++;

        const top1Key = tileKey(recs[0].tile);
        const top3Keys = recs.slice(0, 3).map(r => tileKey(r.tile));
        const top5Keys = recs.slice(0, 5).map(r => tileKey(r.tile));

        if (top1Key === actualKey) result.top1Matches++;
        if (top3Keys.includes(actualKey)) result.top3Matches++;
        if (top5Keys.includes(actualKey)) result.top5Matches++;

        // Track by strategy mode
        if (strategy.mode === 'attack') {
          result.attackDecisions++;
          if (top1Key === actualKey) result.attackTop1++;
        } else if (strategy.mode === 'defense') {
          result.defenseDecisions++;
          if (top1Key === actualKey) result.defenseTop1++;
        }
      }

      // Update hand
      if (event.tsumogiri) {
        // Discarded drawn tile, hand stays the same
      } else {
        const idx = hand.findIndex(t => tileKey(t) === actualKey);
        if (idx >= 0) {
          hand.splice(idx, 1);
          hand.push(drawnTile);
          hand = sortTiles(hand);
        }
      }
      myDiscards.push(actualDiscard);
      drawnTile = null;
      pendingDiscard = false;
    }

    // Track opponent discards
    if (event.type === 'dahai' && event.actor !== PLAYER) {
      const discarded = parseMjaiTile(event.pai);
      const playerWinds: Wind[] = ['east', 'south', 'west', 'north'];
      // Map actor to wind based on oya
      const oppWind = playerWinds[event.actor]; // simplified - use absolute position
      const opp = opponents.find(o => o.position === oppWind) || opponents.find(o => {
        // Fallback: find by checking all
        return true;
      });
      
      // Find the correct opponent by actor index mapping
      const allWinds: Wind[] = ['east', 'south', 'west', 'north'];
      const actorWind = allWinds[event.actor];
      const matchedOpp = opponents.find(o => o.position === actorWind);
      
      if (matchedOpp) {
        const discardInfo: DiscardInfo = {
          tile: discarded,
          turn: turnNumber,
          isTsumogiri: event.tsumogiri || false,
        };
        matchedOpp.discards.push(discardInfo);
        const { score, level } = calcDangerScore(matchedOpp);
        matchedOpp.dangerScore = score;
        matchedOpp.dangerLevel = level;
      }
    }

    // Track riichi
    if (event.type === 'reach' && event.actor === PLAYER) {
      isRiichi = true;
    }

    if (event.type === 'reach_accepted' && event.actor !== PLAYER) {
      const allWinds: Wind[] = ['east', 'south', 'west', 'north'];
      const oppWind = allWinds[event.actor];
      const opp = opponents.find(o => o.position === oppWind);
      if (opp) {
        opp.riichiTurn = turnNumber;
        const { score, level } = calcDangerScore(opp);
        opp.dangerScore = score;
        opp.dangerLevel = level;
      }
    }

    // Track chi/pon/kan for opponents
    if ((event.type === 'chi' || event.type === 'pon' || event.type === 'daiminkan') && event.actor !== PLAYER) {
      const allWinds: Wind[] = ['east', 'south', 'west', 'north'];
      const oppWind = allWinds[event.actor];
      const opp = opponents.find(o => o.position === oppWind);
      if (opp) {
        const meldTiles = (event.consumed || []).map(parseMjaiTile);
        if (event.pai) meldTiles.push(parseMjaiTile(event.pai));
        opp.melds.push({ type: event.type, tiles: meldTiles });
        const { score, level } = calcDangerScore(opp);
        opp.dangerScore = score;
        opp.dangerLevel = level;
      }
    }

    // Track our own chi/pon
    if ((event.type === 'chi' || event.type === 'pon') && event.actor === PLAYER) {
      const consumed = (event.consumed || []).map(parseMjaiTile);
      // Remove consumed tiles from hand
      for (const c of consumed) {
        const idx = hand.findIndex(t => tileKey(t) === tileKey(c));
        if (idx >= 0) hand.splice(idx, 1);
      }
      const meldTiles = [...consumed];
      if (event.pai) meldTiles.push(parseMjaiTile(event.pai));
      myMelds.push({ type: event.type, tiles: meldTiles });
      pendingDiscard = true; // Need to discard after calling
      drawnTile = null; // No drawn tile, but still need to discard
    }
  }

  return result;
}

// ==================== MAIN ====================

const input = process.argv[2] || '/tmp/tenhou-games';
let files: string[] = [];

if (fs.statSync(input).isDirectory()) {
  files = fs.readdirSync(input)
    .filter(f => f.endsWith('.mjson'))
    .map(f => path.join(input, f));
} else {
  files = [input];
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  ACCURACY TEST: Engine vs 鳳凰卓 Players`);
console.log(`  Testing ${files.length} games`);
console.log(`${'='.repeat(60)}\n`);

let totalDecisions = 0;
let totalTop1 = 0;
let totalTop3 = 0;
let totalTop5 = 0;
let totalAttack = 0;
let totalAttackTop1 = 0;
let totalDefense = 0;
let totalDefenseTop1 = 0;

for (const file of files) {
  const result = analyzeGame(file);
  
  const top1Pct = result.totalDecisions > 0 ? (result.top1Matches / result.totalDecisions * 100).toFixed(1) : '0';
  const top3Pct = result.totalDecisions > 0 ? (result.top3Matches / result.totalDecisions * 100).toFixed(1) : '0';
  const top5Pct = result.totalDecisions > 0 ? (result.top5Matches / result.totalDecisions * 100).toFixed(1) : '0';
  
  console.log(`📄 ${result.file}`);
  console.log(`   Decisions: ${result.totalDecisions} | Top-1: ${top1Pct}% | Top-3: ${top3Pct}% | Top-5: ${top5Pct}%`);
  
  if (result.attackDecisions > 0) {
    const atkPct = (result.attackTop1 / result.attackDecisions * 100).toFixed(1);
    console.log(`   Attack mode: ${result.attackDecisions} decisions, ${atkPct}% top-1 match`);
  }
  if (result.defenseDecisions > 0) {
    const defPct = (result.defenseTop1 / result.defenseDecisions * 100).toFixed(1);
    console.log(`   Defense mode: ${result.defenseDecisions} decisions, ${defPct}% top-1 match`);
  }
  console.log('');

  totalDecisions += result.totalDecisions;
  totalTop1 += result.top1Matches;
  totalTop3 += result.top3Matches;
  totalTop5 += result.top5Matches;
  totalAttack += result.attackDecisions;
  totalAttackTop1 += result.attackTop1;
  totalDefense += result.defenseDecisions;
  totalDefenseTop1 += result.defenseTop1;
}

console.log(`${'='.repeat(60)}`);
console.log(`  AGGREGATE RESULTS (${files.length} games)`);
console.log(`${'='.repeat(60)}`);
console.log(`  Total decisions analyzed: ${totalDecisions}`);
console.log(`  Top-1 agreement: ${totalTop1}/${totalDecisions} (${(totalTop1/totalDecisions*100).toFixed(1)}%)`);
console.log(`  Top-3 agreement: ${totalTop3}/${totalDecisions} (${(totalTop3/totalDecisions*100).toFixed(1)}%)`);
console.log(`  Top-5 agreement: ${totalTop5}/${totalDecisions} (${(totalTop5/totalDecisions*100).toFixed(1)}%)`);
if (totalAttack > 0) {
  console.log(`  Attack mode top-1: ${totalAttackTop1}/${totalAttack} (${(totalAttackTop1/totalAttack*100).toFixed(1)}%)`);
}
if (totalDefense > 0) {
  console.log(`  Defense mode top-1: ${totalDefenseTop1}/${totalDefense} (${(totalDefenseTop1/totalDefense*100).toFixed(1)}%)`);
}
console.log(`${'='.repeat(60)}\n`);

// Interpretation
const top1Rate = totalTop1 / totalDecisions * 100;
const top3Rate = totalTop3 / totalDecisions * 100;
if (top1Rate >= 40) {
  console.log(`✅ Top-1 agreement ≥40%: Engine recommendations align well with 鳳凰卓 play.`);
} else if (top1Rate >= 25) {
  console.log(`🟡 Top-1 agreement 25-40%: Engine has reasonable intuition but misses nuances.`);
} else {
  console.log(`⚠️ Top-1 agreement <25%: Engine needs significant improvement.`);
}

if (top3Rate >= 60) {
  console.log(`✅ Top-3 agreement ≥60%: Player's choice is usually in our top 3.`);
} else if (top3Rate >= 40) {
  console.log(`🟡 Top-3 agreement 40-60%: Decent coverage but room for improvement.`);
} else {
  console.log(`⚠️ Top-3 agreement <40%: Major gaps in recommendation quality.`);
}
