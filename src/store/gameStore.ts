import { create } from 'zustand';
import type { GameState, Tile, Wind, Meld, DiscardInfo, PickTarget } from '../types';
import { createTile, sortTiles, windToHonorValue } from '../engine/tiles';
import { calcDangerScore } from '../engine/opponents';

const ROUNDS = ['E1', 'E2', 'E3', 'E4', 'S1', 'S2', 'S3', 'S4'];

export function computePlacements(scores: [number, number, number, number]): [number, number, number, number] {
  return scores.map(s => scores.filter(other => other > s).length + 1) as [number, number, number, number];
}

function makeInitialState(): GameState {
  return {
    roundWind: 'east',
    seatWind: 'east',
    turnNumber: 1,
    doraIndicators: [],
    myHand: [],
    myMelds: [],
    myDiscards: [],
    isRiichi: false,
    riichiTurn: null,
    lastDrawnTile: null,
    opponents: [
      { position: 'south', discards: [], melds: [], riichiTurn: null, dangerLevel: 'normal', dangerScore: 0 },
      { position: 'west', discards: [], melds: [], riichiTurn: null, dangerLevel: 'normal', dangerScore: 0 },
      { position: 'north', discards: [], melds: [], riichiTurn: null, dangerLevel: 'normal', dangerScore: 0 },
    ],
    pickTarget: 'hand',
    scores: [25000, 25000, 25000, 25000],
    currentRound: 'E1',
    winningTileAppeared: null,
    winningTileFrom: null,
  };
}

interface GameStore extends GameState {
  // Actions
  setPickTarget: (target: PickTarget) => void;
  setWinningTileAppeared: (tile: Tile | null, from: Wind | null) => void;
  clearWinningTile: () => void;
  addTileToHand: (suit: Tile['suit'], value: number) => void;
  removeTileFromHand: (tileId: string) => void;
  setDrawnTile: (suit: Tile['suit'], value: number) => void;
  clearDrawnTile: () => void;
  discardFromHand: (tileId: string) => void;
  addTileToOpponentDiscard: (opponentPosition: Wind, suit: Tile['suit'], value: number, isTsumogiri?: boolean) => void;
  removeLastOpponentDiscard: (opponentPosition: Wind) => void;
  addDoraIndicator: (suit: Tile['suit'], value: number) => void;
  removeLastDora: () => void;
  setRoundWind: (wind: Wind) => void;
  setSeatWind: (wind: Wind) => void;
  advanceTurn: () => void;
  decrementTurn: () => void;
  declareRiichi: () => void;
  declareMeld: (meld: Meld) => void;
  declareOpponentRiichi: (position: Wind) => void;
  declareOpponentMeld: (position: Wind, meld: Meld) => void;
  resetGame: () => void;
  resetHand: () => void;
  updateScore: (playerIndex: number, delta: number) => void;
  setScores: (scores: [number, number, number, number]) => void;
  advanceRound: () => void;
  setRound: (round: string) => void;
  getPlacement: () => [number, number, number, number];
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...makeInitialState(),

  setPickTarget: (target) => set({ pickTarget: target }),

  setWinningTileAppeared: (tile, from) => set({ winningTileAppeared: tile, winningTileFrom: from }),
  clearWinningTile: () => set({ winningTileAppeared: null, winningTileFrom: null }),

  addTileToHand: (suit, value) =>
    set(state => {
      const newTile = createTile(suit, value);
      const total = state.myHand.length + (state.lastDrawnTile ? 1 : 0) + state.myMelds.length * 3;
      if (total >= 14) return state; // hand full
      const newHand = sortTiles([...state.myHand, newTile]);
      // Auto-advance turn when drawing the 14th tile (represents your draw action)
      const newTurnNumber = total === 13 ? state.turnNumber + 1 : state.turnNumber;
      return { myHand: newHand, turnNumber: newTurnNumber };
    }),

  removeTileFromHand: (tileId) =>
    set(state => {
      if (state.lastDrawnTile?.id === tileId) {
        return { lastDrawnTile: null };
      }
      return { myHand: state.myHand.filter(t => t.id !== tileId) };
    }),

  setDrawnTile: (suit, value) =>
    set(state => {
      const newTile = createTile(suit, value);
      return { lastDrawnTile: newTile };
    }),

  clearDrawnTile: () => set({ lastDrawnTile: null }),

