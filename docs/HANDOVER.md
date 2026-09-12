# Handover — 2026-09-12

## Current state

Magic Ball is playable end to end: draft (cube, 8 seats) -> deck builder -> single game or
7-game season -> in-app analytics export. The engine was recently reworked to a
multi-channel shot model (rim/mid/three) with channel-specific synergies and plays; that
work, plus a home page redesign ("HOOPS DRAFT" hero) and a `FranchiseDashboard` /
`TopKPIBand` / `DonutChart` set of season-summary components, is committed. Playwright
visual tests exist for the new components with win32 snapshots.

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

## Phase 0 (correctness) — done 2026-09-12

Fixed, with tests that import the real engine (`frontend/tests/unit/`):
- P0-1 defensive modifiers inverted → `defenseMods` are now deltas added to the opponent's
  offense (negative = hurts them); documented on the types in `synergies.ts`.
- P0-2 play cards never activated (id suffix) → `Play.playId` carries the effect id.
- P0-3 possession swings dropped/double-counted → single accumulator.
- P1-1 structural offense>defense edge → edges centred on `LEAGUE_AVG` in `gameEngine.ts`.
- P1-2 silent localStorage quota failures → `src/lib/storage.ts` helpers; DeckBuilder and
  SeasonView show an inline error on quota.
- P2-1 `/api/cards` ~900 queries → 3 queries + module-level memo (`clearCardCache()`).
- P2-2 minutes now scale to game length (48 min regulation + 5 per OT); turnovers are a
  real 15% share of misses and appear in the box score.
- P2-3 Fisher-Yates shuffle; possessions clamped to [85, 115] per team.
- Dead code removed; lint clean in `src/lib` and `src/hooks`; `/api/game-logs` returns 404 in production;
  `outputFileTracingRoot` set; old inline-mirror node tests deleted.

Measured with `npm run balance -- 1000` after the fixes: PPP ≈ 1.08 (was 1.29), team
score mean ≈ 114 with sd ≈ 16, ≈ 80% of scores in [90, 130], home win ≈ 50%.

Still open for Phase 2 (game improvements):
- Margins are wide (mean ≈ 18, NBA ≈ 12) and score sd ≈ 16 (NBA ≈ 12): candidates are
  `EFFICIENCY_SCALE`, the ±0.25 edge clamp, and rotation swings.
- Play card NAMES in `DraftRoom.tsx` `playsDB` don't match their EFFECTS in
  `synergies.ts` `PLAY_EFFECTS` for play-std-2 (card "Box-and-One" → effect "Iso Ball"),
  play-std-3 ("Horns" → "Zone Defense"), play-std-4 ("Full Court Press" → "Fast Break"),
  play-std-5 ("Four Out One In" → "3-Point Barrage"). The card text describes something
  other than what the play does; decide which side is right and align both.
- Synergy activation is very uneven (Young Guns ≈ 85%, Brotherhood ≈ 14%).
- Bots still value players by PER only.
- Lint: 84 errors remain in UI files (`npm run lint` in `frontend/`): 63 `no-explicit-any`
  (35 in the dev-only `app/debug/page.tsx`, the rest in TopKPIBand, GameView,
  FranchiseDashboard, test-ui) and 15 `react-hooks/static-components` (components defined
  inside render). Mechanical; do before adding CI.

## How to run everything

```bash
npm install && npm --prefix frontend install
npm run dev            # app at http://localhost:3000
npm test               # Vitest unit tests (frontend/tests/unit) against the real engine
npm run balance -- 500 # headless balance report (PPP, scores, synergy/play activation)
npm run test:e2e       # Playwright specs, needs `npm run dev` running separately
npm run analyze        # balance report from the latest data/game_logs/full_dump_*.json
npm run screenshot -- /draft draft.png --full
```

To regenerate player data: see `data/README.md` (run order: `download_bref.js` ->
`fetch_bio.py` -> `fetch_players.py` -> `download_images.py` -> `download_logos.py`, all
from `data/`).

## Open issues / next steps

A full code review with verified bugs (defensive modifiers inverted, play cards never
activating, localStorage quota risk) and the phased PWA/DB/Vercel plan is in
`docs/ROADMAP.md`. Start there. The list below predates that review.

Findings below are from `docs/analytics/analysis_report.md` and
`docs/analytics/analytics_summary.md` (auto-generated by `scripts/analyze_game_data.js`
against 5 draft sessions / 5 seasons / 35 games, curated by the user). Quoted "User Note"
lines are the user's own hypotheses, not verified conclusions.

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
   Thresholds live in `frontend/src/lib/synergies.ts` (`SYNERGIES` array).
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
| How is a player's OVR computed? | `frontend/src/lib/engine.ts` |
| How does a possession resolve? | `frontend/src/lib/gameEngine.ts` (`resolvePossession`) |
| What do synergies/plays do? | `frontend/src/lib/synergies.ts`, `docs/game_mechanics.md` |
| How is the cube built / how do bots draft? | `frontend/src/lib/draftEngine.ts`, `frontend/src/hooks/useDraftEngine.ts` |
| How do bots build a roster? | `frontend/src/lib/botDeckBuilder.ts` |
| Season scheduling/standings | `frontend/src/lib/seasonEngine.ts` |
| Data pipeline (scrape -> game.db) | `data/README.md` |
| Code review, bugs, and roadmap | `docs/ROADMAP.md` |
| Balance findings | `docs/analytics/analysis_report.md`, `docs/analytics/analytics_summary.md` |
| How to regenerate a balance report | `npm run balance` (headless) or `scripts/analyze_game_data.js` (`npm run analyze`, from app exports) |
| Screenshotting a route | `scripts/screenshot.js` (`npm run screenshot`) |
