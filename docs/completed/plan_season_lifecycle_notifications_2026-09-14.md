# Plan: season_lifecycle_notifications

File: `docs/completed/plan_season_lifecycle_notifications_2026-09-14.md`. Status: done 2026-09-14
Sequence: inserted ahead of #3 in `docs/ROADMAP.md` (small, unblocked, no file overlap
with 3-8). Depends on: none. Files owned: `engine/season.ts`, `storage/types.ts`,
`storage/supabase.ts`, `src/data/whatsnew.ts` (new), `hooks/useNotices.ts` (new),
`hooks/useUserSeasonStats.ts` (new), `components/TopNav.tsx`, `components/SeasonView.tsx`,
`app/rosters/page.tsx`, `app/roster/[id]/page.tsx`.

## Goal

Seasons currently have no visible lifecycle: a drafted roster, a roster mid-deckbuilding,
a season being played, and a finished season all look the same in the UI, finished
seasons/rosters can still be edited, nothing on the Roster overview or profile shows a
record, and there's no in-app notice for a finished season or app changes. This plan adds
a derived season/roster status (Pre-Season / Live Season / Completed), locks Completed
rosters+seasons read-only, surfaces the record on the Roster overview and a W/L blurb in
the profile menu, and adds a notification bell (static changelog + a "season complete"
notice) to the top nav.

## Decisions (locked)

- **D1**: Season/roster phase is *derived*, never stored. New `SeasonPhase = 'preseason' |
  'live' | 'completed'` and `getSeasonPhase(season: Season | null): SeasonPhase` in
  `engine/season.ts`: no `Season` row or `currentGame === 0` -> `preseason`;
  `1-6` -> `live`; `>= 7` -> `completed`. No new persisted field, no migration, no merge
  changes for status itself.
- **D2**: `HUMAN_SEAT_ID = 'human-0'` becomes an exported constant in `engine/season.ts`,
  replacing the 12 existing raw-string occurrences (`SeasonView.tsx`, `season.ts`) as part
  of this work — not a separate cleanup pass.
- **D3**: Locking a Completed season/roster is enforced at the UI layer only (no storage
  write-guard): `app/roster/[id]/page.tsx` renders a read-only banner and passes a
  `readOnly` prop into `DeckBuilder` that disables save/depth-chart/play edits when
  `getSeasonPhase(linkedSeason) === 'completed'`; `SeasonView.tsx`'s existing
  `isSeasonComplete` local (line ~274) is replaced by `getSeasonPhase(season) ===
  'completed'` for consistency, no behavior change there (it already blocks new games).
