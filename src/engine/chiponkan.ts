import type { Tile, GameState, ChiPonKanAdvice, Meld } from '../types';
import { tileToIndex, tilesToCounts, tileDisplayName, createTile, indexToTile } from './tiles';
import { calcShanten } from './shanten';
import { estimateHandValue } from './handValue';

// Evaluate whether to take a chi (吃) from a discarded tile
export function evaluateChi(
  calledTile: Tile,
  gameState: GameState
): ChiPonKanAdvice[] {
  const hand = [...gameState.myHand];
  const handCounts = tilesToCounts(hand);
  const baseCounts = handCounts.slice();
  const baseShanten = calcShanten(baseCounts, gameState.myMelds.length);

  // Find all possible chi combinations using calledTile
  const idx = tileToIndex(calledTile);
  const suit = calledTile.suit;
  if (suit === 'honor') return []; // can't chi honor tiles

  const val = calledTile.value;
  const advice: ChiPonKanAdvice[] = [];

  // Possible chi sequences: (val-2,val-1,val), (val-1,val,val+1), (val,val+1,val+2)
  const sequences = [
    [val - 2, val - 1, val],
    [val - 1, val, val + 1],
    [val, val + 1, val + 2],
  ].filter(seq => seq.every(v => v >= 1 && v <= 9));

  for (const seq of sequences) {
    const neededFromHand = seq.filter(v => v !== val);
    const tile1Idx = tileToIndex(createTile(suit, neededFromHand[0]));
    const tile2Idx = tileToIndex(createTile(suit, neededFromHand[1]));

    if (handCounts[tile1Idx] < 1 || handCounts[tile2Idx] < 1) continue;

    // Simulate taking the chi: remove 2 tiles from hand, add meld
    const newCounts = handCounts.slice();
    newCounts[tile1Idx]--;
    newCounts[tile2Idx]--;

    const newMeldCount = gameState.myMelds.length + 1;
    const shantenAfter = calcShanten(newCounts, newMeldCount);

    // We also need to discard a tile after chi — find best discard
    // The shanten improvement from chi must be worth losing menzen
    const shantenDiff = baseShanten - shantenAfter;

    // Chi loses menzen (closed hand) possibility — lose riichi, ippatsu, tsumo bonus
    // Estimate the loss in value
    const currentValue = estimateHandValue(
      hand, gameState.myMelds, gameState.roundWind, gameState.seatWind, gameState.doraIndicators,
      gameState.seatWind === 'east'
    );

    const meldTiles = seq.map(v => createTile(suit, v));
    const newMelds = [...gameState.myMelds, { type: 'chi' as const, tiles: meldTiles }];
    const newHandTiles = hand.filter(t => {
      if (t.suit !== suit) return true;
      const idx2 = neededFromHand.indexOf(t.value);
      if (idx2 >= 0) { neededFromHand.splice(idx2, 1); return false; }
      return true;
    });

    const newValue = estimateHandValue(
      newHandTiles, newMelds, gameState.roundWind, gameState.seatWind, gameState.doraIndicators,
      gameState.seatWind === 'east'
    );

    // Recommendation logic
    let recommend = false;
    let reason = '';

    if (shantenAfter === -1) {
      recommend = true;
      reason = `吃牌直接和了！價值约${newValue}点`;
    } else if (shantenAfter === 0 && baseShanten >= 1) {
      recommend = true;
      reason = `吃牌后聽牌，進攻效率高`;
    } else if (shantenDiff > 0 && shantenAfter <= 1) {
      // Shanten improved and we're close
      if (newValue >= 3000) {
        recommend = true;
        reason = `吃牌后${shantenAfter}向聽，手牌约${newValue}点`;
      } else {
        recommend = false;
        reason = `手牌價值偏低(${newValue}点)，失去門前清不值得`;
      }
    } else if (shantenDiff === 0) {
      recommend = false;
      reason = `吃牌不改变向聽数，失去門前清不划算`;
    } else {
      recommend = false;
      reason = `向聽数未明顯改善，保持門前`;
    }

    const seqStr = seq.map(v => `${v}${suit === 'man' ? '万' : suit === 'pin' ? '筒' : '索'}`).join('');
    advice.push({
      action: 'chi',
      calledTile,
      meldTiles,
      recommend,
      shantenBefore: baseShanten,
      shantenAfter,
      reason: `[${seqStr}] ${reason}`,
    });
  }

  return advice;
}

