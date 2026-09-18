# Handover — 2026-09-18

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
(`SupabaseGameStore`, accounts_cloud_saves) with optimistic-concurrency conflict handling
— see the milestones below. The UI runs on semantic tokens + `data-theme` and five
`components/ui` primitives (ui_foundation); `npm run check:styles` is a blocking CI gate
at 0 violations. On phones (coarse pointer under 1000px) the whole document renders at
CSS `zoom: 0.7` with `h-dvh-z` shells and a long-press card preview (game_canvas).
434/435 Vitest tests pass (two pre-existing seeded-statistics drifts, see below), type-check is clean, `npm run lint` is
0 errors / warnings-only (all `<img>`/unused-var, none blocking), `smoke.spec.ts` is 9/9. GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR. A runtime
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
- **game_canvas** (2026-09-16, `plan_game_canvas_2026-09-16.md`): `html { zoom: 0.7 }` under `(pointer: coarse) and (max-width: 999px)` with `h-dvh-z` shells so the five main screens fit a phone in landscape without scrolling; tap-to-select touch contract, long-press preview, `tests/mobile-audit.spec.ts` rules 5/6. Open: `phone_card` (roadmap #8).
- **engine_possession_model** (2026-09-16, `plan_engine_possession_model_2026-09-16.md`): standardised lineup aggregation (`RATING_NORM`/`LINEUP_AGG`/`LINEUP_CENTRE`), possession events (turnover/rebound/creator steer) replace the possession battle, edge 0.20/0.08; talent share 21.9% game/49.3% season; commits `ff6a59a`..`18eb277`.
- **card_balance** (2026-09-17): bref-primary positions + bio crossover, rarity redistribution, badge hand-binning, play catalog 10→14. Superseded by card_ratings_rebalance below.
- **game_theater** (2026-09-17, manual override, `plan_game_theater_2026-09-13.md`): structured per-event `narrative` renders broadcast play-by-play, game-flow beats, crunch time, box score + Summary; 333/333 tests. Open: `narrativeText` fallback removal (D7/T6), skipped by owner call.

## card_ratings_rebalance — done 2026-09-18

Plan: `docs/completed/plan_card_ratings_rebalance_2026-09-18.md`. All T1-T8 done. Fixed a
25-minute backup centre (Queta) being a 90 OVR Mythic while Curry (43-game season) was
74: the pipeline discarded two thirds of the advanced/shooting stats it already scraped,
and PER/VORP-driven OVR punished a shorter season.
What shipped: pipeline widened to 13 previously-discarded columns (usg%/ast%/tov%/stl%/
blk%/orb%/drb%/trb%/obpm/dws/ws-per-48/pct-ast-fg2/pct-ast-fg3); every dimension rebuilt
on a single mean-centred `idx()` (league avg → 0.5, rotation top-7.5% → 1.0) over rotation
players (mpg≥15) instead of the old benchmark-ratio `getIndex`; defence is now
magnitude(DBPM/DWS-48) × shape(steal% vs block%+DRB% split), not two independent scores;
shooting channels get a self-creation boost (`1 - pct_ast_fgN`) so Curry's low assisted-3
rate outweighs a high-volume-but-assisted shooter like Queta; playmaking/rebounding are
rate-stat power blends (AST%^0.65·APG^0.35, TRB%^0.45·RPG^0.55); a raw exceeding 99 earns
a gold L4 badge (gold ring/fill, `PlayerCard.tsx`) instead of being clipped.
**Positions, superseded twice (2026-09-19): `PositionResolver`** (`fetch_players.py`)
replaced the letter-index/`blend_bio_crossover` approach — those capped at broad G/F/C
same as bio.csv. Each player's own bref bio page ("Position: X, Y, and Z") gives exact
eligibility (Shai → PG/SG, Barnes → SG/SF/PF), scraped for all 582 active players into
`data/bref_player_positions.json` by `download_bref.js`. Primary = bref's season `Pos`;
eligibility = the bio-text set, trusted verbatim (0 conflicts, only 3/582 non-adjacent,
~2% three-way+, not pool-skewed → no cut needed, see `data/analyze_positions.py`).
Missing bio text (3/582, a real bref quirk) falls back to a value **persisted from
game.db** before overwrite, then season-Pos-only; a genuinely new Rare+ gap logs to
`REVIEW_MISSING_POSITIONS.md` (gitignored) for a one-time manual edit that persists
forward on its own — `POSITION_OVERRIDES` is for overruling a wrong signal (Jokić), not
filling gaps. Giannis (no Position line at all) hand-set to SF/PF/C. Gold-star treatment
(`getPosColors`, `PlayerCard.tsx`) marks 3+ position eligibility; `multipositionalLevel`
(`archetypes.ts`) starts credit at 3 positions.
**OVR follow-up (2026-09-19):** no longer a flat mean of the seven dimensions (regressed
to the middle, topped out at 90/~47 mean) — `computeCards` now runs two passes: pass 1
averages each player's seven UNCAPPED dimension raws into `rawOvrMean`; pass 2 re-indexes
that composite through the same `idx()` every dimension uses (rotation league avg → ~50
OVR, rotation top-7.5% → 99) before resolving rarity/awards. Untouched: per-dimension
ratings, the possession engine (OVR isn't a game input). **Not verified**: the plan's
screenshot exit criterion — no Supabase credentials in this sandbox, every route 500s
before rendering; do this on a real machine before signing off the gold badge UI.
**Balance workflow locked in, five hierarchical stages** (`AGENTS.md`), all done
2026-09-19: **rarity** simplified to band → adjustment → floor/ceiling (`ratings.ts`;
`RARITY_CUTOFFS` rebanded `<50/50-79/80-89/90+`, `hasAward` folds in every award type);
**badges** re-hand-binned against the
post-rebalance raws (target ~62/29/11 → ~56/27/13 holders), fixing playmaking's dead L3
and the ~3x badge-earn-rate spread (now 10.9-13.4% across all seven dims); **plays/
archetypes**: dropped the stale `MONO_THRESHOLDS_BY_COLOR` defense discount (existed
only because defense badges were scarcer — stage 4 fixed that), added Crash and Finish
(Glass Cleaner's first primary-colour plan), and switched bot archetype selection from
deterministic-best (tied toward mono via array order) to `pick(rng, eligible)` — every
two-colour plan went from 0% to a real activation rate (`bestSelection`, `archetypes.ts`).
PPP steady near 1.05-1.06. Two tests sit just past tolerance from the position-pool + rarity-
band drift, left for a dedicated recalibration pass, not patched ad hoc: `lineup.test.ts`
(`LINEUP_CENTRE`) and `game.test.ts`'s home-court test. `card_balance_thresholds` closed
2026-09-19 by owner override — its D8 target was discarded before `draft_ai` even landed.
**Gold = a fourth badge level** (owner, 2026-09-19): nothing special-cases it. Archetype
colour points, `countBadges` and play requirements all read `Trait.level` numerically, so
one gold Finisher alone activates Post-Up Series (3 levels). Locked by four tests in
`synergies.test.ts`, including that gold REPLACES the l3 trait rather than adding a second.
**`draft_ai` landed (2026-09-19):** T1-T3/T5/T6 recovered from an orphaned branch
(`claude/roadmap-status-96eef9`, forked off main right after `card_balance` closed
2026-09-17, never merged) — cherry-picked its code (not its stale docs) 47 commits
later. Bots draw a target/secondary plan at draft start and score picks value-first-
then-plan (ramping across the draft, bomb-pull override for a clear talent gap), and
`buildBotRoster` never leaves a depth-chart column empty (fixes the old 4-on-5 bug).
T4 (D8 identity-reach tuning) stays parked by owner call, not an exit criterion.
442/443 tests, `npm run balance`/`feasibility` clean, live draft + ticker screenshotted.
**`mobile_native_feel` done (2026-09-19):** no context menu/double-tap-zoom
(`touch-action`/`user-select`/`-webkit-touch-callout` globally in `globals.css`),
Android/PWA back shows a "Leave this screen?" sheet (Cancel/Leave, re-arms on cancel)
on draft room/deck builder instead of silent history-back, dropped two per-move
deck-builder undo toasts. Verified via browser-pane mobile-landscape viewport
(computed styles, live back-guard trigger/cancel/re-arm) — **not verified**: an actual
Android device or Chrome touch-gesture emulation, unavailable in this sandbox; recheck
there first if a long-press/double-tap/back-button report comes in.

## challenge_mode — done 2026-09-18

Plan: `docs/completed/plan_challenge_mode_2026-09-17.md` (T1-T9). Owner signed off live
2026-09-18 after two rounds of UAT; exit criteria re-run at close: 431/431 vitest, smoke 9/9,
tsc clean, lint 0 errors, check:styles 0, `npm run balance -- 500 --seed 42` unchanged at PPP
1.044, and a tournament roster refused at `/challenge/<id>` with no run created. The 82:0 Challenge is a
second game mode picked on the start page BEFORE the draft: 82 games against all 30 real NBA
teams, revealed as a flip clock in two spins, with a front office and one trade at game 41 and
a single grade at the end. `docs/game_mechanics.md` describes it in prose, `ARCHITECTURE.md`
§6b how the pieces connect.

What to know before touching it:

- **A half is simulated in ONE call and saved before anything animates**, and a half already
  in `run.halves` is never re-simulated. That is the whole reason a reload replays the reveal
  instead of re-rolling the season. Don't move simulation into a component. Reel pacing is
  five constants at the top of `ChallengeReel.tsx` (retuned after UAT: a run is ~15.6s, not
  ~29s); the blur radius is a FRACTION of the glyph in `FlipClock.tsx` — fixed pixels left a
  168px digit legible and the half-time record could be read off the sealed reel.
- **Every game's seed derives from (run seed, game index)**, never a shared stream, so reveal
  speed, a skip or a reload cannot shift a result. Same for the trade pack and the schedule.
- **Difficulty is challenge-only**: `CHALLENGE_TUNING` (0.50/0.20 vs the engine's 0.20/0.08)
  is passed to `simulateGame`; tournament balance is untouched and `npm run balance` is
  unchanged at PPP 1.044. Calibrated with `npm run challenge` — 2,000 seat-seasons put the
  best drafted seat at 60 wins mean, p90 70, and wins fall monotonically by seat rank.
- **NBA rosters are locked in** (owner call): a drafted Luka faces Lakers Luka. That forced a
  real engine fix — `simulateGame` kept ONE box-score map keyed by player id for both teams,
  so a shared id merged into one row emitted on the home side only; 13 of 41 games had a box
  score disagreeing with the scoreboard, one by 32 points. Box stats are now keyed by side.
- **The record stays sealed until game 82.** The break shows a pace band only, and
  `challengeAdvice.test.ts` scans every generated string for a rating or a W-L record.

UAT changed three things worth remembering. The reel was too slow at both ends (a run is now
~15.6s, not ~29s). The flip blur was twice overcorrected: what seals the record is the strip
ROLLING, not blur — blur only softens the moving digits, and at 19% of the glyph the cell went
flat. And the "flicker before the deadline" was a REVEAL: the reel dropped blur to 0 when a
half ran out, showing the true 41-game record for a frame before the break mounted.
`/challenge/preview?at=6|28|79` and `/challenge/preview-results[?trade=0]` render the screens
against the signed boards with no auth, storage or simulation.

Seams: the pack reveal advances on animation frames, so it stalls if the browser pane stops
painting (which is why the trade -> deck-builder hand-off is code-verified, not clicked);
`cas_upsert`'s allowlist is hardcoded in SQL, so a new synced table needs the function
re-declared (migration `202609170001`); and an untracked asset in `public/` reads as junk to
the next agent — the 82:0 pack art was deleted on that mistake, so it is tracked now.

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

What to do next is `docs/ROADMAP.md`; `draft_ai` and `card_balance_thresholds` both
closed 2026-09-19. `mode_picker` (#10) is unblocked. Owner actions outside the repo:
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
