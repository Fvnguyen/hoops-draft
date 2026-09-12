# Data Pipeline

This folder contains the Python/JavaScript data pipeline that scrapes basketball-reference HTML snapshots, builds the SQLite player database (`frontend/game.db`), and downloads headshots and team logos into `frontend/public`.

## Overview

The pipeline follows this sequence:

1. **Scrape basketball-reference** → `per_game.html`, `advanced.html`, `shooting.html`, `awards.html`
2. **Fetch rosters with bio data** → `bio.csv`
3. **Merge stats and generate database** → `frontend/game.db` (SQLite)
4. **Download player headshots & team logos** → `frontend/public/headshots` and `frontend/public/logos`

## Scripts

### `download_bref.js`
**Purpose:** Scrapes player stats from basketball-reference using Playwright (headless Chrome).

**Reads:** None (fetches from `https://basketball-reference.com`)

**Writes:** `per_game.html`, `advanced.html`, `shooting.html`, `awards.html` (raw HTML snapshots)

**Dependencies:** `playwright`, Node.js

**Working directory:** `data/` (relative paths to output files)

### `fetch_bio.py`
**Purpose:** Fetches player bio data (height, weight, exact positions) for all 30 NBA teams via the NBA Stats API.

**Reads:** None (fetches from NBA Stats API)

**Writes:** `bio.csv`

**Dependencies:** `nba_api`, `pandas`, Python 3

**Working directory:** `data/`

### `fetch_players.py`
**Purpose:** Main stats processor. Merges per-game, advanced, and shooting stats; combines with bio data; calculates player rating dimensions (Shooting, Inside, Playmaking, Rebounding, PerimDef, PostDef); and populates the SQLite database with Player, SeasonStat, and Award tables.

**Reads:**
- `per_game.html` (basketball-reference per-game stats table)
- `advanced.html` (basketball-reference advanced stats: PER, TS%, BPM, DBPM, VORP)
- `shooting.html` (basketball-reference shooting breakdown by distance)
- `awards.html` (basketball-reference All-NBA, All-Defensive, and All-Star data)
- `bio.csv` (player heights, weights, positions from `fetch_bio.py`)

**Writes:**
- `../frontend/game.db` (SQLite database with Player, SeasonStat, Award tables)
- `players.json` (minimal player ID list for `download_images.py`)

**Dependencies:** `requests`, `pandas`, `bs4` (BeautifulSoup), `nba_api`, `unidecode`, Python 3, SQLite

**Working directory:** `data/` (uses relative path `../frontend/game.db` for the database)

**Filters:** Includes only players with ≥20 games played and ≥5.0 minutes per game.

### `download_images.py`
**Purpose:** Downloads player headshots from the NBA CDN.

**Reads:** `players.json` (player IDs and names from `fetch_players.py`)

**Writes:** `../frontend/public/headshots/{playerId}.png`

**Dependencies:** `requests`, Python 3

**Working directory:** `data/`

### `download_logos.py`
**Purpose:** Downloads team logos (SVG) from the NBA CDN for all 30 teams.

**Reads:** Hardcoded team ID mapping (internal to script)

**Writes:** `../frontend/public/logos/{teamId}.svg`

**Dependencies:** `requests`, Python 3

**Working directory:** `data/`

## Data Files

### `per_game.html`, `advanced.html`, `shooting.html`, `awards.html`
Raw HTML snapshots from basketball-reference (season 2026 stats). Produced by `download_bref.js`. Do not commit; regenerated as needed.

### `bio.csv`
Hardcoded roster data (player names, heights, weights, positions) from the NBA Stats API. Produced by `fetch_bio.py`. Must be present for `fetch_players.py` to run.

### `players.json`
Minimal JSON list of player objects with `id`, `name`, and `rarity` fields. Produced by `fetch_players.py` and consumed by `download_images.py`. Updated after each stats refresh.

### `computed_cards.json`
Card metadata cache (produced by `frontend/src/export_cards.ts`). Not directly part of this pipeline; included here as a reference artifact.

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

1. `node download_bref.js` – Scrape basketball-reference
2. `python fetch_bio.py` – Fetch roster bio data
3. `python fetch_players.py` – Build database and players.json
4. `python download_images.py` – Download headshots
5. `python download_logos.py` – Download team logos

All scripts expect to run from the `data/` directory and use relative paths to reference input files and the frontend database.
