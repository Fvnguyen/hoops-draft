# Plan: sync_outbox

File: `docs/plans/plan_sync_outbox_2026-09-21.md`. Status: planned
Sequence: 12 in `docs/ROADMAP.md`. Depends on: nothing. Must land BEFORE `mobile_load`'s task that dynamically
imports the Supabase store from `frontend/src/storage/index.ts`; that task assumes the write/ready model this
plan changes.
Files owned: `frontend/src/storage/{types,indexedDb,memory,supabase}.ts`,
`frontend/src/components/{AuthProvider,StorageProvider,TopNav,SeasonView,DraftRoom}.tsx`,
`frontend/src/app/(auth)/{AuthForm,LogoutButton}.tsx`, `frontend/src/app/challenge/[rosterId]/page.tsx`,
`frontend/src/app/rosters/page.tsx`, `frontend/supabase/migrations/202609210001_sync_outbox.sql` (new),
`frontend/tests/storage/*`, `docs/HANDOVER.md`, `docs/ARCHITECTURE.md`.

## Goal

Cloud sync (`accounts_cloud_saves`, done 2026-09-14) stays correct only while a session never switches accounts,
never goes offline, and never gets killed mid-write. An installed PWA backgrounded for days does all three. This
plan starts sync on login without a reload, makes every save resolve locally and push in the background through
a persisted outbox, adds delete tombstones, and fixes the worst perf and security gaps. It does not contradict
`accounts_cloud_saves`' D3 (local-first) or D4 (CAS plus type-specific merge); it replaces the transport those
decisions push through, not the merge logic.

## Decisions (locked)

- **D1 Owner-id source of truth.** `AuthProvider.tsx` gains `refreshAuth(): Promise<void>` (re-runs its
  `/api/auth/me` fetch, updates `profile`/`status`) plus a `supabase.auth.onAuthStateChange` subscription calling
  it on `SIGNED_OUT`/`TOKEN_REFRESHED`. `AuthForm.tsx`'s `submit` (line 51) and `LogoutButton.tsx`/`TopNav.tsx`'s
  `signOut` (line 12, line 215) call `refreshAuth()` before navigating. `StorageProvider.tsx` drops its own
  `/api/auth/me` fetch and run-once `setOwnerId` call (line 63); a new effect keyed on `useCurrentProfile()?.id`
  calls `store.setOwnerId(id ?? null)` on every change, and `store.claimLegacyData()` only when a new
  `legacy_claimed` meta flag is absent (set right after). Absorbs the duplicate-fetch removal `mobile_load`
  planned; that plan builds on this. Logout never wipes IndexedDB.
- **D2 `owned()` fix.** `indexedDb.ts:207` returns every row unfiltered when `this.ownerId` is falsy. Always
  filter (`row.ownerId === this.ownerId`) instead, so a signed-out reader only sees rows with no `ownerId`, never
  a prior session's rows.
- **D3 Write model.** Every `GameStore.save*`/`delete*` resolves once the local Dexie write lands;
  `SupabaseGameStore` never awaits `push()`/`deleteRemote()` inside them. The one remaining `/api/auth/me` fetch
  (`AuthProvider.tsx`, after D1) gets `AbortSignal.timeout(4000)`. Only a 401/403 signs out; a timeout or
  network error keeps the last known profile (`lib/authState.ts`, cached in `localStorage`), because with D2 a
  false "signed out" would hide every roster on a bad connection.
- **D4 Outbox.** New Dexie table `outbox` (schema version 5), row `OutboxRecord` (`storage/types.ts`): `{ key
  /* `${ownerId}:${table}:${id}` */, ownerId, table, id, op: 'upsert' | 'delete', queuedAt, attempts, lastError?,
  blocked? }`, coalesced per key, drained only for the signed-in `ownerId`. Reached through `OutboxStore`
  (`listOutbox`/`putOutbox`/`deleteOutbox`), implemented by the two local stores; `SupabaseGameStore` wraps
  `GameStore & OutboxStore`. `save*`/`delete*` write local then call `enqueue()` (fire-and-forget),
  which upserts the row and kicks `drain()`. `drain()` runs one key at a time, re-reading the CURRENT local row
  before each push (also fixes finding 6's late-rejection race, since a second write can't race the first's
  merge). A network error backs off `min(60000, 2000 * 2 ** attempts)` ms and retries; a permanent error (RLS
  403, payload-too-large/invalid-table-name) parks the key and reports it via a new `blocked: number` field on
  `SyncStatus` (additive). `drain()` also runs on `online` and on `visibilitychange` to visible.
