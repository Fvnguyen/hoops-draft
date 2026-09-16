# Proposal: pedigree tuning (positionless cards, legendary list, root-cause review)

File: `docs/plans/proposal_pedigree_tuning_2026-09-16.md`. Referenced by
`plan_card_balance_2026-09-13.md`. Round 1 (below) is implemented and verified; two
open questions from the owner's round-2 feedback are still awaiting an answer.

## Locked paradigms (owner, 2026-09-16)

- **Rarity is a pedigree/splashiness metric, not a performance guarantee** — a Mythic or
  Rare is allowed to underperform its win-shares peers if the underperformance *makes
  sense* (real accolades, a genuinely flashy but flawed skill set).
- **`LEGENDARY_PLAYERS` is the pedigree bump**, independent of this season's measured stats.

## A. Positionless — implemented

Owner confirmed LeBron James, Giannis Antetokounmpo, Scottie Barnes as Gold +
`Positionless`; Jokić hand-rolled to `PF/C` (no badge); Wembanyama and Draymond Green
declined. Implemented as two distinct, regeneration-safe mechanisms:

- **`POSITION_OVERRIDES`** (`data/fetch_players.py`): `Nikola Jokic → PF/C`, same pattern
  as `major_awards`. Verified: `Nikola Jokić` now carries `PF/C`.
- **`POSITIONLESS_PLAYERS`** (`engine/balance.ts`): the three names, pushes a
  `Positionless` trait (`ratings.ts`) and, separately, **actually removes the placement
  penalty** — `positions.ts`'s new `effectivePosition()` resolves a Positionless holder's
  raw position to the literal `'ALL'` string `naturalPositions` already special-cases, so
  they're *naturally* eligible at all 5 depth-chart columns (not just adjacent-with-a-
  penalty), for both human placement and bot deckbuilding. `player.position` itself is
  untouched — still their real position for display and OVR-pool weighting; only
  eligibility changes. 5 call sites updated (`deckbuilder.ts`, `depthChart.ts` callers in
  `DeckBuilder.tsx`). Verified: all 5 columns come back natural for the three names.
- **Open**: no strong additional LeBron/Giannis/Barnes-tier candidates found in the 448
  pool at that bar (initiates *and* defends across position lines) — Alperen Şengün is a
  Jokić-style "point-center" hand-roll candidate (not full Positionless), if you want
  the same C/PF treatment applied to him.

## B. `LEGENDARY_PLAYERS` — implemented

Chris Paul dropped (confirmed retired), Lillard/Irving/Beal kept (confirmed injured, not
retired) — `engine/balance.ts`, verified.

**Open**: possible pedigree additions not currently on the list, for your call: **Luka
Dončić** and **Shai Gilgeous-Alexander** (both naturally Mythic already — this would be
consistency with the AD/Giannis/Jokić pattern, not a functional change), **Klay
Thompson** (real 5x-champion pedigree, currently OVR 40 Common — a genuine "faded star"
case), **Zion Williamson** (huge draft/hype pedigree, currently Common 59 — pedigree
diverging sharply from output, exactly the paradigm's use case). Say which, if any.

## Root-cause review — confirmed correct, no action needed

Duren, LaMelo Ball, Josh Hart, Donovan Mitchell all check out as "makes sense" under the
pedigree paradigm (real stat lines pulled from `cards.json`): Duren is a real All-NBA
Third Team big with zero three-point range and only average defense for his size; LaMelo
is an elite passer with real DBPM of −0.1 and nothing else elite; Josh Hart's card has no
rating above 81 anywhere, the clean "value pick" case; Mitchell is a real All-NBA scorer
with real negative DBPM. None needs a rating fix.

## Systematic quirks — 1-3 fixed and verified, 4 is interpretation-only

1. **Awards.html scrape discarding fix** (commit `264d71c`) — see the plan doc.
2. **DBPM small-sample noise — fixed, with an honest caveat.** Tapered DBPM's weight by
   minutes played in `fetch_players.py` (`DBPM * min(1, MP/24)`), capped so 24+ MPG
   players are untouched. **Verified real**: Thybulle's raw perimeter-defense score drops
   from rank #1 to #2 of 448. **But it doesn't move his displayed rating** — the pipeline
   scales by percentile then a cubic curve, and the top of a 448-player pool is
   compressed enough that a rank change at the very top still rounds to 99 (tested a
   steeper taper too; same result, rank #3). A rating-level minutes floor/cap on top of
   this would be needed to move the visible number — a separate decision, not implemented.
3. **All-Defensive floor now targets the player's real position** (big pool →
   `postDefense`, else `perimeterDefense`) instead of whichever score is already higher.
   **Verified, 3 real changes**: Bam Adebayo now floors `postDefense` (58→90, his real
   role) instead of `perimeterDefense`; Derrick White now floors `perimeterDefense`
   (72→96, his real 1st-team All-D honor) instead of `postDefense`; OG Anunoby similarly.
4. **Badge/play confound — no code change, per your call.** This belongs to play tuning,
   not player tuning; recorded as interpretation guidance for reading future
   `player-bootstrap` badge-correlation tables, not something to fix here.

## The four levers, for future tuning sessions

- **Rarity** = pedigree signal with engineered noise, allowed to diverge from win-shares.
- **OVR** = raw power — position-weighted sum of seven ratings, clamped 40-99.
- **Win shares** (bootstrap-measured) = actual in-engine impact — grounded in gameplay
  but confounded by the play/badge-eligibility effect (quirk 4).
- **Badges** = per-skill thresholds that double as the mechanical gate for archetype
  colours and play roles — read their bootstrap correlation as skill + play-eligibility
  boost + holder-count dilution, not a pure signal.

## Verification

`npm run build:cards`, 254/254 tests, `tsc --noEmit` clean, lint unchanged. `balance --
500 --seed 42`: PPP 1.052→1.044, home win 52.4%→54.2% (both within n=500 noise).
`player-bootstrap`: corr(OVR, WS/g) 0.677→0.665 (small, expected — eligibility and
defense-rating shifts touch a handful of cards). `LINEUP_CENTRE` unchanged, within ±1.5.
