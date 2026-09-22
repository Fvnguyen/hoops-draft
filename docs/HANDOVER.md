# Handover — 2026-09-22

## Current state

Magic Ball is playable end to end in TWO modes, chosen on the start page before the draft:
draft (cube, 8 seats, 8-card packs) -> deck builder (depth chart, play assignments, identity)
-> either the 7-game "In-Season Tournament" against your draft table, or the 82:0 Challenge
(82 games vs all 30 real NBA teams, flip-clock reveal, one trade, one grade — see below). The engine is
a pure, seeded TypeScript module (`frontend/src/engine/`) with a multi-channel shot model
resolved per possession from the five on the floor (standardised, designed lineup
aggregation; turnovers, offensive rebounds and a creator steer — engine_possession_model),
archetype identities and assigned-player plays, narrated outside the engine by
`src/narration/` (structured events -> broadcast prose, game-flow beats, crunch time —
game_theater). Persistence is IndexedDB behind
`GameStore`, storing a slim per-game result (re-simulated on view from its seed) rather
than the full play-by-play; a logged-in user's data also cloud-syncs to Supabase
(`SupabaseGameStore`: local-first writes, an outbox, CAS pushes and tombstones, see
sync_outbox below). The UI runs on semantic tokens + `data-theme` and five
`components/ui` primitives (ui_foundation); `npm run check:styles` is a blocking CI gate
at 0 violations. On phones (coarse pointer under 1000px) the whole document renders at
CSS `zoom: 0.7` with `h-dvh-z` shells and a long-press card preview (game_canvas).
632/632 Vitest tests pass; one is an `it.fails` marker on the known `LINEUP_CENTRE` drift in `lineup.test.ts` (see below), so it turns red the moment a recalibration fixes the numbers, type-check is clean, `npm run lint` is
0 errors / warnings-only (all `<img>`/unused-var, none blocking), `smoke.spec.ts` is 9/9. GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR (green since
2026-09-22; before that every run died at `npm ci` on Node 22, see the workflow comment). A runtime
error boundary (`app/error.tsx`/`global-error.tsx`/`ErrorRecovery.tsx`) shows a recovery
screen instead of a blank page; `smoke.spec.ts` fails on any console/page error.

Finished design docs live in `docs/completed/`; a plan being worked on stays in
`docs/plans/` and moves there when its milestone lands.

## History

One line each (full write-ups live in the linked plans under `docs/completed/`):

