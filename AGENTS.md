# Magic Ball — Agent Guide

Magic Ball is an NBA card game. Real players scraped from basketball-reference and the
NBA Stats API become rated cards (OVR, per-skill ratings, rarity, badges). Players draft
a fixed cube (8 seats x 3 packs x 7 players + 1 play card), build a 12-man roster with
play assignments and an identity, and play out games through a pure, seeded auto-battler
engine, one-off or across a round-robin season. Next.js 16 + React 19 + Tailwind 4; the
app ships a static `cards.json`, no database at runtime.

## Repo map

```
data/            Scraper + stats pipeline (Python + Playwright). See data/README.md.
docs/            ROADMAP.md = which plans in which order; plans/plan_<topic>_<date>.md = one locked
                 plan per piece of work (TEMPLATE.md); completed/ = finished plans and reviews (the "why");
                 HANDOVER.md, ARCHITECTURE.md, game_mechanics.md, card_schema.md, analytics/
scripts/         Node dev scripts: analyze_game_data.js, check_card_counts.js, screenshot.js
frontend/        The Next.js app (see frontend/README.md)
  src/engine/    PURE game engine (no react/next/fs): types, rng, balance (all tuning
                 constants), ratings (computeCards), cards (static JSON), draft,
                 deckbuilder, game, season, synergies, rosterStats. Purity is enforced
                 by tests/unit/engine-purity.test.ts.
  src/storage/   GameStore interface + IndexedDB (Dexie) and in-memory backends,
                 one-time migration from the old localStorage keys.
  src/data/      cards.json — the player cards, a BUILD ARTIFACT (npm run build:cards)
  src/hooks/     useDraftEngine.ts (draft state machine)
  src/components/ DraftRoom, DeckBuilder, GameView, SeasonView, FranchiseDashboard,
                 TopKPIBand, DonutChart, PlayerCard, TopNav
  src/app/       App Router pages + API routes (see below)
  game.db        SQLite output of the data pipeline; read ONLY by scripts/build-cards.ts
  public/        headshots/, logos/, players.json, arena_*.jpg
  tests/         Playwright specs (visual.spec.ts, home.spec.ts, smoke.spec.ts) + win32
                 snapshots; tests/unit/ = Vitest unit tests importing the real engine
  scripts/       balance.ts (headless balance simulator, `npm run balance`),
                 build-cards.ts (game.db -> src/data/cards.json, `npm run build:cards`)
```

## Commands

Root (from repo root):
- `npm run dev` — starts the frontend dev server (`npm --prefix frontend run dev`)
- `npm run build` — production build
- `npm test` — Vitest unit tests in `frontend/tests/unit/` that import the REAL engine
  modules (ratings, draft, synergies/plays, game sim, season). Run from the repo root or
  `frontend/`. `npm run test:watch` inside `frontend/` for watch mode.
- `npm run balance [-- 1000]` — `frontend/scripts/balance.ts`: simulates N headless games
  (draft → bot rosters → sim) and prints PPP, score distribution, synergy and play
  activation rates. Use it after ANY engine or balance-constant change.
- `npm run test:e2e` — Playwright specs in `frontend/tests/` (needs `npm run dev` running
  in another terminal first — baseURL is `http://localhost:3000`); `tests/smoke.spec.ts`
  loads every real route and fails on any console/page error — run before committing.
- `npm run analyze` — runs `scripts/analyze_game_data.js` against the latest
  `data/game_logs/full_dump_*.json` and prints a balance report
- `npm run screenshot` — `node scripts/screenshot.js [route] [outfile] [--full]` (needs the
  dev server running)
- CI (`.github/workflows/ci.yml`): GitHub Actions runs `tsc --noEmit`, lint, `npm test`,
  and `npm run build` on every push/PR (ubuntu, Node 22). Playwright is not run in CI
  (win32 snapshots, needs a server) — `test:e2e`/smoke stays a local gate.

Frontend (from `frontend/`): `npm run dev`, `build`, `start`, `lint`, `test:e2e`.

## Where the truth lives

- **Card ratings**: `frontend/src/engine/ratings.ts` (`computeCards`) is the single source of truth for OVR,
  per-skill ratings, rarity, and badges (OVR v2.1: positional profiles, core-gap penalty,
  legendary/league-leader rarity bumps). Old generator/patcher scripts (`generate_engine*.py`,
  `refactor_*.js`, `data/analyze_*.py`, etc.) are gone — history is in git log.
  **Edit ratings.ts directly, then run `npm run build:cards` and commit the regenerated
  `src/data/cards.json`. Never recreate a generator or patcher script.**
- **Game simulation**: `frontend/src/engine/game.ts` (possession battle, multi-channel
  shot resolution) and `frontend/src/engine/synergies.ts` (badge-driven synergy/play
  modifiers). **Every tuning number lives in `frontend/src/engine/balance.ts`.**
- **Identities and plays**: `engine/archetypes.ts` (colour thresholds, 16-plan catalog,
  tiers, caps, `bestSelection` for bots) and `engine/playbook.ts` (play roles, fixed
  allocations, `evaluatePlaybook`); called possessions are resolved in `engine/game.ts`.
  Tune thresholds with `npm run feasibility`. No mastery tiers, no chemistry synergies.
