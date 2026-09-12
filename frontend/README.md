# Magic Ball — frontend

The Next.js 16 / React 19 / Tailwind 4 app for Magic Ball (see the root `README.md` for
what the game is). This directory is the app itself; the player-data pipeline lives in
`../data`.

## Run it

From this directory:

```bash
npm install
npm run dev
```

Open http://localhost:3000. (You can also run `npm run dev` from the repo root — it just
calls this script via `npm --prefix frontend run dev`.)

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run test:e2e`
(Playwright, needs the dev server running separately — specs live in `tests/`, with
committed win32 snapshots for the visual regression tests).

## Player data is a build artifact

The app never opens a database at runtime. `src/data/cards.json` holds the 448 computed
player cards and is served by `/api/cards`. Regenerate it after changing the rating
engine (`src/engine/ratings.ts`, `src/engine/balance.ts`) or the data pipeline:

```bash
npm run build:cards
```

`better-sqlite3` is a devDependency used only by that script to read `game.db`.

## Tests and balance

```bash
npm test                 # Vitest: tests/unit (engine, imports the real code) + tests/storage
npm run balance -- 500   # headless balance report; add --seed 42 for a reproducible run
npm run test:e2e         # Playwright, needs `npm run dev` running
```

## Where things live

- `src/engine/` — pure game engine: ratings (card ratings, source of truth), game
  (simulation), season, draft, deckbuilder, synergies, rosterStats, rng, balance (all
  tuning constants), cards (static data access)
- `src/storage/` — GameStore (IndexedDB via Dexie, memory fallback) + migration
- `src/hooks/useDraftEngine.ts` — draft state machine
- `src/components/` — DraftRoom, DeckBuilder, GameView, SeasonView, FranchiseDashboard,
  TopKPIBand, DonutChart, PlayerCard, TopNav
- `src/app/` — App Router pages (`/`, `/draft`, `/rosters`, `/season`, `/data`, `/debug`,
  `/deckbuilder-test`, `/test-ui`) and API routes (`/api/cards`, `/api/game-logs`)
- `game.db` — SQLite produced by `../data/fetch_players.py`; input to `npm run build:cards` only
- `public/` — headshots, team logos, `players.json`, arena background images

For the full picture — how data flows in from the scraper, and what the engine/draft/game
modules do — see `../AGENTS.md` and `../docs/ARCHITECTURE.md`.
