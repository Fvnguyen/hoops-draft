# Handover — 2026-09-13

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats, 8-card packs, pack-opening
animation on the first pack) -> deck builder (depth chart, play assignments, identity
selection) -> single game or round-robin season -> in-app analytics export. The engine is
a pure, seeded TypeScript module (`frontend/src/engine/`) with a multi-channel shot model,
archetype identities and assigned-player plays; persistence is IndexedDB behind
`GameStore`, storing a slim per-game result (re-simulated on view from its seed) rather
than the full play-by-play. 184 Vitest tests pass, type-check is clean, `npm run lint` is
0 errors / 14 warnings (all `<img>`/unused-var warnings, none blocking). GitHub Actions CI
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

## ui_draft_deckbuild_pack — done 2026-09-13

Design/full history: `docs/completed/plan_ui_draft_deckbuild_pack_2026-09-13.md` (plan
**2a**). Waves 0-1 (contracts + 6 parallel agents + integration), wave 3 (auto-distribute
fix, superseded below, card sizing), wave 4 (this session: drop draft-time zoning, empty
deckbuilder, hover-preview auto-dismiss, quarter-score fix).

- **Draft flow**: two home CTAs (`/draft?mode=quick|premier`); Premier shows a rarity-
  ordered pack opener (Rare/Mythic hold+glow+shake, real Web Audio SFX) before every pack
  with pick-from-the-spread, a pick clock (`PickTimerRing`, timeout auto-picks via a
  neutral bot profile), and a `PackPassStage` pass animation. **Wave 4**: the old
  Roster/G-League zone split during the draft is gone — one unified "Roster" list
  end-to-end (`useDraftEngine.applyPick/processPickAndPass/pickFromIntro` no longer take a
  `zone` param; `DraftPickRecord.zone` removed).
- **Deck builder**: fixed 5x4-slot depth chart (`engine/depthChart.ts`), single
  position-eligibility source (`engine/positions.ts`), `Toast`+Undo, visible
  `RosterChecklist`, container-query fluid layout. **Wave 4**: fresh drafts now start with
  an empty depth chart — `autoDistributeRoster` (wave 3) is deleted, not superseded in
  place, matching the "no auto-fill" product rule; `BuiltRoster.gLeaguePlayers/gLeaguePlays`
  renamed to `rosterPlayers/rosterPlays` everywhere (engine, storage, UI copy);
  `SavedRoster.zones` dropped, `safeLoad.ts` treats it as optional so old saves still load.
- **Presentation**: `TopKPIBand` why-locked hints, viewBox-fluid `RadarChart`/`DonutChart`,
  new `/roster/[id]` edit route. **Wave 4**: `useHoverPreview`'s auto-dismiss timer
  (1500ms) plus a document-level `dragstart` clear fixes a stuck preview blocking
  drag-and-drop; `GameView.tsx`'s quarter-score filter no longer reveals a quarter's final
  score before its last possession plays.
- **Verified**: `npm test` (184/184), `tsc --noEmit`, `npm run lint` (0 errors) all clean;
  unified Roster list and empty-start deckbuilder live-verified via screenshot this
  session; hover-dismiss and quarter-score fix verified live by the owner.

## ui_polish_small_fixes & playwright_auth_fixture — done 2026-09-14

Design: `docs/completed/plan_ui_polish_small_fixes_2026-09-13.md` (plan 1b),
`docs/completed/plan_playwright_auth_fixture_2026-09-14.md` (plan 1c, written and
executed same session once 1b's smoke-test criterion turned out to need it).

- **UI polish**: hover-preview show delay raised to 800ms plus immediate click-dismiss
  (`useHoverPreview.ts`); draft-room picks confirm via a second click or a 2s auto-confirm
  timer with a "Double-click to pick" hint (`DraftRoom.tsx`); deckbuilder identity radar
  120 -> 168 (`TopKPIBand.tsx`). T2 ("suppress pack-reveal previews") was replaced: the
  pack grid never wired up a preview in the first place, so revealed pack cards were made
  flippable on hover instead, reusing `PlayerCard`/`PlayCard`'s existing flip (same as
  everywhere else) rather than reimplementing the mechanic.
