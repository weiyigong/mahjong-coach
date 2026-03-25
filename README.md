# 麻雀コーチ (Mahjong Coach)

Japanese Riichi Mahjong strategy assistant. A mobile-first PWA that provides real-time discard recommendations, riichi decisions, and opponent danger analysis during live play.

## Features

- **Adaptive Strategy Engine** — Push/fold decisions that adapt to game situation (score differential, round, placement, dealer status). Inspired by Suphx's run-time policy adaptation.
- **Riichi Decision Engine** — EV-based analysis of riichi vs. dama, factoring in wait shape, hand value, ippatsu/uradora upside, and placement impact.
- **Tile Safety System** — Suji, kabe, genbutsu, no-chance analysis with weighted scoring that balances efficiency and safety based on strategy mode.
- **Opponent Modeling** — Bayesian danger detection from discard patterns, tsumogiri tracking, meld analysis, dama detection, honitsu recognition.
- **Session Statistics** — Track win rate, deal-in rate, riichi rate, call rate. Compare against Mortal v4.1c AI benchmarks.
- **Game Review Mode** — Decision log records every engine recommendation. Post-round review highlights disagreements and estimates mistake costs.
- **Tile Connectivity** — Hand shape awareness for discard ranking. Isolated tiles prioritized for discard, connected tiles preserved.
- **Placement Awareness** — Late-game strategy shifts based on current placement, score gaps, and ren-chan value.

## Algorithm Performance

Tested against 50 鳳凰卓 (Tenhou Phoenix Room, top-tier players) games:

| Mode | Agreement Rate |
|------|---------------|
| Overall | 44.6% |
| Attack | 53.8% |
| Defense | 41.1% |
| Tenpai | 75.1% |
| Flexible | 43.8% |

Pure heuristic engine, no neural networks.

## Tech Stack

- React + TypeScript + Vite
- Zustand (state management)
- Mobile-first PWA (service worker, installable)
- Dark theme UI with Traditional Chinese (繁體中文) interface

## Project Structure

```
src/
  engine/          # Core mahjong logic
    strategy.ts    # Main strategy engine (adaptive push/fold)
    riichi.ts      # Riichi decision engine
    safety.ts      # Tile safety scoring (suji/kabe/genbutsu)
    efficiency.ts  # Discard analysis + tile connectivity
    opponents.ts   # Opponent danger modeling
    shanten.ts     # Shanten calculator (DFS + chiitoi + kokushi)
    handValue.ts   # Hand value estimation
    placement.ts   # Placement evaluation + score simulation
    tiles.ts       # Tile utilities
    chiponkan.ts   # Call (chi/pon/kan) advisor
  components/      # React UI components
    StrategyPanel, RiichiAdvisor, StatsPanel, ReviewPanel, etc.
  store/           # Zustand stores
    gameStore.ts   # Game state management
    statsStore.ts  # Session statistics + Mortal benchmarks
    reviewStore.ts # Decision logging + review
  types/           # TypeScript type definitions
```

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Production build
npx tsc --noEmit   # Type check
```

## Replay Analysis (dev tools)

```bash
# Convert Tenhou XML to mjai format
npx tsx scripts/tenhou-to-mjai.ts /path/to/game.xml

# Run engine analysis against pro games
cat game.mjson | npx tsx scripts/replay-analysis.ts

# Batch analysis
for f in /tmp/tenhou-games/*.xml; do
  npx tsx scripts/tenhou-to-mjai.ts "$f"
done > all.mjson
cat all.mjson | npx tsx scripts/replay-analysis.ts
```

## References

- [Suphx: Mastering Mahjong with Deep RL](https://arxiv.org/abs/2003.13590) (Microsoft Research)
- [Mortal](https://github.com/Equim-chan/Mortal) — Open-source mahjong AI (architecture reference)
- [Mortal-Policy](https://github.com/Nitasurin/Mortal-Policy) — Policy-based fork of Mortal
- [Tenhou](https://tenhou.net) — Game log source for benchmarking
