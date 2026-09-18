# Plan: draft_ai

File: `docs/plans/plan_draft_ai_2026-09-13.md`. Status: in progress (T1-T3, T5, T6 done;
T4 D8 tuning explicitly parked by owner 2026-09-17 — revisit only if real drafting feels
broken, not against the D8 numbers in the abstract).
Sequence: 3 in `docs/ROADMAP.md`. Depends on: none (`scripts/archetype-feasibility.ts`
already exists and covers the feasibility/AB reporting this plan used to wait on).
Files owned: `frontend/src/engine/draft.ts`, `engine/deckbuilder.ts` (`buildBotRoster`
coverage fallback), `engine/game.ts` (`buildTeamInfo` OOP penalty), `engine/types.ts`
(`BotProfile`), `engine/balance.ts` (draft section), `hooks/useDraftEngine.ts`,
`scripts/archetype-feasibility.ts`, `components/DraftRoom.tsx` (pack play card only),
`tests/unit/draft*.test.ts`.

## Goal

Bots value cards by PER and a random favoured badge, so identities are uncontested: a
human who chases one colour gets it, and no two drafts feel different. After this plan
every bot chases a plan from the same catalog the human sees, drafts for raw value
early and shifts toward roster depth and plan/synergy achievement as picks go on (D2b),
with a per-bot noise factor so bots don't all read synergies perfectly (D3b) — and
reaches Online identities at a rate close to a focused human. Drafting becomes reading
the table, not stacking numbers.

## Decisions (locked)

- D1 `BotProfile` gets `targetArchetypeId` (drawn from the 16-plan catalog with the draft
  rng at draft start; at most 2 bots per plan, at least 2 bots on a defensive-side or gold
  plan), `secondaryArchetypeId` (a plan sharing a colour with the target), and
  `synergyAwareness` (D3b). Drop `favoredTrait`.
- D2 Base value + bomb pull (merges old D2 + D6 hate-draft into one always-on mechanic,
  uncapped by the pick curve): `baseValue = ratings.overall x rarity multiplier` {Common
  1.0, Uncommon 1.05, Rare 1.12, Mythic 1.2}, replacing `per * 10`. Each pick, if the
  pack's top `baseValue` leads the second-best by >= `BOMB_GAP_THRESHOLD` (`balance.ts`,
  a clean starter vs. a fringe guy), add `BOMB_PULL_MULT * (gap - BOMB_GAP_THRESHOLD)` to
  the leader — never scaled by `planWeight`, so a big enough talent gap always wins.
- D2b Pick curve: D3-D5 below are scaled by `planWeight(pickNum)`, ramping linearly 0->1
  across the *entire* draft (`(pickNum-1)/(TOTAL_DRAFT_PICKS-1)`,
  `TOTAL_DRAFT_PICKS = CUBE_PACKS * (CUBE_PLAYER_CARDS_PER_PACK + 1)` = 24 today) — value
  dominates early, plan/depth dominates late.
