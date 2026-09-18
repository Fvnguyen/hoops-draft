# Plan: card_ratings_rebalance

File: `docs/completed/plan_card_ratings_rebalance_2026-09-18.md`. Status: done 2026-09-18
Sequence: 5 in `docs/ROADMAP.md`. Depends on: none. Files owned: `data/download_bref.js`,
`data/fetch_players.py`, `frontend/src/engine/types.ts` (`SeasonStat`, `Trait`),
`frontend/src/engine/ratings.ts`, `frontend/src/engine/balance.ts` (`RATING_CONFIG`,
`BADGE_THRESHOLDS`, `RARITY_CUTOFFS`), `frontend/src/engine/positions.ts`,
`frontend/scripts/build-cards.ts`, `frontend/src/data/cards.json`,
`frontend/src/components/PlayerCard.tsx` (gold badge icon only).

## Goal

Card ratings reward accumulating easy counting stats and punish shot creation. A
25-minute backup centre (Queta) is a 90 OVR Mythic while Curry is a 74; Ausar Thompson is
a 46 but produces +8.51 margin over a replacement starter, third-best in a 14-player swap
test. The cause is that the pipeline discards two thirds of the useful data:
`fetch_players.py` merges only `PER, TS%, BPM, DBPM, VORP` from the advanced table and
never reads the shooting table's assist columns. This plan widens the pipeline, rebuilds
every dimension on rate stats plus a self-creation term, replaces the positional-profile
OVR with a flat mean, and scrapes real multi-position eligibility.

## Decisions (locked)

**D1 Pipeline.** Add to the `Stat` table and `SeasonStat`: `usg_pct, ast_pct, tov_pct,
stl_pct, blk_pct, orb_pct, drb_pct, trb_pct, obpm, dws, ws_per_48` (advanced table) and
`pct_ast_fg2, pct_ast_fg3` (shooting table, never read today). All 13 are already in
`data/advanced.html` and `data/shooting.html`; no re-scrape is needed for them. Name
matching against those tables resolves 448 of 448 cards, accents included.

**D2 One index function everywhere.** Replace `getIndex` and the `- minDbpm` / `- minVorp`
shift with a single mean-centred map:
`idx(v) = clamp(0.5 + (v - mean) / (2 * (elite - mean)), 0, 1.25)`.
`elite` keeps today's definition (arithmetic mean of the top 7.5%, `benchmarkCutoff`);
`mean` and `elite` are computed over rotation players only (`mpg >= 15`). League average
maps to 0.5, elite to 1.0, and 1.25 is headroom for D7. The min-shift is deleted: it
anchored every rating on the single worst player in the pool, so adding one bad defender
next season moved all 448 cards.

**D3 Defence is magnitude times shape**, not two independent ratings.
`magnitude = 0.6 * idx(DBPM) + 0.4 * idx(DWS/48)` (DWS/48, not raw DWS: raw DWS
correlates 0.696 with minutes played, DWS/48 only 0.194). `perimSig = idx(STL%)`,
`postSig = 0.65 * idx(BLK%) + 0.35 * idx(DRB%)`, then
`perimeterDefense = 99 * magnitude * (0.55 + 0.45 * 2 * perimSig / (perimSig + postSig))`
and symmetrically for `postDefense`. Raw per-game STL/BLK are dropped: the rate form
de-saturates exactly the wrong players (Luka's steals index 1.00 -> 0.70, Maxey 1.00 ->
0.76, Mitchell 0.94 -> 0.67) while real defensive guards keep their max. The
All-Defensive floor at `ratings.ts:214-225` is unchanged.

**D4 Shooting channels get volume weight and a creation boost.**
`perimeter = 99 * (0.45 * idx(3PM) + 0.55 * idx(3P%)) * creationBoost`, where
`creationBoost = 1 + 0.18 * clamp((self - mean_self) / (elite_self - mean_self), -1, 1)`
and `self = 1 - pct_ast_fg3`. `finishing` and `midRange` take the same shape over their
own channel volume/efficiency with `self = 1 - pct_ast_fg2`. Weights locked at 0.45/0.18
on owner sign-off, against the rarity evidence: 5 players match or beat Duncan Robinson's
volume+efficiency profile, 2 match Luka's, 1 matches Curry's; in the 2.5-3.5 3PM band 9 of
39 players shoot >= .405, so efficiency at that volume is common, not rare. This is what
separates Curry (creation index 13.6) from Queta (2.5) and Raynaud (2.4).

