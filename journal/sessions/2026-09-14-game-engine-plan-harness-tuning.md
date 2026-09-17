---
session: 3a4da74f-72ab-4add-b5b5-362847f8ca32
date: 2026-09-14
window: 07:22 - 22:03 (14h41m, with a mid-session context compaction)
project: magic-ball
branch: main
scale: 28 user turns, 762 tool calls, 17 files edited, 3 commits attempted, 21 failures
commits: 453eacc, 90fcd87 (+ a later engine commit at plan close)
title: game_engine plan executed task-by-task (T1-T8) against a measurement harness
---

# game_engine plan — harness-first tuning, T1 through T8, plan closed

## What this session was

The longest and most technically dense of the three: a real-data analysis pass
on draft/game balance, a debug-export access fix shipped to prod, then the full
`game_engine` plan (docs/plans/plan_game_engine_2026-09-13.md) executed
task-by-task under the user's explicit "measure before tuning" discipline. Each
task (T1 OT plays, T2 home-court, T3 PPP/spread, T4 play/identity impact, T5
docs, T6 code review, T7 draft-impact harness, T8 unified report) was driven by
"Continue with T<n>" turns, each followed by harness verification, tests, and
doc updates before moving on. The session closed with `/roadmap done
game_engine`. One mid-session context compaction occurred; the auto-generated
summary (captured in the rendering) is treated as reliable for the covered span.

## Decisions made

**D1 — Debug export opened to all approved users, not just admins.** One-line
gate removed from `TopNav.tsx`; added a client-side "Download JSON" button
since the existing server-side export is blocked in production and wouldn't
survive Vercel's ephemeral filesystem anyway.
→ *Why:* the user has only two real users and needed their local IndexedDB
dumps to do real-data analysis; committed and pushed immediately "so the
change is deployed to prod."

**D2 — Real user dumps, not synthetic data, ground the balance analysis.**
Analysis re-run against one real dump (28-game season, one owner) the moment
it existed; findings written into both `plan_game_engine` and `plan_card_balance`
with a timestamp and an instruction to update it "if we get newer data."

**D3 — game_engine plan's Goal split into two: a Quality goal and a Design
goal.** User's own framing, challenged directly: "The balance goal is
correctly described [but] the plan goal is missing... This plan should improve
game_engine so it is working, reliable, high quality." Quality goal (no known
bugs, deterministic, verified by a dedicated code review — D9/T6) made
separate from and prior to the Design goal (measured balance).
→ *Why:* balance numbers looking reasonable doesn't establish correctness;
these needed separate verification paths.