- **Playwright auth fixture**: `test:e2e` had been unable to pass since `auth_approval` —
  every protected route 401'd for Playwright's unauthenticated context. A dedicated
  E2E-only Supabase account (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` in `.env.local`,
  `scripts/bootstrap-e2e-user.mjs`, run once via `npm run bootstrap:e2e`) plus
  `tests/auth.setup.ts` (logs in through the real `/login` form, saves `storageState`)
  now gates the `chromium` Playwright project. `smoke.spec.ts` (8/8) and `home.spec.ts`
  (2/2) pass for the first time since the auth gate landed.
- **Fallout, not scope creep**: `visual.spec.ts` could finally run too and found one real
  regression (DeckBuilder Top KPI Band snapshot, stale from the radar resize above —
  updated) plus two failures that predate anything in this session (Franchise Dashboard,
  Game View Matchup — see open issues, left as-is per owner call).
- **Verified**: `npm test` (184/184), `tsc --noEmit`, `npm run lint` (0 errors) clean;
  `npm run test:e2e` 12/14 (2 known pre-existing snapshot failures below).

## vercel_deploy & auth_approval — done 2026-09-13

Both plans (sequence 2b/2c) landed; moved to `docs/completed/`.

- **Vercel**: live at
  [hoops-draft-fvnguyen1.vercel.app](https://hoops-draft-fvnguyen1.vercel.app) (project
  `hoops-draft`, Root `frontend`, Node 22.x, Git deploys from `main`, Hobby $0/month).
  Verified via the Vercel API: production READY, 0 runtime errors in 7d, `/api/game-logs`
  404s, `/api/cards` returns data. **Unverified from here**: a spend alert/hard budget is
  set in the dashboard (no API for this) — confirm manually.
- **Auth** (Supabase email/password, admin approval): `profiles` (`status`
  PENDING/APPROVED/REJECTED, `role` USER/ADMIN, RLS-gated); `nguyen.teomads@gmail.com`
  auto-approved; `/login`, `/signup`, `/pending`, `/admin/users`; proxy-based route
  protection; a top-right profile menu (sign-out, admin tools for admins). Local IndexedDB
  rows are stamped `ownerId` and filtered per logged-in user (Dexie v3,
  `claimLegacyData()` adopts pre-login data into the first login) — still local, not synced.
- **This session's follow-up** (username login + team name): added a `username` column
  (migration `202609130002_add_username.sql`, unique, backfilled from email), separate from
  `display_name`; `/login` accepts either (non-`@` input resolves to an email server-side
  via the service-role client first). The engine's hardcoded `'You'` label is now an
  optional `humanName` param (`buildTeamInfo`/`createSeason`, default `'You'`) threaded
  from `SeasonView.tsx`'s `useCurrentProfile().display_name`.
- **Known gaps**: no automated auth-route/role-gate tests (no Supabase-mocking harness
  yet); the new migration must be run in the SQL editor before username login works
  (`frontend/supabase/README.md`); re-run the bootstrap script once to backfill
  `username: 'fvnguyen'` on the existing admin row.
- Verified: `tsc`/lint (0 errors)/`npm test` (184)/`next build` clean; `/login`/`/signup`
  checked visually. Not created: a real account — a human should run a signup/login/approve pass.

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

What to do next is `docs/ROADMAP.md` (plan sequence; `game_engine` is unblocked, and
`ui_draft_deckbuild_pack` has waves 0-1 done — see that plan's Progress for what's left).
The 2026-09-12 code review that produced Phases 0-1 is archived as
`docs/completed/review_code_and_architecture_2026-09-12.md`; the list below predates it.

Findings below are from `docs/analytics/analysis_report.md` and
`docs/analytics/analytics_summary.md` (both now banner-marked stale; generated by the
retired `scripts/analyze_game_data.js` against 5 draft sessions / 5 seasons / 35 games,
curated by the user). Quoted "User Note" lines are the user's own hypotheses, not
verified conclusions. Items 1, 3 and 4 predate the Phase 0 fixes and the plays &
archetypes milestone (PPP is now ≈ 1.08; the old synergy list and `PLAY_EFFECTS` no
longer exist) — `docs/analytics/report_2026-09.md` is the current tool's output, but has
no fresh draft/season data yet; re-run `npm run analyze` after playing a session.

1. **Offense is too powerful.** Points-per-possession measured at 1.290 (NBA average
   ~1.15); only 36% of logged game scores fell in a realistic 90-130 range. User's
   hypothesis: *"edge always rewards the same team (likely if a team has an offensive
   edge once, it has it always and therefore scores a lot)"* — i.e. the per-channel edge
   in `resolvePossession` (`gameEngine.ts`) may compound rather than vary possession to
   possession. Worth instrumenting edge distribution per game before changing
   `EFFICIENCY_SCALE`.
2. **Turnover rate is ~0.8%** vs. an NBA-typical ~13-14%. Per the user's note, this is
   arguably a non-issue: the engine's "turnovers" are just narrative flavor text on missed
   possessions (`MISS_TEXTS` in `gameEngine.ts`), not a modeled stat with a real rate — the
   real lever for possession count is the possession-battle noise/swing, not a turnover
   mechanic. Comparing it to real-world TO rate is likely apples-to-oranges; flagged here
   so it isn't "fixed" by adding a fake turnover stat.
3. **Synergies trigger too often.** Several stacking/combo synergies (Point God System
   91.4%, Court Vision 90.0%, Inside-Out 90.0%, Paint Dominance 87.1%) activate in nearly
   every game, while others are rare (Brotherhood 7.1%, Lockdown Squad 18.6%). User's
   note: *"We need to reduce the number of synergies and how they are triggered."*
   Thresholds live in `frontend/src/engine/synergies.ts` (`SYNERGIES` array).
4. **Play-card activation is uneven.** High Pick & Roll fully activates 64.7% of the time;
   Horns and Four Out One In almost never fully activate (91.7% / 100% failure). Check
   `PLAY_EFFECTS` requirements in `synergies.ts` against how rosters actually distribute
   badges.
5. **Cube draft duplicate bug — likely already resolved, unverified.** One early session
   log (`docs/analytics/analysis_report.md`, session #1) showed only 113/264 unique player
   cards (151 duplicates); the four subsequent sessions in the same report all show
   264/264 unique. `game.db` currently has 448 players, well above the 264 needed for a
   duplicate-free cube, and `generateCubePool` (`draftEngine.ts`) only produces duplicates
   when the pool is smaller than 264. It's unverified whether session #1 ran against a
   smaller/differently-filtered player set or hit some other edge case — worth a targeted
   test (`scripts/check_card_counts.js` checks `data/computed_cards.json`, not a live
   draft) rather than assuming it's fixed.
6. **Home court advantage is a no-op.** Home teams won 17/35 (48.6%) with a 0.1-point
   average margin — there is no explicit home-court modifier in `gameEngine.ts`. Not
   necessarily a bug (may be intentional), but worth a decision one way or the other.
7. **AI draft strength gap.** Up to 11.1 OVR difference between the best- and
   worst-drafting bot; may or may not need tuning in `scoreCardForBot` (`draftEngine.ts`).
8. **Two `visual.spec.ts` snapshots fail with no known cause.** "Season View Franchise
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
| How to regenerate a balance report | `npm run balance` (headless, `--ab` for identity/play impact) or `frontend/scripts/analyze.ts` (`npm run analyze`, from a `/debug` export) |
| Screenshotting a route | `scripts/screenshot.js` (`npm run screenshot`) |
