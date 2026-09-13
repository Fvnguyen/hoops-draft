# Magic Ball

An NBA card game. Real NBA players (scraped from basketball-reference and the NBA Stats
API) become rated cards with rarities and badges. You draft a fixed cube (8 seats x 3
packs x 11 players + play cards), build a 12-man roster in a deck builder, then play out
games with an auto-battler engine — a possession battle, a multi-channel shot model
(rim / mid-range / three), and roster synergies — either as a one-off game or across a
7-game mini-season.

Built with Next.js 16, React 19, and Tailwind 4, reading player data from a read-only
SQLite database via `better-sqlite3`.

## Quick start

```bash
# from the repo root
npm install
npm --prefix frontend install
npm run dev
```

Open http://localhost:3000. The home page links to Draft, My Rosters, and a handful of
dev tools (Deckbuilder test, Test UI, Data viewer, Debug/analytics export).

## The data pipeline, in three sentences

Scripts in `data/` scrape player stats from basketball-reference and bios from the NBA
Stats API, merge them into per-player ratings, and write a SQLite database
(`frontend/game.db`) plus a player headshot/logo set into `frontend/public/`. The frontend
never touches the network for player data — it only reads `game.db` at request time
through `frontend/src/engine/ratings.ts` at build time (`npm run build:cards`), which computes overall rating, per-skill ratings,
rarity, and badges on the fly. See `data/README.md` for the exact script order and
dependencies.

## Repo map

```
data/        Scraper + stats pipeline (Python + Node/Playwright) — see data/README.md
docs/        Game mechanics, card schema, architecture, handover notes, analytics reports
scripts/     npm run analyze / npm run screenshot
frontend/    The Next.js app — see frontend/README.md (npm test, npm run balance live here)
```

## Deployment

Live at [hoops-draft-fvnguyen1.vercel.app](https://hoops-draft-fvnguyen1.vercel.app)
(Vercel project `hoops-draft`, Root Directory `frontend`, Node 22.x, deploys from `main`
via Git integration). Vercel Hobby plan ($0/month) — see
`docs/plans/plan_vercel_deploy_2026-09-13.md` for the cost/limits breakdown; confirm a
spend alert is set in the Vercel dashboard before scaling past personal use. Required env
vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) are set in Vercel and local `frontend/.env.local` — see
`frontend/supabase/README.md` for Supabase setup.

## Learn more

- `docs/ARCHITECTURE.md` — how data flows from scraper to screen
- `docs/game_mechanics.md` — the shot/possession model in prose
- `docs/HANDOVER.md` — current state, open balance issues, where to look next
- `docs/ROADMAP.md` — which plans to tackle in which order (latest three completed listed)
- `docs/plans/` — `plan_<topic>_<date>.md`, one locked plan per piece of work, from `TEMPLATE.md`
- `docs/completed/` — finished plans and reviews
- `AGENTS.md` — conventions and commands for anyone (human or agent) working in this repo
