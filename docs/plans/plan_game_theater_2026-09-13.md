# Plan: game_theater

File: `docs/plans/plan_game_theater_2026-09-13.md`. Status: planned (decisions re-locked
2026-09-16 against `engine_possession_model`: box score, runs, crunch time).
Sequence: 6 in `docs/ROADMAP.md`. Depends on: engine_possession_model (done, unmerged —
develop on `claude/game-engine-card-balance-0toacl`, shipping gate applies). Files owned:
`engine/game.ts` (narration, `PossessionEvent.narrative`, box score fields, clutch lineup
rule), `engine/balance.ts` (clutch + attribution constants), new `frontend/src/narration/`
(templates, beats, renderer), `components/GameView.tsx`, `engine/season.ts` (per-player
season totals), `app/debug` export, `tests/unit/{narration*,boxscore,clutch}.test.ts`.

## Goal

The game theater is the payoff of drafting and building; today it is one line of
template text per possession picked from eight small pools, unaware of the play that was
called, the identity on the floor, runs, lead changes or the clock. After this plan the
narration reads like a broadcast: called plays, coverages, turnovers before the shot,
second chances and the creator steer are named; scoring runs and lead changes are called
out; quarters get a summary; crunch time is a moment (closing fives, playback drops to 1x,
a "Crunchtime!" pop); the box score is a real one (traditional, shooting, plus/minus) and
is logged for analytics.

## Decisions (locked)

- D1 The engine stops producing prose. `PossessionEvent.narrativeText` is replaced by a
  structured `PossessionEvent.narrative`:
  `{ kind, channel?, actorId, assistId?, defenderId?, calledPlayId?, coverageId?,
     isAnd1, isPossessionWin, isSecondChance, steeredTo?, tags: string[] }` where `kind`
  is `miss | block | turnover | steal | rim_make | rim_ft | mid_make | three_make | and1`
  (the possession-model events: a turnover happens before any shot, a steal is a turnover
  with a credited defender, `isSecondChance` marks a shot after an offensive rebound,
  `steeredTo` is the channel the creator steer moved the profile toward when the shift
  exceeded a threshold in `balance.ts`). Prose is rendered outside the engine.
- D2 Rendering lives in `src/narration/render.ts`: `renderPossession(event, ctx, pick)`
  returns a string from template pools keyed by `kind` x `channel`, with placeholders for
  actor, assist, defender, play and coverage names. `pick` is a deterministic index
  function seeded from the game seed + possession index (no `Math.random`).
- D3 Template pools: at least **6** variants per kind/channel combination, at least **3**
  play-aware variants per play in the catalog and per coverage, and a no-repeat rule: a
  variant is not reused within the last 5 possessions of the same kind. House style:
  present tense, under 110 characters, no exclamation marks except and-ones, game
  winners and the crunch-time pop.
- D4 Game-flow beats are computed by a pure `computeBeats(theater)` in
  `src/narration/beats.ts` from the events, never stored: scoring runs (**8-0 or better
  in unanswered points**; a run ends on any opponent score and emits a "run answered"
  beat), lead changes, ties, largest lead, quarter summaries (score, top scorer, shooting
  split), clutch start (D10), OT start, game winner. Beats are interleaved into the
  play-by-play at the right possession index. Measured 2026-09-16 on the possession-model
  branch (400 games, seed 42): 3.4 runs of 8-0+ and 1.3 of 10-0+ per game, 4.9 lead
  changes, largest lead 21, 24% of games within 5 at the 2:00 mark of Q4 — runs need no
  momentum model (possessions stay independent draws); the low lead-change count is a
  variance/balance matter for `card_balance`, not narration.
- D5 Identity flavour: once per quarter, if the offense's selected identity is Online or
  better, one line references it. Never more than one identity line per quarter per team.
- D6 Playback in `GameView.tsx`: speed 1x / 2x / 4x / "to end", pause, auto-scroll that
  stops when the user scrolls up, beats rendered as distinct rows (quarter summary as a
  card, runs as a highlighted line). The existing live box score stays and grows per D9.
- D7 Backward compatibility: seasons saved with `narrativeText` still play; the renderer
  falls back to the stored text when `narrative` is absent. Removed once data_storage
  re-simulates games from seeds. Note: D9/D10 add rng draws and change Q4 lineup draws,
  so seeds simulated before this plan do not replay identically — accepted, the branch
  is unmerged.
