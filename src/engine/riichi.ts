import type { GameState, Tile, RiichiAdvice } from '../types';
import { tilesToCounts, tileToIndex, indexToTile, createTile } from './tiles';
import { calcShanten, findWaitingTiles } from './shanten';
import { countRemainingTiles } from './efficiency';
import { estimateHandValue, estimateTotalHan, estimateFu, estimatePoints } from './handValue';
import { evaluateWinValue } from './placement';
import { computePlacements } from '../store/gameStore';

// Estimate win probability for a tenpai hand
function estimateWinProbForTenpai(
  totalRemaining: number,
  turn: number,
): number {
  // Rough wall size after 'turn' draws (4 players * turn draws consumed from ~70 wall tiles)
  const wallSize = Math.max(4, 70 - turn * 4);
  const remainingDraws = Math.max(1, Math.floor(wallSize / 4)); // our draws remaining

  // P(tsumo) = 1 - (1 - totalRemaining/wallSize)^remainingDraws
  const probPerDraw = Math.min(0.99, totalRemaining / wallSize);
  const winProbTsumo = 1 - Math.pow(1 - probPerDraw, remainingDraws);

  // P(ron) ≈ 3 opponents each discarding ~remainingDraws tiles
  // Very rough: 3x our draws, each opponent has some chance of dealing into us
  const probPerOppDraw = Math.min(0.99, totalRemaining / wallSize);
  const winProbRon = 1 - Math.pow(1 - probPerOppDraw, remainingDraws * 3);

  // Combined: tsumo OR ron (roughly independent wins)
  const combined = winProbTsumo + winProbRon * (1 - winProbTsumo);

  return Math.max(0.03, Math.min(0.90, combined));
}

