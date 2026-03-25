import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionStats, ComputedStats, RoundResult } from '../types';

export const MORTAL_BENCHMARKS = {
  winRate: 0.215,
  dealInRate: 0.127,
  riichiRate: 0.194,
  callRate: 0.316,
  riichiWinRate: 0.477,
  avgWinPoints: 6512,
  avgDealInPoints: -5279,
};

const SESSION_MAX_AGE = 6 * 60 * 60 * 1000; // 6 hours

export function makeInitialStats(): SessionStats {
  return {
    totalRounds: 0,
    roundsAsDealer: 0,
    wins: 0,
    winsByTsumo: 0,
    winsByRon: 0,
    winsAsDealer: 0,
    totalWinPoints: 0,
    dealIns: 0,
    dealInsToRiichi: 0,
    totalDealInPoints: 0,
    riichiDeclarations: 0,
    riichiWins: 0,
    riichiDealIns: 0,
    callsMade: 0,
    callWins: 0,
    tenpaiReached: 0,
    roundResults: [],
    sessionStartTime: Date.now(),
  };
}

export function computeStats(s: SessionStats): ComputedStats {
  const n = s.totalRounds;
  return {
    winRate: n > 0 ? s.wins / n : 0,
    dealInRate: n > 0 ? s.dealIns / n : 0,
    riichiRate: n > 0 ? s.riichiDeclarations / n : 0,
    callRate: n > 0 ? s.callsMade / n : 0,
    riichiWinRate: s.riichiDeclarations > 0 ? s.riichiWins / s.riichiDeclarations : 0,
    avgWinPoints: s.wins > 0 ? s.totalWinPoints / s.wins : 0,
    avgDealInPoints: s.dealIns > 0 ? -(s.totalDealInPoints / s.dealIns) : 0,
    tenpaiRate: n > 0 ? s.tenpaiReached / n : 0,
  };
}

interface StatsStore extends SessionStats {
  recordRoundResult: (result: RoundResult) => void;
  resetSession: () => void;
  checkAndResetIfExpired: () => void;
  getComputedStats: () => ComputedStats;
}

export const useStatsStore = create<StatsStore>()(
  persist(
    (set, get) => ({
      ...makeInitialStats(),

      recordRoundResult: (result) =>
        set(state => {
          const { outcome, points = 0, wasRiichi, hadOpenHand, wasDealer, toRiichiOpponent = false } = result;
          const absPoints = Math.abs(points);

          const isTenpai =
            outcome === 'win-tsumo' ||
            outcome === 'win-ron' ||
            wasRiichi ||
            result.finalShanten <= 0;

          let extra: Partial<SessionStats> = {};

          if (outcome === 'win-tsumo') {
            extra = {
              wins: state.wins + 1,
              winsByTsumo: state.winsByTsumo + 1,
              winsAsDealer: state.winsAsDealer + (wasDealer ? 1 : 0),
              totalWinPoints: state.totalWinPoints + absPoints,
              riichiWins: state.riichiWins + (wasRiichi ? 1 : 0),
              callWins: state.callWins + (hadOpenHand ? 1 : 0),
              tenpaiReached: state.tenpaiReached + 1,
            };
          } else if (outcome === 'win-ron') {
            extra = {
              wins: state.wins + 1,
              winsByRon: state.winsByRon + 1,
              winsAsDealer: state.winsAsDealer + (wasDealer ? 1 : 0),
              totalWinPoints: state.totalWinPoints + absPoints,
              riichiWins: state.riichiWins + (wasRiichi ? 1 : 0),
              callWins: state.callWins + (hadOpenHand ? 1 : 0),
              tenpaiReached: state.tenpaiReached + 1,
            };
          } else if (outcome === 'deal-in') {
            extra = {
              dealIns: state.dealIns + 1,
              dealInsToRiichi: state.dealInsToRiichi + (toRiichiOpponent ? 1 : 0),
              totalDealInPoints: state.totalDealInPoints + absPoints,
              riichiDealIns: state.riichiDealIns + (wasRiichi ? 1 : 0),
            };
          } else if (outcome === 'draw') {
            extra = {
              tenpaiReached: state.tenpaiReached + (isTenpai ? 1 : 0),
            };
          }

          return {
            ...state,
            ...extra,
            totalRounds: state.totalRounds + 1,
            roundsAsDealer: state.roundsAsDealer + (wasDealer ? 1 : 0),
            riichiDeclarations: state.riichiDeclarations + (wasRiichi ? 1 : 0),
            callsMade: state.callsMade + (hadOpenHand ? 1 : 0),
            roundResults: [result, ...state.roundResults],
          };
        }),

      resetSession: () => set(makeInitialStats()),

      checkAndResetIfExpired: () => {
        const { sessionStartTime, resetSession } = get();
        if (Date.now() - sessionStartTime > SESSION_MAX_AGE) {
          resetSession();
        }
      },

      getComputedStats: () => computeStats(get()),
    }),
    {
      name: 'mahjong-session-stats',
    }
  )
);
