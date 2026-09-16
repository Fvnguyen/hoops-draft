# Handover — 2026-09-15

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats, 8-card packs, pack-opening
animation on the first pack) -> deck builder (depth chart, play assignments, identity
selection) -> single game or round-robin season -> in-app analytics export. The engine is
a pure, seeded TypeScript module (`frontend/src/engine/`) with a multi-channel shot model,
archetype identities and assigned-player plays. Persistence is IndexedDB behind
`GameStore`, storing a slim per-game result (re-simulated on view from its seed) rather
than the full play-by-play; a logged-in user's data also cloud-syncs to Supabase
(`SupabaseGameStore`, accounts_cloud_saves) with optimistic-concurrency conflict handling
— see the milestones below. The UI runs on semantic tokens + `data-theme` and five
`components/ui` primitives (ui_foundation); `npm run check:styles` is a blocking CI gate
at 0 violations. On phones (coarse pointer under 1000px) the whole document renders at
CSS `zoom: 0.7` with `h-dvh-z` shells and a long-press card preview (game_canvas).
230 Vitest tests pass, type-check is clean, `npm run lint` is
0 errors / warnings-only (all `<img>`/unused-var, none blocking). GitHub Actions CI
(`.github/workflows/ci.yml`) runs tsc/lint/test/build on every push and PR. A runtime
error boundary (`app/error.tsx`/`global-error.tsx`/`ErrorRecovery.tsx`) shows a recovery
screen instead of a blank page; `smoke.spec.ts` fails on any console/page error.

Finished design docs live in `docs/completed/`; a plan being worked on stays in
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
- **accounts_cloud_saves** (done 2026-09-14, `docs/completed/plan_accounts_cloud_saves_2026-09-14.md`):
  Supabase-backed `GameStore` (`cas_upsert` optimistic-CAS RPC, `SupabaseGameStore` wraps
  `IndexedDbGameStore`), type-specific auto-merge (`storage/merge.ts`), roster conflict UI
  (`SyncConflictPrompt`), scoped `/api/analytics`+`/admin/analytics`; two real post-deploy
  bugs (dead `.catch` on a `PostgrestBuilder`, CAS-vs-deleted-row retry) found and fixed
  live against production; two-device merge/conflict paths verified live, not mocked.
- **game_engine** (done 2026-09-14, `docs/completed/plan_game_engine_2026-09-13.md`): OT/
  home-court/spread/impact tuning fixed and measured; dead-code lineup wiring fixed in
  review; draft-impact + talent-vs-luck decomposition unified into `--report`.
- **season_lifecycle_notifications** (done 2026-09-14,
  `docs/completed/plan_season_lifecycle_notifications_2026-09-14.md`): derived
  Pre-Season/Live/Completed status (`getSeasonPhase`), UI-side lock of completed
  rosters/seasons, per-roster W-L + `computeUserSeasonStats`, notification bell on
  device-local `getMeta/setMeta` (changelog + season-complete notices).
- **game-results-visibility** (merged 2026-09-14, `2cd44e5`, from branch
  `claude/game-results-visibility-season-atxivj`): `playNextGame` now runs against a cloned
  `Season` and a fresh result commits only when the user watches `GameView` to the end and
  hits "Continue to Schedule"; leaving early discards it. Covered by `tests/season.spec.ts`.

- **mobile_responsive** (superseded 2026-09-15, closed 2026-09-16): audit harness
  (`phone-landscape`/`tablet-landscape` projects, `tests/mobile-audit.spec.ts`), manifest +
  SVG icons, `OrientationGate`, auto-login audit (Supabase refresh-token setting still an
  owner action), `/rosters` lineup row; folded into `game_canvas`.

## ui_foundation — done 2026-09-15

Plan: `docs/completed/plan_ui_foundation_2026-09-15.md`. Commits `68b3096` (wave 0),
`a1228eb` (wave 1), `cd41127` (wave 2), `ce52128` (T8), `3db08d3` (owner live-review
fixes), `695d5dc` (snapshot re-baseline). What it is: `globals.css` defines semantic tokens
(surface/ink/line/accent/status) for two themes, `court` (default) and `night`, mapped
into Tailwind with `@theme inline`, so a theme is `data-theme` on `<html>` and nothing
else; five primitives in `components/ui/` (Button, IconButton, Panel, Menu, Overlay; cva +
tailwind-merge, `lib/cn.ts`); game-data colours (position/rarity/team) isolated in
`components/cardColors.ts`, the one product file allowed hex; `scripts/check-styles.mjs`
fails on raw palette classes, `text-[Npx]`, `h-screen`, `pt-[Npx]`, hex in className and
raw `<button>` — 1,358 violations on 2026-09-15 morning, 0 by evening, blocking in CI.

What changed for players: the header never reflows (loading placeholders, `AuthProvider`
status), game routes have a gear menu instead of the website bar, one fixed
`ConfirmPickDock` replaces two mismatched draft confirm buttons (100vh -> dvh is what put
it back on screen on phones), `PackPassStage` no longer remounts the card grid at the end
of a pass (the flicker), every control is >= 44px, no text below 12px, the What's New
splash is an `Overlay` capped at 90dvh, the PlayerCard back scrolls instead of clipping.