**D4 — card-balance-shaped findings routed out of game_engine, not fixed
there.** D1's original scope (rarity/activation-rate should track impact) was
narrowed to impact-magnitude only; the activation-rate axis handed to
`card_balance` explicitly, including two concrete anomalies (Junkyard Dogs,
Triangle Offense) as evidence.
→ *Why (the user's own challenge):* "align what of [game_engine] is 'card
balancing' work and should belong to card balance plan."

**D5 — Home-court becomes an asymmetric coin-flip on possession noise, not an
additive bonus.** `NOISE_PCT` replaced with separate `HOME_NOISE_LO/HI_PCT`
and `AWAY_NOISE_LO/HI_PCT` bands (home skewed positive, away skewed negative),
tuned empirically to land in the 52-56% win-rate target across multiple seeds
and an identical-roster isolation test.
→ *Why:* user's design philosophy stated up front: "Home/Away should not be an
extra bonus, instead fold it into the possession coin flip."

**D6 — Lineup construction moves from precomputed quarter-phase rotation
blocks to a fresh per-possession weighted draw (`drawLineup`).** The old
"starter opens/closes, backup middle" choreography was removed along with
`SubstitutionEvent`/`GameTheater.substitutions` (confirmed zero UI consumers).
`PossessionEvent.segment` (default halves) added as a hook for a future
"coach mode" without committing to quarter granularity now.
→ *Why (challenged twice by the user):* "the starter blocks and tying to
quarters to me is game_theater, the engine does not have to care... challenge
this conceptually and from a game_design standpoint" — the engine-vs-theater
boundary was the deciding factor, not implementation convenience. The 5-man
vs. 5-man per-possession shape was explicitly confirmed unchanged before
implementation began.

**D7 — Root PPP shortfall traced to a hardcoded flat 1-point value for
rim-shot shooting fouls, not team-strength or efficiency knobs.** Two real
free throws at league-average 77% are worth ~1.54 points, not 1 — fixed via a
new `RIM_FT_PCT` constant, with the math derived and confirmed empirically
(0.994 → 1.06 PPP) before implementation.
→ *Why:* the user explicitly rejected blind constant-tweaking on
`NBA_BASELINE`: "Do we know for sure which levers are actually impacting the
most or drifting the most... e.g. we put rim success at 1.5 to reflect fts but
that may be the culprit" — forcing expected-value math per scoring channel
before any edit.

**D8 — And-1/assist eligibility gated on `isCleanFieldGoal`, not `points >=
2`.** A real bug surfaced while fixing D7: free-throw trips were incorrectly
eligible for and-1/assist credit under the old point-threshold check.

**D9 — Play catalog's real lever is per-play `allocation` in `playbook.ts`,
not `PLAY_BUDGET_*` or `PLAY_SCORER_BOOST`.** Confirmed empirically (bumped
scorer boost to 2.5, zero effect) before reverting those and raising
allocation values by rarity tier instead. Catalog's default sample size also
permanently raised from 300 to 600 after n=2000 confirmed some near-zero
impacts were real signal, not noise.

**D10 — OT capped at 3 periods (not 10), tie broken by average starter OVR
(not a coin flip), starters-only lineup preserved.** User's explicit correction
after the session's first OT pass: "OT should stay, intent was to mimic actual
games, so we just play starters, rewards top-heavy teams... Max OT should be 3
periods, at tie team wins on average starter OVR."

**D11 — Outcome decomposition (talent vs. home/away vs. strategy vs. luck)
folded permanently into the harness and the Power Curve report**, not treated
as a one-off answer. Built as hierarchical R² (OLS via hand-rolled Gaussian
elimination, no stats library) plus Pearson correlation, at both single-game
and season level.
→ *Why:* the user rejected the artifact's naive "95% other factors" figure as
uninterpretable and conflating knowable opponent strength with true
randomness: "This so far does not tell me enough if game_mechanics are good or
not because card balancing against broken mechanics does not make sense."
→ Result: talent (OVR gap) explains 7.6% of single-game outcome variance but
24.4% of a full 7-game season's win total — talent signal strengthens
substantially with sample size even though single games stay noise-dominated.
Win% rose monotonically by OVR-gap decile (27.3% → 72.9%), taken as evidence
the core mechanics are NOT broken.

**D12 — All of T1-T8's session-long uncommitted code changes staged and
committed as one commit at plan close**, despite the plan's own D7 rule that
"every constant change is one commit... so tuning is bisectable." Flagged by
the agent as a conflict, resolved via AskUserQuestion rather than silently
picking either option.

## What was tried and rejected

- **Getting data dumps from the Vercel-hosted production instance** — flatly
  not possible: the export route 404s in production by design, and even
  unblocked would write to Vercel's ephemeral, read-only-mostly filesystem.
  Real fix was the client-side download button (D1) instead.
- **Keeping the quarter-phase "starter opens/closes" rotation choreography
  just fed with real shares** — the agent's first proposal, rejected by the
  user for conflating engine and theater concerns; investigation then showed
  the choreography had zero UI consumers, strengthening the case to remove it
  entirely rather than preserve it.
- **Touching `NBA_BASELINE` directly to fix the PPP gap** — the user
  explicitly redirected away from this before it happened, demanding lever
  attribution first; this produced the real (different) fix (D7).
- **`STRENGTH_SWING_PCT`/`EFFICIENCY_SCALE` as levers for mean PPP** — ruled
  out analytically and empirically (PPP stayed flat at 0.994-0.998 regardless
  of their value); they control spread, not mean.
- **`PLAY_BUDGET_OFFENSE/DEFENSE` and `PLAY_SCORER_BOOST` as levers for
  single-play impact** — tried, measured to have zero effect on the isolated
  `--catalog` metric, reverted.
- **Treating n=300 catalog samples as sufficient** — a 0-impact play result
  turned out to be a real signal at n=2000, not noise; default sample size
  raised permanently rather than accepting the ambiguous smaller run.

## Build history

1. Roadmap status report; user redirects to a pre-game_engine real-data
   analysis pass instead. Dispatched an investigation subagent (data source
   confirmation), then extended `analyze.ts` with an owner-breakdown section
   and test-account exclusion.
2. Vercel dump question answered (not retrievable) → debug-export access fix
   (D1) → committed as 453eacc/90fcd87, pushed to prod.
3. Real dumps collected manually via the user's browser downloads; analysis
   re-run; findings (67.9% home-win rate, etc.) written into both plans with
   timestamps.
4. Roadmap/plan summary discussion; user's design-philosophy statement (4
   numbered points) sets constraints for the rest of the session.
5. Extended `balance.ts` with `--catalog` (per-play/identity isolated A/B
   measurement); built and published the "Power Curve" artifact (X=activation
   difficulty, Y=win-rate lift) via the artifact-design/dataviz skills,
   verified live in-browser before publishing.
6. Plan scope/goal realignment (D3, D4) via direct user review comments on the
   plan doc; three rounds of proposal → refinement → approval before rewriting.
7. T6 (code review of `game.ts`/`synergies.ts`/`playbook.ts`/`season.ts`):
   found and fixed 4 issues (and-1 clamp, OT iteration safety cap, dead
   initializer, stale docstring), logged one larger architectural finding to
   HANDOVER per D9's routing rule, ruled out two false leads by checking
   actual constants.
