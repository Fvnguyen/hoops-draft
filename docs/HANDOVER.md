# Handover — 2026-09-13

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats, 8-card packs, pack-opening
animation on the first pack) -> deck builder (depth chart, play assignments, identity
selection) -> single game or round-robin season -> in-app analytics export. The engine is
a pure, seeded TypeScript module (`frontend/src/engine/`) with a multi-channel shot model,
archetype identities and assigned-player plays; persistence is IndexedDB behind
`GameStore`, storing a slim per-game result (re-simulated on view from its seed) rather
than the full play-by-play. 193 Vitest tests pass, type-check is clean, `npm run lint` is
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
- **Vercel deploy & auth** (done 2026-09-13, `docs/completed/plan_vercel_deploy_2026-09-13.md`/
  `plan_auth_approval_2026-09-13.md`): live at
  [hoops-draft-fvnguyen1.vercel.app](https://hoops-draft-fvnguyen1.vercel.app); Supabase
  email/password auth with admin approval and username login; local IndexedDB data
  stamped per-user (Dexie v3).

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
