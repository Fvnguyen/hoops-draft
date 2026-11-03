# Data Pipeline

This folder contains the Python/JavaScript data pipeline that scrapes basketball-reference HTML snapshots, builds the SQLite player database (`frontend/game.db`), and downloads headshots and team logos into `frontend/public`.

## Overview

The pipeline follows this sequence:

1. **Scrape basketball-reference** → `per_game.html`, `advanced.html`, `shooting.html`, `awards.html`
2. **Fetch rosters with bio data** → `bio.csv`
3. **Merge stats and generate database** → `frontend/game.db` (SQLite)
4. **Download player headshots & team logos** → `data/headshots_src` and `frontend/public/logos` (mobile_load T4: `frontend/scripts/ensure-headshots.mjs` turns `headshots_src` into the WebP thumbnails actually served from `frontend/public/headshots/{96,480}`)

## Scripts

### `download_bref.js`
**Purpose:** Scrapes player stats from basketball-reference using Playwright (headless Chrome). Also scrapes the 26 letter-index pages (broad position + career span) and, per active player, that player's own bio page for exact multi-position eligibility (D10 follow-up, 2026-09-19) — bref's season table and the letter-index both cap at one broad G/F/C side, but a player's own page carries real text like "Point Guard and Shooting Guard".

**Reads:** None (fetches from `https://basketball-reference.com`)

**Writes:** `per_game.html`, `advanced.html`, `shooting.html`, `awards.html` (raw HTML snapshots); `bref_positions/players_<a-z>.html` (raw letter-index snapshots); `bref_player_positions.json` (derived — name -> raw "Position: ..." text for every active player, NOT raw HTML per player, which would be ~1.4MB x 582 players)

**Dependencies:** `playwright`, Node.js

**Working directory:** `data/` (relative paths to output files)

**Rate limiting:** one request every 3 seconds. The per-player bio scrape (~582 active players) takes 30-45 minutes and is resumable — re-running `download_bref.js` skips any name already in `bref_player_positions.json`.

### `fetch_bio.py`
**Purpose:** Fetches player bio data (height, weight, exact positions) for all 30 NBA teams via the NBA Stats API.

**Reads:** None (fetches from NBA Stats API)

**Writes:** `bio.csv`

**Dependencies:** `nba_api`, `pandas`, Python 3

**Working directory:** `data/`

### `fetch_players.py`
**Purpose:** Main stats processor. Merges per-game, advanced, and shooting stats; combines with bio data; resolves each player's depth-chart position via `PositionResolver` (see below); calculates player rating dimensions; and populates the SQLite database with Player, SeasonStat, and Award tables.

**`PositionResolver`** (D10 follow-up, 2026-09-19 — rules locked after analysis of all 582 active players, see `analyze_positions.py`): primary is always bref's season `Pos`; eligibility is the full position set parsed from the player's own bref bio page (`bref_player_positions.json`), trusted verbatim — no adjacency inference, no rating-based trim (the pool-wide distribution isn't skewed enough to need one). A player missing bio text falls back to a **persisted** value read from `game.db` *before* this run overwrites it, then to season-Pos-only. Persistence, not `POSITION_OVERRIDES`, is the fix for a data gap — `POSITION_OVERRIDES` stays reserved for overruling a real but wrong signal (e.g. Jokić's bio page says plain "Center"). A Rare+ card with genuinely no persisted value AND no bio text is logged to `REVIEW_MISSING_POSITIONS.md` (gitignored, regenerated per run) for a one-time manual `game.db` edit, which then persists forward on its own.

**Reads:**
- `per_game.html` (basketball-reference per-game stats table)
- `advanced.html` (basketball-reference advanced stats: PER, TS%, BPM, DBPM, VORP, USG%/AST%/TOV%/STL%/BLK%/ORB%/DRB%/TRB%/OBPM/DWS/WS-per-48)
- `shooting.html` (basketball-reference shooting breakdown by distance + assisted-FG%)
- `awards.html` (basketball-reference All-NBA, All-Defensive, and All-Star data)
- `bio.csv` (player heights and weights only — its broad position field is unused)
- `bref_player_positions.json` (exact multi-position eligibility)
- `../frontend/game.db` (read-only, for `PositionResolver`'s persisted-position fallback, before this run's tables are dropped and recreated)

**Writes:**
- `../frontend/game.db` (SQLite database with Player, SeasonStat, Award tables)
- `players.json` (minimal player ID list for `download_images.py`)
- `REVIEW_MISSING_POSITIONS.md` (gitignored; only written when a Rare+ card has no bio text and no persisted position)