8. `calcPossessionShares` dead-code fix, escalated into the full drawLineup
   rewrite (D6) after two rounds of user conceptual pushback.
9. T1 (OT plays via shared `playOnePossession` helper) and T2 (home-court
   asymmetric noise, D5) implemented and tuned across multiple seeds.
10. T7 (draft-impact harness: three synthetic strategies — best-OVR,
    highest-rarity, random — round-robin seasons).
11. T3 (spread tuning): iterative empirical tuning of `STRENGTH_SWING_PCT`/
    `EFFICIENCY_SCALE`/`MAX_EFF_SHIFT`, hit a stuck PPP gap, user redirected to
    lever-attribution math, found and fixed the rim-FT bug (D7) and the
    and-1/assist gating bug (D8).
12. T4 (play/identity impact tuning): diagnosed D2's stated knobs as inert for
    the actual bottleneck, raised per-play allocations instead, raised catalog
    default sample size.
13. T8 (`--report` unified command + Power Curve artifact's Draft Impact
    section, verified live in-browser before publishing).
14. Mid-session context compaction; session resumed directly into interpreting
    a talent/luck decomposition the user had asked for (D11), re-verified at
    standard sample size, results reported.
15. User correction on OT/tiebreak specifics (D10); implemented, re-verified
    spread bands still in-band, decomposition folded permanently into
    `writeUnifiedReport`'s schema and the Power Curve artifact (published as
    Version 3).
16. T5 (`docs/game_mechanics.md` updated to match D2-D5 numbers, linked to the
    Power Curve report).
17. `/roadmap done game_engine`: exit-criteria verification including a live
    Playwright smoke pass (9/9) on real routes, plan moved to
    `docs/completed/`, ROADMAP/HANDOVER updated, stale links fixed, all
    session code committed as one commit (D12) after flagging the
    D7-incremental-commit conflict to the user via AskUserQuestion.

## Working-style observations

> Raw material for the profile. Dated, cited, not yet synthesized.

- **States a full design philosophy up front as a numbered list before
  execution starts**, rather than letting decisions emerge turn by turn — four
  explicit points (MtG-style variance is fine; luck must matter alongside
  choice; NBA realism is theater's job not engine's; home/away folds into the
  coin flip, not a bonus) issued in one message that then governed dozens of
  downstream implementation choices.
- **Rejects a proposal by supplying the missing category, not the fix.**
  "the starter blocks and tying to quarters to me is game_theater, the engine
  does not have to care... Also challenge this conceptually and from a game
  design standpoint. Does it feel right, offer depth without
  overcomplicating?" — asks for a conceptual defense, not just a revised
  implementation.
- **Distrusts unattributed numbers even when they're moving the right
  direction.** Refused to accept the artifact's "95% luck" figure as
  meaningful: "This so far does not tell me enough if game_mechanics are good
  or not because card balancing against broken mechanics does not make
  sense" — pushed for a decomposition that separated knowable opponent
  strength from true randomness before trusting the conclusion either way.
- **Forces root-cause attribution before permitting constant tweaks.** "Do we
  know for sure which levers are actually impacting the most or drifting the
  most... e.g. we put rim success at 1.5 to reflect fts but that may be the
  culprit" — explicitly floated the eventual right answer as a hypothesis
  rather than an instruction, then let the agent verify it independently.
- **Corrects design intent with the underlying reason attached, not just the
  new value.** "OT should stay, intent was to mimick actual games, so we just
  play starters, rewards top-heavy teams" — the number (3 periods) came with
  the design reason (rewarding top-heavy rosters) in the same sentence.
- **Comments directly against the plan document by line/quote**, using
  `mcp__ccd_view__show_pane` to open the file for review rather than
  discussing changes purely in chat — "In `docs/plans/plan_game_engine...` at
  line 12: [quote]... re-phrase goal, propose to me for approval."
- **Drives almost the entire multi-hour session with terse "Continue with
  T<n>" turns**, trusting the established harness-then-implement-then-verify
  loop to repeat correctly without re-explaining it each time.

## Open threads

- The margin/sd spread bands ran "slightly wide of the original target" at
  plan close — explicitly noted as an accepted prior tradeoff, not a new
  regression, but not fully resolved either.
- `card_balance` plan inherits two concrete content-level anomalies flagged
  during this session (Junkyard Dogs' near-zero activation rate, Triangle
  Offense's ~0 impact) plus the `NBA_BASELINE.mid` (0.42) structural
  mid-range-efficiency trap affecting Horns/Midrange Clinic/Elbow Orchestra.
- `game_theater` plan is now unblocked (game_engine's dependency satisfied)
  but not started in this session.
- The T1-T8 commit-discipline conflict with the plan's own D7 rule (incremental,
  bisectable commits) was resolved for this one plan by batching, but the
  precedent for future plans wasn't addressed.