- D3 Plan pull: for each badge matching the bot's target plan colour, add `PLAN_PULL *
  badgeLevel * planWeight * synergyAwareness` (halved for the secondary plan).
  `PLAN_PULL` starts at 6.
- D3b Synergy awareness: each bot draws a fixed `synergyAwareness` once, uniform
  `[0.5, 1.0]` (`BOT_SYNERGY_AWARENESS_RANGE`) — scales D3's plan pull and D5's
  staffability only, never base value or positional need (misjudging synergy, not raw
  quality or an empty roster slot).
- D4 Positional need: target 2 per depth-chart column (PG/SG/SF/PF/C, not a coarser
  G/F/C bucket — that let a bot stack SGs while drafting zero PGs). Short-of-target gets
  `1 + 0.15 * planWeight`, full gets `1 - 0.2 * planWeight`.
- D5 Play cards: value = rarity base x `(1 - planWeight + planWeight * staffability *
  synergyAwareness)`, staffability = share of roles the bot's drafted players could fill
  (`isEligibleForRole`). Side-matching the target plan adds `x(1 + 0.2 * planWeight)`.
- D7 Bot noise stays `BOT_NOISE_PCT = 0.15` (per-pick scatter, on top of D3b's fixed
  per-bot synergy blind spot).
- D8 Targets (aspirational, NOT a blocking exit criterion — T4 parked 2026-09-17): bots
  reach Online in 25-35% of drafts (now 7-16%; one 2026-09-17 tuning pass only reached
  3-19%), Dedicated 8-15%, roster quality gap <= 6. Revisit only on a real reported
  drafting problem — badges overlap broadly enough across the pool that a modest
  additive plan-pull doesn't concentrate a roster much; closing this needs a real
  iteration session against `npm run feasibility`, not a one-shot constant bump.
- D9 Draft UI: pack play card shows roles with badge requirements (reused `PlayCard`
  roles view, already built). No ticker change; target plan stays hidden.
- D10 `getBotPick` stays synchronous and deterministic for a given seed.
- D11 Position coverage is a hard guarantee, not a tuning target (owner 2026-09-17:
  "this should never happen"):
  - D11a From pack 3 on, before normal scoring: if any column has zero naturally-eligible
    drafted players and the pack has an eligible card for it, force-take the pack's
    highest-`rawBaseValue` such card, overriding the score-based pick.
  - D11b `buildBotRoster` belt-and-braces fallback (the draft net can still miss if no
    eligible card ever appeared): after the natural-fit pass, any still-empty column
    takes the best remaining player who fits adjacently, or failing that (an all-guard
    roster can't reach PF/C in one hop on the PG-SG-SF-PF-C chain) the single best
    remaining player of any position. Never empty.
  - D11c Off-position penalty applies identically to bots and humans: `buildTeamInfo`'s
    `OFF_POSITION_PENALTY = 0.9` flat derate, the same mechanism a human's adjacent
    placement already triggers — D11b draws it too, no free pass. Positionless
    (`effectivePosition` -> `'ALL'`) is exempt from both D11a's forcing and D11c's
    penalty; fixed a bug where `buildTeamInfo`'s natural-position check ignored
    `effectivePosition`/traits, incorrectly penalising Positionless players.

## Out of scope

Changing plan thresholds or the plan catalog (card_balance), play-role staffing logic in
`deckbuilder.ts` (untouched — only D11's position-coverage fallback lands there),
human-facing pick suggestions.

## Tasks

- T1 Types and profile assignment per D1 in `types.ts`, `draft.ts` (`createBotProfiles`,
  incl. `synergyAwareness` draw per D3b), `useDraftEngine.ts` call site; test: profile
  distribution over 500 seeds honours the caps and `synergyAwareness` lands in
  `[0.5, 1.0]`. Tier: mid.
- T2 `scoreCardForBot` v2 per D2-D5, D2b, D3b, D7 with `BOMB_GAP_THRESHOLD`,
  `BOMB_PULL_MULT`, `PLAN_PULL` and `BOT_SYNERGY_AWARENESS_RANGE` in `balance.ts`;
  tests: pick 1 score for two similar-overall cards with different plan colours is
  within noise (`planWeight` near zero), the same pair diverges by the draft's back
  third; a pack with a large `baseValue` gap picks the leader over an equal-colour
  second card even late in the draft (bomb pull beats plan pull); a low-
  `synergyAwareness` bot values plan pull/staffability less than a high one at the same
  pick; positional multiplier ordering. Tier: mid.
- T3 Feasibility script reports D8 metrics for bots and human, plus roster quality gap
  and bomb-pull trigger rate, broken out by draft third so the value-to-plan shift is
  visible. Tier: mid.
- T4 Parked (owner 2026-09-17): tuning `BOMB_GAP_THRESHOLD`, `BOMB_PULL_MULT`,
  `PLAN_PULL`, `BOT_SYNERGY_AWARENESS_RANGE`, rarity multipliers and positional factors
  to D8 using T3. Revisit only on a real reported drafting problem. Tier: top.
- T5 Pack play card roles per D9 in `DraftRoom.tsx`; screenshot. Tier: low.
- T6 Position coverage guarantee per D11 in `draft.ts` (`missingNaturalColumns`,
  `forcedPositionPick`), `deckbuilder.ts` (`buildBotRoster`'s adjacent-then-any fallback),
  `game.ts` (`buildTeamInfo`'s `isNaturalPosition`/`applyOOPPenalty`, now Positionless-
  aware); `OFF_POSITION_PENALTY` new in `balance.ts`. Tests: `buildBotRoster` never
  leaves a column empty over 100 seeded drafts; a synthetic all-guard roster still
  covers PF/C via fallback; `getBotPick` forces the pack's Centre over a higher-value
  Guard once past pack 2 with zero natural Centres, but not before; `buildTeamInfo`
  derates an off-position player, doesn't derate a natural one, and exempts Positionless.
  Tier: mid.

## Parallelization

- Wave 0 (driver, 15 min): write the `BotProfile` fields and the `scoreCardForBot`
  signature into `types.ts` / `draft.ts` as the contract.
- Wave 1 (parallel): T1 (mid), T2 (mid, may stub profile fields from the contract), T3
  (mid), T5 (low). Disjoint files apart from `draft.ts`, which T1 and T2 split by
  function (T1 owns `createBotProfiles`, T2 owns `scoreCardForBot`).
- Wave 2: T4 by the driver.

## Recommended model tier

Main driver: Opus 5 / Gemini 3 Pro (T4 and reviewing the valuation function). Agents:
Sonnet 5 / Gemini 3 Pro for T1-T3, Haiku 4.5 / Gemini 3 Flash for T5.

## Verification / exit criteria

- `npm test` green (346/346 including D11's new coverage/penalty tests); `npm run
  balance -- 500 --seed 42` and `npm run feasibility -- 100` both run clean end-to-end.
- Zero empty depth-chart columns across 100 seeded headless drafts x 8 seats (D11
  regression test) and a standalone 300-seed x 8-seat stress check.
- A full draft in the app completes with the ticker running; screenshot of a pack with
  the play card roles visible.
- D8 bands (`npm run feasibility -- 200`) are explicitly NOT an exit criterion while T4
  stays parked.
