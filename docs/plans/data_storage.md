# Plan: data_storage

Status: planned
Sequence: 6 in `docs/ROADMAP.md`. Depends on: nothing (can run in parallel with 1-5 by a
second session; it owns disjoint files). Files owned: `frontend/src/storage/*`,
`engine/season.ts` (schedule entry result shape), `engine/index.ts` exports,
`app/rosters/page.tsx` (export/import UI), `tests/unit/storage*.test.ts`,
`tests/unit/determinism.test.ts`.

## Goal

User state is stored as fat snapshots: a seven-game season is about 1.7 MB because every
game keeps its full narrated theater. The engine is deterministic from a seed, so a game
can be a few hundred bytes and re-simulated when viewed. After this plan seasons are
small, storage has explicit schema versions with migrations, users can back up and
restore their data without the dev-only `/debug` page, and the store is ready to sit
behind a remote backend in the accounts plan.

## Decisions (locked)

- D1 A completed game is persisted as
  `{ seed, balanceVersion, homeSeatIndex, awaySeatIndex, finalScore, boxScore, overtimes }`.
  The theater is re-simulated on demand with `simulateGame(home, away, seed)` from the
  season's stored `TeamInfo` snapshots (which already embed the players' cards, so later
  card set changes do not alter old games). If `balanceVersion` differs from the current
  `BALANCE_VERSION` (new export in `engine/balance.ts`, bumped by any engine plan), the
  view shows the box score and a notice that play-by-play is unavailable rather than a
  different game.
- D2 Determinism test: same seed + same `TeamInfo` pair produce byte-identical theaters
  across two runs and across the memory and IndexedDB code paths. This test gates D1.
- D3 Dexie schema versions: the store declares `version(n)` steps with upgrade functions;
  `normalizeSeason` and `normalizeBuiltRoster` become upgrade steps run once at open, and
  the load-time normalizers are removed after one release. A `meta` table stores
  `schemaVersion` and `cardSetVersion`.
- D4 Drafts and rosters record `cardSetVersion` (from card_balance D8; until it exists,
  `'2025-26.1'`). Rosters from an older card set load normally; the rosters page shows a
  small "older card set" tag. No silent re-rating.
- D5 Export/import: the rosters page gets "Export my data" (one JSON file with drafts,
  rosters, seasons, `schemaVersion`) and "Import" (merges by id, newer `timestamp` wins,
  never deletes). `/debug` keeps its analytics export; it is not the user backup path.
- D6 Size target: a completed 7-game season under **100 KB** in IndexedDB; a draft
  session under **300 KB**. Measured by a storage test that serialises fixtures.
- D7 Remote backend is not implemented here; `GameStore` keeps one interface and the
  IndexedDB and memory implementations. No Zustand or other state library is added.
- D8 Seasons in progress at upgrade time: the upgrade step converts already-played games
  to D1 shape by keeping their stored box score and seed; their theater is dropped and
  re-simulated on view. A game stored without a seed (pre-Phase-1) keeps its theater
  as-is in a `legacyTheater` field, shown read-only.

## Out of scope

Accounts, sync, conflict resolution across devices, server storage, deleting user data
from the UI, analytics export changes.

## Tasks

- T1 `BALANCE_VERSION` export and determinism test per D2. Tier: mid.
- T2 Game result shape per D1 in `season.ts` + re-simulate-on-view in the season page and
  `GameView` call sites; D8 legacy handling. Tier: mid.
- T3 Dexie versioned migrations per D3 and `meta` table; tests with `fake-indexeddb`
  upgrading a fixture written in the old shape. Tier: mid.
- T4 `cardSetVersion` stamping per D4 and the rosters page tag. Tier: low.
- T5 Export/import per D5 on the rosters page; test for merge rules. Tier: mid.
- T6 Size test per D6. Tier: low.

## Parallelization

- Wave 0 (driver, 15 min): write the D1 record type and the `meta` table shape in
  `storage/types.ts` as the contract; add `BALANCE_VERSION` (T1 is small enough to do
  inline here).
- Wave 1 (parallel): T2 (mid, `season.ts` + season/game views), T3 (mid, `storage/*`),
  T5 (mid, rosters page + a `storage/exportImport.ts` module). Disjoint files.
- Wave 2: T4, T6 (low) after wave 1.

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro, with an Opus 5 / Gemini 3 Pro Deep Think review
of the migration design (D3, D8) before wave 1 starts. Agents: Sonnet 5 for T2, T3, T5;
Haiku 4.5 / Gemini 3 Flash for T4, T6.

## Verification / exit criteria

- Determinism and size tests pass; `npm test` green on both storage backends.
- In the app: a season saved before this plan opens, its played games show box scores
  and play-by-play, new games play and persist under 100 KB per season (checked in
  DevTools Application tab and stated in the handover).
- Export then import on a fresh browser profile restores drafts, rosters and seasons.
