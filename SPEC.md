# Mahjong Coach (麻雀コーチ) — Japanese Riichi Mahjong Assistant

## Overview
A mobile-friendly PWA (Progressive Web App) that acts as a real-time strategy assistant for Japanese Riichi Mahjong (日本麻将/立直麻将). The user inputs their hand tiles and tracks all players' discards, and the app recommends optimal plays with explanations.

**Target use case:** User brings this on their phone to a live in-person mahjong game. They input tiles by tapping, and get real-time recommendations.

## Technical Requirements
- **Pure frontend PWA** — no backend server needed
- **React + TypeScript + Vite**
- **Mobile-first responsive design** — must work great on phone screens
- **Installable as PWA** — add to home screen, works offline
- **All computation happens client-side in JavaScript/TypeScript**

## Core Features

### 1. Tile Input UI
- Visual tile picker: show all 34 tile types (9 man/万, 9 pin/筒, 9 sou/索, 7 honor tiles)
- Each tile shows remaining count (max 4 each, minus what's already placed)
- Tap to add tile to: my hand, or any of 4 players' discard ponds
- Hand display: show current 13 tiles (14 when drawn), sorted by suit
- Support for declaring: chi (吃), pon (碰), kan (杠), riichi (立直)
- Dora indicator tile input
- Round wind (場風) and seat wind (自風) selector

### 2. Shanten Calculator (向听数)
- Calculate current shanten number for the hand
- Show which tiles reduce shanten (有効牌/effective tiles)
- For tenpai (听牌) hands: show all possible winning tiles and their remaining count

### 3. Optimal Discard Recommendation
- For each tile in hand, calculate:
  - Shanten number after discarding it
  - Number of effective tiles (進張数) after discarding, accounting for all visible tiles (discards, melds, dora indicators)
  - **Rank all discards from best to worst**
- Highlight the recommended discard(s) with clear visual indicator

### 4. Bayesian Opponent Modeling (from video strategy)
- Track each opponent's discard order and timing
- Apply priors: early game discards are typically honor tiles → edge tiles → middle tiles
- When an opponent's discard pattern deviates from normal (e.g., discarding middle tiles early), flag it
- Estimate danger level of each opponent:
  - "Normal" (整理中) — still building hand
  - "Suspicious" (注意) — unusual patterns detected  
  - "Dangerous" (危険) — likely tenpai based on signals
- Signals to track:
  - Discarding middle tiles early = unusual, hand likely already has good shape
  - Long silence (not discarding from draw) = tsumogiri detection if possible
  - Skipped chi/pon opportunity = may be going for menzen (門前清)

### 5. Tile Safety Rating (防御/Defense)
For each tile in your hand, calculate a safety score (0-100) against each opponent:
- **Suji (筋):** If opponent discarded 1, then 4 is relatively safe (1-4-7 line). Similarly 2-5-8, 3-6-9
- **Kabe (壁):** If 3 copies of a tile are visible, the 4th is safe. Also: if all 4 copies of tile X are visible, tiles that needed X for a sequence are safer
- **Genbutsu (現物):** Tiles the opponent has personally discarded = 100% safe against that opponent
- **Trembling Hand Correction:** Never assign 100% safety (cap at 95%) except for genbutsu. Account for opponent mistakes per trembling-hand perfect equilibrium
- **Combined danger score:** Weight across all opponents, with higher weight for opponents flagged as "Dangerous"

### 6. Attack/Defense Decision
- Calculate: Expected value of winning = (hand value estimate in points) × (probability of completing hand based on remaining tiles and shanten)
- Calculate: Risk of dealing in = danger score of tiles you need to discard × estimated opponent hand value
- Recommend mode:
  - 🟢 **全力進攻 (Full Attack):** Low shanten, high hand value, no dangerous opponents
  - 🟡 **回し打ち (Flexible):** Medium risk, consider safer tiles that maintain efficiency  
  - 🔴 **ベタオリ (Full Defense):** High shanten or low value vs dangerous opponent, recommend safest discards only
- Show recommendation with brief explanation in Chinese

### 7. Chi/Pon/Kan Advisor
When a relevant tile is discarded by an opponent:
- Calculate hand efficiency WITH vs WITHOUT the meld
- Factor in: loss of menzen bonus (門前清), tanyao eligibility, hand value change
- Recommend: ✅ Take it / ❌ Skip it, with reason

## UI/UX Design

### Layout (Mobile Portrait)
```
┌─────────────────────────────┐
│ 🀄 Round: East 1 | Dora: 5m │
│ Seat: South | Turn: 8       │
├─────────────────────────────┤
│ ┌─ Opponent Discards ─────┐ │
│ │ East(上家): 1m 9p N W   │ │  
│ │ Risk: 🟢 Normal         │ │
│ │ North(対面): 9m 1p E S  │ │
│ │ Risk: 🟡 Suspicious     │ │
│ │ West(下家): 3m 5p 8s    │ │
│ │ Risk: 🔴 Dangerous!     │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ Strategy: 🟡 回し打ち       │
│ "West likely tenpai.        │
│  Consider safer routes."    │
├─────────────────────────────┤
│ ┌─ My Hand ───────────────┐ │
│ │ [2m][3m][5m][2p][3p][6p]│ │
│ │ [7p][3s][4s][5s][8s][N] │ │
│ │ Draw: [6m]              │ │
│ └─────────────────────────┘ │
│ Shanten: 1 (一向聴)         │
│ Effective tiles: 14 (5種)   │
├─────────────────────────────┤
│ ┌─ Recommendations ───────┐ │
│ │ ⭐ Discard N (北)        │ │
│ │   → 0向聴, 14枚進張      │ │
│ │   Safety: 92% (現物)     │ │
│ │                         │ │
│ │ 2. Discard 8s           │ │
│ │   → 0向聴, 11枚進張      │ │
│ │   Safety: 78%           │ │
│ │                         │ │
│ │ 3. Discard 5m           │ │
│ │   → 1向聴, 8枚進張       │ │
│ │   Safety: 45% ⚠️        │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ [Tile Picker - tap to add] │
│ 🀇🀈🀉🀊🀋🀌🀍🀎🀏 Man     │
│ 🀙🀚🀛🀜🀝🀞🀟🀠🀡 Pin     │
│ 🀀🀁🀂🀃🀄🀅🀆 Honor       │
│ [+Hand][+East][+North]     │
│ [+West][+Dora]             │
└─────────────────────────────┘
```

### Color Scheme
- Dark theme (easy on eyes during long games, also looks cool)
- Accent colors: Green (safe/attack), Yellow (caution), Red (danger/defense)
- Tile colors: traditional mahjong colors (red for man characters, blue for pin circles, green for sou bamboo)

### Tile Images
- Use Unicode mahjong characters OR simple styled div tiles with suit+number
- Must be easily tappable on mobile (minimum 44px touch targets)

## Hand Value Estimation
For attack/defense decision, estimate hand value:
- Count visible yaku (役): tanyao, pinfu, iipeiko, yakuhai, etc.
- Estimate fu (符) based on hand structure
- Calculate approximate points using standard scoring table
- Don't need to be perfect — rough estimate is fine for strategy decisions

## Data Model
```typescript
interface GameState {
  roundWind: Wind; // 場風
  seatWind: Wind; // 自風
  turnNumber: number;
  doraIndicators: Tile[];
  myHand: Tile[]; // 13 or 14 tiles
  myMelds: Meld[]; // open melds (chi/pon/kan)
  myDiscards: Tile[];
  opponents: {
    position: 'east' | 'south' | 'west' | 'north';
    discards: DiscardInfo[]; // tile + turn number
    melds: Meld[];
    riichiTurn: number | null;
    dangerLevel: 'normal' | 'suspicious' | 'dangerous';
  }[];
}

interface DiscardRecommendation {
  tile: Tile;
  shantenAfter: number;
  effectiveTiles: number; // accounting for visible tiles
  safetyScore: number; // 0-100
  reason: string; // Chinese explanation
}
```

## Performance
- Shanten calculation must be fast (<50ms) — use optimized lookup tables
- All computation client-side, no network calls during gameplay
- Smooth tile animations and transitions

## Language
- UI labels: mix of Chinese and Japanese mahjong terms (most Chinese mahjong players know the Japanese terms)
- Strategy explanations: Chinese (中文)
- Keep it concise — user is glancing at phone during a live game

## PWA Requirements
- Service worker for offline support
- Web app manifest with proper icons
- Installable on iOS and Android
- Works without internet after first load
