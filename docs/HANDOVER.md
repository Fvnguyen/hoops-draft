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
426 Vitest tests pass, type-check is clean, `npm run lint` is
0 errors / warnings-only (all `<img>`/unused-var, none blocking), `smoke.spec.ts` is 9/9. GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR. A runtime
error boundary (`app/error.tsx`/`global-error.tsx`/`ErrorRecovery.tsx`) shows a recovery
screen instead of a blank page; `smoke.spec.ts` fails on any console/page error.

Finished design docs live in `docs/completed/`; a plan being worked on stays in
`docs/plans/` and moves there when its milestone lands.

## History

One line each (full write-ups live in the linked plans under `docs/completed/`):

- **Repo cleanup + Phase 0 correctness** (2026-09-12): `frontend/` absorbed via subtree merge, dead scripts/deps removed, agent docs written; inverted defensive modifiers, play activation, possession double counting, edge bias, storage quota, `/api/cards` N+1 fixed; PPP 1.29 → 1.08.
- **Phase 1 engine isolation** (2026-09-12): pure seeded engine (`engine/rng.ts`), `cards.json` build artifact, `src/storage/` GameStore.
- **Plays & archetypes** (2026-09-13, `plan_plays_and_synergies_2026-09-13.md`): identities (`archetypes.ts`), assigned-player plays (`playbook.ts`), roster v2, `PlayPanel`.
- **Post-milestone fixes** (2026-09-13): pack reveal sequence, live box score from possessions, Mythic card-back bleed, legacy upgrade paths.
- **Stability pass** (2026-09-13, `plan_stability_pass_2026-09-13.md`): CI workflow, error boundary, safe loads, seeded bots, `smoke.spec.ts`, lint 0 errors.
- **Analytics tooling & data storage** (2026-09-13): `scripts/analyze.ts`; slim `StoredGameResult`s re-simulated from seed (Dexie v2); rosters Export/Import.
- **Vercel deploy & auth** (2026-09-13): live at hoops-draft-fvnguyen1.vercel.app; Supabase email/password + admin approval; per-user IndexedDB stamping (Dexie v3).
- **ui_draft_deckbuild_pack** (2026-09-13): rarity-ordered pack opener with pick clock, unified Roster list, fixed 5x4 depth chart, empty-start deck builder.
- **ui_polish_small_fixes & playwright_auth_fixture** (2026-09-14): hover/confirm/radar polish; E2E Supabase account + `tests/auth.setup.ts` so `test:e2e` runs authenticated.
- **accounts_cloud_saves** (2026-09-14, `plan_accounts_cloud_saves_2026-09-14.md`): `SupabaseGameStore` over IndexedDB with `cas_upsert` optimistic CAS, type-specific merge, roster conflict UI; two post-deploy bugs fixed live.
- **game_engine** (2026-09-14, `plan_game_engine_2026-09-13.md`): OT/home-court/spread/impact tuning measured; lineup wiring fixed; `--report` unifies draft-impact + talent-vs-luck.
- **season_lifecycle_notifications** (2026-09-14): derived season phase, completed-roster lock, per-roster W-L, notification bell on device-local meta.
- **game-results-visibility** (2026-09-14, `2cd44e5`): a game result commits only when watched to the end and continued; leaving early discards it.
- **mobile_responsive** (superseded 2026-09-15, closed 2026-09-16): audit harness + projects, manifest/icons, `OrientationGate`, `/rosters` lineup row; folded into `game_canvas`.
- **ui_foundation** (2026-09-15, `plan_ui_foundation_2026-09-15.md`): semantic tokens + `data-theme`, five `components/ui` primitives, blocking `check:styles` gate 1,358 → 0, 12px/44px floors; mobile audit phone 200 → 2, tablet 201 → 0.
- **deckbuilder_ux** (2026-09-15, `plan_deckbuilder_ux_2026-09-15.md`): design-first (8 signed artboards, `docs/design/deckbuilder_ux/`), 56px HUD, dockable Plays/Roster sidebars, click-to-assign via pure `engine/deckbuilder.ts` helpers, `deckbuilder.spec` at 3 tiers. Seams: Add button swallowed by a wrapper; role avatars must be CSS backgrounds; `--update-snapshots=all` to force a baseline rewrite.
- **badge_effects** (2026-09-17, `plan_badge_effects_2026-09-17.md`): closed without a full plan — badge-levels-as-content scope shipped inside `card_balance` T2/T3 instead; the "special effects on top of the lineup model" mechanic it originally named was never built.
- **game_canvas** (2026-09-16, `plan_game_canvas_2026-09-16.md`): `html { zoom: 0.7 }` under `(pointer: coarse) and (max-width: 999px)` with `h-dvh-z` shells so the five main screens fit a phone in landscape without scrolling; tap-to-select touch contract, long-press preview, `tests/mobile-audit.spec.ts` rules 5/6. Open: `phone_card` (roadmap #8).
- **engine_possession_model** (2026-09-16, `plan_engine_possession_model_2026-09-16.md`): standardised lineup aggregation (`RATING_NORM`/`LINEUP_AGG`/`LINEUP_CENTRE`), possession events (turnover/rebound/creator steer) replace the possession battle, edge 0.20/0.08; talent share 21.9% game/49.3% season; commits `ff6a59a`..`18eb277`.
- **card_balance** (2026-09-17): bref-primary positions + bio crossover, rarity redistribution, badge hand-binning, play catalog 10→14. Superseded by card_ratings_rebalance below.

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
filling gaps. Giannis (no Position line at all) hand-set to SF/PF/C.
**OVR follow-up (2026-09-19):** no longer a flat mean of the seven dimensions (regressed
to the middle, topped out at 90/~47 mean) — `computeCards` now re-indexes the
UNCAPPED-dimension composite through the same `idx()` every dimension uses. `RARITY_CUTOFFS`
re-fit 90/68/62 (was 68/58/58) — within ±10% of target. Untouched: per-dimension ratings,
the possession engine (OVR isn't a game input), 426/426 tests. **Not verified**: the plan's screenshot exit
criterion — no Supabase credentials in this sandbox, every route 500s before rendering;
do this on a real machine before signing off the gold badge UI. `card_balance_thresholds`
(roadmap #6, depends on this now) should re-tune from this pool — every badge level moved.

## game_theater — done 2026-09-17 (manual override)

Plan: `docs/completed/plan_game_theater_2026-09-13.md`. Closed by owner override before
its own two exit criteria ran (an in-app season game with a close finish, and loading a
season saved before this plan) — run both when convenient; if either turns up a bug, the
fix is scoped to this feature, not a new plan. T6 (removing `narrativeText` once those
pass) was skipped for the same reason and is still open: `engine/game.ts` still emits it,
`narration/render.ts` still falls back to it (D7).
What shipped (commits `be99ef0`, `8215a45`, `5f2d777`, `fed411a`, `579ae51`): every event
carries a structured `narrative` (kind, channel, actor, assist, credited defender, called
play/coverage, second chance, `steeredTo`) that `src/narration/` renders into
broadcast-style play-by-play (298 template bodies, no-repeat window 5), game-flow beats
(runs, lead changes, quarter cards, identity lines), crunch time (Q4/OT closing fives,
1x-snap + "Crunchtime!" pop-up, 23% of games enter it), and a full box score (REB off/
def, STL, BLK, FG/3P/FT, +/-, season totals) with a completion Summary (player of the
game, two data-backed hints, never OVR). Attribution rolls on a derived rng so the sim
stream is untouched. Verified: 333/333 tests, tsc/lint/`check:styles` clean, `npm run
balance -- 500 --seed 42` before/after unchanged; screenshots via `theater-shot.ts`,
in-app fixture `/theater-preview?seed=13&poss=203&tab=playByPlay&pop=1`.
Gotchas: any rng-order change needs a `BALANCE_VERSION` bump; the phone-landscape header
takes most of the 385px screen — next mobile item is compacting it.

## challenge_mode — built 2026-09-17, awaiting owner sign-off

Plan: `docs/plans/plan_challenge_mode_2026-09-17.md` (T1-T9 done). The 82:0 Challenge is a
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

Before this closes the owner should do a full playthrough per draft style (start page -> draft
-> deck builder -> first spin -> front office + trade -> second spin -> results, reloading at
each phase). `/challenge/preview?at=6|28|79` and `/challenge/preview-results[?trade=0]` render
the screens against the signed boards with no auth, storage or simulation.

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

What to do next is `docs/ROADMAP.md`. `challenge_mode` is built but NOT closed — it needs the
owner's live sign-off first (see its section above), then `git mv` the plan to `docs/completed/`
and update the roadmap tables. After that `draft_ai` is next up, with
`card_balance_thresholds` behind it.
Owner actions outside the repo:
Supabase dashboard Authentication → Sessions refresh-token/inactivity timeout >= 90 days;
Vercel image-optimization quota is the first place to look if headshots ever break. The
2026-09-12 code review that produced Phases 0-1 is archived as
`docs/completed/review_code_and_architecture_2026-09-12.md`; the list below predates it.

1. **Stale analytics findings** (PPP 1.29, ~0.8% turnovers, uneven activation) were
   measured against the retired engine; PPP is ≈1.05 and turnovers 13.9% now. Re-run
   `npm run analyze` before treating `docs/analytics/*` as current.
2. **Cube draft duplicate bug — likely already resolved, unverified.** One early session
   log showed 113/264 unique cards; `game.db` now has 448 players (needs ≥264 for a
   duplicate-free cube) and every later session shows 264/264 unique. Worth a targeted
   test rather than assuming fixed.
3. **AI draft strength gap.** Up to 11.1 OVR difference between the best- and worst-drafting
   bot; tuning would go in `scoreCardForBot` (`engine/draft.ts` — the old `draftEngine.ts`
   pointer here was stale). `draft_ai` is the plan that owns this.
4. **82:0 trade -> deck-builder hand-off is verified by code only** (pack reveal
   animation frames stalled a headless verification pass) — confirm with one click-through.
5. **"Enter a seed" is still disabled** on the start page's challenge picker. `parseSeed`
   (`components/challenge/Results.tsx`) is the missing half and already round-trips across
   the full 32-bit range; wiring the input belongs to `mode_picker` (roadmap #10).
6. **`mobile-audit` deck-builder step flakes when several touch projects run in one
   invocation** (the three projects share one fixture roster; the "Edit Roster" click
   sometimes fails `toHaveURL(/roster/)` on the second project). Always `--workers=1`,
   and rerun a single project if it hits; never seen on a solo run.
7. **`game.test.ts` minutes floor** — the 200-game fixture was unseeded (the 2026-09-15
   flake); seeded 2026-09-16, so CI is deterministic. The underlying edge remains: a
   starter with a low share (small OVR gap, low MPG, age 35+) can legitimately land under
   18 minutes on some seeds; if it reappears, lower the floor rather than reseed.
8. **engine_possession_model follow-ups, still open post-card_balance** — owner accepted
   the measured state on 2026-09-16: talent share 21.9% per game / 49.3% per season
   (`EFFICIENCY_SCALE` 0.12-0.15 pulls it back if seasons feel solved) and the lever order
   (perimeter shooting 1.98 just under perimeter defence 2.12; `EDGE_WEIGHT.three.off`
   1.15 flips it). Unexplained: the player-level on-floor regression gives finishing a
   negative marginal in the 41-55 OVR band while the roster-level `--levers` A/B makes
   finishing the top lever; look with a larger bootstrap before retuning ratings.
9. **Shipping gate — already crossed.** `main` was pushed to `origin/main` on 2026-09-17
   (commit `7c89111`) before `card_balance` had fully landed — the 2026-09-16 gate ("wait
   for card_balance to land before any push") did not hold. Nothing to revert;
   `card_balance` closed 2026-09-17 with `card_balance_thresholds` split out, blocked on
   `draft_ai`.
10. **Bot roster with an empty position plays four on five.** `buildBotRoster` can produce a
   depth chart with no eligible player for a slot (seed 424242 in `boxscore.test.ts`, game 3:
   PG 5, SG 5, SF 1, PF 1, C 0) and the engine then draws four players for that team every
   possession. `engine/challenge.ts` works around it for NBA opponents by backfilling the
   empty column; the general fix belongs in `engine/deckbuilder.ts` — `draft_ai` territory.
11. **Jahmai Mashack's headshot — RESOLVED 2026-09-17.** He is absent from the bundled
   `nba_api` static list (so the resolver could never match him) but present in the LIVE
   player index as 1642942; the real photo is fetched and saved under his hash id. His card
   id stays a hash until `fetch_players.py` is re-run against the live index. Future gaps are
   covered by `scripts/ensure-headshots.mjs`, which `build:cards` runs.

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
