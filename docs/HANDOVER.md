# Handover — 2026-09-14

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats, 8-card packs, pack-opening
animation on the first pack) -> deck builder (depth chart, play assignments, identity
selection) -> single game or round-robin season -> in-app analytics export. The engine is
a pure, seeded TypeScript module (`frontend/src/engine/`) with a multi-channel shot model,
archetype identities and assigned-player plays. Persistence is IndexedDB behind
`GameStore`, storing a slim per-game result (re-simulated on view from its seed) rather
than the full play-by-play; a logged-in user's data also cloud-syncs to Supabase
(`SupabaseGameStore`, accounts_cloud_saves) with optimistic-concurrency conflict handling
— see the milestone below. 212 Vitest tests pass, type-check is clean, `npm run lint` is
0 errors / warnings-only (all `<img>`/unused-var, none blocking). GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR. A runtime
error boundary (`app/error.tsx`/`global-error.tsx`/`ErrorRecovery.tsx`) shows a recovery
screen instead of a blank page; `smoke.spec.ts` fails on any console/page error.

Finished design docs live in `docs/completed/`; a plan still being worked on stays in
`docs/plans/` and moves there when its milestone lands.

## History

- **Repo cleanup** (done 2026-09-12): absorbed the nested `frontend/` git repo via subtree
  merge (`aa0f02b`/`e26dcb7`, old `.git` backed up to
  `C:\Users\fabia\magic-ball-frontend.git.bak`); removed dead generator/patcher scripts and
  unused deps (`@prisma/client`, `unidecode`); wrote this file, `ARCHITECTURE.md`, root
  `AGENTS.md`/`CLAUDE.md`/`README.md`.
- **Phase 0 (correctness)** (done 2026-09-12): fixed inverted defensive modifiers, play
  activation, possession-swing double counting, offense/defense edge bias, silent storage
  quota failures, `/api/cards` N+1 queries, minutes/turnover scaling; PPP 1.29 → 1.08.
  Still open: margins/score sd wider than NBA (`EFFICIENCY_SCALE`, edge clamp), bots value
  players by PER only.
- **Phase 1 (engine isolation)** (done 2026-09-12): engine made pure/seeded
  (`engine/rng.ts`), cards became a build artifact (`cards.json`), persistence moved to
  `src/storage/` (GameStore/IndexedDB).
- **Plays & archetypes milestone** (done 2026-09-13): archetype identities
  (`engine/archetypes.ts`) and assigned-player plays (`engine/playbook.ts`), roster v2
  (`playAssignments`, `archetypes`), deck builder `PlayPanel`. Design and full numbers in
  `docs/completed/plan_plays_and_synergies_2026-09-13.md`.
- **Post-milestone fixes** (done 2026-09-13, `cc32edf`/`ab04726`/`fa10e01`): pack opener
  reveal sequence (design in `docs/completed/plan_pack_opening_animation_2026-09-13.md`,
  since reworked further by `ui_draft_deckbuild_pack`); live box score derived from
  possessions played so far (`deriveLiveBoxScore`); Mythic card-back bleed-through fixed
  (`isolation: isolate` instead of `mix-blend-mode`); legacy season/roster upgrade paths.
- **Stability pass** (done 2026-09-13, `docs/completed/plan_stability_pass_2026-09-13.md`):
  CI (`.github/workflows/ci.yml`), a runtime error boundary (`ErrorRecovery.tsx`), safe
  loads for corrupt storage records, seeded bot reproducibility, `smoke.spec.ts`, lint 0
  errors (was 8).
- **Analytics tooling & data storage** (done 2026-09-13, `docs/completed/plan_analytics_tooling_2026-09-13.md`/
  `plan_data_storage_2026-09-13.md`): `frontend/scripts/analyze.ts` replaces the retired
  synergy-based analyzer; seasons persist slim `StoredGameResult`s re-simulated on view
  (Dexie v2); Export/Import on the rosters page.