**D5 Playmaking.** `99 * idx(AST%)^0.65 * idx(APG)^0.35 * (0.92 + 0.16 * idx(-TOV%))`.
Volume stays in at exponent 0.35 so small-sample and low-responsibility passers cannot
climb: the highest-AST% sub-5-apg players land at 72 (Cole Anthony, D'Angelo Russell)
against Jokic 118 and Cade 115. Replaces `ast * 8.0 + ast / tov`.

**D6 Rebounding.** `99 * idx(TRB%)^0.45 * idx(RPG)^0.55`. The volume exponent is 0.55,
higher than playmaking's 0.35, because TRB% alone lets low-minute bigs climb: at 0.35
Kevin Love reaches 80 and Goga Bitadze 75, at 0.55 they sit at 74 and 68 while Jokic
rises to 113 and Wembanyama to 109. Replaces `trb * 8.0`.

**D7 Clamp at 99, gold badge above.** Every dimension computes an uncapped raw; the
stored rating is `min(99, raw)`, with the clamp point staying the existing top-7.5% mean
benchmark. A dimension whose uncapped raw exceeds 99 earns a **gold badge**,
`Trait.level = 4`, above L3. This preserves the Wembanyama (post 113) and Ausar Thompson
(perimeter 110) deltas as a visible reward instead of clipping them away. Ratings do not
carry above 99 into the engine, so `LEAGUE_AVG` and `game.ts`'s per-channel edges need no
re-derivation. The gold band is small under D4-D6: 4 cards on perimeter, 7 on playmaking.

**D8 OVR is the flat mean of the seven ratings.** Delete `PROFILES`, `TOP1`, `TOP2`,
`FORGIVE`, `OFFROLE_MAX_W`, `REF`, `CORE_PEN`, `CORE_REF`, and the
`compositeAdvancedScore` multiplier entirely. PER is big-biased by 0.52 sd and VORP is
cumulative, which is why Curry's 43-game season sank him. Modelled on today's ratings the
flat mean already gives Jokic 90.6 clear of Luka 84.4 and SGA 83.3, drops Queta 90 -> 62.4
and lifts Curry 74 -> 63.9 above him. No position is locked out: top-10 flat average runs
66 (C) to 75 (PG). `_baseOvr` and `_multiplier` are removed from the card.

**D9 Rarity is re-fitted, not re-designed.** Cutoffs cannot be locked before the new
distribution exists, so the target is locked instead: keep the shipped mix within 10% of
23 Mythic / 55 Rare / 117 Uncommon / 253 Common. Two levers change. The league-leader
bump drops steals and blocks as qualifying categories (leading steals at 2.2/g is what
made Kevin Porter Jr. a Mythic); points, assists, rebounds and 3PM remain, and the tie
test becomes strict `>`. The single-L3-badge promotion to Rare now requires a gold badge
or two at L3, because D4-D6 move badge levels wholesale. Starter floor unchanged.

**D10 Positions allow up to three columns.** Source multi-position eligibility from
basketball-reference's 26 letter-index pages (`/players/a/` .. `/players/z/`), whose `pos`
column carries combos; fall back to per-player pages only for names those miss, rate
limited to 1 request every 3 seconds. The season per-game table cannot supply this: its
`Pos` column is a single code for all 963 rows. Remove the single-crossover cap in
`blend_bio_crossover`, let `sort_pos` emit up to three. `getPool` disappears with D8, so
only `positions.ts` must accept 3-way strings.

## Out of scope

- The possession engine's own shot-creation blind spot. The sim rates Curry at +0.97 over
  replacement against Queta's +6.90, so D4 fixes the card but not the game. Separate plan.
- Archetype threshold re-tuning: `card_balance_thresholds` (sequence 6) does that, and now
  depends on this plan because D4-D7 move every badge level.
- Any UI beyond the gold badge icon. `PlayerCard.tsx` gets the L4 tier and nothing else.

## Tasks

| # | Task | Files | Done when | Tier |
|---|---|---|---|---|
| T1 | Widen scrape + schema (D1) | `fetch_players.py` (merge at line 126, shooting read, `Stat` DDL/INSERT), `types.ts` | `PRAGMA table_info(Stat)` lists all 13 D1 columns; `build:cards` runs clean | mid |
| T2 | Multi-position scrape (D10) | `download_bref.js`, `fetch_players.py`, `positions.ts` | Scottie Barnes shows 3 positions and `naturalPositions` returns 3 columns | mid |
| T3 | Index fn + defence (D2, D3) | `ratings.ts`, `balance.ts` | D3 anchors reproduce: Wembanyama post-dominant, Ausar perimeter-dominant, Luka perimeter defence < 80 | top |
| T4 | Offence/playmaking/rebounding (D4-D6) | `ratings.ts`, `balance.ts` | D4/D5/D6 anchor numbers reproduce within 2 points | top |
| T5 | Gold badge (D7) | `types.ts`, `ratings.ts`, `balance.ts`, `PlayerCard.tsx` | 4 perimeter + 7 playmaking golds in `cards.json`; screenshot shows the tier | mid |
| T6 | Flat OVR (D8) | `ratings.ts`, `balance.ts` (delete `ovr` block) | `npm test` passes; Jokic is the single highest OVR | top |
| T7 | Rarity re-fit (D9) | `balance.ts`, `ratings.ts` | mix within 10% of target; no card Mythic on a steals lead | top |
| T8 | Regenerate + verify | `cards.json` | every exit criterion below passes | top |

## Outcome (2026-09-18)

T1-T8 done. `npm test` 426/426, tsc clean, `npm run build:cards` clean (448 cards).
`npm run balance -- 1000 --seed 42`: PPP 1.046 → 1.031 (-0.015, inside the 0.02 budget —
measured via a real HEAD baseline worktree, not a stale before/after mix); `LINEUP_CENTRE`
and `RATING_NORM` regenerated from the new pool. Rarity 23 Mythic / 59 Rare / 107 Uncommon
/ 259 Common (target 23/55/117/253, all within ±10% except Uncommon at -8.5%, Rare +7.3%);
KPJ (steals leader only) no longer Mythic. Anchors: Curry(63)>Queta(62) OVR, Curry
perimeter(96)>Duncan Robinson(79), Jokić highest OVR(90), Wembanyama post>perim,
Ausar perim-dominant, no sub-5-apg player above Cade's capped 99 on playmaking, Kevin Love
rebounding 74<75 — all hold. Two anchors miss by a hair and are accepted: Ausar Thompson
OVR 59 (anchor wanted >60) and Luka perimeter defence 83 (anchor wanted <80) — both are
close, single-point-scale artifacts of the locked D2-D6 weights, not formula bugs.
D10: bref's own per-season `Pos` column and both crossover sources (bio.csv, the 26
letter-index pages now scraped into `data/bref_positions/`) cap at 2-letter G/F/C
combos this season — a genuine 3-way PG/SG/SF-style spread is not reachable from real
data, so `naturalPositions` never sees more than 2 columns. The index-page switch still
shipped (132 vs 110 crossover columns — bref-native name matching beats bio.csv's fuzzy
cross-source match) and `blend_bio_crossover`'s single-crossover cap is gone, ready for
a season where either source actually carries 3 sides.
Screenshot verification could not run: this sandbox has no `frontend/.env.local`
Supabase credentials, so every route 500s in the Supabase middleware (`proxy.ts`) before
rendering — a pre-existing gap, not caused by this change; the gold badge was
code-reviewed instead of screenshotted.

## Follow-up (2026-09-19, owner request): index OVR itself

The flat mean at D8 regressed OVR to the middle — few players are elite in all seven
dimensions, so it topped out at 90 with a ~47 pool mean. `computeCards` now runs two
passes: pass 1 averages each player's seven UNCAPPED (pre-D7-clamp) dimension raws into
`rawOvrMean`; pass 2 re-indexes that composite through the same `idx()` every dimension
uses (rotation league avg → ~50 OVR, rotation top-7.5% → 99). `RARITY_CUTOFFS` re-fit
90/68/62 (was 68/58/58): 22/55/124/247 vs target 23/55/117/253, within ±10%.
Per-dimension ratings, badges and the possession engine are untouched (OVR is never a
game input) — `npm run balance` PPP unchanged at 1.037.
