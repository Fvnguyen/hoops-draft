# Magic Ball — Agent Guide

Magic Ball is an NBA card game. Real players scraped from basketball-reference and the
NBA Stats API become rated cards (OVR, per-skill ratings, rarity, badges). Players draft
a fixed cube (8 seats x 3 packs x 7 players + 1 play card), build a 12-man roster with
play assignments and an identity, and play out games through a pure, seeded auto-battler
engine — one-off, across a round-robin "In-Season Tournament", or as the 82:0 Challenge
(82 games vs all 30 real NBA teams, one trade, one grade; see docs/game_mechanics.md). Next.js 16 + React 19 + Tailwind 4; the
app ships a static `cards.json`, no database at runtime.

## Repo map

```
data/            Scraper + stats pipeline (Python + Playwright). See data/README.md.
docs/            ROADMAP.md = which plans in which order; plans/plan_<topic>_<date>.md = one
                 locked plan per piece of work (TEMPLATE.md); completed/ = finished plans (the
                 "why"); HANDOVER.md, ARCHITECTURE.md, game_mechanics.md, design/, analytics/
scripts/         Node dev scripts: check_card_counts.js, screenshot.js
frontend/        The Next.js app (see frontend/README.md)
  src/engine/    PURE game engine (no react/next/fs): types, rng, balance (all tuning
                 constants), ratings (computeCards), cards, plays (the catalog — DraftRoom
                 re-exports it as playsDB), draft, deckbuilder, game, season, synergies,
                 rosterStats, challenge + challengeAdvice (82:0). Purity is enforced by
                 tests/unit/engine-purity.test.ts.
  src/storage/   GameStore interface + IndexedDB (Dexie), in-memory and Supabase backends
  src/data/      cards.json — the player cards, a BUILD ARTIFACT (npm run build:cards)
  src/narration/ PURE prose over engine events (render + templates/, beats, summary, hints;
                 challenge/ = the front-office quote pools)
  src/hooks/     useDraftEngine.ts (draft state machine)
  src/components/ DraftRoom, DeckBuilder, GameView, SeasonView, PlayerCard, TopNav,
                 challenge/ (FlipClock, TierLadder, ChallengeReel, FrontOffice, Trade, Results)
  src/app/       App Router pages + API routes (see below)
  game.db        SQLite output of the data pipeline; read ONLY by scripts/build-cards.ts
  public/        headshots/{96,480}/ (WebP thumbnails), art/, logos/, icons/ — 13 MB; masters live in data/
  tests/         Playwright specs (visual/home/smoke) + win32 snapshots; tests/unit/ =
                 Vitest tests importing the real engine
  scripts/       balance.ts + challenge-sim.ts (headless simulators), build-cards.ts
                 (game.db -> cards.json), ensure-headshots.mjs, theater-shot.ts
```

## Commands

Root (from repo root):
- `npm run dev` / `npm run build` — frontend dev server (`npm --prefix frontend run dev`) / production build
- `npm test` — Vitest unit tests in `frontend/tests/unit/` importing the REAL engine modules
  (ratings, draft, plays, game sim, season, challenge). Repo root or `frontend/`.
- `npm run balance [-- 1000]` / `npm run challenge [-- 40 --seed 42 --sweep]` / `npm run
  analyze` — headless balance tools; see "Balance workflow" below for when to run them.
- `npm run test:e2e` — Playwright in `frontend/tests/` (needs `npm run dev` in another
  terminal, baseURL `http://localhost:3000`); `smoke.spec.ts` loads every real route and fails
  on any console/page error — run before committing.
- `npm run screenshot` — `node scripts/screenshot.js [route] [outfile] [--full]` (needs dev)
- CI (`.github/workflows/ci.yml`): `tsc --noEmit`, lint, `npm test`, `npm run build` on every
  push/PR (ubuntu, Node 22). Playwright is NOT in CI (win32 snapshots, needs a server) —
  `test:e2e`/smoke stays a local gate.

Frontend (from `frontend/`): `npm run dev`, `build`, `start`, `lint`, `test:e2e`.

## Where the truth lives

- **Card ratings**: `frontend/src/engine/ratings.ts` (`computeCards`) is the single source of
  truth for OVR, per-skill ratings, rarity and badges (OVR v2.1: positional profiles, core-gap
  penalty, legendary/league-leader rarity bumps). The old generator/patcher scripts are gone —
  history is in git log. **Edit ratings.ts directly, run `npm run build:cards`, commit the
  regenerated `src/data/cards.json`. Never recreate a generator or patcher script.**
- **Game simulation**: `frontend/src/engine/game.ts` (possession battle, multi-channel shot
  resolution) and `frontend/src/engine/synergies.ts` (badge-driven synergy/play modifiers).
  **Every tuning number lives in `frontend/src/engine/balance.ts`.**
- **Identities and plays**: `engine/archetypes.ts` (colour thresholds, 16-plan catalog, tiers,
  caps, `bestSelection` for bots) and `engine/playbook.ts` (play roles, fixed allocations,
  `evaluatePlaybook`); possessions resolved in `engine/game.ts`. Tune thresholds with
  `npm run feasibility`. No mastery tiers, no chemistry synergies.
- **82:0 Challenge**: `engine/challenge.ts` (opponents, schedule, per-game seeds, grades,
  `simulateHalf`, trade pack) + `engine/challengeAdvice.ts` (front office). A half is simulated
  and SAVED before anything animates — never simulate a half already in `run.halves`.
  `/challenge/preview` + `/challenge/preview-results` are the no-auth design sign-off routes.
- **Randomness**: engine code never calls `Math.random()`; it takes an `Rng` (`engine/rng.ts`,
  mulberry32). Drafts, seasons, games and challenge runs store their seed, so any result can
  be reproduced. Pass `--seed N` to `npm run balance` for a deterministic run.
