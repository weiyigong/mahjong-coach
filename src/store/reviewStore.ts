import { create } from 'zustand';
import type { DecisionRecord, RoundReview, Tile } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

export function tileToString(tile: Tile): string {
  if (tile.suit === 'honor') {
    const honorNames = ['', '東', '南', '西', '北', '白', '發', '中'];
    return honorNames[tile.value] ?? '?';
  }
  const suitSuffix = tile.suit === 'man' ? '萬' : tile.suit === 'pin' ? '筒' : '索';
  return `${tile.value}${suitSuffix}`;
}

export function handToString(tiles: Tile[], drawn?: Tile): string {
  const all = drawn ? [...tiles, drawn] : tiles;
  return all.map(tileToString).join('');
}

function buildSummary(decisions: DecisionRecord[]): RoundReview['summary'] {
  const agreements = decisions.filter(d => d.agreement === 'agree').length;
  const disagreements = decisions.filter(d => d.agreement === 'disagree').length;
  const unknowns = decisions.filter(d => d.agreement === 'unknown').length;
  const estimatedPointsLost = decisions.reduce((sum, d) => sum + (d.potentialCost ?? 0), 0);

  let biggestMistake: RoundReview['summary']['biggestMistake'];
  const disagreeRecords = decisions.filter(d => d.agreement === 'disagree' && (d.potentialCost ?? 0) > 0);
  if (disagreeRecords.length > 0) {
    const worst = disagreeRecords.reduce((a, b) =>
      (a.potentialCost ?? 0) >= (b.potentialCost ?? 0) ? a : b
    );
    const userTile = worst.userAction?.discardedTile ? tileToString(worst.userAction.discardedTile) : '未知';
    const engTile = tileToString(worst.engineRecommendation.topDiscard);
    biggestMistake = {
      turn: worst.turn,
      description: `第 ${worst.turn} 巡：引擎推薦打 ${engTile}，實打 ${userTile}`,
      estimatedCost: worst.potentialCost ?? 0,
    };
  }

  return { totalDecisions: decisions.length, agreements, disagreements, unknowns, estimatedPointsLost, biggestMistake };
}

// ─── store ────────────────────────────────────────────────────────────────────

interface ReviewStore {
  currentDecisions: DecisionRecord[];
  completedReviews: RoundReview[];

  recordDecision: (record: DecisionRecord) => void;
  markUserAction: (turn: number, discardedTile: Tile, declaredRiichi?: boolean, potentialCost?: number) => void;
  finalizeRound: (round: string) => void;
  clearCurrentRound: () => void;
  resetAll: () => void;
}

export const useReviewStore = create<ReviewStore>((set) => ({
  currentDecisions: [],
  completedReviews: [],

  recordDecision: (record) =>
    set(state => ({
      currentDecisions: [...state.currentDecisions, record],
    })),

  markUserAction: (turn, discardedTile, declaredRiichi = false, potentialCost = 0) =>
    set(state => {
      const decisions = state.currentDecisions.map(d => {
        if (d.turn !== turn) return d;
        const agreed =
          d.engineRecommendation.topDiscard.suit === discardedTile.suit &&
          d.engineRecommendation.topDiscard.value === discardedTile.value;
        return {
          ...d,
          userAction: { discardedTile, declaredRiichi },
          agreement: agreed ? ('agree' as const) : ('disagree' as const),
          potentialCost: agreed ? 0 : potentialCost,
        };
      });
      return { currentDecisions: decisions };
    }),

  finalizeRound: (round) =>
    set(state => {
      if (state.currentDecisions.length === 0) return state;
      const review: RoundReview = {
        round,
        decisions: state.currentDecisions,
        summary: buildSummary(state.currentDecisions),
      };
      return {
        completedReviews: [review, ...state.completedReviews].slice(0, 20),
        currentDecisions: [],
      };
    }),

  clearCurrentRound: () => set({ currentDecisions: [] }),

  resetAll: () => set({ currentDecisions: [], completedReviews: [] }),
}));
