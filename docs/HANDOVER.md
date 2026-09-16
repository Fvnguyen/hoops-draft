# Handover — 2026-09-16

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats, 8-card packs, pack-opening
animation on the first pack) -> deck builder (depth chart, play assignments, identity
selection) -> single game or round-robin season -> in-app analytics export. The engine is
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
333 Vitest tests pass, type-check is clean, `npm run lint` is
0 errors / warnings-only (all `<img>`/unused-var, none blocking). GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR. A runtime
error boundary (`app/error.tsx`/`global-error.tsx`/`ErrorRecovery.tsx`) shows a recovery
screen instead of a blank page; `smoke.spec.ts` fails on any console/page error.

Finished design docs live in `docs/completed/`; a plan being worked on stays in
`docs/plans/` and moves there when its milestone lands.

## History

One line each (full write-ups live in the linked plans under `docs/completed/`):

- **Repo cleanup** (2026-09-12): nested `frontend/` repo absorbed via subtree merge; dead generator/patcher scripts and unused deps removed; AGENTS/CLAUDE/HANDOVER/ARCHITECTURE written.
- **Phase 0 correctness** (2026-09-12): inverted defensive modifiers, play activation, possession double counting, edge bias, storage quota, `/api/cards` N+1 fixed; PPP 1.29 → 1.08.
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

## game_canvas — done 2026-09-16