### `analyze_positions.py`
**Purpose:** Re-verification tool for `PositionResolver`'s locked rules — run any time `bref_player_positions.json` is refreshed (a new season) to confirm the position-count distribution, primary-containment, and adjacency findings still hold before trusting the resolver blind. Not part of the automated pipeline; prints a report, writes nothing.

**Reads:** `per_game.html`, `bref_player_positions.json`, `../frontend/src/data/cards.json` (optional, for rarity cross-reference)

**Dependencies:** `requests`, `pandas`, `bs4` (BeautifulSoup), `nba_api`, `unidecode`, Python 3, SQLite

**Working directory:** `data/` (uses relative path `../frontend/game.db` for the database)

**Filters:** none at ingest (season_2026_27 D2). Every player on a current-season NBA roster (`bio.csv`) gets one `SeasonStat` row per season in `season_config.json` he played in (GP >= 1); awards are stored per season. Which rows make a card and how they blend is decided in `frontend/src/engine/ratings.ts`.

### `download_images.py`
**Purpose:** Downloads player headshots from the NBA CDN.

**Reads:** `players.json` (player IDs and names from `fetch_players.py`)

**Writes:** `headshots_src/{playerId}.png` (mobile_load T4: moved out of the deployed
`frontend/public/` — see `frontend/scripts/ensure-headshots.mjs` for the WebP thumbnails
that are actually served)

**Dependencies:** `requests`, Python 3

**Working directory:** `data/`

### `download_logos.py`
**Purpose:** Downloads team logos (SVG) from the NBA CDN for all 30 teams.

**Reads:** Hardcoded team ID mapping (internal to script)

**Writes:** `../frontend/public/logos/{teamId}.svg`

**Dependencies:** `requests`, Python 3

**Working directory:** `data/`

## Data Files

### `season_config.json`
`{ current, priors }`: the season every script reads (season_2026_27 D1). bref names a season by its end year (`2026-27` -> `NBA_2027`).

### `bref/<season>/{per_game,advanced,shooting,awards}.html`
Raw HTML snapshots from basketball-reference, one folder per season in `season_config.json` (the current season has no `awards.html`). Produced by `download_bref.js`.

### `bio.csv`
Hardcoded roster data (player names, heights, weights, positions) from the NBA Stats API. Produced by `fetch_bio.py`. Must be present for `fetch_players.py` to run.

### `players.json`
Minimal JSON list of player objects with `id`, `name`, and `rarity` fields. Produced by `fetch_players.py` and consumed by `download_images.py`. Updated after each stats refresh.

### `computed_cards.json`
Card metadata cache (produced by `frontend/src/export_cards.ts`). Not directly part of this pipeline; included here as a reference artifact.

### `bref_positions/`, `bref_player_positions.json`
Committed like the other scrape snapshots (card_ratings_rebalance D10, 2026-09-18/19).
`bref_positions/players_<a-z>.html` are raw letter-index pages; `bref_player_positions.json`
is a derived compact map (not raw HTML) of each active player's own bio-page position text.

## Output Database

### `../frontend/game.db`
SQLite database with three tables:

- **Player:** `id`, `name`, `position`, `height`, `weight`, `age`, `team`
- **SeasonStat:** Player stats for a single season (games, minutes, points, rebounds, assists, steals, blocks, FG%, 3P%, FT%, advanced metrics, shooting by distance)
- **Award:** Awards (All-NBA, All-Defensive, MVP, DPOY, MIP, ROTY) linked to players and seasons

## Runtime Exports

### `game_logs/`
Directory for runtime exports from the app's `/debug` page (game drafts, full rosters, season snapshots). Files are JSON and not committed. A `.gitkeep` file maintains the directory in version control.

## Analysis Documentation

Curated analysis and game design reports:

- `docs/analytics/analysis_report.md` – Detailed game balance analysis
- `docs/analytics/analytics_summary.md` – High-level summary of findings

## Run Order

Weekly card set (season_2026_27 D11): `npm run refresh:season` from the repo root runs
`refresh_season.py`, which freezes the shipping set, bumps `CARD_SET_VERSION` and runs, in
order: `download_bref.js` -> `fetch_bio.py` -> `fetch_players.py` -> `download_images.py` ->
`npm run build:cards` -> `refresh_stats.js`. `--skip-scrape` rebuilds from the snapshots on
disk (no freeze, no bump). The GitHub workflow `season-refresh.yml` runs it every Monday and
opens a PR.

Daily card-back stats: `npm run refresh:stats` (`refresh_stats.js`) scrapes the current
season's per-game page into `frontend/public/data/season-stats.json`; the workflow commits
it every morning when it changed.

All scripts expect to run from the `data/` directory and use relative paths to reference input files and the frontend database.
