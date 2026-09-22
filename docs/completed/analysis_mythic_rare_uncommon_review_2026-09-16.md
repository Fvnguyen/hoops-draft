# Analysis: Mythic/Rare/Uncommon eyeball pass

File: `docs/completed/analysis_mythic_rare_uncommon_review_2026-09-16.md`. Not a locked plan —
a findings doc referenced by `plan_card_balance_2026-09-13.md`'s "Real-data findings"
section, requested by the owner as a manual pass over the top three rarity tiers after
T1 (positions). Internal/analysis use only.

## Method

`npm run player-bootstrap -- 150 --seed 42 --json` on the post-T1 pool (position
crossover blend included), 4,200 games, 150 cards/rarity-mix random rosters, same method
as `analysis_player_win_shares_bootstrap_2026-09-16.md`. z-score of each Mythic/Rare/
Uncommon card's `winSharesPerGame` against its own rarity tier's mean/sd (n=24/20/70).
114 cards reviewed (24 Mythic, 20 Rare, 70 Uncommon — this run's rarity split, pre-T2
retune). Dump: `data/game_logs/player_bootstrap_2026-09-16T19-23-46-485Z.json`.

## Most overrated for their rarity (bottom 20 by z, need a down-tune)

Desmond Bane (Uncommon 74, z −2.62), Brandin Podziemski (Uncommon 66, −2.24), **Jalen
Duren (Mythic 90, −2.18)**, Devin Booker (Uncommon 74, −1.76), **Donovan Mitchell
(Mythic 93, −1.68)**, Tyler Herro (Uncommon 72, −1.56), Day'Ron Sharpe (Uncommon 67,
−1.56), Rudy Gobert (Mythic 90, −1.45, `LEGENDARY_PLAYERS`), Ryan Kalkbrenner (Uncommon
67, −1.40), Jimmy Butler (Rare 79, −1.38, `LEGENDARY_PLAYERS`), Matas Buzelis (Uncommon
65, −1.29), Grayson Allen (Uncommon 70, −1.27), Ayo Dosunmu (Uncommon 67, −1.24), Derik
Queen (Uncommon 69, −1.22), Kawhi Leonard (Mythic 90, −1.21, `LEGENDARY_PLAYERS`), Paul
Reed (Uncommon 70, PF/C, −1.17), Immanuel Quickley (Rare 81, −1.15), VJ Edgecombe
(Uncommon 68, −1.11), Bam Adebayo (Rare 82, PF/C, −1.09), Derrick White (Rare 82, −1.07).

Pattern: almost every name here is a shot-volume/scoring guard (Bane, Podziemski,
Booker, Mitchell, Herro, Quickley) or a rim-only big with no complementary skill
(Duren, Sharpe, Kalkbrenner) — the same over-credited-scoring-volume finding as the
2026-09-16 bootstrap doc, now visible inside individual rarity tiers, not just pool-wide.
**Two Mythics (Duren, Mitchell) are the biggest misses in the entire top tier** — a Mythic
card should be a lock to outperform its rarity peers, not sit 1.7–2.2 sd below them.

## Most underrated for their rarity (top 20 by z, promotion candidates)

