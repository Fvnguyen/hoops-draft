# Plan: game_theater

File: `docs/plans/plan_game_theater_2026-09-13.md`. Status: planned (re-locked 2026-09-16:
box score, runs, crunch time, UI pass). Sequence: 6 in `docs/ROADMAP.md`. Depends on:
engine_possession_model (done, unmerged — develop on `claude/game-engine-card-balance-0toacl`,
shipping gate applies). Files owned: `engine/game.ts`, `engine/balance.ts` (clutch +
attribution constants), new `src/narration/`, `components/GameView.tsx`, `SeasonView.tsx`
(context prop), `engine/season.ts` (per-player totals), `app/debug`, `tests/unit/`.

## Goal

The game theater is the payoff of drafting and building; today it is one line of
template text per possession from eight small pools, unaware of the play called, the
identity on the floor, runs, lead changes or the clock. After this plan it reads like a broadcast: called plays, coverages, turnovers before the shot,
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
  play-by-play at the right possession index. Measured 2026-09-16 (400 games, seed 42):
  3.4 runs of 8-0+ per game, 4.9 lead changes, 24% of games within 5 at 2:00 of Q4 — runs
  need no momentum model; the low lead-change count is `card_balance`'s, not narration's.
- D5 Identity flavour: once per quarter, if the offense's selected identity is Online or
  better, one line references it. Never more than one identity line per quarter per team.
- D6 Playback in `GameView.tsx`: speeds 1x / 2x / 4x, pause, and a separate "End" action
  that is not a speed: it jumps straight to the final result, box score and full log,
  skipping every beat and pop-up. Auto-scroll stops when the user scrolls up; beats render
  as distinct rows (quarter summary as a card, runs as a highlighted line). The existing
  live box score stays and grows per D9.
- D7 Backward compatibility: seasons saved with `narrativeText` still play; the renderer
  falls back to the stored text when `narrative` is absent. Removed once data_storage
  re-simulates games from seeds. Note: D9/D10 add rng draws and change Q4 lineup draws,
  so seeds simulated before this plan do not replay identically — accepted, the branch
  is unmerged.
- D8 No audio, no commentator personas, no per-player catchphrases.
- D9 **Box score** (`PlayerBoxScore`), locked 2026-09-16. Traditional: minutes, points,
  rebounds (offensive + defensive, total derived), assists, steals, blocks, turnovers.
  Shooting: FGM/FGA, 3PM/3PA, FTM/FTA (percentages derived). Plus/minus from the on-court
  lists and `runningScore`, stored on the box. **Attribution only** — outcomes and balance
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
  first clutch event reaches the play-by-play during 2x or 4x playback, the speed
  **snaps to 1x** ("End" is not playback and is never interrupted), and a centred "Crunchtime!" pop-up shows for ~1.5s and fades
  (once per window entry, so Q4 and each OT; `prefers-reduced-motion` = fade only). A
  `clutch_start` beat row marks it in the log; clutch points and plus/minus in the
  summary are computed by beats from `isClutch`, not stored. No fouling, timeouts or clock
  management (no real clock; the derived 12-minute display stays and the window's "2:00"
  is computed from the same formula so pop-up and clock agree).

- D11 **UI pass** (prettier, more readable, more exciting), locked 2026-09-16. (a) Home/
  Away: one colour token per side (home warm, away cool) used everywhere — score band, log
  row chip, box tabs; header reads `AWAY @ HOME`; the user's team carries a "YOU" chip and
  its rows are tinted. `GameView` gains an optional `context` prop
  `{ userSeatId, home: { wins, losses, streak, rank }, away: {...}, headToHead? }` filled
  by `SeasonView`; absent = "Exhibition". (b) Header: team names with logos/initials,
  record + streak + rank under each, identity tier chips, live score large, quarter strip,
  derived clock, the beat ticker line. (c) Box score: sortable columns, starters above a
  divider, top value per column highlighted, DNP rows collapsed, percentages derived. (d)
  "Summary" section on completion: player of the game (both teams, pure
  `playerOfTheGame(box)` in `src/narration/summary.ts` on a fixed game-score formula),
  the user team's top and low performer (low = worst game score among players with at
  least 15 possessions), each with one data-backed hint from a rule table in
  `src/narration/hints.ts` (e.g. volume at a low FG%, high +/- off the bench = closing-five
  candidate, turnovers per touch, a rebounding hole). Hints cite box stats, badges and
  positions only — **never OVR or engine ratings** (product rule). At most 2 hints.

## Out of scope

Simulation changes beyond D10's lineup rule and D9's attribution; balance retunes
(card_balance); mobile layout (game_canvas done); badge effects.

## Tasks

- T1 Engine: `narrative` per D1 emitted alongside the existing text for one release;
  test: a fixed seed produces the same `narrative` sequence; purity test passes. Tier: mid.
- T2 Renderer per D2 and the no-repeat rule per D3; test: determinism and no repeats
  within 5. Tier: mid.
- T3 Template content per D3 and D5 as data files in `src/narration/templates/` (one per
  kind, play and coverage). Tier: low (reviewed by the driver).
- T4 Beats per D4; tests for runs, run-answered, lead changes, quarter summaries and
  clutch start on a synthetic theater. Tier: mid.
- T5 GameView playback per D6, D7 and the D10 UI (1x snap + pop-up); screenshots of a
  quarter summary, a run line and the pop-up. Tier: mid.
- T6 Remove `narrativeText` from the engine once T5 ships and D7 is verified. Tier: low.
- T7 Box score per D9: fields, derived-rng attribution, plus/minus, season totals, debug
  export, GameView columns (MIN PTS REB AST STL BLK TOV FG 3P FT +/-); `boxscore.test.ts`
  pins that a fixed seed's outcomes and `npm run balance` numbers are unchanged before/
  after. Tier: mid.
- T9 UI pass per D11 after T5: context prop from SeasonView, header, side tokens, box
  score, summary + hints with `summary.test.ts`; screenshots desktop and phone (zoom 0.7
  shells from game_canvas); ui_foundation style gate stays at 0. Tier: mid (hints: top).
- T8 Clutch rule per D10: constants, `isClutch`, closers draw; `clutch.test.ts` (window
  entry/no entry, starters on the floor 5 of 5 inside it, OT); quote `npm run balance`
  before/after (expect home win/PPP within the D5 bands of game_engine). Tier: top.

## Parallelization / model tier

Wave 0 (driver): `src/narration/types.ts` — `narrative` shape, renderer signature, template
format, `Beat` union, D9/D10 field names. Wave 1 (disjoint files): T1 + T7 + T8 (`game.ts`,
one agent, T8 first), T2, T3, T4. Wave 2: T5. Wave 3: T9, then T6. Driver Sonnet 5 /
Gemini 3 Pro; T8, the T7 balance check and the hint rules top tier; T3, T6 low; rest mid.

## Verification / exit criteria

- `npm test` green with narration, boxscore and clutch tests; purity test passes.
- `npm run balance -- 500 --seed 42` quoted before/after T7 (identical) and T8 (in band).
- Play a full game in the app: every possession renders text, play names appear on
  called possessions, at least one run and one quarter summary appear, a close game
  drops to 1x with the pop-up and shows the closing fives, the box score shows every D9
  column, the summary names a player of the game and two hints; screenshots captured.
- Load a season saved before this plan: it still plays through (D7).
