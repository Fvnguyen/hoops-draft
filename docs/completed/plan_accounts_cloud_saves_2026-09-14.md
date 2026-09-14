# Plan: accounts_cloud_saves

File: `docs/plans/plan_accounts_cloud_saves_2026-09-14.md`. Status: done 2026-09-14
Sequence: 3. Depends on: — (auth_approval done, unblocked).
Files owned: `frontend/supabase/migrations/202609140001_cloud_saves.sql`, `frontend/src/
storage/{supabase,merge}.ts` (merge.ts new), `storage/index.ts`, `storage/types.ts`,
`engine/season.ts` (add `recomputeStandingsFromSchedule`), `components/StorageProvider.tsx`,
`components/TopNav.tsx`, `components/SyncConflictPrompt.tsx` (new),
`hooks/useSyncStatus.ts`, `lib/analyzeStats.ts` (new), `app/api/analytics/route.ts`
(new), `app/admin/analytics/`, `scripts/analyze.ts`.

## Goal

A logged-in user's draft sessions, rosters, and seasons survive a cleared browser and
follow them across devices, including mobile arriving soon (real concurrent edits, not
just backup/restore). This also lays the query groundwork for both admin cross-user
analytics now and per-user "my stats" later, without a second backend rewrite.
`docs/ARCHITECTURE.md` §8 already names this as "a third `GameStore` implementation with
IndexedDB kept as the offline cache" — this plan builds that.

## Decisions (locked)

- **D1 Schema.** Three tables mirroring the existing Dexie tables 1:1, one row per
  record: `public.draft_sessions`, `public.rosters`, `public.seasons`. Columns: `id text
  primary key`, `owner_id uuid not null references auth.users(id) on delete cascade`,
  `data jsonb not null` (the full `DraftSession`/`SavedRoster`/`Season` object),
  `client_timestamp timestamptz not null` (from `data.timestamp`), `updated_at
  timestamptz not null default now()` (server-set on every write). Index on `(owner_id)`
  per table.
- **D2 RLS.** Owner can `select`/`insert`/`update`/`delete` only rows where `owner_id =
  auth.uid()`. A `profiles.role = 'ADMIN'` user can additionally `select` (read-only)
  every row across all owners, for D6.
- **D3 Sync model: local-first, push-on-write, pull-on-init.** IndexedDB stays the store
  every read goes through. Every `save*` writes to IndexedDB first, then pushes to
  Supabase via D4's compare-and-swap RPC; a failed push (offline, or a CAS rejection that
  needs merging) goes into a retry queue flushed on the next write or a browser `online`
  event. On app start, once `ownerId` is set, pull all Supabase rows for that owner and
  merge into IndexedDB (D4).
- **D4 Concurrency: optimistic compare-and-swap + type-specific auto-merge, kept
  transport-agnostic.** Mobile means real concurrent edits, not just restore, so plain
  last-write-wins is rejected.
  - Postgres RPC `cas_upsert(table_name, id, owner_id, expected_updated_at, data,
    client_timestamp)` (dynamic SQL via `format()`) does `update ... where updated_at =
    expected_updated_at`, falling back to `insert` when no row exists; returns `{ok,
    current_row}`. Every push goes through this RPC, never a raw upsert.
  - `frontend/src/storage/merge.ts`: pure functions, **no Supabase/Dexie/fetch imports**
    (same discipline `tests/unit/engine-purity.test.ts` enforces for `engine/`, checked
    by a matching new test) — `merge<T>(local, remote): {merged: T, conflict: boolean}`
    per type, called only when `cas_upsert` returns `ok: false`. Kept transport-agnostic
    so the same functions still work if direct-to-Supabase writes are later replaced by
    a real backend API — only `supabase.ts`'s transport would change.
  - `mergeDraftSession`: `pickLog` is sequential/append-only within a draft — take the
    side with the longer log (`conflict: true` only if it isn't a superset prefix, i.e.
    corruption, not a normal race). Covers resuming a draft on a second device.
  - `mergeSeason`: schedule entries are monotonic (`played` flips once, gains a
    `result`) — per entry take whichever side played it; `currentGame = max(local,
    remote)`; recompute `standings` from the merged schedule via new pure
    `recomputeStandingsFromSchedule()` (`engine/season.ts`) instead of merging standings
    fields directly, so they can't drift from the schedule. `conflict` is always `false`.
  - `mergeRoster`: no sensible auto-merge for depth-chart/play edits (reordering isn't
    append-only) — always `conflict: true` when both sides changed since the common
    `updated_at`; the one place a human picks a side.
  - `conflict: true` parks the push and surfaces D7; `conflict: false` re-pushes the
    merged record automatically (one more `cas_upsert` round trip), no user interruption.
- **D5 One-time migration push.** On first `StorageProvider` mount with an `ownerId` set
  (after `claimLegacyData()`), `exportAll()` and `cas_upsert` every locally-owned row
  missing on the server. Idempotent, safe on every mount.
