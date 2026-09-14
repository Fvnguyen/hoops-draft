# Plan: game_engine

File: `docs/plans/plan_game_engine_2026-09-13.md`. Status: done 2026-09-14.
Sequence: 2 in `docs/ROADMAP.md`. Depends on: analytics_tooling (the `--ab` harness).
Files owned: `frontend/src/engine/game.ts` (simulation, not the narration text pools),
`engine/synergies.ts`, `engine/balance.ts` (simulation and play sections),
`engine/playbook.ts` (allocation numbers only), `engine/season.ts` (home-court
pass-through), `scripts/balance.ts` (`--ab`/`--catalog`/`--report`), `tests/unit/game*.test.ts`.

## Goal

**Quality goal.** The simulation code this plan owns must be correct and reliable: no
known bugs, no fragile or undocumented assumptions, deterministic and reproducible under
a seed. Verified by a dedicated code review (D9), not inferred from balance numbers
looking reasonable — nothing run against this plan so far has read the code for
correctness, only observed simulated outcomes.

**Design goal.** Strategic choices — identity lock, play staffing — must show up on the
scoreboard, but so must chance (opponent quality, the possession coin flip, an
empty-handed draft): this is a trading-card auto-battler, not a solved system. Plays and
identities are allowed to differ in both difficulty and power, MtG-style — checked against
measured metrics via `--catalog`/`--ab`/the draft-impact analytics (D10), unified into one
report (D11), rather than asserted from having written the tuning constants. Game design
leads; NBA-realism follows where it doesn't conflict, with `game_theater` as the pressure
valve if it ever does.

## Real-data findings (update timestamp when a newer dump lands)

**2026-09-14** — first real-user export (1 owner, 28 games, directional not confirmatory):
home win 67.9%, mean margin 19.3 — the "before" D3/D4/D5 replaced. Identity tier tracked
win rate cleanly (supports D1). `--catalog` surfaced two X-axis anomalies not this plan's
to fix, handed to `card_balance` (D2/D3): Shooting Gallery (mono) as hard to unlock as a
two-colour identity, and 4 identities that never reached Dedicated. Re-run `npm run
analyze` and `--report` (D11) after T4 lands; prefer a multi-user sample over this one.

## Decisions (locked)

- D1/D2 — done for plays; two content outliers handed to `card_balance`. Measured with
  `npm run balance -- 500 --seed 42 --catalog` (default sample raised 300->600
  games/entry — at 300 the ~2.9pp standard error hid real deltas in noise). Binding
  lever: `PLAY_BUDGET_OFFENSE` 0.30->0.40, `PLAY_BUDGET_DEFENSE` 0.25->0.35, each play's
  own `allocation` raised by rarity (Common 0.07->0.10, Uncommon 0.09->0.13, Rare
  0.10->0.15, Mythic 0.12->0.18) — `--catalog`'s isolated single-play test never staffs a
  second play, so the budget *ceiling* alone was always inert; `IDENTITY_CAPS`/
  `PLAY_SCORER_BOOST` tried and reverted, confirmed empirically inert too. Result: no
  play sits at ~0 delta anymore (all +2pp to +7.4pp). Two outliers don't scale with tier
  regardless — root cause: `NBA_BASELINE.mid` (0.42, lowest-efficiency channel) makes any
  play/identity shifting shots *into* mid-range self-sabotaging (Horns/Triangle Offense,
  Midrange Clinic/Elbow Orchestra) — handed to `card_balance`, a bigger call than this
  plan's knobs authorize alone.
- D3 — done. Overtime possessions roll for called plays and coverages exactly like
  regulation (same budgets, same rng stream, shared `playOnePossession` helper), but
  stay starters-only (`starterLineupMap`, not `drawLineup`) per owner intent — OT mimics
  real crunch-time basketball, rewarding top-heavy rosters over bench depth. Capped at 3
  periods (`MAX_OT_PERIODS`); a tie past that goes to the higher average starter OVR
  (coin flip only on an exact tie), not a random coin flip.
- D4 — done. Home court is an asymmetric coin flip on `calcPossessionSplit`'s existing
  per-team noise roll, not a flat bonus: home draws from a skewed-positive range
  (`HOME_NOISE_LO_PCT`/`HI_PCT`, tuned to -5.5%/+9% of `BASE_PACE`), away stays roughly
  centered (`AWAY_NOISE_*_PCT`, -7.5%/+7.5%) — landing **52-56%** home win both with
  identical rosters and across seeds in the general balance run.
