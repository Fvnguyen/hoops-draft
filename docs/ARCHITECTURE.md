# Architecture

How data flows from basketball-reference to a played game, and which file owns each step.

```mermaid
flowchart TD
    A["basketball-reference.com\n+ NBA Stats API"] -->|"data/download_bref.js\n(Playwright)"| B["per_game.html\nadvanced.html\nshooting.html\nawards.html"]
    A -->|"data/fetch_bio.py\n(nba_api)"| C["bio.csv"]
    B --> D["data/fetch_players.py"]
    C --> D
    D --> E["frontend/game.db\n(SQLite, pipeline output)"]
    D --> F["data/players.json"]
    F -->|"data/download_images.py\ndata/download_logos.py"| G["frontend/public/\nheadshots, logos"]
    E -->|"npm run build:cards\nscripts/build-cards.ts\nengine/ratings.ts computeCards()"| H["frontend/src/data/cards.json\n(build artifact, committed)"]
    H --> I["/api/cards route.ts\n(static JSON)"]
    I --> J["useDraftEngine hook\n+ engine/draft.ts\ngenerateCubePool(rng), bot picks"]
    J --> K["DraftRoom.tsx\n(draft UI)"]
    K --> L["botDeckBuilder.ts\nbuildBotRoster (bots)\nDeckBuilder.tsx (human)"]
    L --> M["src/storage GameStore\n(IndexedDB via Dexie)\ndraftSessions, rosters"]
    M --> N["engine/season.ts\ncreateSeason / playNextGame(rng)"]
    N --> O["engine/game.ts\nsimulateGame(rng)\n+ engine/synergies.ts calcTeamBonuses"]
    O --> P["GameView.tsx / SeasonView.tsx\n(playback UI)"]
    O --> Q["src/storage GameStore\nseasons (with seeds)"]
    Q -->|"/debug page"| R["POST /api/game-logs\n-> data/game_logs/*.json"]
    R --> S["scripts/analyze_game_data.js\nbalance report"]
    S --> T["docs/analytics/\nanalysis_report.md\nanalytics_summary.md"]
```

## 1. Data collection (`data/`)

- **`download_bref.js`** — Playwright scrape of basketball-reference; writes raw HTML
  snapshots (`per_game.html`, `advanced.html`, `shooting.html`, `awards.html`).
- **`fetch_bio.py`** — pulls height/weight/position via `nba_api`; writes `bio.csv`.
- **`fetch_players.py`** — the merge step. Parses the HTML snapshots with BeautifulSoup,
  joins with `bio.csv`, computes the raw per-player stat rows, and writes both
  `frontend/game.db` (tables `Player`, `SeasonStat`, `Award`) and `players.json`. Filters
  to players with >=20 games and >=5.0 MPG.
- **`download_images.py`** / **`download_logos.py`** — pull headshots and team logos into
  `frontend/public/{headshots,logos}`.

Full script contracts (reads/writes/working directory) are in `data/README.md`.

## 2. Card computation (`frontend/src/engine/ratings.ts`, run at build time)

`computeCards(input)` is the only place ratings are computed. It is pure: it takes the
`Player`, `SeasonStat` and `Award` rows as plain arrays and returns cards. It runs in
`scripts/build-cards.ts` (`npm run build:cards`), which reads `game.db` and writes
`frontend/src/data/cards.json`; the app only ever reads that JSON (`engine/cards.ts`,
`/api/cards`). Steps:

1. Takes the latest `SeasonStat` row per player.
2. Buckets each player into a positional pool (`PG`/`SG`/`SF`/`PF`/`C`/`G`/`F`/`G-F`/`F-C`/
   `Gold`) via `getPool()`.
3. Computes seven skill ratings per player (finishing, mid-range, perimeter, playmaking,
   rebounding, perimeter defense, post defense) by indexing each raw stat against a
   benchmark — the mean of the top 7.5% of players in that stat (`RATING_CONFIG
   .benchmarkCutoff`).
4. Combines the seven ratings into an overall rating using a positional weight profile
   (`RATING_CONFIG.ovr.PROFILES`), a top-2-stat boost (`TOP1`/`TOP2`), an off-role
   forgiveness term (`FORGIVE`/`OFFROLE_MAX_W`/`REF`), a **core-gap penalty** that punishes
   weakness in a position's top-3 weighted stats (`CORE_PEN`/`CORE_REF`), and a composite
   PER/VORP/DBPM multiplier (0.80–1.15x).
5. Assigns rarity from the overall rating, then bumps it for MVP/All-NBA/DPOY/All-Defense,
   for a hardcoded `LEGENDARY_PLAYERS` list, and for league-leader status (top scorer,
   rebounder, assister, stealer, blocker, or 3pt-maker).