- D8 No audio, no images, no commentator personas, no per-player catchphrases.
- D9 **Box score** (`PlayerBoxScore`), locked 2026-09-16. Traditional: minutes, points,
  rebounds (offensive + defensive, total derived), assists, steals, blocks, turnovers.
  Shooting: FGM/FGA, 3PM/3PA, FTM/FTA (percentages derived in the UI). Plus/minus:
  computed from `lineupOnCourt`/`defenseOnCourt` and `runningScore`, stored on the box
  for convenience. Attribution is **attribution only** — possession outcomes and balance
  numbers are unchanged: the shooter is the scorer already drawn before the make roll
  (misses now count an attempt); a share of misses (`BLOCK_SHARE_OF_MISSES`) is labelled
  a block and credited to a defender weighted by post defence at the rim / perimeter
  defence elsewhere; a share of turnovers (`STEAL_SHARE_OF_TURNOVERS`) is a steal credited
  by perimeter defence; a miss not offensively rebounded credits a defensive rebound
  weighted by rebounding. These draws come from a **derived rng** (`createRng(seed ^
  index)`), so the sim stream is untouched by attribution. New event fields:
  `stealPlayerId`, `blockPlayerId`, `defensiveRebounderId`, `isClutch` (D10). Season
  keeps per-player totals across the human's games; `/debug` export includes the box.
- D10 **Crunch time**, locked 2026-09-16. Window = the last `CLUTCH_WINDOW_POSS` (4)
  offensive possessions per team in Q4 and in every OT period, entered only if the
  absolute margin at the window's first possession is `CLUTCH_MARGIN` (5) or less; once
  entered it lasts to the end of the period. Engine: `isClutch` on every event in the
  window; inside it both teams draw their **closing five** (depth-chart starters, share
  1.0 — bench never closes), one flag on `drawLineup`. Constants in `balance.ts`. Measured
  before: starters were on the floor 3.5 of 5 in the final 8 possessions. UI: when the
  first clutch event reaches the play-by-play, playback **snaps to 1x from any speed,
  "to end" included**, and a centred "Crunchtime!" pop-up shows for ~1.5s and fades
  (once per window entry, so Q4 and each OT; `prefers-reduced-motion` = fade only). A
  `clutch_start` beat row marks it in the log; clutch points and plus/minus in the
  summary are computed by beats from `isClutch`, not stored. No fouling, timeouts or clock
  management (no real clock; the derived 12-minute display stays and the window's "2:00"
  is computed from the same formula so pop-up and clock agree).

## Out of scope

Simulation changes beyond D10's lineup rule and D9's attribution; balance retunes
(card_balance); mobile layout (game_canvas done); badge effects.

## Tasks

- T1 Engine: `narrative` per D1 emitted alongside the existing text for one release;
  test: a fixed seed produces the same `narrative` sequence; purity test passes. Tier: mid.
- T2 Renderer per D2 and the no-repeat rule per D3; test: determinism and no repeats
  within 5. Tier: mid.
- T3 Template content per D3 and D5 as data files in `src/narration/templates/` (one file
  per kind, one per play, one per coverage). Tier: low (reviewed by the driver).
- T4 Beats per D4; tests for runs, run-answered, lead changes, quarter summaries and
  clutch start on a synthetic theater. Tier: mid.
- T5 GameView playback per D6, D7 and the D10 UI (1x snap + pop-up); screenshots of a
  quarter summary, a run line and the pop-up. Tier: mid.
- T6 Remove `narrativeText` production from the engine after T5 ships and D7 fallback is
  verified in the app. Tier: low.
- T7 Box score per D9: fields, derived-rng attribution, plus/minus, season totals, debug
  export, GameView columns (MIN PTS REB AST STL BLK TOV FG 3P FT +/-); `boxscore.test.ts`
  pins that a fixed seed's outcomes and `npm run balance` numbers are unchanged before/
  after. Tier: mid.
- T8 Clutch rule per D10: constants, `isClutch`, closers draw; `clutch.test.ts` (window
  entry/no entry, starters on the floor 5 of 5 inside it, OT); quote `npm run balance`
  before/after (expect home win/PPP within the D5 bands of game_engine). Tier: top.

## Parallelization

- Wave 0 (driver): `src/narration/types.ts` with the `narrative` shape, renderer
  signature, template format, `Beat` union, and the D9/D10 field names as contracts.
- Wave 1 (parallel, disjoint files): T1 + T7 + T8 (all `game.ts`, one agent, T8 first),
  T2 (`render.ts`), T3 (templates), T4 (`beats.ts`).
- Wave 2: T5 once T2, T4, T7, T8 exist. Wave 3: T6.

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro. T8 and the T7 balance check: top tier (they touch
the possession loop). T1, T2, T4, T5, T7: mid. T3, T6: low.

## Verification / exit criteria

- `npm test` green with narration, boxscore and clutch tests; purity test passes.
- `npm run balance -- 500 --seed 42` quoted before/after T7 (identical) and T8 (in band).
- Play a full game in the app: every possession renders text, play names appear on
  called possessions, at least one run and one quarter summary appear, a close game
  drops to 1x with the pop-up and shows the closing fives, the box score shows every D9
  column; screenshots captured.
- Load a season saved before this plan: it still plays through (D7).