- **D5 Delete tombstones.** `deleted_at timestamptz` (default null) on all four tables. New RPC
  `cas_delete(table_name, p_id, p_owner_id)` sets it (allowlist now one `sync_table_allowed()`); `pullAll` reads
  `deleted_at` too and hard-deletes the local copy of a tombstoned row (that is how device B learns of A's
  delete); an insert-only `cas_upsert` revives a tombstone in place. `api/analytics` adds `deleted_at is null`.
  Local rows hard-delete immediately; the outbox carries the delete remotely.
  `handleDelete` (`app/rosters/page.tsx:156-163`) also calls `store.deleteChallengeRun(run.id)` when one exists,
  closing the ChallengeRun-orphan half of finding 4. The DraftSession orphan stays, since a session can
  legitimately outlive one of its rosters.
- **D6 Composite primary key.** `id text primary key` (`202609140001_cloud_saves.sql:4`) becomes
  `primary key (owner_id, id)` on all four tables. `cas_upsert`/`cas_delete` already scope by `owner_id`, so
  behavior is unchanged per owner; two owners can now hold the same `id`, fixing `exportImport.ts`'s
  import-keeps-ids backup loop.
- **D7 Sync perf.** `cas_upsert` returns `(ok, updated_at, current_row)`; on success `current_row` is only
  `{id, updated_at}` (keeps the deployed client working while the migration is live), the full row on `ok = false`. `pullAll` first selects `id, updated_at` per table
  (`deleted_at is null`); only ids whose `updated_at` differs or is missing get a second batched
  `select id, data, updated_at where id = any($ids)`. `pushLocalToCloud` skips `pushIfMissing` for any key
  already in `this.baselines`. Card-id-only `DraftSession` storage is OUT OF SCOPE, a schema change tangled with
  `CARD_SET_VERSION`/`cards.json` versioning that needs its own plan.
- **D8 RLS and payload cap.** Each table's `owner full access` policy splits into `for select` (unchanged) and
  `for insert, update, delete` (adds `and exists (select 1 from public.profiles p where p.id = auth.uid() and
  p.status = 'APPROVED')`). `cas_upsert` raises if `pg_column_size(p_data) > 16777216` (16 MiB; measured: 4 legacy seasons are 1.1-4.6 MB). The
  `app/api/auth/login/route.ts` open redirect is a separate bug fix, not part of this plan.
- **D9 Deterministic ids.** `challenge_<rosterId>`/`season_<rosterId>` replace `challenge_${Date.now()}`
  (`app/challenge/[rosterId]/page.tsx:95`) and `season_${Date.now()}` (`engine/season.ts:180`) for new
  runs/seasons; existing `_<timestamp>` ids keep working via `getSeasonByRoster`/`getChallengeRunByRoster`.
  `GameStore` gains `getOrCreateSeason`/`getOrCreateChallengeRun(rosterId, factory)`, each one Dexie `rw`
  transaction using `table.add()` (rejects on an existing key), so concurrent callers on one device produce
  exactly one row. `engine/season.ts` stays untouched; the id is overridden before the first save.
- **D10 Table descriptor.** One `SYNC_TABLES` array (name, Dexie table accessor, `stamp`, `merge`, `parse` from
  `safeLoad.ts`) replaces the four-way if-chains in `writeLocalOnly`/`readLocal`/`resolveViaMerge`
  (`supabase.ts`) and the repeated CRUD in `indexedDb.ts`/`memory.ts`. Behavior-preserving only.
- **D11 Scope of the low findings.** Draft autosave is DROPPED (owner, 2026-09-21): nothing can resume a draft
  (packs live in React state, `DraftRoom.tsx:405` says so), so a per-pick save only litters storage and
  analytics. The real fix is a future `draft_resume` plan (seed + pick log rebuild the state). `exportAll`/`usage`/backup omitting challenge runs, local-only `clearAll`, no
  `navigator.storage.persist()`, no Dexie `blocked`/`versionchange` handler stay out of scope: small standalone
  fixes for later.
- **D12 Migrations.** The new migration is written here but applied only by the owner, running `npm run migrate
  -- supabase/migrations/202609210001_sync_outbox.sql`. No task runs it; no agent touches Supabase directly.

## Out of scope

- Card-id-only `DraftSession` storage (D7).
- CRDT/live collaborative roster editing, already out of scope per `accounts_cloud_saves`.
- The `app/api/auth/login/route.ts` open-redirect fix (separate bug fix).
- Everything D11 lists as staying out of scope, and mid-draft kill recovery (future `draft_resume` plan).