- **Repo cleanup + Phase 0/1** (2026-09-12): `frontend/` absorbed via subtree merge; PPP 1.29 → 1.08; pure seeded engine (`engine/rng.ts`), `cards.json` build artifact, `src/storage/` GameStore.
- **Plays, archetypes & stability** (2026-09-13, `plan_plays_and_synergies_2026-09-13.md` + `plan_stability_pass_2026-09-13.md`): identities/plays/roster v2/`PlayPanel`; CI workflow, error boundary, safe loads, `smoke.spec.ts`.
- **Analytics, deploy & pack UI** (2026-09-13): `scripts/analyze.ts`, Dexie v2/Export-Import; live at hoops-draft-fvnguyen1.vercel.app with Supabase auth; rarity-ordered pack opener, unified Roster list, empty-start deck builder.
- **ui_polish_small_fixes & playwright_auth_fixture** (2026-09-14): hover/confirm/radar polish; E2E Supabase account + `tests/auth.setup.ts` so `test:e2e` runs authenticated.
- **accounts_cloud_saves, game_engine & season_lifecycle** (2026-09-14): `SupabaseGameStore` optimistic CAS; OT/home-court/spread tuning; derived season phase, notification bell; a game result commits only when watched to the end (`2cd44e5`).
- **mobile_responsive** (superseded 2026-09-15, closed 2026-09-16): audit harness, manifest/icons, `OrientationGate`; folded into `game_canvas`.
- **ui_foundation** (2026-09-15, `plan_ui_foundation_2026-09-15.md`): semantic tokens + `data-theme`, five `components/ui` primitives, blocking `check:styles` gate 1,358 → 0, 12px/44px floors; mobile audit phone 200 → 2, tablet 201 → 0.
- **deckbuilder_ux** (2026-09-15, `plan_deckbuilder_ux_2026-09-15.md`): design-first (8 signed artboards, `docs/design/deckbuilder_ux/`), 56px HUD, dockable Plays/Roster sidebars, click-to-assign via pure `engine/deckbuilder.ts` helpers, `deckbuilder.spec` at 3 tiers. Seams: Add button swallowed by a wrapper; role avatars must be CSS backgrounds; `--update-snapshots=all` to force a baseline rewrite.
- **badge_effects** (2026-09-17, `plan_badge_effects_2026-09-17.md`): closed without a full plan — badge-levels-as-content scope shipped inside `card_balance` T2/T3 instead; the "special effects on top of the lineup model" mechanic it originally named was never built.
- **game_canvas** (2026-09-16, `plan_game_canvas_2026-09-16.md`): `html { zoom: 0.7 }` under `(pointer: coarse) and (max-width: 999px)` with `h-dvh-z` shells so the five main screens fit a phone in landscape without scrolling; tap-to-select touch contract, long-press preview, `tests/mobile-audit.spec.ts` rules 5/6.
- **phone_card** (2026-09-19, `plan_phone_card_2026-09-19.md`): owner rejected two landscape redesign mocks against a real S26+ screenshot, signed off a modest resize instead — phone-only `wide` prop on `size="sm"` `PlayerCard`/`PackRevealCard`, aspect 5/7 → 1.15/1, badge gap 4px → 6px, image crop retargeted (`object-[center_20%]`), grid `max-w` factor `10/7` → `2.3`. `DepthSlotColumn` untouched. 442/443 tests, tsc/lint/check:styles clean, smoke 9/9, verified via browser-pane touch emulation at 760×385.
- **challenge_loose_ends** (2026-09-19, `plan_challenge_loose_ends_2026-09-19.md`): `PlayCard`/`PlayCardFront` get the same phone `wide` resize as player cards; 82:0 results screen's primary CTA is now "End Challenge — Results Locked In" (`/rosters`), replacing "Draft a new team"; rosters list shows `Start 82:0`/`Continue 82:0`/`View Result` per run phase plus a `W-L · Title (Grade)` summary once done; `TopNav` gains a "82:0 Challenges: N completed, best W-L (grade)" line, omitted at zero completed runs. 442/443 tests, tsc/lint/check:styles clean, smoke 9/9.
- **challenge_mode** (2026-09-18, `plan_challenge_mode_2026-09-17.md`): the 82:0 Challenge as a second mode picked before the draft; a half is simulated in one call and saved before anything animates, every game seeded from (run seed, index), `CHALLENGE_TUNING` challenge-only, NBA rosters locked in (box stats keyed by side), record sealed until game 82; reel pacing constants atop `ChallengeReel.tsx`, `/challenge/preview` routes render the signed boards with no auth.
- **engine_possession_model** (2026-09-16, `plan_engine_possession_model_2026-09-16.md`): standardised lineup aggregation (`RATING_NORM`/`LINEUP_AGG`/`LINEUP_CENTRE`), possession events (turnover/rebound/creator steer) replace the possession battle, edge 0.20/0.08; talent share 21.9% game/49.3% season; commits `ff6a59a`..`18eb277`.
- **card_balance** (2026-09-17): bref-primary positions + bio crossover, rarity redistribution, badge hand-binning, play catalog 10→14. Superseded by card_ratings_rebalance below.
- **mobile_native_feel** (2026-09-19): global `touch-action`/`user-select`/`-webkit-touch-callout` in `globals.css` (no context menu/double-tap zoom); Android/PWA back shows a "Leave this screen?" sheet on draft room/deck builder; two per-move undo toasts dropped. Verified in the browser pane only — **not verified** on a real Android device; recheck there first on a long-press/double-tap/back report.
- **card_ratings_rebalance + draft_ai** (2026-09-18/19, `plan_card_ratings_rebalance_2026-09-18.md`): pipeline keeps 13 more advanced columns; every dimension on one mean-centred `idx()` over rotation players; OVR = re-indexed mean of the uncapped raws; bref bio-page positions (`PositionResolver`); rarity band -> adjustment -> floor/ceiling; badges re-binned; gold = a fourth badge level; bots draft value-first-then-plan. `lineup.test.ts` (`LINEUP_CENTRE`) drifts past tolerance since, awaiting a recalibration pass.
- **game_theater** (2026-09-17, manual override, `plan_game_theater_2026-09-13.md`): structured per-event `narrative` renders broadcast play-by-play, game-flow beats, crunch time, box score + Summary; 333/333 tests. Open: `narrativeText` fallback removal (D7/T6), skipped by owner call.
- **sync_outbox** (2026-09-21, `plan_sync_outbox_2026-09-21.md`): local-first writes through a persisted outbox, tombstones, persisted baselines (relaunch downloads 0 KB), deterministic season/82:0 ids, approved-only writes; migration applied. Still open: no UI for `SyncStatus.blocked`; 82:0 run creation never exercised in a browser.
- **mobile_load** (2026-09-21, `plan_mobile_load_2026-09-21.md`): first-load JS gz `/login` 405 -> 262 KB, `/` 469 -> 333 (card set out of the root layout, supabase-js lazy; a Postgrest builder is a thenable, build queries inside one callback); `public/` 104 -> 13 MB, headshot URLs only via `headshotThumb`; proxy verifies the session locally; asset-only service worker. Measure with `node scripts/route-js-size.mjs` after `npm run build`.