// Evaluate whether to take a pon (碰)
export function evaluatePon(
  calledTile: Tile,
  gameState: GameState
): ChiPonKanAdvice | null {
  const hand = [...gameState.myHand];
  const handCounts = tilesToCounts(hand);
  const idx = tileToIndex(calledTile);

  if (handCounts[idx] < 2) return null; // can't pon without 2 copies

  const baseShanten = calcShanten(handCounts, gameState.myMelds.length);

  // Simulate pon: remove 2 from hand, add meld
  const newCounts = handCounts.slice();
  newCounts[idx] -= 2;
  const newMeldCount = gameState.myMelds.length + 1;
  const shantenAfter = calcShanten(newCounts, newMeldCount);

  const meldTiles = [calledTile, calledTile, calledTile].map((t, i) =>
    createTile(t.suit, t.value)
  );

  let recommend = false;
  let reason = '';

  // Check if it's a valuable tile (yakuhai)
  const isYakuhai = calledTile.suit === 'honor' && (
    calledTile.value >= 5 || // dragons
    calledTile.value === gameState.roundWind.charCodeAt(0) || // rough check
    false
  );

  const tileIsRoundWind =
    calledTile.suit === 'honor' &&
    ((gameState.roundWind === 'east' && calledTile.value === 1) ||
     (gameState.roundWind === 'south' && calledTile.value === 2) ||
     (gameState.roundWind === 'west' && calledTile.value === 3) ||
     (gameState.roundWind === 'north' && calledTile.value === 4));

  const tileIsSeatWind =
    calledTile.suit === 'honor' &&
    ((gameState.seatWind === 'east' && calledTile.value === 1) ||
     (gameState.seatWind === 'south' && calledTile.value === 2) ||
     (gameState.seatWind === 'west' && calledTile.value === 3) ||
     (gameState.seatWind === 'north' && calledTile.value === 4));

  const tileIsDragon = calledTile.suit === 'honor' && calledTile.value >= 5;
  const isYakuhaiTile = tileIsRoundWind || tileIsSeatWind || tileIsDragon;

  if (shantenAfter === -1) {
    recommend = true;
    reason = '碰牌直接和了！';
  } else if (shantenAfter === 0 && baseShanten >= 1) {
    recommend = true;
    reason = `碰${tileDisplayName(calledTile)}后聽牌`;
    if (!isYakuhaiTile) reason += '，但失去門前清機會';
  } else if (isYakuhaiTile && shantenAfter <= 1) {
    recommend = true;
    reason = `${tileDisplayName(calledTile)}是役牌，碰牌確保有役，${shantenAfter}向聽`;
  } else if (shantenAfter < baseShanten && !isYakuhaiTile) {
    recommend = false;
    reason = `碰牌效率一般，失去門前清(立直)機會`;
  } else {
    recommend = shantenAfter <= baseShanten && isYakuhaiTile;
    reason = isYakuhaiTile
      ? `役牌碰，獲得基本役，${shantenAfter}向聽`
      : `向聽数未改善，建議保持門前`;
  }

  return {
    action: 'pon',
    calledTile,
    meldTiles,
    recommend,
    shantenBefore: baseShanten,
    shantenAfter,
    reason,
  };
}

// Evaluate whether to declare kan (杠)
export function evaluateKan(
  calledTile: Tile,
  gameState: GameState,
  kanType: 'open' | 'closed' | 'added'
): ChiPonKanAdvice | null {
  const hand = [...gameState.myHand];
  const handCounts = tilesToCounts(hand);
  const idx = tileToIndex(calledTile);
  const baseShanten = calcShanten(handCounts, gameState.myMelds.length);

  // For open kan: need 3 copies in hand + 1 called
  // For closed kan: need 4 copies in hand
  // For added kan (加杠): need 1 copy in hand + existing pon

  const canDo = kanType === 'closed' ? handCounts[idx] >= 4
    : kanType === 'open' ? handCounts[idx] >= 3
    : handCounts[idx] >= 1; // added kan

  if (!canDo) return null;

  const meldTiles = [0, 1, 2, 3].map(() => createTile(calledTile.suit, calledTile.value));

  // Kan: draw extra tile after declaring
  // If already in riichi with closed kan: check if wait doesn't change
  if (gameState.isRiichi && kanType === 'closed') {
    // Special rule: can only do closed kan in riichi if it doesn't change the wait
    // We'll just recommend with a note
    return {
      action: 'kan',
      calledTile,
      meldTiles,
      recommend: true,
      shantenBefore: baseShanten,
      shantenAfter: baseShanten,
      reason: '立直后暗杠，獲得岭上牌，等待不变时可行',
    };
  }

  const newCounts = handCounts.slice();
  if (kanType === 'closed') {
    newCounts[idx] -= 4;
  } else {
    newCounts[idx] -= 3;
  }
  const newMeldCount = gameState.myMelds.length + 1;
  const shantenAfter = calcShanten(newCounts, newMeldCount);

  // Kan gives extra draw but costs a turn (rinshan draw)
  const isYakuhaiTile =
    calledTile.suit === 'honor' && (calledTile.value >= 5 ||
    (gameState.roundWind === 'east' && calledTile.value === 1));

  let recommend = false;
  let reason = '';

  if (shantenAfter === 0) {
    recommend = true;
    reason = `杠后聽牌，且多摸岭上牌機會`;
  } else if (shantenAfter <= baseShanten && isYakuhaiTile) {
    recommend = true;
    reason = `役牌杠，多一张進張機會`;
  } else if (shantenAfter <= baseShanten) {
    recommend = kanType === 'closed'; // closed kan doesn't show tiles
    reason = kanType === 'closed'
      ? `暗杠不改变手牌，还可多摸一张`
      : `開槓暴露手牌，風險較大`;
  } else {
    recommend = false;
    reason = `杠后向聽数惡化，不建議`;
  }

  return {
    action: 'kan',
    calledTile,
    meldTiles,
    recommend,
    shantenBefore: baseShanten,
    shantenAfter,
    reason,
  };
}