6. Assigns badges (`getBadge`, thresholds 80/90/96) and situational traits (Ironman,
   Sniper, Volume Scorer, etc.) from raw stats.

Served to the client via `frontend/src/app/api/cards/route.ts` (`GET /api/cards`), which
returns the committed JSON with a one-hour cache header. All tuning constants for this
step (`RATING_CONFIG`, legendary list, badge/rarity thresholds) live in
`engine/balance.ts`.

## 3. Draft (`engine/draft.ts` + `useDraftEngine.ts` + `DraftRoom.tsx`)

- **`generateCubePool(players, plays, rng)`** builds all 24 packs (8 seats x 3 rounds) upfront
  from a seeded `Rng` (the seed is minted in `useDraftEngine` and stored on the
  `DraftSession`): shuffles the
  full player pool, takes 264 player cards (11 per pack) with each player used at most
  once per pass, cycling with a suffixed id only if the pool has fewer than 264 players
  (it currently has 448, from `game.db`, so this should not trigger). Adds one random play
  card per pack.
- **`useDraftEngine`** is the draft state machine: seats 8 players (1 human + 7 bots named
  from `BOT_NAMES`), deals packs, and on each pick rotates packs left/right (standard
  booster-draft snake direction, reversed for the middle pack) via `processPickAndPass`.
  It also records every pick (`DraftPickRecord`) into a `pickLog` for later analysis.
- **`getBotPick` / `scoreCardForBot`** (`engine/draft.ts`) score each card in a bot's pack:
  PER-based base value (or a rarity table for play cards), a seeded pseudo-random 15%
  noise multiplier per bot, a positional-need pivot after pick 10, a synergy/trait-overlap
  bonus after pick 5, a favored-trait bonus, and a hate-draft floor for high-PER players.

## 4. Deck building (`engine/deckbuilder.ts` + `DeckBuilder.tsx`)

- **`buildBotRoster`** auto-builds each bot's 12-man active roster: best player per
  position first, then fills to 12 by positional need, then by smallest column; picks the
  top 3 play cards by category (system > special > basic) then rarity; everyone else stays
  in `BuiltRoster.rosterPlayers`/`rosterPlays` (the bench pool).
- The human's roster starts with an empty depth chart and every drafted card in the
  "Roster" sidebar list (no auto-fill — the human builds the lineup) and is built
  interactively in **`DeckBuilder.tsx`** (depth chart ordering, active play selection),
  then saved through the `GameStore` (`saveRoster`); the whole 8-seat draft is saved as a
  `DraftSession` (`saveDraftSession`) when the draft ends. See section 8 for the storage
  layer.

## 5. Game engine (`engine/game.ts` + `engine/synergies.ts`)

`simulateGame(homeTeam, awayTeam, { rng })` produces a full `GameTheater` object (which
records its `seed`) that the UI plays back possession-by-possession (no live simulation
loop in the UI). Every random draw goes through the `Rng`, so the same seed and rosters
reproduce the same game:

1. **Possession shares** (`calcPossessionShares`) — per-player share of team possessions,
   derived from OVR gap between starter/backup/deep bench and blended with real MPG.
2. **Bonuses** (`synergies.ts` `calcTeamBonuses`) — sums badge levels across the 12-man
   roster (`countBadges`), checks each `SYNERGIES` entry (stacking / combo / chemistry
   tiers) and each active `Play`'s requirements (`PLAY_EFFECTS`, full bonus if all
   requirements met, half if >=50%), and nets them into offense/defense `GameModifiers`
   (shot-share shifts, efficiency shifts, possession swing, and-1 chance).
3. **Possession battle** (`calcPossessionSplit` / `calcTeamPossRating`) — starts both
   teams at 100 possessions +/-5% noise, then shifts up to +/-8% based on a
   playmaking(40%)/rebounding(35%)/defense(25%) rating (starters weighted 2x), plus
   synergy/play possession swings.
4. **Shot profile** (`calcTeamShotProfile`) — blends 50% NBA baseline shot distribution
   (35% rim / 25% mid / 40% three) with 50% team tendency from finishing/mid-range/
   perimeter ratings, then applies share-bonus modifiers.
5. **Per-possession resolution** (`resolvePossession`) — rolls a shot channel from the
   profile, computes an edge (offense rating vs. matched defense rating, clamped
   +/-0.25), shifts the channel's baseline efficiency by `edge * 0.30` (clamped +/-10pp,
   `EFFICIENCY_SCALE` / `MAX_EFF_SHIFT` constants), rolls make/miss, then points (rim
   averages 1.5 via a 50/50 2-vs-1-point split modeling free throws) and an and-1 check
   (`AND1_BASE`, per channel).