Owner UAT on the S26+ set the bar: the five main screens fit a phone-landscape screen
without scrolling, scaled down like Chrome does with a non-responsive page. Mechanism:
`html { zoom: var(--zoom) }`, 0.7 under `(pointer: coarse) and (max-width: 999px)`
(`globals.css`). `zoom` reflows (unlike transform) so fixed positioning, inner scroll and
hit-testing keep working with no JS; viewport units shrink with it, so every full-height
shell uses `h-dvh-z`/`min-h-dvh-z` (`100dvh / --zoom`) — one code path, desktop unchanged,
tablet stays fluid. Per screen: Home fits (lg-only 600px floor, fan shown on phones);
the pack spread and later picks are two rows of four whose grid width is derived from
the viewport height (header + ticker hidden while inert during the intro); deck builder
has no page scroll, only its columns; game/season scroll vertically by decision.
Audit (`tests/mobile-audit.spec.ts`): rule 5 flags own text outside the viewport with no
scroll container (found four real clips `scrollWidth` never saw), rule 6 forbids page
scroll on home/draft/deck builder, rects divided by `currentCSSZoom`. Touch contract:
tap selects, tap again deselects, no flip/double-tap pick, the dock's Confirm/Take picks;
long-press (450ms) opens the preview (badge legend + front + back); cards cancel the
context menu. Desktop keeps hover flip and double-click-to-pick. Also: static front
during the reveal flip, basic plays tap-to-slot, schedule + standings side by side,
headshots via `next/image` (~22 KB WebP) with the draft room preloading the next pack.
Verified: audit 0 findings on `phone-narrow`/`phone-landscape`/`tablet-landscape`
(`--workers=1`), chromium 40/40, vitest 230/230. Open: `phone_card` (roadmap #8).

## engine_possession_model — done 2026-09-16 (UNMERGED: ships with game_theater + card_balance)

Plan: `docs/completed/plan_engine_possession_model_2026-09-16.md`. **Shipping gate:** the
branch `claude/game-engine-card-balance-0toacl` is not merged to `main` (Vercel deploys
main) until `game_theater` and `card_balance`, which depend on it, land on the same branch. Commits `ff6a59a` (lineup model), `b8c233a` (in-game
centres), `0332b3a` (edge 0.20/0.08), `5b46e5e` (possession events), plus the lever tuning
commit. Owner reframing that drove it: meaningful play and NBA feel, dimensions unequally
important *by design*. What changed in the engine, all constants in `balance.ts`:
- **Lineup model** (`engine/lineup.ts`): ratings standardised to 50 ± 15 per dimension
  (`RATING_NORM`), the five on the floor aggregated per dimension by `LINEUP_AGG` (k /
  hole floor / hole cost: playmaking k=1.5 star channel, shooting + rebounding k=0.5 by
  committee, defence k=0; a hole is the average of the two lowest players below 35),
  edges centred on `LINEUP_CENTRE` measured over lineups the engine actually draws (bot
  drafts, minutes-weighted — 6-13 points above the random pool; centring on the pool made
  every edge negative and PPP fall with the edge scale). Real readings: Lakers playmaking
  79, Pistons perimeter 44 vs 57 for five 70s. Owner chose edge size 0.20 / 0.08 from a
  sweep (talent share per game 5.3% → 10.2%, season 17.5% → 29.1%).
- **Possession events** replace the pre-game possession battle: turnover before the shot
  (playmaking vs 0.3 × opponent perimeter defence, 13.9% of possessions), offensive
  rebound after a missed FG (rebounding vs rebounding, ~30% of misses, up to 2 extra
  shots), creator steer (up to 8pp of share toward the channel worth the most absolute
  expected points in this matchup), shot profile from the on-court five. Per-side
  `EDGE_WEIGHT` per channel is the deliberate size table.
- **Measured** (`npm run balance -- 5000 --seed 777 --levers`, margin per game for +10
  standardised points on one rating for a whole roster): finishing 2.66, playmaking 2.66,
  perimeter defence 2.12, perimeter 1.98, post defence 1.58, rebounding 1.38, mid-range
  0.75 (was 4.37 for perimeter defence and 1.11 for finishing at equal weights). Spread
  (500, seed 42): PPP 1.050, sd 13.1, margin 15.3, [90,130] 86.6%, home win 57.2%.
  `player_bootstrap` corr(OVR, win shares) 0.617 → 0.691. **`--report` talent share after
  tuning: 21.9% per game / 49.3% per 7-game season** — double the 10.2% / 29.1% the owner
  chose 0.20 for before the possession events existed (turnovers + rebounds + weighted
  levers add talent signal on top of the efficiency edge). Owner call whether to keep it
  or pull `EFFICIENCY_SCALE` back toward 0.12-0.15 (see open issue 6).
- **Tooling**: balance script `--eff-scale`/`--max-shift`/`--levers`, header prints measured
  lineup centres; `build-cards` prints the `RATING_NORM` block; `game.test.ts`'s 200-game
  fixture is now seeded (it was the HANDOVER #5 flake).
Gotchas: `LINEUP_CENTRE`/`RATING_NORM` are regenerated constants with drift tests (±1.5 /
±0.5); the six-lineup numbers are pinned in `lineup.test.ts`, so retuning `LINEUP_AGG`
means updating those expectations deliberately; the steer ranks channels by absolute
expected points (a relative-edge version steered into mid-range).
Next, on this branch: `game_theater` (narrate turnovers before the shot, second chances,
the steer) and `card_balance` (ratings/OVR-40 floor against this engine); then merge.
`badge_effects` later.

## game_theater — implemented 2026-09-16 (UNMERGED; owner in-app pass pending)

Plan: `docs/plans/plan_game_theater_2026-09-13.md` (stays in plans/ until the owner plays
a season game on the branch and loads an older season — the two exit criteria this
container cannot run, every route sits behind the Supabase gate). Commits `be99ef0`
(T1/T7), `8215a45` (T2-T4), `5f2d777` (T8), `fed411a` (T5/T9), then T6. What changed:
- **Engine** (`game.ts`, `balance.ts`): every event carries `narrative` (kind, channel,
  actor, assist, credited defender, called play/coverage, second chance, `steeredTo`,
  free throws, tags) and `shots`; the box score has REB off/def, STL, BLK, FG/3P/FT
  made-attempted, +/-. Attribution (blocks 10% of misses, steals 55% of turnovers,
  defensive rebounds) rolls on a per-possession rng derived from the seed, so the sim
  stream was untouched by T7 (balance byte-identical). `boxScoreThrough(theater, i)` is
  the live box; `seasonPlayerTotals(season)` sums the human rows. Crunch time (D10):
  `CLUTCH_WINDOW_POSS` 4 / `CLUTCH_MARGIN` 5, `isClutch` on events, closing fives with no
  bench even under a play call; 23% of games enter Q4 clutch (300, seed 777), starters on
  the floor inside it 5.00 (was 3.5). The engine produces no prose any more (T6);
  `narrativeText` survives only on legacy theaters. `BALANCE_VERSION` 7.
- **Narration** (`src/narration/`): `render.ts` (deterministic pools per kind x channel,
  play/coverage-aware lines, no-repeat window 5, < 110 chars), `beats.ts` (runs 8-0
  unanswered + run-answered, lead changes, ties, largest lead, quarter cards with top
  scorer + shooting split, clutch start, OT, identity lines once per quarter, game
  winner, final), `summary.ts` + `hints.ts` (player of the game, user top/low, rule
  table for roster notes — box stats/badges/positions only, never OVR), `context.ts`
  (record/streak/rank as of the game day). 298 template bodies under `templates/`.
- **UI** (`GameView.tsx`, `BoxScore.tsx`, `SeasonView.tsx`): 1x/2x/4x + pause, End =
  result now (never interrupted), 2x/4x snap to 1x at the first clutch possession with a
  fading "Crunchtime!" pop-up (`.crunch-pop`, reduced-motion fade), auto-scroll that
  pauses on scroll-up, side tokens (home warm / away cool), AWAY @ HOME header with the
  season context prop, derived per-possession clock, beat ticker, quarter strip, sortable
  box score with starters divider / column tops / DNP toggle / totals, Summary panel.
- **Verification**: vitest 333/333; tsc, lint (0 errors), `check:styles` 0, `next build`
  green. Balance 500/seed 42 after everything: PPP 1.049, sd 13.1, [90,130] 87.0%, home
  win 52.6%, margin 14.5 (the script chains games on one rng stream, so runs before/after
  an rng change are not paired; a paired rule-off/on check over seeds 42-44 put the
  clutch rule inside noise). Screenshots: `npx tsx scripts/theater-shot.ts` (static
  `GameView` render with the built CSS; `PW_CHROMIUM=/opt/pw-browsers/chromium` here) —
  crunch pop-up, feed, final box + summary, phone reviewed. In-app fixture:
  `/theater-preview?seed=13&poss=203&tab=playByPlay&pop=1` (seeds 4 (OT), 5, 13, 17 reach crunch time).
Gotchas: games re-simulate from their seed, so any rng-order change needs a
`BALANCE_VERSION` bump; the D7 text fallback only matters for `legacyTheater` saves. The
phone-landscape header takes most of the 385px screen — next mobile item is compacting it.

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

What to do next is `docs/ROADMAP.md` (`engine_possession_model` and `game_theater` are
done but unmerged; `card_balance` comes next on the same branch, then the merge;
`game_canvas`, `deckbuilder_ux`, `ui_foundation` and earlier are done). Owner actions outside the repo:
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
3. **AI draft strength gap.** Up to 11.1 OVR difference between the best- and
   worst-drafting bot; may or may not need tuning in `scoreCardForBot` (`draftEngine.ts`).
4. **`mobile-audit` deck-builder step flakes when several touch projects run in one
   invocation** (the three projects share one fixture roster; the "Edit Roster" click
   sometimes fails `toHaveURL(/roster/)` on the second project). Always `--workers=1`,
   and rerun a single project if it hits; never seen on a solo run.
5. **`game.test.ts` minutes floor** — the 200-game fixture was unseeded (the 2026-09-15
   flake); seeded 2026-09-16, so CI is deterministic. The underlying edge remains: a
   starter with a low share (small OVR gap, low MPG, age 35+) can legitimately land under
   18 minutes on some seeds; if it reappears, lower the floor rather than reseed.
6. **engine_possession_model follow-ups, revisit during card_balance** — owner accepted
   the measured state on 2026-09-16: talent share 21.9% per game / 49.3% per season
   (`EFFICIENCY_SCALE` 0.12-0.15 pulls it back if seasons feel solved) and the lever order
   (perimeter shooting 1.98 just under perimeter defence 2.12; `EDGE_WEIGHT.three.off`
   1.15 flips it). Unexplained: the player-level on-floor regression gives finishing a
   negative marginal in the 41-55 OVR band while the roster-level `--levers` A/B makes
   finishing the top lever; look with a larger bootstrap before retuning ratings.
7. **Shipping gate**: do not open a PR or merge `claude/game-engine-card-balance-0toacl`
   until game_theater (owner in-app pass) and card_balance are complete on it (owner,
   2026-09-16). game_theater's work sits on `claude/game-theater-plan-summary-k3smz3`,
   rebased on that branch — fast-forward it there.
8. **Bot roster with an empty position plays four on five.** `buildBotRoster` can produce
   a depth chart with no eligible player for a slot (seed 424242 in `boxscore.test.ts`,
   game 3: PG 5, SG 5, SF 1, PF 1, C 0) and the engine then draws four players for that
   team every possession. Fix belongs in `engine/deckbuilder.ts` (bot roster must cover
   all five slots, or the draft bot must guarantee eligibility) — `draft_ai` territory.

9. **Jahmai Mashack (MEM) has no NBA id** — not in the installed `nba_api` static list, and
   `stats.nba.com` timed out from the build container, so his card keeps a hash id and the
   CDN placeholder headshot. Re-run `fetch_players.py` (its resolver now prefers active
   players and strips Jr/II/III suffixes — fixed 2026-09-16 for Ron Holland, Robert
   Williams III, A.J. Green) with a current `nba_api` and network to pick him up.

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