Measured: mobile audit phone 200 -> 2, tablet 201 -> 0 findings; the 2 are one layout
item (the /rosters 5-column grid squeezes a card's front body to 87x19px at 830px wide),
handed to mobile_responsive T6. Vitest 218/218; chromium e2e 20/20 green after the D11 re-baseline. `season.spec`
passes for the first time: the splash's seen-state is IndexedDB, not in `storageState`, so
every fresh context shows it — `tests/helpers/splash.ts` is the shared dismissal.

Gotchas: `Button href=` forwards data-*/aria-*; `Menu`'s `<summary>` carries `role=button`;
`sr-only` text and image crops are excluded from the audit's clipped rule.

## deckbuilder_ux — done 2026-09-15

Plan: `docs/completed/plan_deckbuilder_ux_2026-09-15.md`. Design-first: eight artboards on the
canvas "Deck Builder HUD" (https://claude.ai/artifact/Vixm9Jj2yx6xwzbHGVc22K), sources and
2x PNGs in `docs/design/deckbuilder_ux/`, all signed by the owner the same day. Commits
`9f036b3` (wave 1), `7e98612` (wave 2) + fixes. What changed: the builder's top band is
a 56px HUD (Players/Plays/Identity chips, radar peak/valley words, shot-diet mini from
1440, Clear/Save icons + one "Save & play season" primary; expanded = radar, shot diet,
identity lanes); the ACTIVE ROSTER validity row is gone; Plays and Roster are the same
collapsible sidebar (docked / 48px strip / compact drawer), tiers measured on the shell
(compact < 960, regular < 1440 with the two sidebars mutually exclusive, wide both dock);
depth chart per artboard (d) with 5/7 starter and 44px bench rows; plays are 72px tiles
(56px in lists); a click assigns a play (first open slot) or a player (highlighted
slots), through pure `engine/deckbuilder.ts` helpers the drag path shares (11 unit tests).
`tests/deckbuilder.spec.ts` covers overflow, 44px, both click flows and the exclusivity
rule at 900/1100/1440. Mobile audit: deck-builder 0 findings on both projects; phone
total 2 (the /rosters grid row, mobile T6). Chromium e2e 35/35, vitest 229/229.

Seams caught only by integration: the roster-list Add button was swallowed (handler on
a wrapper the tile never bubbled to); role avatars must be CSS backgrounds (an <img>'s
onError misses a 404 that lands before hydration); `--update-snapshots` keeps a stale
baseline that still passes the diff ratio — use `=all` to force a rewrite.

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
scroll container or translated drawer (found four real clips `scrollWidth` never saw),
rule 6 forbids page scroll on home/draft/deck builder (strict on home/draft: any region
over half the screen scrolling more than a tenth), rects divided by `currentCSSZoom`,
measurement before the full-page screenshot, textless/line-clamped boxes are art.
Touch contract: tap selects, tap again deselects, no flip on tap, no double-tap pick, no
2s auto-pick — the dock's Confirm/Take picks; long-press (450ms) opens the preview with
badge legend + front + un-rotated back (`PlayerCardBack`); cards cancel the browser
context menu on every pointer. Desktop keeps hover flip and double-click-to-pick (now in
the pack opener too). Also: pack reveal shows the static front during the flip (nested
3D contexts painted text through the backs), basic plays tap-to-slot, season schedule +
standings side by side, two-line names under 200px, headshots via `next/image` (~22 KB
WebP instead of 182 KB PNG) with the draft room preloading this and the incoming pack.
Verified: audit 0 findings on `phone-narrow`/`phone-landscape`/`tablet-landscape`
(`--workers=1`), chromium 40/40, vitest 230/230. Open: `phone_card` (roadmap #8).

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

What to do next is `docs/ROADMAP.md` (`accounts_cloud_saves`, `game_engine`,
`season_lifecycle_notifications`, `ui_foundation`, `deckbuilder_ux`, `game_canvas` are
done; `mobile_responsive` was folded into `game_canvas`). Owner actions outside the repo:
Supabase dashboard Authentication → Sessions refresh-token/inactivity timeout >= 90 days;
Vercel image-optimization quota is the first place to look if headshots ever break. The
2026-09-12 code review that produced Phases 0-1 is archived as
`docs/completed/review_code_and_architecture_2026-09-12.md`; the list below predates it.

Item 1 below is from `docs/analytics/analysis_report.md`/`analytics_summary.md` (both
banner-marked stale, generated by the retired `scripts/analyze_game_data.js`) —
`docs/analytics/report_2026-09.md` is the current tool's output but has no fresh
draft/season data yet; re-run `npm run analyze` after playing a session.

1. **Offense-too-powerful / turnover-rate / synergy-frequency findings (stale)** — PPP
   1.290, a suspected compounding per-channel edge, ~0.8% turnover rate, uneven synergy/
   play activation. All measured against the old `gameEngine.ts`/`PLAY_EFFECTS`, which no
   longer exist; PPP is now ≈1.06. Re-run `npm run analyze` before treating as current.
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
5. **`game.test.ts` minutes assertion is flaky.** Failed once on 2026-09-15 (17.5 < 18),
   passed every run since (5+). Seeded test, so likely a real edge in `game.ts` minutes
   distribution for one seed; worth pinning the failing seed before it bites CI.

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
| Where is user data stored? | `frontend/src/storage/` (GameStore: IndexedDB + Supabase via `SupabaseGameStore`) |
| Data pipeline (scrape -> game.db) | `data/README.md` |
| What to work on next | `docs/ROADMAP.md`, then `docs/plans/plan_<topic>_<date>.md` |
| Original code review (2026-09-12) | `docs/completed/review_code_and_architecture_2026-09-12.md` |
| Balance findings | `docs/analytics/analysis_report.md`, `docs/analytics/analytics_summary.md` |
| How to regenerate a balance report | `npm run balance` (headless; `--ab`/`--catalog`/`--draft-impact` flags) or `frontend/scripts/analyze.ts` (`npm run analyze`, from a `/debug` export) |
| Screenshotting a route | `scripts/screenshot.js` (`npm run screenshot`) |