- **Vercel deploy & auth** (done 2026-09-13, `docs/completed/plan_vercel_deploy_2026-09-13.md`/
  `plan_auth_approval_2026-09-13.md`): live at
  [hoops-draft-fvnguyen1.vercel.app](https://hoops-draft-fvnguyen1.vercel.app); Supabase
  email/password auth with admin approval and username login; local IndexedDB data
  stamped per-user (Dexie v3).
- **ui_draft_deckbuild_pack** (done 2026-09-13, `docs/completed/plan_ui_draft_deckbuild_pack_2026-09-13.md`):
  rarity-ordered pack opener with pick clock, unified Roster list (no draft-time zoning),
  fixed 5x4 depth chart, empty-start deck builder (no auto-fill).
- **ui_polish_small_fixes & playwright_auth_fixture** (done 2026-09-14): hover-preview/
  draft-pick-confirm/radar polish; dedicated E2E Supabase account +
  `tests/auth.setup.ts` fixture so `test:e2e` can finally run authenticated
  (`docs/completed/plan_ui_polish_small_fixes_2026-09-13.md`,
  `plan_playwright_auth_fixture_2026-09-14.md`).

## accounts_cloud_saves — in progress 2026-09-14

Plan: `docs/plans/plan_accounts_cloud_saves_2026-09-14.md` (sequence #3). T1-T9 built and
verified this session against the real Supabase project (not a mock) — schema, RPC, and
UI are live in dev; still open before calling it done, see below.

- **Schema/sync**: migration `202609140001_cloud_saves.sql` (applied) adds
  `draft_sessions`/`rosters`/`seasons` tables, owner+admin RLS, and a `cas_upsert`
  compare-and-swap RPC. `SupabaseGameStore` (`frontend/src/storage/supabase.ts`) wraps
  `IndexedDbGameStore` — reads stay local, writes push through `cas_upsert`, offline/failed
  pushes queue and retry on reconnect — and is now the default `getGameStore()` result in
  the browser.
- **Concurrency**: `storage/merge.ts` (pure, no Supabase/Dexie/fetch imports, purity-tested
  like `engine/`) auto-merges draft sessions (longer `pickLog` wins) and seasons (schedule
  entries unioned by `played`, standings recomputed via the new
  `engine/season.ts#recomputeStandingsFromSchedule`); a roster conflict has no sensible
  auto-merge and surfaces via `SyncConflictPrompt` (`TopNav`'s new sync indicator,
  `useSyncStatus`).
- **Migration**: `StorageProvider` pushes any local-only rows to the cloud once per login
  (`pushLocalToCloud`, insert-only — never overwrites an existing cloud row).
- **Analytics**: aggregate math extracted from `scripts/analyze.ts` into
  `src/lib/analyzeStats.ts` (byte-identical `npm run analyze` output, diffed). New
  `/api/analytics?scope=self|all` (self = own RLS-scoped data, all = ADMIN via service
  role) and `/admin/analytics` page, both verified live against the real DB and gates
  (non-admin gets 403/redirect).
- **Two real bugs found and fixed post-deploy** (2026-09-14, live-tested with a Playwright
  e2e run against the real Supabase project, not a mock): (1) `deleteRoster`/`deleteSeason`/
  `deleteDraftSession` chained `.catch(() => {})` onto a Supabase `PostgrestBuilder`, which
  is `PromiseLike`, not a real `Promise` — it has no `.catch`, so every cloud delete threw
  synchronously and never reached the server; fixed to `await` inside a real try/catch
  (`deleteRemote`), and `CloudSyncClient`'s delete return type corrected to `PromiseLike`
  so this class of mistake fails to compile next time. (2) `push()` treated a CAS
  rejection with a stale (since-deleted) baseline as "needs a merge," found nothing to
  merge against, and silently queued forever instead of ever writing the save — fixed to
  retry as a fresh insert when the server reports no row at all. Both covered by new
  `tests/storage/supabase.test.ts` cases (a mock `.delete().eq()` that's a bare
  `PromiseLike`, matching the real client, would now fail the same way).
- **tests/season.spec.ts** (new): drives the merged `game-results-visibility` fix
  end-to-end — imports a fixed-id fixture (`scripts/build-e2e-season-fixture.ts` ->
  `tests/fixtures/season-fixture.json`) via the real rosters-page Import flow, plays game
  1, leaves early via "Exit Game" and confirms nothing saved, then finishes and hits
  "Continue to Schedule" and confirms the schedule/standings update. Self-cleaning (deletes
  its own fixture roster/season at the start of each run) — verified idempotent across 3
  consecutive live runs.
- **Verified**: `npm test` (212/212), `tsc --noEmit`, `npm run lint` (0 errors) clean;
  `npm run test:e2e` 13/15 (2 known pre-existing snapshot failures, see open issues);
  migration applied and confirmed via direct DB query (tables/policies/RPC present); the
  delete/re-insert bug fixes verified against the live DB, not just the mock.
- **Open before `/roadmap done`**: no real second-device field test yet (simulated via
  the `SupabaseGameStore` test suite's `FakeCloud`, not two physical devices); no roster
  has actually hit a conflict outside tests — worth playing a draft/season on two devices
  once mobile work lands to confirm `SyncConflictPrompt` in the wild.

## game-results-visibility (merged, not this session's own plan) — 2026-09-14

Single-commit fix from a separate Claude session/branch
(`claude/game-results-visibility-season-atxivj`, merged `2cd44e5`): `SeasonView` used to
commit a freshly-played game's result to `season` state/the store the instant `playNextGame`
ran, so leaving mid-playback (or before a single possession rendered) already revealed the
final score and updated standings. Now `playNextGame` runs against a cloned `Season`, and
the result only commits once the user watches `GameView` to completion and hits "Continue
to Schedule"; a still-running fresh game shows a destructive "Exit Game" control with a
"this won't be saved" confirmation instead. Replays of already-played days are unaffected.
No test shipped with the original commit — `tests/season.spec.ts` (above) covers it now.

## game_engine — done 2026-09-14

Design/full history: `docs/completed/plan_game_engine_2026-09-13.md`. All T1-T8 done in
one session; sequence #2 in the roadmap.

- **Bugs fixed**: OT never called plays (now shares `playOnePossession` with regulation,
  stays starters-only per owner intent, capped at 3 periods, tie broken by average
  starter OVR not a coin flip); home court was a complete no-op (48.6% home win) — now an
  asymmetric possession-noise roll, 52-56% with identical rosters; a rim shooting foul
  paid a flat 1pt instead of two real FTs (`RIM_FT_PCT` 0.77), the single biggest driver
  of PPP sitting below target — fixed (PPP 0.994->1.06), which also exposed an
  and-1/assist eligibility bug; `calcPossessionShares` was dead code, replaced the
  quarter-phase rotation with per-possession `drawLineup`.
- **Balance tuning**: play call-rate budgets/allocations raised so no play sits at ~0
  win-rate impact (catalog sample size also raised 300->600, `npm run balance --
  --catalog`); two content outliers (Horns, Triangle Offense, Midrange Clinic, Elbow
  Orchestra — all shift shots into `NBA_BASELINE.mid`'s worst-efficiency channel) handed
  to `card_balance`, out of this plan's scope.
- **Analytics**: `npm run balance -- <n> --seed <s> --report` produces one versioned
  `balance_report_*.json` (schemaVersion 2: catalog+draftImpact+spread+
  outcomeDecomposition), the source for the [Power Curve
  report](https://claude.ai/code/artifact/17ace14e-ea53-40ff-be8c-9196c3415964).
  `outcomeDecomposition` replaced an earlier strategy-only cut that conflated real
  opponent talent with luck: talent (OVR gap) alone explains 7.6% of a single game but
  24.4% of a full 7-game season, win% climbing monotonically 27%->73% across OVR-gap
  deciles — talent is rewarded, mechanics are sound.
- **Open from this milestone**: the two mid-range-shifting content outliers and
  `NBA_BASELINE.mid`'s low efficiency, handed to `card_balance`; margin/sd run slightly
  wide of D5's original target band (margin 14-16 vs. 12-14 target, sd ~13.2-13.5 vs.
  12-13) but was accepted as the final tuning result after `RIM_FT_PCT` — worth a look if
  `card_balance` content changes shift the shot mix enough to matter.
- Verified: `npm test` (193/193), `tsc --noEmit`, `npm run lint` (0 errors) clean;
  `npm run balance -- 500 --seed 42 --report` matches D11's shape; `smoke.spec.ts` (9/9,
  including `/season`) passes with no console errors.

## How to run everything

```bash
npm install && npm --prefix frontend install
npm run dev            # app at http://localhost:3000
npm test               # Vitest: frontend/tests/unit (real engine) + tests/storage
npm run build:cards    # regenerate frontend/src/data/cards.json from frontend/game.db
npm run balance -- 500 # headless balance report (PPP, scores, play impact)
npm run feasibility -- 100 # archetype reachability for focused drafters vs bots
npm run bootstrap:e2e  # one-time: create/approve the E2E test account (needs .env.local)
npm run test:e2e       # Playwright specs, needs `npm run dev` running separately
npm run analyze        # balance report from the latest data/game_logs/full_dump_*.json
npm run screenshot -- /draft draft.png --full
```

To regenerate player data: see `data/README.md` (run order: `download_bref.js` ->
`fetch_bio.py` -> `fetch_players.py` -> `download_images.py` -> `download_logos.py`, all
from `data/`).

## Open issues / next steps

What to do next is `docs/ROADMAP.md` (plan sequence; `game_engine` is done, `card_balance`
and `game_theater` are now unblocked). The 2026-09-12 code review that produced Phases
0-1 is archived as `docs/completed/review_code_and_architecture_2026-09-12.md`; the list
below predates it.

Item 1 below is from `docs/analytics/analysis_report.md`/`analytics_summary.md` (both
banner-marked stale, generated by the retired `scripts/analyze_game_data.js`) —
`docs/analytics/report_2026-09.md` is the current tool's output but has no fresh
draft/season data yet; re-run `npm run analyze` after playing a session.

1. **Offense-too-powerful / turnover-rate / synergy-frequency findings (pre-Phase-0,
   stale)** — PPP 1.290 and a suspected compounding per-channel edge, ~0.8% turnover rate
   (likely apples-to-oranges vs NBA — turnovers are flavor text, not a modeled stat), and
   uneven synergy/play-card activation rates. All measured against the old `gameEngine.ts`/
   `PLAY_EFFECTS` pre-Phase-0/pre-plays-and-archetypes; PPP is now ≈1.06 and neither file
   exists anymore. Re-run `npm run analyze` on a fresh session before treating any of this
   as current.
2. **Cube draft duplicate bug — likely already resolved, unverified.** One early session
   log showed 113/264 unique cards; `game.db` now has 448 players (needs ≥264 for a
   duplicate-free cube) and every later session shows 264/264 unique. Worth a targeted
   test rather than assuming fixed.
3. **AI draft strength gap.** Up to 11.1 OVR difference between the best- and
   worst-drafting bot; may or may not need tuning in `scoreCardForBot` (`draftEngine.ts`).
4. **Two `visual.spec.ts` snapshots fail with no known cause.** "Season View Franchise
   Dashboard" (expects 234px tall, gets 226px) and "Game View Matchup Header and Tape"
   (600px vs 601px) — neither touches any file changed in `ui_draft_deckbuild_pack` or
   `ui_polish_small_fixes`. First time these could even run since `auth_approval` gated
   Playwright out; the drift may predate that plan entirely. Worth a `git bisect` against
   the visual-snapshot history, or just re-baseline once someone confirms the current
   render is correct by eye.

## Where to look

| Question | File |
|---|---|
| How is a player's OVR computed? | `frontend/src/engine/ratings.ts` (+ constants in `engine/balance.ts`) |
| How does a possession resolve? | `frontend/src/engine/game.ts` (`resolvePossession`) |
| What do identities/plays do? | `frontend/src/engine/archetypes.ts`, `engine/playbook.ts`, called in `engine/game.ts`; `docs/game_mechanics.md` |
| Why were plays/identities built this way? | `docs/completed/plan_plays_and_synergies_2026-09-13.md` |
| Tuning identity thresholds | `npm run feasibility -- 100` (`frontend/scripts/archetype-feasibility.ts`) |
| How is the cube built / how do bots draft? | `frontend/src/engine/draft.ts`, `frontend/src/hooks/useDraftEngine.ts` |
| How do bots build a roster? | `frontend/src/engine/deckbuilder.ts` |
| Season scheduling/standings | `frontend/src/engine/season.ts` |
| Where is user data stored? | `frontend/src/storage/` (GameStore, IndexedDB) |
| Data pipeline (scrape -> game.db) | `data/README.md` |
| What to work on next | `docs/ROADMAP.md`, then `docs/plans/plan_<topic>_<date>.md` |
| Original code review (2026-09-12) | `docs/completed/review_code_and_architecture_2026-09-12.md` |
| Balance findings | `docs/analytics/analysis_report.md`, `docs/analytics/analytics_summary.md` |
| How to regenerate a balance report | `npm run balance` (headless; `--ab`/`--catalog`/`--draft-impact` flags) or `frontend/scripts/analyze.ts` (`npm run analyze`, from a `/debug` export) |
| Screenshotting a route | `scripts/screenshot.js` (`npm run screenshot`) |
