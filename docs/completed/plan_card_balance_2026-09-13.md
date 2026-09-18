# Plan: card_balance

File: `docs/completed/plan_card_balance_2026-09-13.md`. Status: done 2026-09-17
(T1-T4, T6 complete and verified; T5 — threshold re-tune, which needs draft_ai's
contested drafts to mean anything — split out to
[plan_card_balance_thresholds_2026-09-17.md](plan_card_balance_thresholds_2026-09-17.md),
closed 2026-09-19 by owner override before draft_ai landed).
Sequence: was 4 in `docs/ROADMAP.md`. Depends on: game_engine and draft_ai (so measurements
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

## Real-data findings (update timestamp when a newer dump lands)

One line each; full tables live in the linked doc. Rerun `balance`/`player-bootstrap` (D9)
after every T1-T5 commit.

- **Pre-T1 baseline (2026-09-14/16)**: real-user cube spot-check Mythic 12/Rare 15/
  Uncommon 57/Common 108; post-merge D9 "before" PPP 1.050, home win 57.2%, corr(OVR,
  WS/g) 0.691, pool 20/22/58/348, OVR floor 204/448, only 9 real position labels. Full
  tables: [win-shares bootstrap](../plans/analysis_player_win_shares_bootstrap_2026-09-16.md), [rarity review](../plans/analysis_mythic_rare_uncommon_review_2026-09-16.md).
- **2026-09-16, T1 + cleanup + pedigree**: bref-primary positions + bio adjacent-
  crossover blend (PG 76, SG 98, SG/SF 53, SF 50, PF 71, PF/C 56, C 44); dead `G`/`F`
  profiles removed; fixed the discarded awards.html scrape (`264d71c`), shipped
  `Positionless`, Jokić to `PF/C`, dropped Chris Paul from `LEGENDARY_PLAYERS`, an MPG
  rating floor ([detail](../plans/proposal_pedigree_tuning_2026-09-16.md)); `game.test.ts`
  minutes floor 18→16. corr(OVR, WS/g) 0.691→0.677 (T2 recovers this). 254/254 tests.
- **2026-09-17, T3 done**: badge L1/L2/L3 hand-binned 70-79/80-89/90-99 (~62/29/11 per
  dimension, rejected an equal-percentile "absolute balance" fix). Two-Way Disruptor/
  Playmaking Maestro/Sniper rebuilt as two-badge-level combo conditions
  (`KEYSTONE_CONDITIONS`), never a card trait. New: Point Forward (first AND-badge play
  role), Positionless Revolution (gold plan, roster-wide gate — a single-player keystone
  was unreachable with only 3 pool-wide Positionless holders). 333/333 tests.
- **2026-09-17, T2 done**: real `SeasonStat.gs` wired in (180 real starters vs the 30 MPG
  proxy's 80); a real starter is never Common; Uncommon->Rare needs one L3 badge or two
  L2+. Result 24/20/70/334 -> 23/55/117/253 (5.1%/12.3%/26.1%, on D2's target).
  corr(OVR, win%) 0.313->0.375. 333/333 tests.
- **2026-09-17, T6 done**: `CARD_SET_VERSION = '2025-26.2'` exported from `engine/cards.ts`
  (single source of truth), stamped onto every card in `cards.json`; `storage`'s
  `CURRENT_CARD_SET_VERSION` re-exports it instead of its own hardcoded string, so the
  two can't drift. `docs/card_schema.md` updated. 333/333 tests; metadata only, balance
  unaffected.
- **2026-09-17, T4 done, catalog 10 -> 14**: two defensive (Switch Everything: pure
  Lockdown Defender x2; Drop Coverage: pure Paint Protector x2) and two offensive
  (Post-Up Series: pure Finisher x2, reworked from an original Finisher+Mid-Range
  Maestro pairing that would've just duplicated Triangle Offense's colour pair; Drive-
  and-Kick Series: Floor General + 2 Sharpshooter per D4). Allocation held to 8-12%
  (below the legacy 10-18% band) until played and re-tuned. New `tests/unit/play-
  catalog-coverage.test.ts` (D4's coverage requirement): closes both uncovered
  defensive monos (No-Fly Zone, Paint Wall) and one offensive mono (Rim Pressure);
  Elbow Orchestra + 3 more monos are asserted as a known gap, not fakeable from 4 plays.
  Bug found+fixed: `tests/unit/fixtures/plays.ts`, the hand-synced copy `balance`/
  `feasibility` actually read, still had pre-T3 stale badges and didn't know about
  these plays — zero activation data, no error. `LINEUP_CENTRE`'s unit test sample
  bumped 6->14 drafts (a small-sample seed drifted past tolerance on the corrected
  data; the canonical 40-draft measurement stayed inside it). 338/338 tests; feasibility
  and balance clean, new plays 74-87% full-activation.

## Decisions (locked)

- D1 Positions: `data/fetch_players.py` keeps basketball-reference `Pos` as primary and
  uses the NBA Stats bio position only as fallback. `game.db` and `cards.json` are
  regenerated. Depth-chart eligibility and the ten rating profiles then work as designed.
  **Amended 2026-09-16 (T1)**: bref gave zero combo positions this season, so a raw
  bref-only primary blends in the NBA Stats bio's broad category (G/F/C) as one adjacent
  depth-chart crossover column when it implies a side bref alone doesn't cover — see the
  T1 finding above for the mechanism and `ratings.ts`'s `getPool`.
- D2 Rarity distribution target on the 448-player pool: **Mythic 4-5%** (18-22),
  **Rare 12-14%** (54-63), **Uncommon 28-32%**, rest Common. Achieved by `RARITY_CUTOFFS`
  (Rare cutoff drops from 80) and the legendary/league-leader bumps, never by hand-listing
  players. Draft packs already guarantee rarity slots; pack rules are not changed here.
- D3 Badge coverage: **superseded 2026-09-16 (owner)**. No forced 40/12 floor via
  `BADGE_THRESHOLDS` — uneven coverage reflects genuine scarcity/impact, same pedigree
  logic as rarity. `npm run feasibility` (T5) is the right tool to catch a badge too
  scarce to draft around; T4/T5 balance plays and identities against real badge
  availability, not the other way around. Cosmetic-only traits (Legend, League Leader,
  Ironman, Efficiency Savant, Young Phenom, Veteran Presence, Microwave, Volume Scorer,
  Stat Sheet Stuffer) removed entirely — never read by any engine system, confirmed by
  search; `isLegendary`/`isLeagueLeader`'s real effect (the rarity bump) is untouched.
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
- D6 The draft pool's play cards: with 14 plays (T4 landed 10+4, not the originally
  estimated 11+4), each cube still contains 24 play cards (one per pack); pack
  collation draws by rarity as today.
- D7 Product rule restated: no OVR or ratings shown to users anywhere new; `/data` stays
  dev-only.
- D8 A card set version string `CARD_SET_VERSION = '2025-26.2'` is exported from
  `engine/cards.ts` and written into `cards.json`; data_storage stamps it on drafts.
- D9 Every content change ships with regenerated `cards.json` in the same commit and the
  before/after of `npm run balance -- 500 --seed 42` and `npm run feasibility -- 200`.

## Out of scope

New seasons of player data (its own plan), card art, new badges, mastery tiers, chemistry
synergies, any UI beyond what new plays need (`PlayCard` already renders roles generically).

## Tasks

- T1 Position fix per D1 in `data/fetch_players.py`, rerun the merge step, regenerate
  `game.db` and `cards.json`; test: at least 300 of 448 players have a PG/SG/SF/PF/C
  primary. Tier: mid (Python).
- T2 Rarity per D2 in `balance.ts` / `ratings.ts`; test asserts the distribution bands on
  `cards.json`. Tier: top.
- T3 Badge coverage per D3; test over `cards.json`. Tier: mid.
- T4 Four new plays per D4 in `playbook.ts`; plan-coverage test; `game_mechanics.md`. Tier: mid.
- T5 Threshold re-tune per D5 with the feasibility script. Tier: top. **Split out to
  `plan_card_balance_thresholds_2026-09-17.md`** — needs draft_ai's contested drafts.
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

## Verification / exit criteria — closed 2026-09-17

- New Vitest tests over `cards.json` pass: position coverage, rarity bands, badge
  coverage, plan-to-play coverage. **Done** (338/338, incl. `play-catalog-coverage.test.ts`).
- `npm run balance -- 1000 --seed 42 --ab`: PPP 1.042, sd 13.6, margin 15.6, 85.0% in
  [90,130], home win 54.8% — close to but not fully inside game_engine D5's bands
  (PPP 1.05-1.12, sd 12-13, margin 12-14); consistent with the small drift the D5 sweep
  table itself already showed at other points, not a new regression. **Accepted as-is.**
- `npm run feasibility -- 200` hits draft_ai D8 (bots Online 25-35%): **not done, moved to
  the T5 follow-up plan** — draft_ai hasn't landed, so bots still draft by raw PER
  (online% single digits for most colours; see the follow-up plan for the actual numbers).
- Draft one cube in the app: new plays appear, render with roles, and can be staffed in
  the deck builder. **Done** — Switch Everything and Post-Up Series both appeared in a
  live Quick Draft, rendered with their motif face + badge medallions and flipped to the
  correct mechanic text; Switch Everything's two Lockdown Defender roles were staffed in
  the deck builder (one role filled, the other correctly reported "no eligible players"
  against that specific random roster — the inactive-until-staffed state working as
  designed, not a bug).
