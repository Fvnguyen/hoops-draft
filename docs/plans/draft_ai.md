# Plan: draft_ai

Status: planned
Sequence: 3 in `docs/ROADMAP.md`. Depends on: analytics_tooling (feasibility/AB reporting).
Files owned: `frontend/src/engine/draft.ts`, `engine/types.ts` (`BotProfile`),
`engine/balance.ts` (draft section), `hooks/useDraftEngine.ts`,
`scripts/archetype-feasibility.ts`, `components/DraftRoom.tsx` (pack play card only),
`tests/unit/draft*.test.ts`.

## Goal

Bots value cards by PER and a random favoured badge, so identities are uncontested: a
human who chases one colour gets it, and no two drafts feel different. After this plan
every bot chases a plan from the same catalog the human sees, values players and plays
for how much they advance that plan, and reaches Online identities at a rate close to a
focused human. Drafting becomes reading the table, not stacking numbers.

## Decisions (locked)

- D1 `BotProfile` gets `targetArchetypeId` (drawn from the 16-plan catalog with the draft
  rng at draft start; at most 2 bots per plan, at least 2 bots on a defensive-side or gold
  plan) and `secondaryArchetypeId` (a plan sharing a colour with the target). Drop
  `favoredTrait`.
- D2 Base card value is `ratings.overall` (internal only; never shown) with a rarity
  multiplier {Common 1.0, Uncommon 1.05, Rare 1.12, Mythic 1.2}, replacing `per * 10`.
- D3 Plan pull: for each badge on the card that is a colour of the bot's target plan, add
  `PLAN_PULL * badgeLevel`; halve it for the secondary plan. `PLAN_PULL` (new,
  `balance.ts`) starts at 6 on the overall scale. Pull is zero before pick 3.
- D4 Positional need replaces the current x1.4 / x0.6 multipliers with a target shape
  4G / 4F / 2C / 2 flex for 12 picks: a card at a position still short of target gets
  x1.15, at a full position x0.8, from pick 8 onward.
- D5 Play cards: value = rarity base x staffability, where staffability is the share of the
  play's roles the bot's drafted players could fill today (`isEligibleForRole`), with a
  floor of 0.4 before pick 8 so bots still take strong plays early. Plays whose side
  matches the target plan's side get x1.2.
- D6 Hate-draft rule stays, keyed on `ratings.overall >= 85` instead of PER > 25.
- D7 Bot noise stays `BOT_NOISE_PCT = 0.15`.
- D8 Targets (`npm run feasibility -- 200`): bots reach Online in **25-35%** of drafts (now
  7-16%), Dedicated **8-15%**; a focused human drafter reaches Online **40-55%** (now
  43-71%, expected to drop because the pool is contested). Bot roster quality gap
  (best vs worst mean overall) **at most 6** (from up to 11).
- D9 Draft UI: the play card inside a pack shows its roles with badge requirements (reuse
  the `PlayCard` roles view). No change to the ticker; a bot's target plan is hidden
  information.
- D10 `getBotPick` stays synchronous and deterministic for a given seed.

## Out of scope

Changing plan thresholds or the plan catalog (card_balance), deck-builder bot roster
building (`deckbuilder.ts` already staffs roles), human-facing pick suggestions.

## Tasks

- T1 Types and profile assignment per D1 in `types.ts`, `draft.ts` (`createBotProfiles`),
  `useDraftEngine.ts` call site; test: profile distribution over 500 seeds honours the
  caps. Tier: mid.
- T2 `scoreCardForBot` v2 per D2-D7 with `PLAN_PULL` in `balance.ts`; tests: a colour
  carrier outranks an equal-overall non-carrier for a bot targeting that colour; play
  staffability ordering. Tier: mid.
- T3 Feasibility script reports D8 metrics for bots and human, plus roster quality gap.
  Tier: mid.
- T4 Tune `PLAN_PULL`, rarity multipliers and positional factors to D8 using T3; one
  commit per constant change with before/after. Tier: top.
- T5 Pack play card roles per D9 in `DraftRoom.tsx`; screenshot. Tier: low.

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

- `npm run feasibility -- 200` hits every D8 band.
- `npm run balance -- 500 --seed 42` shows the human seat, with a bot-built roster,
  winning between 45% and 55% against bots (bots are not stronger than the human's tools).
- `npm test` green; a full draft in the app completes with the ticker running; screenshot
  of a pack with the play card roles visible.