- **Randomness**: engine code never calls `Math.random()`; it takes an `Rng`
  (`engine/rng.ts`, mulberry32). Drafts, seasons and games store their seed, so any
  result can be reproduced. Pass `--seed N` to `npm run balance` for a deterministic run.
- **Persistence**: UI code talks only to `getGameStore()` (`src/storage`), never to
  `localStorage` directly. The store is IndexedDB in the browser and in-memory during
  SSR/tests. `initStorage()` (called once by `StorageProvider`) migrates the old
  localStorage keys. `docs/game_mechanics.md` describes the model in prose — cross-check it
  against the code before trusting a specific number; the code is authoritative.
- **Do not commit generated/runtime output**: `data/game_logs/*.json` (draft/season/roster
  exports from `/debug`), screenshots, `.next/`, `tsbuildinfo`. All gitignored — regenerate
  instead of hand-editing.

## Product rules (from the owner — do not "improve" these away)

- **Never show a player's OVR or the seven engine ratings to users** — not on cards, lists,
  rosters, or as a team OVR. They exist only for the engine and the dev-only `/data` page.
  Season averages (PPG, RPG, …) are fine to show.
- **Rarity is a MtG-style gem/icon, never a coloured frame** (frames fight with position
  and team colours). Rare and Mythic should feel splashy.
- **Draft zoning stays**: drafted cards are sorted into Roster / G-League during the draft
  (MTG Arena style pre-building). No card "inspect" panel; bot pick ticker is wanted.
- No auto-fill in the deck builder; the human builds the lineup.

## Conventions

- TypeScript strict mode, Next.js App Router (`src/app/**/page.tsx`,
  `src/app/api/**/route.ts`).
- Path alias `@/*` -> `frontend/src/*` (see `frontend/tsconfig.json`).
- Client components are explicitly marked `'use client'` (state, localStorage, hooks);
  API routes and `lib/engine.ts` run server-side only.
- Styling: Tailwind 4 utility classes, no CSS modules.
- Player data: the app never opens a database. `src/data/cards.json` is generated from
  `frontend/game.db` by `scripts/build-cards.ts` (better-sqlite3 is a devDependency used
  only there). `/api/cards` serves that JSON statically.
- State persistence is client-side IndexedDB via `GameStore` (draft sessions, rosters,
  seasons), per browser. A remote backend can be added behind the same interface.
- Windows dev machine, `core.autocrlf=true` — LF/CRLF diff noise in `git diff` is normal,
  not a real change.

## Data pipeline

Lives in `data/`, run from `data/`. Full script order, inputs/outputs, and table schema
are documented in `data/README.md` — read that instead of duplicating it here. Short
version: `download_bref.js` scrapes HTML -> `fetch_players.py` (+ `fetch_bio.py`) builds
`frontend/game.db` and `players.json` -> `download_images.py` / `download_logos.py` pull
media into `frontend/public` -> `npm run build:cards` (from the repo root or `frontend/`)
turns `game.db` into `frontend/src/data/cards.json`, which is what the app ships.

## Verifying game balance

- Fastest loop: `npm run balance` (headless, seconds, no browser). Convention to know:
  `TeamBonuses.defenseMods` are deltas ADDED to the opponent's offense, so a defensive
  effect is stored as a negative number; per-channel edges are centred on the league
  means in `LEAGUE_AVG` (gameEngine.ts) — regenerate those from the balance script's
  header if the card pool or rating formulas change.
- `scripts/analyze_game_data.js` (`npm run analyze`) reads the newest
  `data/game_logs/full_dump_*.json` and reports draft cube integrity, rarity distribution,
  OVR-vs-win-rate correlation, synergy/play activation rates, and score-range sanity.
- The `/debug` page in the running app (`frontend/src/app/debug/page.tsx`) reads current
  `localStorage` state and POSTs it to `/api/game-logs`, which writes the JSON that
  `analyze_game_data.js` consumes. Play a few drafts/seasons, hit export on `/debug`, then
  run `npm run analyze`.
- Next work: `docs/ROADMAP.md` then `docs/plans/plan_<topic>_<date>.md`; open issues in
  `docs/HANDOVER.md`; `docs/analytics/*` reports predate the current engine.

## Gotchas discovered in the code
- `scripts/build-cards.ts` resolves `game.db` relative to `frontend/`; run it via the npm script.
- `/api/game-logs` (dev-only export used by `/debug`) writes to `../data/game_logs`
  relative to cwd and is disabled in production builds.
- The cube draft (`generateCubePool` in `engine/draft.ts`) only guarantees zero duplicate
  player cards when the player pool has at least 264 players; the pool has 448.
- Not junk: `/test-ui` (fixture page for `visual.spec.ts`/`smoke.spec.ts`), `/debug`
  (analytics export), `/deckbuilder-test`, `/data`, `/rosters`, `/draft`, `/season` are all
  real, linked-from-home-page pages — see `page.tsx` and `components/TopNav.tsx`.
