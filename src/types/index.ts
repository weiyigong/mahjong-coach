export type Suit = 'man' | 'pin' | 'sou' | 'honor';
export type Wind = 'east' | 'south' | 'west' | 'north';
export type MeldType = 'chi' | 'pon' | 'kan' | 'closedKan';
export type DangerLevel = 'normal' | 'suspicious' | 'dangerous';
export type StrategyMode = 'attack' | 'flexible' | 'defense' | 'abandon';
export type PickTarget = 'hand' | 'east' | 'south' | 'west' | 'north' | 'dora' | 'myDiscard';

export interface Tile {
  suit: Suit;
  value: number; // 1-9 for suited; 1=East,2=South,3=West,4=North,5=Haku,6=Hatsu,7=Chun for honor
  id: string;    // unique identifier for React keys
}

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  calledFrom?: Wind;
}

export interface DiscardInfo {
  tile: Tile;
  turn: number;
  isTsumogiri: boolean;
}

export interface Opponent {
  position: Wind;
  discards: DiscardInfo[];
  melds: Meld[];
  riichiTurn: number | null;
  dangerLevel: DangerLevel;
  dangerScore: number; // 0-100
}

export interface GameState {
  roundWind: Wind;
  seatWind: Wind;
  turnNumber: number;
  doraIndicators: Tile[];
  myHand: Tile[];       // tiles in hand (not including open melds)
  myMelds: Meld[];      // open melds
  myDiscards: Tile[];
  isRiichi: boolean;
  riichiTurn: number | null;
  opponents: Opponent[];
  pickTarget: PickTarget;
  lastDrawnTile: Tile | null;
  scores: [number, number, number, number]; // [self, south, west, north]
  currentRound: string; // E1-E4, S1-S4
  winningTileAppeared: Tile | null;
  winningTileFrom: Wind | null;
}

export interface RonPassAdvice {
  shouldRon: boolean;
  ronValue: number;
  tsumoValue: number;
  ronPlacement: number;
  tsumoPlacement: number;
  tsumoProb: number;
  reason: string;
}

export interface DiscardRecommendation {
  tile: Tile;
  shantenAfter: number;
  effectiveTileCount: number;   // total remaining effective tiles
  effectiveTileTypes: number;   // number of distinct effective tile types
  safetyScore: number;          // 0-100 across all opponents
  safetyBreakdown: SafteyDetail[];
  connectivity: number;         // Fix 4: how well the tile connects to the hand (0=isolated, higher=connected)
  reason: string;               // Chinese explanation
  rank: number;
  safetyNote?: string;          // additional note (e.g. 電報 strategy)
  dealInTarget?: Wind;          // if this tile is a candidate for intentional deal-in
}

export interface SafteyDetail {
  opponent: Wind;
  score: number;
  label: string; // 現物/筋/安全/注意/危險
}

export interface DealInAdvice {
  recommend: boolean;
  cheapTarget: Wind;
  cheapEstimate: number;
  dangerousTarget: Wind;
  dangerousEstimate: number;
  placementImpactCheap: string;
  placementImpactDangerous: string;
  reason: string;
}

export interface RiichiAdvice {
  shouldRiichi: boolean;
  riichiEV: number;      // expected value if declaring riichi
  damaEV: number;        // expected value if staying dama
  reasons: string[];     // explanation items in Traditional Chinese
  waitAnalysis: {
    waitTiles: Tile[];
    totalRemaining: number;
    waitType: 'good' | 'decent' | 'bad';
  };
}

export interface StrategyResult {
  mode: StrategyMode;
  explanation: string;
  discards: DiscardRecommendation[];
  winProbability: number;
  expectedValue: number;
  dealInAdvice?: DealInAdvice;
  riichiAdvice?: RiichiAdvice;
}

export interface ChiPonKanAdvice {
  action: 'chi' | 'pon' | 'kan';
  calledTile: Tile;
  meldTiles: Tile[];
  recommend: boolean;
  shantenBefore: number;
  shantenAfter: number;
  reason: string;
}

export interface EffectiveTile {
  tile: Tile;
  remaining: number; // copies still available (not visible)
}

export interface RoundResult {
  round: string;           // e.g., 'E1', 'S3'
  wasDealer: boolean;
  outcome: 'win-tsumo' | 'win-ron' | 'deal-in' | 'draw' | 'other-win';
  points?: number;         // positive for wins, negative for deal-ins
  wasRiichi: boolean;
  hadOpenHand: boolean;
  finalShanten: number;    // shanten at round end (0 = tenpai, -1 = won)
  toRiichiOpponent?: boolean; // deal-in specifically to riichi opponent
}

export interface SessionStats {
  totalRounds: number;
  roundsAsDealer: number;
  wins: number;
  winsByTsumo: number;
  winsByRon: number;
  winsAsDealer: number;
  totalWinPoints: number;
  dealIns: number;
  dealInsToRiichi: number;
  totalDealInPoints: number;
  riichiDeclarations: number;
  riichiWins: number;
  riichiDealIns: number;
  callsMade: number;
  callWins: number;
  tenpaiReached: number;
  roundResults: RoundResult[];
  sessionStartTime: number;
}

export interface ComputedStats {
  winRate: number;
  dealInRate: number;
  riichiRate: number;
  callRate: number;
  riichiWinRate: number;
  avgWinPoints: number;
  avgDealInPoints: number;
  tenpaiRate: number;
}

export interface DecisionRecord {
  turn: number;
  round: string;
  hand: Tile[];
  drawnTile?: Tile;
  engineRecommendation: {
    topDiscard: Tile;
    strategyMode: StrategyMode;
    explanation: string;
    riichiAdvice?: 'riichi' | 'dama' | null;
  };
  userAction?: {
    discardedTile?: Tile;
    declaredRiichi?: boolean;
  };
  agreement: 'agree' | 'disagree' | 'unknown';
  potentialCost?: number;
}

export interface RoundReview {
  round: string;
  decisions: DecisionRecord[];
  summary: {
    totalDecisions: number;
    agreements: number;
    disagreements: number;
    unknowns: number;
    estimatedPointsLost: number;
    biggestMistake?: {
      turn: number;
      description: string;
      estimatedCost: number;
    };
  };
}