  discardFromHand: (tileId) =>
    set(state => {
      let discardedTile: Tile | null = null;
      let newHand = state.myHand;
      let newDrawn = state.lastDrawnTile;

      if (state.lastDrawnTile?.id === tileId) {
        discardedTile = state.lastDrawnTile;
        newDrawn = null;
      } else {
        const tileIndex = state.myHand.findIndex(t => t.id === tileId);
        if (tileIndex === -1) return state;
        discardedTile = state.myHand[tileIndex];
        newHand = state.myHand.filter(t => t.id !== tileId);
      }

      return {
        myHand: newHand,
        lastDrawnTile: newDrawn,
        myDiscards: [...state.myDiscards, discardedTile],
      };
    }),

  addTileToOpponentDiscard: (position, suit, value, isTsumogiri = false) =>
    set(state => {
      const discardInfo: DiscardInfo = {
        tile: createTile(suit, value),
        turn: state.turnNumber,
        isTsumogiri,
      };
      const newOpponents = state.opponents.map(opp => {
        if (opp.position !== position) return opp;
        const newDiscards = [...opp.discards, discardInfo];
        const { score, level } = calcDangerScore({ ...opp, discards: newDiscards });
        return { ...opp, discards: newDiscards, dangerScore: score, dangerLevel: level };
      });
      // Auto-advance turn when adding opponent discards
      return { opponents: newOpponents, turnNumber: state.turnNumber + 1 };
    }),

  removeLastOpponentDiscard: (position) =>
    set(state => {
      const newOpponents = state.opponents.map(opp => {
        if (opp.position !== position) return opp;
        const newDiscards = opp.discards.slice(0, -1);
        const { score, level } = calcDangerScore({ ...opp, discards: newDiscards });
        return { ...opp, discards: newDiscards, dangerScore: score, dangerLevel: level };
      });
      return { opponents: newOpponents };
    }),

  addDoraIndicator: (suit, value) =>
    set(state => {
      if (state.doraIndicators.length >= 5) return state;
      return { doraIndicators: [...state.doraIndicators, createTile(suit, value)] };
    }),

  removeLastDora: () =>
    set(state => ({
      doraIndicators: state.doraIndicators.slice(0, -1),
    })),

  setRoundWind: (wind) => set({ roundWind: wind }),

  setSeatWind: (wind) => set(state => {
    const allWinds: Wind[] = ['east', 'south', 'west', 'north'];
    const oppWinds = allWinds.filter(w => w !== wind);
    return {
      seatWind: wind,
      opponents: oppWinds.map(w => ({
        position: w,
        discards: [],
        melds: [],
        riichiTurn: null,
        dangerLevel: 'normal' as const,
        dangerScore: 0,
      })),
      pickTarget: 'hand',
    };
  }),

  advanceTurn: () => set(state => ({ turnNumber: state.turnNumber + 1 })),
  decrementTurn: () => set(state => ({ turnNumber: Math.max(1, state.turnNumber - 1) })),

  declareRiichi: () =>
    set(state => ({
      isRiichi: true,
      riichiTurn: state.turnNumber,
    })),

  declareMeld: (meld) =>
    set(state => ({
      myMelds: [...state.myMelds, meld],
    })),

  declareOpponentRiichi: (position) =>
    set(state => {
      const newOpponents = state.opponents.map(opp => {
        if (opp.position !== position) return opp;
        const updated = { ...opp, riichiTurn: state.turnNumber };
        const { score, level } = calcDangerScore(updated);
        return { ...updated, dangerScore: score, dangerLevel: level };
      });
      return { opponents: newOpponents };
    }),

  declareOpponentMeld: (position, meld) =>
    set(state => {
      const newOpponents = state.opponents.map(opp => {
        if (opp.position !== position) return opp;
        const updated = { ...opp, melds: [...opp.melds, meld] };
        const { score, level } = calcDangerScore(updated);
        return { ...updated, dangerScore: score, dangerLevel: level };
      });
      return { opponents: newOpponents };
    }),

  updateScore: (playerIndex, delta) =>
    set(state => {
      const newScores = [...state.scores] as [number, number, number, number];
      newScores[playerIndex] = newScores[playerIndex] + delta;
      return { scores: newScores };
    }),

  setScores: (scores) => set({ scores }),

  advanceRound: () =>
    set(state => {
      const idx = ROUNDS.indexOf(state.currentRound);
      const next = ROUNDS[Math.min(idx + 1, ROUNDS.length - 1)];
      return { currentRound: next };
    }),

  setRound: (round) => set({ currentRound: round }),

  getPlacement: () => computePlacements(get().scores),

  resetGame: () => set(makeInitialState()),

  resetHand: () =>
    set(state => ({
      myHand: [],
      myMelds: [],
      myDiscards: [],
      lastDrawnTile: null,
      isRiichi: false,
      riichiTurn: null,
    })),
}));