- **Persistence**: UI code talks only to `getGameStore()` (`src/storage`), never to
  `localStorage` — IndexedDB in the browser, in-memory in SSR/tests, Supabase on top when
  signed in. `docs/game_mechanics.md` describes the model in prose; the code is authoritative.
- **Do not commit generated/runtime output**: `data/game_logs/*.json`, screenshots, `.next/`,
  `tsbuildinfo` — all gitignored, regenerate them. DO commit `public/` art: an untracked asset
  reads as junk to the next agent, which is how the 82:0 pack image got deleted.

## Product rules (from the owner — do not "improve" these away)

- **Never show a player's OVR or the seven engine ratings to users** — not on cards, lists or
  rosters; they exist only for the engine and the dev-only `/data` page. Season averages
  (PPG, RPG, …) are fine to show.
- **Rarity is a MtG-style gem/icon, never a coloured frame** (frames fight with position and
  team colours). Rare and Mythic should feel splashy.
- **One draft-time list**: every drafted card lands in a single "Roster" list, no Roster/
  G-League split. No card "inspect" panel; bot pick ticker is wanted. No auto-fill in the deck
  builder: the depth chart starts empty, the human builds the lineup.
- Locked identity plans are not selectable; one nearest-progress hint per lane (muted, non-
  clickable) explains what's missing — replaces the old "locked plans hidden" rule.
- **82:0: the record stays sealed until game 82** — the break shows a pace band, never a W-L
  (`challengeAdvice.test.ts` asserts no output carries a record or a rating). **NBA rosters
  are locked in**: a card you drafted still plays for his real team against you, which is why
  `simulateGame` keys box stats by side + player id.

## Conventions

- TypeScript strict mode, Next.js App Router (`src/app/**/page.tsx`, `src/app/api/**/route.ts`).
- Path alias `@/*` -> `frontend/src/*` (see `frontend/tsconfig.json`).
- Client components are marked `'use client'`; API routes run server-side only.
- Player data: the app never opens a database. `src/data/cards.json` is generated from
  `frontend/game.db` by `scripts/build-cards.ts` and loaded with `import('@/engine/cards')` where needed
  (never from the root layout; the home page uses the Mythic/Rare slice `src/data/showcase.json`).
- Headshot URLs come ONLY from `headshotThumb(playerId, 96 | 480)` (`src/lib/headshotThumb.ts`); bump
  `CARD_SET_VERSION` (`engine/cardSetVersion.ts`) with every pipeline refresh, it busts the image cache.
- State persistence is client-side IndexedDB via `GameStore` (draft sessions, rosters,
  seasons), per browser. A remote backend fits behind the same interface.
- Windows dev machine, `core.autocrlf=true` — LF/CRLF diff noise in `git diff` is expected.
- Styling: semantic tokens only; `npm run check:styles` is a blocking 0-violation gate.

## Data pipeline

Lives in `data/`, run from `data/`. Script order, inputs/outputs and table schema are in
`data/README.md` — don't duplicate it here. Short version: `download_bref.js` scrapes HTML ->
`fetch_players.py` (+ `fetch_bio.py`) builds `frontend/game.db` and `players.json` ->
`download_images.py` pulls source PNGs into `data/headshots_src/` (logos into `frontend/public`) ->
`npm run build:cards` turns `game.db` into `src/data/cards.json` + `showcase.json`, backfills a
missing headshot with a placeholder and writes the 96/480 px WebP sets (`ensure-headshots.mjs`;
a bref-hash id means no NBA match). Art: `node scripts/gen-art.mjs` from `data/art_src/`.

## Balance workflow (owner-locked, 2026-09-19)

No automated balance checks fire on their own — only inside a plan, or when the owner asks.
When balance work does happen it is strictly hierarchical: verify a stage before tuning the
next one, and never retune an earlier stage to paper over a later one's problem. Progress
and open drift are tracked in `docs/HANDOVER.md`, not here.

1. **Player pool** — data/stats/position correctness (does everyone have the right data).
2. **Ratings/OVR** (`ratings.ts`) — distribution, scale, sense checks.
3. **Rarity** (`RARITY_CUTOFFS` + band/floor/ceiling in `ratings.ts`) — distribution, sense checks.
4. **Badges** (`BADGE_THRESHOLDS`) — distribution, sense checks.
5. **Plays/Archetypes** (`archetypes.ts`, `playbook.ts`) — verification.

Tools: `npm run balance` (headless PPP/score/synergy, no browser), `npm run challenge`
(82:0), `npm run analyze` (cube integrity, rarity/identity spread, win rate by tier — from
a `/debug` export). `TeamBonuses.defenseMods` are deltas ADDED to the opponent's offense (a
defensive effect is a NEGATIVE number). `LINEUP_CENTRE` (`engine/balance.ts`) is downstream
of stages 1-2 and needs its own pass, not an ad-hoc fix, when an earlier stage's data changes.

## Gotchas discovered in the code
- `scripts/build-cards.ts` resolves `game.db` relative to `frontend/` — run it via the npm
  script. `/api/game-logs` (dev-only) writes to `../data/game_logs` relative to cwd.
- The cube draft (`generateCubePool` in `engine/draft.ts`) only guarantees zero duplicate
  player cards when the pool has 264+ players; it has 448.
- CI runs Node 24 so its npm matches the npm 11 that writes `package-lock.json` here; on
  npm 10 `npm ci` fails with `Missing: @emnapi/runtime from lock file`. Keep the two aligned.
- Not junk: `/test-ui` (fixture for `visual`/`smoke`), `/theater-preview`, `/challenge/preview`,
  `/challenge/preview-results`, `/debug`, `/deckbuilder-test`, `/data` are real pages.