6. Rotation timelines (`generateQuarterRotation`) drive substitutions and which 5-man
   lineup is on court for each possession; overtime uses starters only.

**Tuning knobs** all live in `engine/balance.ts`: `NBA_BASELINE` (shot shares/efficiency),
`LEAGUE_AVG` (edge centring), `EFFICIENCY_SCALE`, `MAX_EFF_SHIFT`, `PROFILE_WEIGHT`,
`AND1_BASE`, `STRENGTH_SWING_PCT`, `NOISE_PCT`, `TURNOVER_RATE`, possession clamps;
synergy/play tables live in `engine/synergies.ts` (`SYNERGIES`, `PLAY_EFFECTS`).
Convention: `TeamBonuses.defenseMods` are deltas added to the *opponent's* offense, so a
defensive effect is stored negative.

## 6. Season (`engine/season.ts` + `SeasonView.tsx`)

`createSeason(session, rosterId, rng)` builds a 7-game schedule (one game against each of
the other 7 seats, home/away alternating) and standings, and stores a season `seed`;
`playNextGame` derives a per-game seed, simulates via `engine/game.ts`, stores the seed on
the schedule entry and updates standings (wins desc, then point differential). Persisted
through the `GameStore` (`saveSeason`), keyed by `rosterId` + the originating `sessionId`.

## 6b. 82:0 Challenge (`engine/challenge.ts` + `app/challenge/[rosterId]/`)

The second game mode. A `DraftSession` carries `gameMode: 'tournament' | 'challenge'`
(missing = tournament) stamped at draft time from `/draft?...&game=`, and both the deck
builder's save CTA and the `/rosters` CTA route by it, so a roster can only enter the mode
it was drafted for.

`engine/challenge.ts` is pure and owns everything deterministic: `buildNbaTeams` (30
opponents from the card pool via `buildBotRoster`, with an empty-depth-chart-column fix),
`buildChallengeSchedule` (30 shuffled, repeated 3x, first 82), `challengeGameSeed` and
`mixSeed` (every game, the schedule and the trade pack derive their OWN stream from the run
seed, so reveal speed, a skip or a reload can never shift a result), `CHALLENGE_GRADES` /
`gradeForWins`, `simulateHalf` (41 games in one call, returning a W/L string, per-game
scores and top performers, player totals and opponent team totals) and `drawTradeOffers`.
`engine/challengeAdvice.ts` sits on top: pace band, ranked reasons and three speaker quotes
rendered from the pools in `src/narration/challenge/`.

`app/challenge/[rosterId]/page.tsx` is only a PHASE MACHINE — `first -> break -> second ->
done` — and holds the one invariant that matters: a half is simulated and committed to the
store before any component animates it, and nothing is ever simulated for a half already in
`run.halves`. That is what makes a reload replay the reveal instead of re-rolling the
season. When the roster changed at the break it also replays half 2 against `rosterPre` and
stores it as `run.ghost`, the results screen's counterfactual. Components under
`components/challenge/` (`FlipClock`, `TierLadder`, `ChallengeReel`, `FrontOffice`, `Trade`,
`Results`) are presentation over that committed data and hold no simulation of their own.

Challenge routes are dark by `data-theme="night"` on the subtree rather than hand-picked
inverse tokens, and are game routes (`lib/routes.ts`), so TopNav shows its gear menu and the
challenge headers reserve `--spacing-nav-gear` to clear it. `/challenge/preview` and
`/challenge/preview-results` render the signed boards from fixtures with no auth, storage or
simulation — the design-sign-off routes.

Storage is a `ChallengeRun` per roster (see §8), and `frontend/scripts/challenge-sim.ts`
(`npm run challenge`) is the headless calibrator for `CHALLENGE_TUNING`.

## 7. Logging and analysis

The `/debug` page calls `GameStore.exportAll()` and `POST`s the result to `/api/game-logs`
(`frontend/src/app/api/game-logs/route.ts`), which writes one JSON file per draft session
and per season plus a combined `full_dump_*.json` into `data/game_logs/` (resolved as
`../data/game_logs` relative to `process.cwd()` — again assumes cwd is `frontend/`). That
directory is gitignored; regenerate it by playing the app rather than committing exports.

`scripts/analyze_game_data.js` (`npm run analyze`) reads the newest `full_dump_*.json` and
prints draft-cube integrity, rarity distribution, OVR-vs-outcome correlation, synergy/play
activation rates, and score-range sanity checks. The curated writeups in
`docs/analytics/analysis_report.md` (raw per-session breakdown) and
`docs/analytics/analytics_summary.md` (findings + the user's own architectural hypotheses,
quoted as "User Note") are hand-curated snapshots of that script's output, not
regenerated automatically.