- **D4**: `app/rosters/page.tsx` fetches each roster's season (already does, via
  `getSeasonByRoster`) and additionally reads the `HUMAN_SEAT_ID` standings entry, showing
  a phase pill (Pre-Season/Live/Completed) + "W-L" text per card. No N+1 concern: roster
  counts are small (single user's saved rosters).
- **D5**: User-level stats: `computeUserSeasonStats(seasons: Season[]): { seasonsPlayed:
  number; wins: number; losses: number; avgWins: string; avgLosses: string }` in
  `engine/season.ts`, filtering to `getSeasonPhase(s) === 'completed'`, summing the
  `HUMAN_SEAT_ID` standings entry per season, `avg* = (total / seasonsPlayed).toFixed(1)`
  (0 seasons -> all zeros/'0.0', no division by zero). One shared hook
  `hooks/useUserSeasonStats.ts` (lists seasons via `getGameStore()`, memoizes) is used by
  both the Roster overview (if it wants a header total — optional) and the profile menu.
- **D6**: Notification/changelog state is **device-local, not cloud-synced**. `getMeta`/
  `setMeta` (already implemented on `IndexedDbGameStore` and `MemoryGameStore`, storing
  arbitrary string key/value pairs) are promoted onto the public `GameStore` interface in
  `storage/types.ts`; `SupabaseGameStore` (which wraps a local store) delegates both to
  `this.local.getMeta/setMeta` — no new Supabase table, no RLS policy, no `merge.ts`
  change. Rationale: this is UI "have I seen this" state, not gameplay data; losing it on
  a new device just re-surfaces an already-dismissed notice once, which is harmless.
  Cross-device sync of read/dismissed state is explicitly out of scope (see below).
- **D7**: Notice model, `hooks/useNotices.ts`: a `Notice = { id: string; kind: 'changelog'
  | 'season-complete'; date: string; title: string; body: string }`. Two sources, merged
  and sorted by date desc:
  1. **Changelog** — hand-maintained `src/data/whatsnew.ts` exporting `WHATS_NEW: {id,
     date, title, body}[]`; unseen = entries newer than `getMeta('lastSeenChangelogId')`
     (array is ordered, so "index > last-seen index" is enough — no date math needed).
  2. **Season-complete** — one synthetic notice per `Season` where
     `getSeasonPhase(s) === 'completed'` and its id isn't in the JSON array under
     `getMeta('dismissedNoticeIds')`.
  Opening the bell marks all changelog entries seen (`setMeta('lastSeenChangelogId',
  latestId)`); dismissing a season-complete notice appends its id to
  `dismissedNoticeIds`. The `Notice` union is intentionally small but leaves room to add a
  `kind` later without a storage shape change.
- **D8**: Bell icon lives in `components/TopNav.tsx` next to the existing `ProfileMenu`
  trigger (not inside the profile dropdown), with a small unread-count dot; clicking opens
  its own dropdown panel (same pattern as `ProfileMenu`, not a new modal system).

## Out of scope

- Cross-device sync of notification read/dismissed state (D6) — a future plan can move
  this into a real synced table if it turns out to matter.
- Any notice type beyond changelog + season-complete (e.g. "new card added", injury
  alerts) — the `Notice` union supports adding one later.
- An authoring UI for the changelog — it's a hand-edited data file, like existing
  hand-maintained content (archetype catalog, playbook).
- Write-level enforcement of the Completed lock (e.g. rejecting a `saveRoster` call
  server-side) — UI-only gating per D3, consistent with this app having no backend
  authority over game rules today.

## Tasks

- **T1** — `engine/season.ts`: add `HUMAN_SEAT_ID` const, `SeasonPhase` type,
  `getSeasonPhase()`, `computeUserSeasonStats()`; replace the 12 raw `'human-0'` literals.
  Done when: `frontend/tests/unit/` has new cases for all three phases and a 0/1/N-season
  stats case, `npm test` passes. Tier: mid.
- **T2** — `storage/types.ts` (add `getMeta`/`setMeta` to `GameStore`), `storage/supabase.ts`
  (delegate to `this.local`). `indexedDb.ts`/`memory.ts` already satisfy the interface
  structurally — confirm `tsc --noEmit` is clean. Tier: mid.
- **T3** — `src/data/whatsnew.ts` (seed with 1-2 real recent entries, e.g. cloud saves,
  season results fix) + `hooks/useNotices.ts` + `hooks/useUserSeasonStats.ts`. Tier: mid.
- **T4** — `components/TopNav.tsx`: bell + dropdown wired to `useNotices`; profile-menu
  stats blurb wired to `useUserSeasonStats` (one line, e.g. "14 seasons · 82-66 · 5.9 W
  avg"). Screenshot both open states. Tier: mid.
- **T5** — `app/rosters/page.tsx`: phase pill + W-L per roster card. Screenshot. Tier: mid.
- **T6** — `app/roster/[id]/page.tsx` + `components/DeckBuilder.tsx` (readOnly prop) +
  `components/SeasonView.tsx` (swap local `isSeasonComplete` for `getSeasonPhase`):
  read-only banner, edits disabled on a Completed roster. Screenshot the banner. Tier: mid.

## Parallelization (optional)

Small enough for one driver, sequential: T1 -> T2 (both touch shared types other tasks
import) -> T3/T4/T5/T6 can run as one wave once T1/T2 land, since they touch disjoint
files (TopNav vs rosters/page vs roster/[id]+DeckBuilder+SeasonView).

## Recommended model tier

Main driver: mid (Sonnet 5) — no balance/engine-math decisions, just plumbing and UI.
All tasks: mid.

## Verification / exit criteria

- `npm test` (root) green — new `engine/season.ts` unit cases included.
- `tsc --noEmit` and `npm run lint` clean.
- `npm run build` succeeds.
- Screenshots (`node scripts/screenshot.js`) of: Roster overview with phase pills + W-L,
  TopNav with bell dropdown open, profile menu with stats blurb, a Completed roster's
  read-only banner.
- Manual check via `/debug`-exported season data or a played-out season in dev: a
  Completed season shows the "Completed" pill and blocks DeckBuilder edits; a fresh
  season-complete notice appears in the bell and can be dismissed.
