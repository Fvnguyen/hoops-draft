# Plan: game_engine

Status: planned
Sequence: 2 in `docs/ROADMAP.md`. Depends on: analytics_tooling (the `--ab` harness).
Files owned: `frontend/src/engine/game.ts` (simulation, not the narration text pools),
`engine/balance.ts` (simulation and play sections), `engine/playbook.ts` (allocation
numbers only), `engine/season.ts` (home-court pass-through), `tests/unit/game*.test.ts`.

## Goal

The strategic choices a player makes, which identity to lock and which players to assign
to which plays, must show up on the scoreboard. Today a fully staffed play adds a few
percent of win probability because its modifiers apply on 9-12% of possessions, and the
score spread is wider than the NBA's. After this plan an identity plus staffed plays is
worth a visible margin, games look like NBA games, overtime respects plays, and playing at
home matters a little.

## Decisions (locked)

- D1 Impact targets, measured with `npm run balance -- 1000 --seed 42 --ab` on the human
  seat vs the same roster stripped of identities and assignments:
  - Dedicated identity + 2 fully staffed plays: **+6 to +8 points** expected margin.
  - Online identity + 1 staffed play: **+3 to +4 points**.
  - A staffed play alone (no identity): **+1.5 to +2.5 points**, regardless of side.
- D2 How impact grows (in this order until D1 holds; stop at the first that suffices):
  1. Call rates: `PLAY_BUDGET_OFFENSE` 0.30 to 0.40, `PLAY_BUDGET_DEFENSE` 0.25 to 0.35,
     each play's `allocation` scaled proportionally by `scaledPlayAllocations`.
  2. On-call effect caps in `IDENTITY_CAPS`: `eff` 0.05 to 0.08, `share` 0.15 to 0.20.
  3. `PLAY_SCORER_BOOST` 2.0 to 2.5.
  `ARCHETYPE_ONLINE_SCALE` stays 0.7 so Dedicated keeps its premium.
- D3 Overtime possessions roll for called plays and coverages exactly like regulation
  possessions (same budgets, same rng stream). No OT-specific tuning.
- D4 Home court: yes. New constant `HOME_COURT_EFF = 0.015` in `balance.ts`, added to the
  home team's efficiency on every channel before clamping (about +2 points expected).
  `season.ts` already stores `homeSeatIndex` per matchup; `simulateGame` receives which
  side is home. Season standings show no home/away split (UI unchanged).
- D5 Spread targets (same 1000-game run, no A/B): team score sd **12-13** (now about 16),
  mean absolute margin **12-14** (now about 18), **at least 85%** of team scores in
  [90, 130], PPP stays in [1.05, 1.12], home win rate **52-56%**. Knobs, in order:
  `NOISE_PCT`, `STRENGTH_SWING_PCT`, then `MAX_EFF_SHIFT`, then `EFFICIENCY_SCALE`.
  Possession clamp stays [0.85, 1.15].
- D6 No new mechanics: no fatigue, injuries, fouls, timeouts, or clutch modifiers. Those
  belong to a later plan if ever.
- D7 Every constant change is one commit whose body quotes before/after from the exact
  balance command, so tuning is bisectable.
- D8 Existing saved seasons keep playing; games already simulated are not re-simulated.
  Today games store their theater; after data_storage they store seed + result and a
  `balanceVersion` guards re-simulation. Coordinate with that plan; bump the version here.

## Out of scope

Bot drafting (draft_ai), card ratings or play/plan content (card_balance), narration
(game_theater), persistence shape (data_storage).

## Tasks

- T1 OT plays per D3 in `game.ts`; test: with a fixed seed, an OT game logs `calledPlays`
  in OT possessions. Tier: mid.
- T2 Home court per D4 in `balance.ts`, `game.ts`, `season.ts`; test: identical rosters,
  home wins 52-56% over 2000 seeded games. Tier: mid.
- T3 Spread tuning per D5: `balance.ts` constants only; commit per D7. Tier: top.
- T4 Impact tuning per D1/D2: `balance.ts` play section and `playbook.ts` allocations;
  commit per D7. Tier: top.
- T5 `docs/game_mechanics.md` updated for D2-D5 numbers; HANDOVER "Open after this
  milestone" trimmed. Tier: low.

## Parallelization

- Wave 1 (parallel): T1 (mid) and T2 (mid). T1 owns the OT loop in `game.ts`, T2 owns a
  new `applyHomeCourt` function and the `season.ts` pass-through; agree the function name
  in a one-line contract first so the two `game.ts` edits don't overlap.
- Wave 2: T3 then T4 sequentially by the driver (both are runs of the same harness; the
  second depends on the first's constants). Not worth agents; each is a 10-minute loop.
- Wave 3: T5 (low).

## Recommended model tier

Main driver: Fable 5.1 or Opus 5 / Gemini 3 Pro (T3/T4 are judgment calls on numbers).
Agents: Sonnet 5 / Gemini 3 Pro for T1/T2, Haiku 4.5 / Gemini 3 Flash for T5.

## Verification / exit criteria

- `npm run balance -- 1000 --seed 42 --ab` hits every D1 band.
- `npm run balance -- 1000 --seed 42` hits every D5 band.
- `npm test` green including the two new tests; purity test still passes.
- Play one season game in the app: box score, live box, and narration still render;
  no console errors.
