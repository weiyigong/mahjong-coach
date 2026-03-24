import type { Tile, Suit, Wind } from '../types';

// Tile index encoding:
// 0-8:   man 1m-9m (characters / 万子)
// 9-17:  pin 1p-9p (circles / 筒子)
// 18-26: sou 1s-9s (bamboo / 索子)
// 27: East(東), 28: South(南), 29: West(西), 30: North(北)
// 31: Haku(白), 32: Hatsu(発), 33: Chun(中)

let _tileIdCounter = 0;

export function createTile(suit: Suit, value: number): Tile {
  return { suit, value, id: `${suit}${value}_${_tileIdCounter++}` };
}

export function tileToIndex(tile: Tile): number {
  if (tile.suit === 'man') return tile.value - 1;
  if (tile.suit === 'pin') return 9 + tile.value - 1;
  if (tile.suit === 'sou') return 18 + tile.value - 1;
  // honor: 1=E,2=S,3=W,4=N,5=Haku,6=Hatsu,7=Chun
  return 27 + tile.value - 1;
}

export function indexToTile(idx: number): { suit: Suit; value: number } {
  if (idx < 9) return { suit: 'man', value: idx + 1 };
  if (idx < 18) return { suit: 'pin', value: idx - 9 + 1 };
  if (idx < 27) return { suit: 'sou', value: idx - 18 + 1 };
  return { suit: 'honor', value: idx - 27 + 1 };
}

export function tilesToCounts(tiles: Tile[]): number[] {
  const counts = new Array(34).fill(0);
  for (const t of tiles) counts[tileToIndex(t)]++;
  return counts;
}

export function countsToTiles(counts: number[]): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < 34; i++) {
    const { suit, value } = indexToTile(i);
    for (let j = 0; j < counts[i]; j++) {
      tiles.push(createTile(suit, value));
    }
  }
  return tiles;
}

export function sameTileType(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function tileKey(tile: Tile): string {
  return `${tile.suit}${tile.value}`;
}

export function tileSortKey(tile: Tile): number {
  return tileToIndex(tile);
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

// Display names
const MAN_CHARS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const HONOR_NAMES_FULL = ['东风', '南风', '西风', '北风', '白板', '发财', '红中'];

export function tileDisplayName(tile: Tile): string {
  if (tile.suit === 'man') return `${tile.value}万`;
  if (tile.suit === 'pin') return `${tile.value}筒`;
  if (tile.suit === 'sou') return `${tile.value}索`;
  return HONOR_NAMES[tile.value - 1];
}

export function tileShortName(tile: Tile): string {
  if (tile.suit === 'man') return MAN_CHARS[tile.value - 1] + '万';
  if (tile.suit === 'pin') return `${tile.value}筒`;
  if (tile.suit === 'sou') return `${tile.value}索`;
  return HONOR_NAMES[tile.value - 1];
}

export function honorFullName(value: number): string {
  return HONOR_NAMES_FULL[value - 1] || '';
}

export function windToHonorValue(wind: Wind): number {
  return { east: 1, south: 2, west: 3, north: 4 }[wind];
}

export function windLabel(wind: Wind): string {
  return { east: '東', south: '南', west: '西', north: '北' }[wind];
}

export function windLabelChinese(wind: Wind): string {
  return { east: '东', south: '南', west: '西', north: '北' }[wind];
}

export function positionLabel(wind: Wind): string {
  return { east: '上家', south: '下家', west: '對家', north: '下家' }[wind];
}

// Kokushi tiles (terminals + honors)
export const KOKUSHI_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

// Dora calculation: the tile AFTER the indicator is the dora
export function doraFromIndicator(indicator: Tile): { suit: Suit; value: number } {
  if (indicator.suit === 'honor') {
    // Winds cycle: E→S→W→N→E
    if (indicator.value <= 4) {
      return { suit: 'honor', value: indicator.value === 4 ? 1 : indicator.value + 1 };
    }
    // Dragons cycle: Haku→Hatsu→Chun→Haku
    return { suit: 'honor', value: indicator.value === 7 ? 5 : indicator.value + 1 };
  }
  // Suited: 1→2→...→9→1
  return { suit: indicator.suit, value: indicator.value === 9 ? 1 : indicator.value + 1 };
}

// Check if tile is a terminal (1 or 9)
export function isTerminal(tile: Tile): boolean {
  return tile.suit !== 'honor' && (tile.value === 1 || tile.value === 9);
}

// Check if tile is an honor
export function isHonor(tile: Tile): boolean {
  return tile.suit === 'honor';
}

// Check if tile is a simple (2-8, no honor)
export function isSimple(tile: Tile): boolean {
  return tile.suit !== 'honor' && tile.value >= 2 && tile.value <= 8;
}

// Get all 34 unique tile types
export const ALL_TILE_TYPES: { suit: Suit; value: number }[] = [];
for (let v = 1; v <= 9; v++) ALL_TILE_TYPES.push({ suit: 'man', value: v });
for (let v = 1; v <= 9; v++) ALL_TILE_TYPES.push({ suit: 'pin', value: v });
for (let v = 1; v <= 9; v++) ALL_TILE_TYPES.push({ suit: 'sou', value: v });
for (let v = 1; v <= 7; v++) ALL_TILE_TYPES.push({ suit: 'honor', value: v });
