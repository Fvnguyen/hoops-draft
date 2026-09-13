# Plan: card_balance

File: `docs/plans/plan_card_balance_2026-09-13.md`. Status: planned.
Sequence: 4 in `docs/ROADMAP.md`. Depends on: game_engine and draft_ai (so measurements
reflect the final simulation and contested drafts). Files owned: `data/fetch_players.py`,
`frontend/game.db` (regenerated), `engine/ratings.ts`, `engine/balance.ts` (rating,
badge, rarity sections), `engine/playbook.ts` (catalog entries), `engine/archetypes.ts`
(catalog names/descriptions/thresholds), `src/data/cards.json` (regenerated),
`tests/unit/ratings*.test.ts`, `docs/card_schema.md`.

## Goal

The content side of balance: who is rare, who carries which badge, which plays exist and
which plans they serve. Today positions collapse to G/F/C for most players (five of ten
rating profiles are unused), rarity is 20 Mythic / 22 Rare / 58 Uncommon / 348 Common out
of 448, some plans have no natural play, and defensive identities are much rarer than
offensive ones. After this plan the card pool supports every plan in the catalog, each
plan has plays that fit it, rarity feels like MtG (Mythics are events, Rares are the
backbone of a strategy), and positions are real.

## Decisions (locked)

- D1 Positions: `data/fetch_players.py` keeps basketball-reference `Pos` as primary and
  uses the NBA Stats bio position only as fallback. `game.db` and `cards.json` are
  regenerated. Depth-chart eligibility and the ten rating profiles then work as designed.
  Combined positions (G/F, F/C) stay as they are in bref.
- D2 Rarity distribution target on the 448-player pool: **Mythic 4-5%** (18-22),
  **Rare 12-14%** (54-63), **Uncommon 28-32%**, rest Common. Achieved by `RARITY_CUTOFFS`
  (Rare cutoff drops from 80) and the legendary/league-leader bumps, never by hand-listing
  players. Draft packs already guarantee rarity slots; pack rules are not changed here.
- D3 Badge coverage: every colour used by the plan catalog must have at least **40**
  carriers at level 1 and **12** at level 2 in the pool; achieved via `BADGE_THRESHOLDS`
  per skill, checked by a new Vitest test over `cards.json`. Defensive colours get the
  same floor as offensive ones.
- D4 Play catalog grows from 11 to **15**: add two defensive plays (a switch-everything
  scheme keyed on perimeter defence, a drop-coverage scheme keyed on rim protection) and
  two offensive plays (a post-up series keyed on interior scoring, a drive-and-kick series
  keyed on playmaking + three-point shooting). Each has 2-3 roles, fixed allocation in the
  existing 0.07-0.12 band by rarity, and a `mods` shape consistent with its side. Every
  plan in the catalog must have at least one play whose roles use only that plan's colours
  (checked by a test).
- D5 Plan catalog stays at 16 plans; names, descriptions and colour thresholds may change,
  the shape (lane, kind, tier rules) may not. Re-tune thresholds with `npm run feasibility`
  after D1-D4 to keep the draft_ai D8 bands.
- D6 The draft pool's play cards: with 15 plays, each cube still contains 24 play cards
  (one per pack); pack collation draws by rarity as today.
- D7 Product rule restated: no OVR or ratings shown to users anywhere new; `/data` stays
  dev-only.
- D8 A card set version string `CARD_SET_VERSION = '2025-26.2'` is exported from
  `engine/cards.ts` and written into `cards.json`; data_storage stamps it on drafts.
- D9 Every content change ships with regenerated `cards.json` in the same commit and the
  before/after of `npm run balance -- 500 --seed 42` and `npm run feasibility -- 200`.

## Out of scope

New seasons of player data (a data pipeline run is its own plan), card art, new badges,
mastery tiers, chemistry synergies, any UI beyond what new plays need to render (the
`PlayCard` component already renders roles generically).

## Tasks

- T1 Position fix per D1 in `data/fetch_players.py`, rerun the merge step, regenerate
  `game.db` and `cards.json`; test: at least 300 of 448 players have a PG/SG/SF/PF/C
  primary. Tier: mid (Python).
- T2 Rarity per D2 in `balance.ts` / `ratings.ts`; test asserts the distribution bands on
  `cards.json`. Tier: top.
- T3 Badge coverage per D3; test over `cards.json`. Tier: mid.
- T4 Four new plays per D4 in `playbook.ts`; plan-coverage test; `docs/game_mechanics.md`
  play table. Tier: mid.
- T5 Threshold re-tune per D5 with the feasibility script. Tier: top.
- T6 `CARD_SET_VERSION` per D8; `docs/card_schema.md` updated. Tier: low.

## Parallelization

- Wave 1 (parallel): T1 (mid, Python, owns `data/` and the regenerated db), T4 (mid,
  owns `playbook.ts`), T6 (low, owns `cards.ts` and the schema doc). T2/T3 wait for T1
  because positions change profile weights and therefore ratings.
- Wave 2 (parallel after T1): T2 (top) and T3 (mid) both edit `balance.ts` in different
  sections; T2 owns `RARITY_CUTOFFS` + `ratings.ts`, T3 owns `BADGE_THRESHOLDS`. Both run
  `npm run build:cards`; the driver resolves the regenerated `cards.json` by rebuilding
  once after both land.
- Wave 3: T5 by the driver.

## Recommended model tier

Main driver: Fable 5.1 or Opus 5 / Gemini 3 Pro (rarity and threshold decisions are
statistical judgment over the pool). Agents: Sonnet 5 / Gemini 3 Pro for T1, T3, T4;
Haiku 4.5 / Gemini 3 Flash for T6.

## Verification / exit criteria

- New Vitest tests over `cards.json` pass: position coverage, rarity bands, badge
  coverage, plan-to-play coverage.
- `npm run feasibility -- 200` still hits draft_ai D8; `npm run balance -- 1000 --seed 42
  --ab` still hits game_engine D1 and D5.
- Draft one cube in the app: new plays appear, render with roles, and can be staffed in
  the deck builder; screenshot of one new play in the play panel.