## 8. Persistence (`frontend/src/storage/`)

UI code never touches `localStorage` or IndexedDB directly. It calls `getGameStore()`,
which returns the single `GameStore` implementation for the environment:

- `indexedDb.ts` — Dexie database `MagicBallDB` with tables `draftSessions`, `rosters`,
  `seasons`, `challengeRuns`, `outbox`, `meta`. Quota failures surface as `StorageQuotaError`, which
  the deck builder and season view show inline.
- `memory.ts` — in-memory store used during SSR and in tests.
- `migrate.ts` — one-time import of the pre-Phase-1 `localStorage` keys
  (`hoops-draft-sessions`, `hoops-draft-seasons`, `myRosters`); the old keys are renamed
  to `*.migrated`, never deleted.
- `StorageProvider` (`src/components/StorageProvider.tsx`) runs `initStorage()` once at
  app start and exposes `useStorageReady()` so pages can wait for the migration.
- `StorageProvider` also keeps the store's OWNER in step with `AuthProvider`'s profile
  (sync_outbox): login, logout and an account switch are soft navigations, so the owner
  is re-applied on every change, one change after another. Both local stores ALWAYS filter
  reads by owner (no owner = only never-claimed rows). Ownerless rows are claimed once per
  device (`legacy_claimed` meta flag). `useStorageReady()` is false while a change applies.
- `supabase.ts` — `SupabaseGameStore`, the browser default in `getGameStore()`. It wraps a
  local store (`GameStore & OutboxStore`); every read goes through it. **Local-first with
  an outbox** (sync_outbox, migration `202609210001_sync_outbox.sql`):
  - A save or delete resolves on the LOCAL write and leaves one payload-free `OutboxRecord`
    per `${ownerId}:${table}:${id}` (Dexie table `outbox`, schema v5). Ten offline saves of
    one roster are one record; a delete replaces a pending upsert.
  - A single-flight **drain** pushes one key at a time, re-reading the current local row at
    send time. Triggers: a write, `online`, the tab becoming visible, the end of
    `setOwnerId`, the backoff timer. Pull and drain share one promise chain, and every
    request has a timeout (supabase-js has none).
  - A push is the `cas_upsert` RPC: compare-and-swap against the **baseline** (the
    `updated_at` the server held when both sides last agreed), persisted per owner in
    `meta` (`sync.baselines:<ownerId>`). Any rejection that carries a row is merged by the
    pure `merge.ts` (same purity discipline as `engine/`): draft sessions keep the longer
    `pickLog`, seasons union played games and recompute standings, rosters keep the newest
    edit, a `ChallengeRun` keeps the later `phase` (a tie goes to the run created first, so
    two devices converge). Only a truly diverged draft is parked for `SyncConflictPrompt`.
  - A delete is a `cas_delete` **tombstone** (`deleted_at`). A pull applies tombstones
    locally, which is how a second device learns a row is gone; a newer local save still
    in the outbox beats a tombstone, and an insert revives one.
  - The **pull** is two-phase: `id, updated_at, deleted_at` first, then `data` only for
    rows whose stamp differs from the baseline. It runs at sign-in (readiness waits at most
    6 s for it) and when the app is resumed after 5+ minutes.
  - Transient errors back off (2 s doubling, 60 s cap). Permanent ones (RLS, payload cap
    16 MiB, unknown table) park the record as `blocked` (`SyncStatus.blocked`); it gets one
    fresh attempt per sign-in.
  - `getOrCreateSeason` / `getOrCreateChallengeRun` create at most one row per roster, in
    one Dexie `rw` transaction, under `season_<rosterId>` / `challenge_<rosterId>`.
  - Server side: primary key `(owner_id, id)`, writes only for an APPROVED profile, the
    table allowlist lives in one `sync_table_allowed()` function. `/api/analytics` and
    `/admin/analytics` read the same tables (`src/lib/analyzeStats.ts`, shared with
    `scripts/analyze.ts`) — `scope=self` under the caller's RLS session, `scope=all`
    ADMIN-gated; both skip tombstones.

## 9. Headless tooling

- `npm test` — Vitest: `tests/unit` imports the real engine (ratings, draft, synergies
  and plays, game sim, season, determinism, engine purity) and `tests/storage` runs the
  store contract against both backends using `fake-indexeddb`.
- `npm run balance -- 1000 --seed 42` — `scripts/balance.ts` runs a full
  draft, roster and season pipeline for N games in a few seconds and prints PPP, score
  distribution and synergy/play activation rates. This is the tuning loop.
- `npm run build:cards` — regenerates `src/data/cards.json` from `game.db`.
