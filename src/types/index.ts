export type Suit = 'man' | 'pin' | 'sou' | 'honor';
export type Wind = 'east' | 'south' | 'west' | 'north';
export type MeldType = 'chi' | 'pon' | 'kan' | 'closedKan';
export type DangerLevel = 'normal' | 'suspicious' | 'dangerous';
export type StrategyMode = 'attack' | 'flexible' | 'defense';
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
}

export interface DiscardRecommendation {
  tile: Tile;
  shantenAfter: number;
  effectiveTileCount: number;   // total remaining effective tiles
  effectiveTileTypes: number;   // number of distinct effective tile types
  safetyScore: number;          // 0-100 across all opponents
  safetyBreakdown: SafteyDetail[];
  reason: string;               // Chinese explanation
  rank: number;
}

export interface SafteyDetail {
  opponent: Wind;
  score: number;
  label: string; // 現物/筋/安全/注意/危險
}

export interface StrategyResult {
  mode: StrategyMode;
  explanation: string;
  discards: DiscardRecommendation[];
  winProbability: number;
  expectedValue: number;
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
