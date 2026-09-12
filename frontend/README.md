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

## The `game.db` / cwd gotcha

`frontend/src/lib/engine.ts` opens `game.db` with `path.join(process.cwd(), 'game.db')`,
and `/api/game-logs` and `src/export_cards.ts` similarly resolve paths relative to the
current working directory. **All of this only works if the process is started from
`frontend/`** — which `next dev` / `next build` naturally are, so this only bites you if
you try to run something like `ts-node` or a script from the repo root against these
files.

## Where things live

- `src/lib/` — engine.ts (card ratings, source of truth), gameEngine.ts (simulation),
  seasonEngine.ts, draftEngine.ts, botDeckBuilder.ts, synergies.ts, rosterStats.ts
- `src/hooks/useDraftEngine.ts` — draft state machine
- `src/components/` — DraftRoom, DeckBuilder, GameView, SeasonView, FranchiseDashboard,
  TopKPIBand, DonutChart, PlayerCard, TopNav
- `src/app/` — App Router pages (`/`, `/draft`, `/rosters`, `/season`, `/data`, `/debug`,
  `/deckbuilder-test`, `/test-ui`) and API routes (`/api/cards`, `/api/game-logs`)
- `game.db` — read-only SQLite player database, produced by `../data/fetch_players.py`
- `public/` — headshots, team logos, `players.json`, arena background images
- `prisma/schema.prisma` — legacy; the app reads `game.db` directly via `better-sqlite3`,
  not through Prisma (see root `docs/HANDOVER.md` for details)

For the full picture — how data flows in from the scraper, and what the engine/draft/game
modules do — see `../AGENTS.md` and `../docs/ARCHITECTURE.md`.