- **D6 Analytics: scoped from the start, admin UI now, self UI later.**
  `analyzeStats.ts` and the new `GET /api/analytics?scope=self|all` route both take a
  `scope` param: `self` runs under the caller's own session (RLS already permits reading
  one's own `seasons` rows, no service-role key needed) and `all` requires
  `profiles.role = 'ADMIN'` and the service-role client. Only the admin page
  (`/admin/analytics`, `scope=all`) ships a UI this plan; `scope=self` is built, tested,
  and ready for a future per-user stats page to call without touching the query layer
  again. Aggregate math (PPP, score distribution, win rate by identity tier) is extracted
  from `frontend/scripts/analyze.ts` into `analyzeStats.ts` so both the script and the
  route share one implementation — never duplicated in SQL.
- **D7 Conflict + sync UI.** A non-blocking `TopNav` indicator ("synced" / "syncing…" /
  "offline, N pending" / "N conflicts") backed by `useSyncStatus.ts`. A roster conflict
  (D4) opens `SyncConflictPrompt.tsx` — "this roster changed on another device: keep this
  device's version / use the cloud version" — reusing the existing `Toast` visual
  language. Draft/season conflicts never reach this UI (auto-merged).
- **D8 Config.** Reuses existing Supabase env vars.

## Out of scope

- The `scope=self` per-user stats *page/UI* — D6 ships the query path only.
- True CRDT/live collaborative roster editing with both devices open — D4's conflict is
  still "pick a side," just surfaced instead of silently lost.
- Public/shareable rosters or seasons — separate feature; replacing `/debug` + `npm run
  analyze` — stays alongside D6.

## Tasks

- **T1** Migration: D1 tables, D2 RLS, `cas_upsert` RPC (D4). Done-when: `npm run migrate
  -- supabase/migrations/202609140001_cloud_saves.sql` succeeds; tables/policies/RPC
  visible in the dashboard. Tier: mid.
- **T2** `recomputeStandingsFromSchedule()` in `engine/season.ts`, unit-tested against a
  hand-built schedule. Tier: mid.
- **T3** `frontend/src/storage/merge.ts`: the three merge functions (D4), unit-tested
  alone plus a purity test mirroring `tests/unit/engine-purity.test.ts`. Tier: mid.
- **T4** `frontend/src/storage/supabase.ts`: `SupabaseGameStore` implementing
  `GameStore` — IndexedDB-first reads, `cas_upsert` push with retry queue, pull-on-init,
  calls `merge.ts` (T3) on rejection, exposes pending conflicts (new
  `listConflicts()`/`resolveConflict()`). Wired into `getGameStore()`. Done-when:
  `tests/storage/supabase.test.ts` (mocked client) covers push/pull, auto-merge for
  seasons/drafts, and prompted conflict for rosters. Tier: mid.
- **T5** One-time migration push (D5) from `StorageProvider.tsx`. Done-when: sign in with
  existing local data, rows appear in Supabase. Tier: mid.
- **T6** Sync + conflict UI (D7): `useSyncStatus.ts`, `TopNav.tsx`,
  `SyncConflictPrompt.tsx`. Done-when: screenshot shows the indicator; a forced roster
  conflict shows the prompt and both choices resolve it. Tier: low.
- **T7** `analyzeStats.ts` extraction + scoped `/api/analytics` route (D6). Done-when:
  `npm run analyze` output unchanged after extraction; `scope=self`/`scope=all` both
  covered by a route test with a mocked session. Tier: mid.
- **T8** `/admin/analytics` page consuming `scope=all`. Done-when: screenshot as the
  admin account with non-zero numbers from real Supabase data (seeded by T5). Tier: mid.
- **T9** Docs: `ARCHITECTURE.md` §8 (push/pull/CAS/merge, no longer hypothetical),
  `supabase/README.md` (new migration step). Tier: low.

## Parallelization

- **Wave 0** (driver, mid): T1 — schema/RPC is the contract everything else reads.
- **Wave 1**, disjoint files, parallel: T2 (engine) + T3 (merge.ts) — neither touches
  Supabase, both are pure and independently testable.
- **Wave 2** (mid): T4, alone — depends on T1-T3.
- **Wave 3**, disjoint files, parallel: T5 (`StorageProvider.tsx`) + T6 (`TopNav`/new
  components) + T7 (`analyzeStats.ts`/route).
- **Wave 4**, parallel: T8 (depends on T7) + T9 (docs).

## Recommended model tier

Mid (Sonnet 5 / Gemini 3 Pro) — plumbing and a well-specified merge algorithm against an
existing `GameStore` interface, not design-heavy or balance-affecting. Low tier for UI
copy and docs (T6, T9). Review T3/T4's merge logic closely — the one part with real edge
cases.

## Verification / exit criteria

- `npm test` passes: `tests/storage/supabase.test.ts`, `tests/storage/merge.test.ts`,
  merge-purity test.
- `tsc --noEmit` and `npm run lint` clean.
- Two-device check: play a game on device A, open B without refreshing A, confirm
  `currentGame`/standings merge cleanly with no prompt.
- Conflict check: edit the same roster on two offline devices, reconnect both, confirm
  the prompt appears once and both resolutions work.
- `npm run analyze` output unchanged after the T7 extraction; admin analytics page shows
  real Supabase-sourced numbers, screenshotted; `scope=self` returns only own rows.
- `smoke.spec.ts` still passes.