- D5 — done. Spread is a real tuning goal (fairness, blowout/close feel, keeping
  luck/choice legible), game design first, NBA-realism secondary. Targets (1000 games):
  sd **12-13**, margin **12-14**, **>=85%** in [90,130], PPP **1.05-1.12**.
  `STRENGTH_SWING_PCT`/`EFFICIENCY_SCALE`/`MAX_EFF_SHIFT` alone couldn't reach PPP/[90,130]
  (both are zero-mean edge scalers — tighten spread, can't move the average score). Root
  cause: a rim shooting foul awarded a flat 1 point; two real FTs at `RIM_FT_PCT` (0.77)
  average ~1.54 — the actual driver of low PPP; fixing it also surfaced an and-1/assist
  bug (gated on `points >= 2`, wrongly satisfied by a 2-for-2 FT trip — now gated on
  `isCleanFieldGoal`). Result (seed 42): PPP 0.994->1.06, sd 13.3->13.1-13.5, margin
  15.4->14.4-15.5, [90,130] 79.8%->87-88%, home win steady 52-56%. Knobs:
  `STRENGTH_SWING_PCT` 0.08->0.035, `EFFICIENCY_SCALE` 0.30->0.10, `MAX_EFF_SHIFT`
  0.10->0.04.
- D6 No new mechanics: no fatigue, injuries, fouls, timeouts, or clutch modifiers. Those
  belong to a later plan if ever.
- D7 Every constant change is one commit whose body quotes before/after from the exact
  balance command, so tuning is bisectable.
- D8 Existing saved seasons keep playing; games already simulated are not re-simulated.
  Today games store their theater; after data_storage they store seed + result and a
  `balanceVersion` guards re-simulation. Coordinate with that plan; bump the version here.
- D9 Code review scope: read `game.ts`, `synergies.ts`, `playbook.ts`, `season.ts` for
  bugs, fragile assumptions, and architectural issues; `archetypes.ts`'s modifier code is
  read-only reference, not owned. A confirmed bug in an owned file is fixed here; anything
  needing `archetypes.ts`/card-content changes goes to `card_balance`; an architectural
  concern too large for this plan goes to `docs/HANDOVER.md`, not fixed here.
- D10 Draft-impact analytics: three synthetic pick strategies, distinct from the real bot
  AI in `engine/draft.ts` (draft_ai's, untouched) — best-OVR (highest `ratings.overall`),
  highest-rarity (Mythic > Rare > Uncommon > Common, OVR tiebreak), random (seeded
  uniform). Each of the 8 seats per draft gets one via `(seatIndex + draftIndex) % 3` so
  counts balance exactly, not approximately. Reports win rate/margin by strategy alone and
  by strategy x identity-tier x staffed-play-count, separating drafting, lineup-building,
  and chance.
- D11 — done. One repeatable tool: `npm run balance -- <n> --seed <s> --report` produces
  one versioned `balance_report_<timestamp>.json` (schemaVersion 2) with `catalog` (D1),
  `draftImpact` (D10), `spread`, `outcomeDecomposition` sections, folded into the Power
  Curve artifact. `outcomeDecomposition` replaced an earlier strategy-only cut (4.2%
  strategy/0.8% lineup/95.0% "unexplained") that conflated real opponent talent with
  luck: a hierarchical R² on each game's actual OVR gap now shows talent alone explains
  7.6% of a single game but 24.4% of a full 7-game season (roughly triples as noise
  averages out), with win% climbing monotonically 27%→73% across OVR-gap deciles —
  mechanics reward being better. `--ab`/`--catalog`/`--draft-impact` stay focused flags.

## Out of scope

Bot drafting mechanics/strategy (`draft_ai` owns pick logic and bot behavior; D10's three
strategies are a synthetic analysis instrument, not a product feature); card ratings or
play/plan content (`card_balance`); narration (`game_theater`); persistence shape
(`data_storage`). In scope: measuring how a drafted team's composition and draft strategy
correlate with match outcome (D10).

## Tasks

- T1 — done. OT plays/tiebreak/cap per D3; test: fixed seed, an OT game logs
  `calledPlays`. Tier: mid.
- T2 — done. Home court per D4; test: identical rosters, home wins 52-56% over 3000
  seeded games. Tier: mid.
- T3 — done. Spread tuning per D5 + the `RIM_FT_PCT` fix the diagnosis surfaced. Tier: top.
- T4 — done. Impact tuning per D1/D2; two content outliers (mid-range self-sabotage)
  handed to `card_balance`. Tier: top.
- T5 — done. `docs/game_mechanics.md` updated for D2-D5 numbers (possession noise, OT
  cap/tiebreak, rim-FT scoring, play budgets) with a link to the Power Curve report;
  HANDOVER's sprawling T-series item trimmed. Tier: low.
- T6 — done. Code review per D9 across `game.ts`/`synergies.ts`/`playbook.ts`/
  `season.ts`; fixed confirmed bugs with regression tests. Grew in scope (owner call):
  also fixed `calcPossessionShares`'s dead-code wiring (see HANDOVER) since T1/T2/T7 all
  build on the lineup mechanism it touches. Tier: top.
- T7 — done. Draft-impact harness per D10 (`--draft-impact`): strategy pickers, seat
  assignment, report by strategy x tier x staffed-play. Tier: mid.
- T8 — done. Unify per D11: `--report`, Power Curve artifact's Draft Impact section. Tier: mid.

## Parallelization

All waves done: T6 -> T1/T2/T7 -> T3/T4 -> T8 -> T5.

## Recommended model tier

Main driver: Fable 5.1 or Opus 5 / Gemini 3 Pro (T3/T4/T6 are judgment calls). Agents:
Sonnet 5 / Gemini 3 Pro for T1/T2/T7/T8, Haiku 4.5 / Gemini 3 Flash for T5.

## Verification / exit criteria

- `npm run balance -- 500 --seed 42 --report` produces a `balance_report_*.json` matching
  D11's shape (`catalog`, `draftImpact`, `spread` all present).
- Catalog section shows D1's shape: impact scales with tier, no near-zero-delta commons.
- Draft-impact section shows a real spread across the three D10 strategies (not flat).
- Spread section hits every D5 band and D4's 52-56% home win rate.
- T6's findings list exists; every confirmed bug has a fix and a regression test.
- `npm test` green including all new tests; purity test still passes.
- Play one season game in the app: box score, live box, and narration still render; no
  console errors. Power Curve artifact republished with the Draft Impact section.