## Tasks

- **T1** Outbox types and Dexie v5 (`storage/types.ts`, `indexedDb.ts`), `owned()` fix (D2), migration
  `202609210001_sync_outbox.sql` (D5/D6/D7/D8). Done-when: `tsc --noEmit` clean; owner applies the migration
  (D12), confirms tables/RPCs in the dashboard. Tier: top.
- **T2** Auth wiring: `AuthProvider.tsx` (`refreshAuth`/`onAuthStateChange`), `AuthForm.tsx`/`LogoutButton.tsx`/
  `TopNav.tsx` call sites (D1). Done-when: `npm run test:e2e` (`auto-login.spec.ts`, `topnav.spec.ts`,
  `smoke.spec.ts`) green. Tier: mid.
- **T3** Dropped, see D11.
- **T4** `StorageProvider.tsx` rewrite: derive `ownerId` from `useCurrentProfile()?.id`, `legacy_claimed` gate
  (D1); `useNotices` reloads on owner change (it reads seasons before the owner is set). Done-when: screenshot per AGENTS.md, plus a manual two-login check (sign in, switch account same tab, no
  reload) shows only the new account's rosters. Tier: top.
- **T5** Outbox engine in `supabase.ts`: non-blocking writes, `drain()`/backoff/error classification (D3/D4),
  tombstone deletes plus roster-to-run cascade (D5), two-phase pull plus skip-if-baselined push plus slim CAS
  handling (D7), `app/rosters/page.tsx` cascade call. Done-when: `tests/storage/supabase.test.ts` covers a write
  resolving before push settles (fake timers), per-key serialized drain, permanent-vs-transient classification,
  an offline delete not resurrecting after reconnect, `pullAll`'s id/updated_at-first query. Tier: top.
- **T6** Deterministic ids plus atomic get-or-create (D9). Files: `storage/types.ts`, `indexedDb.ts`,
  `memory.ts`, `supabase.ts`, `SeasonView.tsx`, `app/challenge/[rosterId]/page.tsx`. Done-when:
  `tests/storage/gameStore.test.ts` new case, `Promise.all` of two `getOrCreateChallengeRun(rosterId, factory)`
  calls, yields the same id and exactly one stored row. Tier: mid.
- **T7** Table descriptor refactor (D10). Files: `indexedDb.ts`, `memory.ts`, `supabase.ts`. Done-when:
  `npm test` fully green, same assertions pass unmodified. Tier: top.
- **T8** Docs: `docs/HANDOVER.md` (outbox/tombstone/composite-PK), `docs/ARCHITECTURE.md` section 8. Done-when:
  `wc -l docs/HANDOVER.md` under 250. Tier: low.

## Parallelization

- **Wave 0** (driver, top): T1. Schema, Dexie version, migration SQL are the contract everything else reads.
  Owner applies the migration before wave 2 starts.
- **Wave 1**: T2 (`AuthProvider`/`AuthForm`/`LogoutButton`/`TopNav`).
- **Wave 2**, depends on T1-T2, disjoint files, parallel: T4 (`StorageProvider.tsx`) and T5 (`supabase.ts`
  outbox engine; T5 does not touch `StorageProvider.tsx`).
- **Wave 3**, depends on T5, sequential since both touch `supabase.ts`/`indexedDb.ts` (one agent, not two in
  parallel): T6, then T7.
- **Wave 4**, depends on everything: T8 (docs).

## Recommended model tier

Main driver: Sonnet 5 (mid). Reads this plan, runs `tsc`/`npm test`, verifies the owner applied the migration
before wave 2, screenshots T4, commits. T1, T4, T5, T7 run top tier (Fable 5.1/Opus 5 or Gemini 3 Pro Deep
Think): schema/RLS/payload-cap correctness, the drain/backoff/tombstone logic, and the account-switch path are
what corrupts data if wrong. T2/T6 run mid; T8 runs low.

## Verification / exit criteria

- `npm test` green, including cases named in T5/T6's done-when.
- `tsc --noEmit`, `npm run lint`, `npm run check:styles` (0 violations) clean.
- `smoke.spec.ts` 9/9; `topnav.spec.ts`/`auto-login.spec.ts` green.
- Manual: go offline,
  delete a roster with a challenge run, reconnect, confirm neither reappears (D5). Log in, switch accounts in
  one tab, confirm no stale-owner rows (T4, screenshotted per AGENTS.md).
- `npm run analyze` output structurally unchanged; this plan does not touch balance.
- Owner confirms the migration applied in the Supabase dashboard (D12) before `/roadmap done`.