## pvp_draft — built 2026-09-22, awaiting the owner playtest

Two humans draft one cube live from seats 0 and 4 (`usePvpDraft` over `useDraftEngine`'s
`PvpDraftBinding`, `/playoffs/[id]/draft` and `/build`, `WaitingFor`). Migration
`202609220002_match_void.sql` APPLIED to production (dry run 17/17): `match_void`,
`void_reason`, and no pick clock until the first pick (accepting used to start it, so an
absent host's pick 1 was auto-picked on arrival). "Finish the draft" only after 5 min
offline, and it stops when the opponent's heartbeat returns.
- Fixed on the way: Realtime joined before the session loaded, so RLS silently dropped
  every event (`loadMatchClient` awaits `getSession`); the heartbeat called `.catch` on a
  Postgrest thenable; the nav bar covered "Lock roster" (PvP draft/build are game routes).
- Verified: `npm test` 670/670; `pvp-draft.spec` 2/2 (24 rounds + build + lock -> series,
  offline finish) plus draft/resume/visual/smoke/topnav/invite 24/24; phone audit 0 over 11.
- Open: owner plays one full PvP draft on phone + desktop, then `/roadmap done pvp_draft`.
  Both clients must run the same card set: a replay on different `cards.json` versions
  would reject a legal pick and void the match (store the version on the row if deploys
  ever straddle a live draft).

## draft_resume — done 2026-09-22

Plan: `docs/completed/plan_draft_resume_2026-09-22.md`, commits `b86dbe4` + the close-out.
- `engine/draftReplay.ts`: `replayDraft(seed, humanPicks, ...)` rebuilds the room; bots are
  deterministic from the seed. Takes several human seats (`human-0`, `human-4`) for pvp_draft.
- `useDraftEngine` state is `(seed, humanPicks, humanAutoPicks)`, no cached packs; it no
  longer auto-starts: `DraftRoom` calls `startNewDraft()` or `resumeDraft(session)` once
  the unfinished-session check resolves. A resumed draft keeps its saved mode/game.
- The in-progress `DraftSession` (`status: 'drafting'`, `seats: []`) is saved after every
  pick under the id the complete session later overwrites.
- Tests share one cloud-synced E2E account, so a spec that stops mid-draft leaves a resume
  sheet for the next one: call `clearAnyUnfinishedDraft` (`tests/helpers/draft.ts`) before
  visiting `/draft` (it broke `mobile-audit` once).
- Verified: 200-draft equivalence vs the old hook's logic; `npm test` 655/655; bench
  checksum 219438687; `playwright test draft draft-resume visual smoke topnav` 20/20;
  `mobile-audit --project=phone-landscape` 0 findings over 9 screens.

## pvp_match — done 2026-09-22

Plan: `docs/completed/plan_pvp_match_2026-09-22.md`, commits `98cf50b`..the close-out. The
shared record of a two-player Playoffs match; no draft or series screens yet (pvp_draft,
pvp_series). `storage/matchTypes.ts` is the contract: `Match` mirrors the row, the comment
block lists every RPC and its error codes.
- Migration `202609220001_matches.sql` APPLIED to production 2026-09-22 after a dry run
  (migration + the 16 cases of `supabase/tests/202609220001_matches_test.sql` in one
  rolled-back transaction). Live: 9 RPCs, RLS on, in `supabase_realtime`, anon cannot invite
  or read `user_directory`, helpers not client-callable.
- Clients never write `matches`; games are written only by `POST /api/match/[id]/simulate`
  (service role, `lib/matchSimulate.ts`, game numbers 1-based, `engine/playoffs.ts`).
  Heartbeats do not bump `version`. The bell reads slim columns (`MATCH_SUMMARY_COLUMNS`).
- Second E2E account `E2E_TEST_EMAIL_2` (`e2e_test_2`); `playoffs-invite.spec` deletes the
  matches between the two E2E accounts before and after.
- Verified: `npm test` 655/655, `playoffs-invite.spec` green twice, smoke 9/9,
  `route-js-size` `/` 335 -> 336 KB gz, bench checksum 219438687.
- `useMatchList` is one module-level store: however many components call it, a page load
  makes one `match_expire` + one select (`tests/unit/match-list.test.ts`).
- Open: no unit test of the simulate route handler itself; add it in pvp_series with the
  advance route.

## render_and_engine_perf — done 2026-09-22

Plan: `docs/completed/plan_render_and_engine_perf_2026-09-21.md` (T1-T14, `faae707`..`b21a285`).
Behaviour-preserving throughout: `npx tsx scripts/bench-engine.ts` prints a checksum of a
simulated 82:0 season that must stay 219438687, and `node scripts/balance-baseline.mjs` must
print IDENTICAL against `tests/fixtures/balance-500-seed42.txt` (never `--write` it without
an owner-approved balance change). Both held after every commit.
- **Engine:** 82:0 half 136 -> 71 ms, half + ghost 263 -> 149 ms on the dev machine.
  `memoLineup` caches lineup aggregates per five-man array (WeakMap; unregistered arrays are
  never cached, tests edit ratings in place); `prepareLineupDraw` hoists the depth-chart
  weights out of the possession loop; `simulateGame(..., { events: false })` skips the
  play-by-play for `simulateHalf` (a viewer re-simulates the seed with events); the trade
  ghost runs only when `rosterChanged` says the roster differs. `game.ts` is 364 lines over
  `gameTypes/shot/rotation/possession/teamInfo/boxscore.ts`. A season's games are seeded
  `mixSeed(season.seed, 'game:<day>:<matchup>')`, no clock reads, so a season replays from
  its seed. Narration picks variants off its own salted stream, never the engine's.
- **Deck builder:** roster editing is one pure reducer, `applyBuilderAction` in
  `engine/deckbuilder.ts` (43 tests incl. a 300-action property run); `useRosterBuilder`
  returns a dispatch's error synchronously. `DeckBuilder.tsx` 686 lines; layout in
  `useDockLayout`, derived playbook in `useBuilderPlaybook`, saving in `useSaveRoster`,
  `RosterSidebar`/`PlaysSidebar`/`SaveRosterModal`/`ClearRosterModal`/`DragGhost`. Roster
  filter and lane state live ABOVE the sidebar body (`useRosterSidebarView`): the body
  unmounts when the phone drawer closes, and `deckbuilder.spec` asserts the filter survives.
- **Render:** `TeamBlock`/`TaleOfTheTape` memoized, live box only while on screen
  (`tests/game-view-render.spec.ts`: 46 -> 10 renders per 23 possessions). `PlayerCard.tsx`
  918 lines (`PlayArt.tsx`, `BadgeIcon.tsx`); hover previews arm only on fine pointers;
  long-press preview on bench rows, starters, compact cards and rosters-page starters
  (`tests/long-press.spec.ts`, dispatched touch events, chromium project). Rosters page renders
  front-only starter cards, stagger capped at 1 s, `content-visibility:auto` per roster.
Owner phone round for the long-press attach signed off 2026-09-22.

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

What to do next is `docs/ROADMAP.md`; `draft_ai`, `card_balance_thresholds`,
`mobile_native_feel`, `phone_card` and `challenge_loose_ends` all closed. `mode_picker`
(#10) is unblocked. **2026-09-21 review** (code, architecture, mobile/PWA) produced three
planned, unstarted plans: `mobile_load` (#11), `sync_outbox` (#12), `render_and_engine_perf`
(#13). All three are done and merged into `main`, as are `draft_resume` (#14) and `pvp_match` (#15); `pvp_draft` (#16) is unblocked. Fixed the same day: opening a
saved roster wiped every play-role assignment (`initBuilderState` in `engine/deckbuilder.ts`
seeds the builder at mount; `tests/roster-reopen.spec.ts` fails on the old code), Enter/Space
on a pack card picked it instantly, login `next` open redirect (`lib/safeNextPath.ts`).
655/655 tests (the `lineup.test.ts` drift is an `it.fails` marker). Owner actions outside the repo:
Supabase dashboard Authentication → Sessions refresh-token/inactivity timeout >= 90 days;
Vercel image-optimization quota is the first place to look if headshots ever break. The
2026-09-12 code review that produced Phases 0-1 is archived as
`docs/completed/review_code_and_architecture_2026-09-12.md`; the list below predates it.

1. **Stale analytics findings** (PPP 1.29, ~0.8% turnovers, uneven activation) were
   measured against the retired engine; PPP is ≈1.05 and turnovers 13.9% now. Re-run
   `npm run analyze` before treating `docs/analytics/*` as current.
2. **AI draft strength gap — needs a fresh measurement.** The old 11.1 OVR spread was
   measured against the pre-`draft_ai` PER-based valuation, now replaced by the value-
   then-plan curve; re-run and re-measure before assuming it still applies.
3. **82:0 trade -> deck-builder hand-off is verified by code only** — confirm with a click-through.
4. **"Enter a seed" is still disabled** on the start page's challenge picker. `parseSeed`
   (`components/challenge/Results.tsx`) already round-trips the full 32-bit range; wiring
   the input belongs to `mode_picker` (roadmap #10).
5. **`mobile-audit` deck-builder step flakes when several touch projects share one fixture
   roster** — "Edit Roster" sometimes fails `toHaveURL(/roster/)` on the second project.
   Always `--workers=1`; never seen on a solo run.
6. **`game.test.ts` minutes floor** — seeded 2026-09-16, so CI is deterministic. The
   underlying edge remains: a starter with a low share (small OVR gap, low MPG, age 35+)
   can legitimately land under 18 minutes on some seeds; if it reappears, lower the floor.
7. **engine_possession_model follow-ups, still open post-card_balance** — owner accepted
   the measured state 2026-09-16: talent share 21.9%/game, 49.3%/season (`EFFICIENCY_SCALE`
   0.12-0.15 pulls it back if seasons feel solved). Unexplained: the player-level on-floor
   regression gives finishing a negative marginal in the 41-55 OVR band while the roster-
   level `--levers` A/B makes finishing the top lever; look with a larger bootstrap first.
8. **Vercel Deployment Storage at 75% of 10 GB (2026-09-21)** — each push kept a ~90 MB
   deployment (estimate, from when `frontend/public` was 104 MB; it is 13 MB since mobile_load), nothing pruned: 82 hoops-draft deployments (57 production, 25 preview).
   `frontend/vercel.json`: `ignoreCommand` skips builds with no `frontend/` change since
   `VERCEL_GIT_PREVIOUS_SHA` (it must exit ONLY 0 = skip or 1 = build: Vercel clones shallowly, a
   push deeper than the clone made `git diff` exit 128 and the deploy ERRORED, fixed in `30c4878`),
   and `claude/*` branches don't build (drop that block if previews are
   wanted for phone UAT). Root Directory = `frontend` is VERIFIED (build log runs `frontend@0.1.0
   build`). Owner actions: run `scripts/prune-vercel-deployments.ps1` (dry run by default, `-Execute`
   deletes permanently; keeps live + 4 newest READY production + last 48h; token via
   `$env:VERCEL_TOKEN`), set Deployment Retention on both projects (dashboard only, no API). Behaviour at 100% is unknown.

## Where to look

| Question | File |
|---|---|
| How is a player's OVR computed? | `frontend/src/engine/ratings.ts` (+ constants in `engine/balance.ts`) |
| How does a possession resolve? | `frontend/src/engine/game.ts` (`playOnePossession` → `turnoverChance`, `steerShotProfile`, `resolvePossession`, `offensiveReboundChance`); `docs/game_mechanics.md` §1-4 |
| How do five players become one lineup number? | `frontend/src/engine/lineup.ts` + the "Lineup model" section of `engine/balance.ts` (`LINEUP_AGG`, `LINEUP_CENTRE`) |
| How big is each rating's lever? | `npm run balance -- 5000 --seed 777 --levers` |
| What do identities/plays do? | `frontend/src/engine/archetypes.ts`, `engine/playbook.ts`, called in `engine/game.ts`; `docs/game_mechanics.md` |
| Why were plays/identities built this way? | `docs/completed/plan_plays_and_synergies_2026-09-13.md` |
| Tuning identity thresholds | `npm run feasibility -- 100` (`frontend/scripts/archetype-feasibility.ts`) |
| How is the cube built / how do bots draft? | `frontend/src/engine/draft.ts`, `frontend/src/hooks/useDraftEngine.ts` |
| How do bots build a roster? | `frontend/src/engine/deckbuilder.ts` |
| Season scheduling/standings | `frontend/src/engine/season.ts` |
| Where is user data stored? | `frontend/src/storage/` (GameStore: IndexedDB + Supabase via `SupabaseGameStore`) |
| Data pipeline (scrape -> game.db) | `data/README.md` |
| What to work on next | `docs/ROADMAP.md`, then `docs/plans/plan_<topic>_<date>.md` |
| Original code review (2026-09-12) | `docs/completed/review_code_and_architecture_2026-09-12.md` |
| Balance findings | `docs/analytics/analysis_report.md`, `docs/analytics/analytics_summary.md` |
| How to regenerate a balance report | `npm run balance` (headless; `--ab`/`--catalog`/`--draft-impact` flags) or `frontend/scripts/analyze.ts` (`npm run analyze`, from a `/debug` export) |
| Screenshotting a route | `scripts/screenshot.js` (`npm run screenshot`); the game theater without a login: `frontend/scripts/theater-shot.ts` |
| How is a possession narrated / what are beats? | `frontend/src/narration/` (`render.ts`, `beats.ts`, `summary.ts`, `hints.ts`, `templates/`), consumed by `components/GameView.tsx` |
