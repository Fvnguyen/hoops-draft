# Handover — 2026-09-13

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats, 8-card packs, pack-opening
animation on the first pack) -> deck builder (depth chart, play assignments, identity
selection) -> single game or round-robin season -> in-app analytics export. The engine is
a pure, seeded TypeScript module (`frontend/src/engine/`) with a multi-channel shot model,
archetype identities and assigned-player plays; persistence is IndexedDB behind
`GameStore`, storing a slim per-game result (re-simulated on view from its seed) rather
than the full play-by-play. 122 Vitest tests pass, type-check is clean, `npm run lint` is
0 errors / 13 warnings (all `<img>`/unused-var warnings, none blocking). GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR. A runtime
error boundary (`app/error.tsx`, `app/global-error.tsx`, shared `ErrorRecovery.tsx`) shows
a recovery screen instead of a blank page; `frontend/tests/smoke.spec.ts` loads every real
route headlessly and fails on any console/page error.

Finished design docs live in `docs/completed/`; a plan still being worked on stays in
`docs/plans/` and moves there when its milestone lands.

## What this cleanup changed

- **Git restructure**: `frontend/` used to be a separate nested git repository, tracked in
  the main repo only as a bare gitlink (so a fresh clone got an empty `frontend/`). It has
  been absorbed into the main repo with its full history merged via a subtree merge
  (commits `aa0f02b` "chore: absorb nested frontend repo..." and `e26dcb7` "chore: link
  frontend git history"). The old nested `.git` was backed up to
  `C:\Users\fabia\magic-ball-frontend.git.bak` — safe to delete once you've confirmed
  `git log -- frontend/...` shows the expected history.
- The root `node_modules` was previously tracked (183 files); it is now untracked
  and gitignored.
- Dead one-off scripts were removed: the `generate_engine1..10.py` heredoc generators and
  `refactor_*.js` / `update_engine.py` patchers that used to produce
  `frontend/src/lib/engine.ts` (edit it directly now), plus `data/analyze_*.py`,
  `data/check_*.py`, `data/fix_merge.py`, `data/update_fetch.py` one-off patchers of
  `fetch_players.py`. History is preserved in git if you need to see what they did.
- `tests/analyze_game_data.js` moved to `scripts/analyze_game_data.js` (it's a dev tool,
  not a test).
- Root `package.json` gained `dev`/`build`/`test`/`test:e2e`/`analyze`/`screenshot`
  scripts so the whole project can be driven from the repo root.
- Removed unused npm dependencies `@prisma/client` and `unidecode` from `frontend/` and
  the legacy `frontend/prisma/schema.prisma` (nothing imported them; all DB access is
  `better-sqlite3` in `engine.ts`).
- Documentation added/rewritten: this file, `docs/ARCHITECTURE.md`, root `AGENTS.md`,
  root `CLAUDE.md`, root `README.md`, `frontend/README.md`, `data/README.md`.

## History

- **Phase 0 (correctness)** (done 2026-09-12): fixed inverted defensive modifiers, play
  activation, possession-swing double counting, offense/defense edge bias, silent storage
  quota failures, `/api/cards` N+1 queries, minutes/turnover scaling; PPP 1.29 → 1.08.
  Still open: margins/score sd wider than NBA (`EFFICIENCY_SCALE`, edge clamp), bots value
  players by PER only.
- **Phase 1 (engine isolation)** (done 2026-09-12): engine made pure/seeded
  (`engine/rng.ts`), cards became a build artifact (`cards.json`), persistence moved to
  `src/storage/` (GameStore/IndexedDB). First Vercel preview deploy still not done.
- **Plays & archetypes milestone** (done 2026-09-13): archetype identities
  (`engine/archetypes.ts`) and assigned-player plays (`engine/playbook.ts`), roster v2
  (`playAssignments`, `archetypes`), deck builder `PlayPanel`. Design and full numbers in
  `docs/completed/plan_plays_and_synergies_2026-09-13.md`.
- **Post-milestone fixes** (done 2026-09-13, `cc32edf`/`ab04726`/`fa10e01`): pack opener
  reveal sequence (design in `docs/completed/plan_pack_opening_animation_2026-09-13.md`,
  since reworked further by `ui_draft_deckbuild_pack`); live box score derived from
  possessions played so far (`deriveLiveBoxScore`); Mythic card-back bleed-through fixed
  (`isolation: isolate` instead of `mix-blend-mode`); legacy season/roster upgrade paths.

## Stability pass milestone — done 2026-09-13

Design: `docs/completed/plan_stability_pass_2026-09-13.md`. A cheap, pre-everything-else
pass removing defects likely to bite later plans and adding the two safety nets the repo
lacked: CI and a runtime error boundary.

- **CI**: `.github/workflows/ci.yml` runs `tsc --noEmit`, lint, Vitest, and `next build` on
  every push/PR (ubuntu, Node 22). Lint is now 0 errors (was 8): the 7 `no-explicit-any` in
  `/test-ui` got real `PlayerBio`/`SeasonStat` mocks; `DraftRoom.tsx`'s
  `set-state-in-effect` was replaced with `useSyncExternalStore` for the client-mount flag.
- **Error boundary**: `app/error.tsx` + `app/global-error.tsx` share `ErrorRecovery.tsx` —
  a recovery screen with the error message, "Try again" (`reset()`), a home link, and a
  confirm-gated "Reset local data" button that calls `getGameStore().clearAll()`.
- **Safe loads**: `src/storage/safeLoad.ts` shape-checks every record out of a `GameStore`
  backend (`getDraftSession`/`getRoster`/`getSeason` + list variants in both `indexedDb.ts`
  and `memory.ts`); a corrupt record is dropped (logged, returns `null`/filtered from
  lists) instead of throwing, and legacy seasons/rosters still upgrade via
  `normalizeSeason`/`normalizeBuiltRoster`. Covered by `tests/storage/safeLoad.test.ts`.
- **Draft reproducibility**: bot `noiseSeed`/`favoredTrait` are now drawn from the draft's
  seeded `Rng` (extracted as `createBotProfiles` in `useDraftEngine.ts`) instead of
  `Math.random()`, so the same `draftSeed` reproduces the same bot picks. Covered by
  `tests/unit/draft-reproducibility.test.ts`.
- **Roster edit keeps its season**: `/rosters` passes `sessionId` in the edit link;
  `deckbuilder-test` forwards it to `DeckBuilder` (falling back to the saved roster's own
  `sessionId` if the query param is absent), so re-saving keeps the Play Season button.
- **PackOpener hygiene**: the keydown effect now has a stable `[]` dependency array (reads
  phase via a ref instead of re-subscribing every render); the deal-in stagger is gated by
  `prefers-reduced-motion` too; the duplicated unmount timer-cleanup was removed.
- **Smoke spec**: `frontend/tests/smoke.spec.ts` loads every real route and fails on any
  `pageerror` or console error — the local gate to run before committing (see AGENTS.md).

Verified: `npm test` (103 Vitest tests, up from 93), `npx tsc --noEmit`, `npm run lint` (0
errors), `npm run build`, and `npx playwright test tests/smoke.spec.ts` (8/8) all pass.

## Analytics tooling & data storage milestone — done 2026-09-13

Design: `docs/completed/plan_analytics_tooling_2026-09-13.md`,
`docs/completed/plan_data_storage_2026-09-13.md`. Both had no unmet dependencies and
disjoint files, so they ran together; six wave-1 tasks landed as parallel agents plus
driver wave-0/wave-2 work.

- **Analytics**: `scripts/analyze_game_data.js` replaced by `frontend/scripts/analyze.ts`
  (imports the real engine like `balance.ts`); reports identity tier per lane, staffed
  plays, per-game play calls, and win rate by tier/staffing instead of the old
  synergy/`PLAY_EFFECTS` sections (those systems no longer exist). `balance.ts --ab` adds
  a paired treatment-vs-archetypes-off harness: at n=700 opponent-games, dedicated-tier
  identities are +5.71 margin / +16.3pp win rate over no identity, and 2 staffed plays are
  +14.0pp over 0 — see `docs/analytics/report_2026-09.md`. Root `package.json`'s
  `balance`/`analyze` scripts now forward `--` args (they silently didn't before).
- **Storage**: seasons persist `StoredGameResult` (seed + box score, not the full
  `GameTheater`) per game; the theater re-simulates on view via
  `resolveMatchupReplay`/`teamInfoForSeat` (`engine/season.ts`), falling back to a
  box-score-only view if `balanceVersion` has changed, or a read-only `legacyTheater` for
  pre-Phase-1 saves with no seed. Only the human's own matchup keeps its full box score;
  bot-vs-bot matchups (3 of 4 per game day) drop theirs — nothing ever reads them and it's
  what kept a season over the 100 KB target (measured 132 KB before, now under). Dexie
  schema bumped to v2 with a one-time upgrade (`storageMeta` table, `normalizeSeason`/
  `normalizeBuiltRoster` no longer run on every load). Rosters page has Export/Import
  (merge by id, newer `timestamp` wins) and an "older card set" tag from the new
  `cardSetVersion` field, stamped by the storage layer at save time.
- **Verified**: `npm test` (122 Vitest tests, up from 103), `npx tsc --noEmit`, `npm run
  lint` (0 errors), `npm run build` all pass.

Open after this milestone: no fresh `/debug` export exists yet with the plays/archetypes
fields populated (the on-disk dumps predate that milestone) — `docs/analytics/report_2026-09.md`'s
identity/play-call sections are empty until someone plays a draft + season and exports.

## ui_draft_deckbuild_pack wave 0 (T0) — done 2026-09-13

Design: `docs/plans/plan_ui_draft_deckbuild_pack_2026-09-13.md` (plan **2a**, wave 1 next).
T0 is contracts-only: everything below compiles, but most new behaviour is a no-op stub.

- New pure modules: `engine/depthChart.ts` (D12 fixed-slot helpers, built on
  `engine/positions.ts`), `lib/draftTimer.ts`, `lib/packReveal.ts` — none imported into
  the UI yet (`DeckBuilder.tsx` still has its own eligibility copy); wave 1 wires them in.
- New components: `Toast.tsx` (`ToastProvider`/`useToast`, not mounted anywhere yet),
  `audio/sfx.ts` (no-op interface, real Web Audio synthesis is T2), `RosterDistribution.tsx`
  and `AssignPopover.tsx` — both extracted out of `DraftSidebar.tsx`/`PlayPanel.tsx` with
  their original callers rewired, so this half is a real (tested) refactor, not a stub.
- Widened contracts, all backward compatible: optional `DraftSession.mode`,
  `DraftPickRecord.autoPicked`; `useDraftEngine` gained a `mode` param, a `round-summary`
  state, `pickDeadline`/`passSeq`, and no-op `pickFromIntro`/`startNextRound`/
  `expirePick`/`armIntroClock`; `PackOpener` gained unused `mode`/`pickDeadline` props;
  `DraftRoom` gained a `mode` prop (default `'premier'`, not URL-driven yet).
- Verified: `tsc --noEmit`, lint (0 errors), `npm test` (122 tests, unchanged), `next
  build` all clean. Not verified live in-browser: the other session's in-progress
  `auth_approval` middleware (`frontend/src/proxy.ts`) currently redirects `/draft` to a
  `/login` page that doesn't exist yet — unrelated to this change; `next build`'s static
  prerender of `/draft` exercises the same component tree and succeeded.

Next: wave 1 (T1-T6) can run in parallel now that the tree compiles against the final
hook/component API — see the plan's Tasks table.

## How to run everything

```bash
npm install && npm --prefix frontend install
npm run dev            # app at http://localhost:3000
npm test               # Vitest: frontend/tests/unit (real engine) + tests/storage
npm run build:cards    # regenerate frontend/src/data/cards.json from frontend/game.db
npm run balance -- 500 # headless balance report (PPP, scores, play impact)
npm run feasibility -- 100 # archetype reachability for focused drafters vs bots
npm run test:e2e       # Playwright specs, needs `npm run dev` running separately
npm run analyze        # balance report from the latest data/game_logs/full_dump_*.json
npm run screenshot -- /draft draft.png --full
```

To regenerate player data: see `data/README.md` (run order: `download_bref.js` ->
`fetch_bio.py` -> `fetch_players.py` -> `download_images.py` -> `download_logos.py`, all
from `data/`).

## Open issues / next steps

What to do next is `docs/ROADMAP.md` (plan sequence; `game_engine` is unblocked, and
`ui_draft_deckbuild_pack` has wave 0 done — wave 1 (T1-T6) can run next).
The 2026-09-12 code review that produced Phases 0-1 is archived as
`docs/completed/review_code_and_architecture_2026-09-12.md`. The list below predates it.

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