**Josh Hart (Uncommon 79, SG/SF, z +2.40)** — the single best-performing card in the
whole review, two full rarity tiers under where it plays. Jalen Johnson (Mythic 96,
+2.31 — correctly Mythic, the tier's best performer). Cooper Flagg (Uncommon 74, +1.89).
Jalen Williams (Uncommon 69, SG/SF, +1.73). Jaylen Brown (Rare 81, SG/SF, +1.72). Ivica
Zubac (Uncommon 72, +1.69). Darius Garland (Uncommon 75, +1.69). Karl-Anthony Towns
(Rare 83, PF/C, +1.68). Anthony Davis (Mythic 89, PF/C, +1.67 — correctly Mythic and the
strongest `LEGENDARY_PLAYERS` entry). Stephon Castle (Rare 81, +1.57). Julius Randle
(Uncommon 67, PF/C, +1.45). Jrue Holiday, Josh Giddey, Davion Mitchell, Mikal Bridges,
Onyeka Okongwu, Moussa Diabaté, Tre Jones, James Harden, Deandre Ayton round out the 20.

**Josh Hart and Cooper Flagg are the clearest single-card promotion cases** — Uncommon
today, performing like a Rare or better, on the opposite side of the same volume-scoring
bias: connective, efficient, two-way players the current formula under-credits.

## Multipositional cards (28 of 114, 24.6%)

All from the T1 crossover blend (`SG/SF` or `PF/C`); no `PG/SG` or `SF/PF` cards
appear at Mythic/Rare/Uncommon this pass (matches the pipeline note that those crossovers
need a two-hop bridge this design doesn't build). Skewed toward bigs: 20 `PF/C` vs. 8
`SG/SF`, even though the full-pool crossover counts are close (56 vs. 53) — stretch bigs
cluster higher in OVR than combo guards do.

**Best-performing multipositional cards** (true "gold," rarity matches measured impact):
Josh Hart (SG/SF Uncommon, z +2.40 — see above), Anthony Davis (PF/C Mythic, +1.67),
Jaylen Brown (SG/SF Rare, +1.72), Karl-Anthony Towns (PF/C Rare, +1.68), Jalen Williams
(SG/SF Uncommon, +1.73), Victor Wembanyama (PF/C Mythic 99, +0.40 — the pool's only
99 OVR alongside Jokić, correctly elite AND correctly multipositional), Joel Embiid
(PF/C Mythic, +0.39), Evan Mobley (PF/C Mythic, +0.62).

**Weakest multipositional cards**: Bam Adebayo (PF/C Rare, −1.09), Paul Reed (PF/C
Uncommon, −1.17) — both already flagged above under scoring-volume bias, not a
multiposition-specific problem.

## `LEGENDARY_PLAYERS` (hardcoded rarity/OVR bump list) sanity check

**6 of 18 names aren't even in this season's 448-card pool** (retired or filtered out
by the ≥20 GP / ≥5.0 MPG cut): Chris Paul, Damian Lillard, Kyrie Irving, Bradley Beal.
Dead weight in the constant — harmless today (a name not found is presumably a no-op)
but worth pruning in T2 so the list only ever matches real season data.

Of the 14 who are in the pool, the bump is **backwards for three of them**: Rudy Gobert
(z −1.45, the single worst-performing legendary), Jimmy Butler (−1.38), Kawhi Leonard
(−1.21) all get a rarity/OVR boost from reputation while measurably underperforming
their tier. Meanwhile Anthony Davis (+1.67) and Jalen Johnson — not on the list at all —
are the actual standouts this engine rewards. `LEGENDARY_PLAYERS` reads as a
reputation list frozen before the possession-events engine existed; T2 should either
retire it or re-derive it from measured performance instead of name recognition.

## Recommendations for T2

1. Prune `LEGENDARY_PLAYERS` to players actually in the pool, and reconsider whether a
   reputation-based bump belongs in the engine at all now that the bootstrap can measure
   real impact directly — Gobert/Butler/Kawhi are getting rewarded for the wrong reason.
2. Down-tune shot-volume/scoring profiles at Uncommon+ (Bane, Podziemski, Booker,
   Mitchell, Herro, Quickley, Duren, Sharpe) — the same "shot-creation over-credited"
   finding from the pool-wide bootstrap, concentrated enough here to be individually
   actionable rather than a formula-wide reweight alone.
3. Promote Josh Hart and Cooper Flagg specifically — both are two-tier outliers, not
   marginal cases; if T2's retune doesn't move them on its own, treat as a targeted check.
4. Multiposition eligibility (T1 follow-up) reads correctly: every multipositional card
   in this tier list is either a real stretch big or a real combo wing, and the
   strongest ones (Wembanyama, Davis, Towns, Brown, Williams, Hart) are both good cards
   and legitimately versatile — no adjustment needed there, only on the rating formula.