// Main export: evaluate whether to declare riichi or stay dama
export function evaluateRiichi(gameState: GameState): RiichiAdvice | null {
  // Not applicable if already in riichi
  if (gameState.isRiichi) return null;

  // Riichi requires a closed hand
  if (gameState.myMelds.length > 0) return null;

  const hand = [...gameState.myHand];
  if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);

  const counts = tilesToCounts(hand);
  const shanten = calcShanten(counts, 0);

  // Must be tenpai (shanten = 0)
  if (shanten !== 0) return null;

  const isDealer = gameState.seatWind === 'east';
  const remaining = countRemainingTiles(gameState);
  const scores = gameState.scores ?? [25000, 25000, 25000, 25000];
  const turn = gameState.turnNumber;

  // Find wait tiles
  const waitIndices = findWaitingTiles(counts, 0);
  const waitTiles: Tile[] = waitIndices.map(idx => {
    const { suit, value } = indexToTile(idx);
    return createTile(suit, value);
  });

  // Count remaining tiles for each wait tile
  let totalRemaining = 0;
  for (const idx of waitIndices) {
    totalRemaining += remaining[idx];
  }
  const waitTypes = waitIndices.length;

  // Wait type classification
  let waitType: 'good' | 'decent' | 'bad';
  if (waitTypes >= 2 && totalRemaining >= 5) {
    waitType = 'good';   // 良形
  } else if (waitTypes >= 2 || (waitTypes === 1 && totalRemaining >= 3)) {
    waitType = 'decent'; // 普通
  } else {
    waitType = 'bad';    // 愚形
  }

  // Count dora in hand
  let doraCount = 0;
  for (const indicator of gameState.doraIndicators) {
    const indIdx = tileToIndex(indicator);
    const doraIdx = (indIdx % 9) === 8 ? indIdx - 8 : indIdx + 1;
    doraCount += hand.filter(t => tileToIndex(t) === doraIdx).length;
  }

  // Base han without riichi (to detect riichi-only hands)
  const hanWithoutRiichi = estimateTotalHan(
    hand, [], gameState.roundWind, gameState.seatWind, false, false, doraCount
  );
  const needsRiichi = hanWithoutRiichi === 0;

  // Dama hand value (no riichi han)
  const damaHandValue = estimateHandValue(
    hand,
    [],
    gameState.roundWind,
    gameState.seatWind,
    gameState.doraIndicators,
    isDealer
  );

  // Riichi hand value: +1 han
  const riichiHan = hanWithoutRiichi + 1;
  const riichiBaseFu = estimateFu(hand, [], false, gameState.seatWind, gameState.roundWind);
  const riichiBasePoints = estimatePoints(Math.max(1, riichiHan), riichiBaseFu, isDealer);

  // Ippatsu bonus: ~17.5% chance of ippatsu (+1 han)
  const ippatsuPts = estimatePoints(Math.max(1, riichiHan + 1), riichiBaseFu, isDealer);
  const ippatsuBonus = (ippatsuPts - riichiBasePoints) * 0.175;

  // Uradora bonus: each indicator ≈ 35% chance of +1 han
  const uraHanPts = estimatePoints(Math.max(1, riichiHan + 1), riichiBaseFu, isDealer);
  const uraBonus = (uraHanPts - riichiBasePoints) * 0.35 * gameState.doraIndicators.length;

  const riichiWinValue = riichiBasePoints + ippatsuBonus + uraBonus;

  // Win probabilities
  const baseWinProb = estimateWinProbForTenpai(totalRemaining, turn);
  // Riichi: ~12% extra win chance due to intimidation (opponents fold more)
  const riichiWinProb = Math.min(0.90, baseWinProb * 1.12);
  const damaWinProb = baseWinProb;

  // EV calculations
  const riichiStickCost = 1000;
  const riichiEV = riichiWinProb * riichiWinValue - (1 - riichiWinProb) * riichiStickCost;
  const damaEV = damaWinProb * damaHandValue;

  // --- Decision Logic ---
  const reasons: string[] = [];

  // Start with EV-based default
  let shouldRiichi = riichiEV > damaEV;

  // Always riichi: hand needs riichi for any yaku
  if (needsRiichi) {
    shouldRiichi = true;
    reasons.push('此手牌無役，必須立直才能和牌');
  }

  // Always riichi: low dama value with good wait
  if (damaHandValue < 3900 && waitType === 'good') {
    shouldRiichi = true;
    reasons.push(`黙聽價值低（約${damaHandValue}點），良形進張，立直大幅提升收益`);
  }

  // Always dama: haneman+ already
  if (damaHandValue >= 12000) {
    shouldRiichi = false;
    reasons.push(`手牌已${isDealer ? '滿貫以上' : '跳滿以上'}（${damaHandValue}點），立直邊際效益有限`);
  }

  // Always dama: very late game (turn 17+)
  if (turn >= 17) {
    shouldRiichi = false;
    reasons.push('殘局（17巡+），勝率極低，不宜投入1000點棒');
  }

  // Placement-based situational adjustments
  const placements = computePlacements(scores);
  const myPlacement = placements[0];
  const sortedScores = [...scores].sort((a, b) => b - a);
  const isLastRounds = gameState.currentRound === 'S3' || gameState.currentRound === 'S4';

  if (isLastRounds && myPlacement === 1) {
    const leadOver2nd = scores[0] - sortedScores[1];
    if (leadOver2nd > 12000 && turn < 17) {
      shouldRiichi = false;
      reasons.push(`大幅領先首位（+${Math.round(leadOver2nd / 100) / 10}k），黙聽更安全，避免暴露聽牌`);
    }
  }

  if (isLastRounds && myPlacement >= 3 && turn < 17) {
    shouldRiichi = true;
    reasons.push('末局落後，立直壓迫力有助逆轉局勢');
  }

  // Dealer bias: riichi extends dealer turn (ren-chan value)
  if (isDealer && !shouldRiichi && damaHandValue < 7700 && turn < 15) {
    shouldRiichi = true;
    reasons.push('莊家立直連莊價值高，積極進攻有利');
  }

  // Placement change check: riichi win improves placement but dama doesn't
  const riichiPlacementEval = evaluateWinValue(scores, 0, riichiWinValue, null, isDealer);
  const damaPlacementEval = evaluateWinValue(scores, 0, damaHandValue, null, isDealer);
  if (riichiPlacementEval.placementDelta > damaPlacementEval.placementDelta
    && riichiPlacementEval.placementDelta > 0) {
    shouldRiichi = true;
    reasons.push(`立直和了可升至第${riichiPlacementEval.placementAfter}位，黙聽則無法升位`);
  }

  // EV comparison note (if no specific override has been added yet)
  if (reasons.length === 0 || reasons.every(r => !r.includes('期望值'))) {
    const evDiff = Math.abs(riichiEV - damaEV);
    if (riichiEV > damaEV * 1.15) {
      reasons.push(`立直期望值（${Math.round(riichiEV)}點）顯著高於黙聽（${Math.round(damaEV)}點）`);
    } else if (damaEV > riichiEV * 1.15) {
      reasons.push(`黙聽期望值（${Math.round(damaEV)}點）顯著高於立直（${Math.round(riichiEV)}點）`);
    } else if (evDiff < 500) {
      reasons.push(`立直與黙聽期望值相近（差距${evDiff}點），${shouldRiichi ? '立直壓迫力更大' : '黙聽保留摸打彈性'}`);
    }
  }

  // Wait quality note
  const waitTypeLabel = waitType === 'good' ? '良形' : waitType === 'decent' ? '普通形' : '愚形';
  reasons.push(`${waitTypeLabel}聽牌（${waitTypes}種${totalRemaining}張），勝率約${Math.round(baseWinProb * 100)}%`);

  // Uradora upside if recommending riichi
  if (shouldRiichi && uraBonus > 200) {
    reasons.push(`立直後裏寶牌期望加成約${Math.round(uraBonus)}點`);
  }

  // Bad wait warning when recommending riichi anyway (e.g., needed for yaku)
  if (shouldRiichi && waitType === 'bad' && !needsRiichi) {
    reasons.push('⚠️ 愚形立直風險較高，請注意放銃損失');
  }

  return {
    shouldRiichi,
    riichiEV: Math.round(riichiEV),
    damaEV: Math.round(damaEV),
    reasons,
    waitAnalysis: {
      waitTiles,
      totalRemaining,
      waitType,
    },
  };
}
