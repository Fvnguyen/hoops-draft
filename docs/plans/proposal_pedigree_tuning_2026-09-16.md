# Proposal: pedigree tuning (positionless cards, legendary list, root-cause review)

File: `docs/plans/proposal_pedigree_tuning_2026-09-16.md`. Not a locked plan — a proposal
awaiting the owner's approval, referenced by `plan_card_balance_2026-09-13.md`. Supersedes
the position-related ask in `analysis_mythic_rare_uncommon_review_2026-09-16.md`, which was
a stats-only pass; the owner wants positional hand-edits judged by "what would feel right
to a user," not by win-shares. **Nothing in this doc is implemented yet.**

## Locked paradigms (owner, 2026-09-16)

- **Rarity is a pedigree/splashiness metric, not a performance guarantee.** Like MtG, a
  Mythic or Rare card is allowed to underperform its win-shares peers if the underperformance
  *makes sense* (real accolades, a genuinely flashy but flawed skill set) — that's a feature,
  not a bug, and lures new players who recognize the name.
- **`LEGENDARY_PLAYERS` is the pedigree bump**, a manual rarity nudge so a card matches what a
  user already expects of a famous name, independent of this season's measured stats.
- Both paradigms replace the framing in the earlier eyeball-pass doc, which read
  Gobert/Butler/Kawhi's underperformance as a problem to fix — under this paradigm it isn't;
  see "Root-cause review" below for the corrected read.

## A. Positionless/"Gold" hand-edits — proposed, awaiting approval

Judged by real-world reputation, not stats. Six candidates, all currently a single
specific position or one stats-driven crossover:

| Player | Current position | Proposed | Positionless badge | Why (reputation, not stats) |
|---|---|---|---|---|
| LeBron James | SF | SF/PF, or SF/PG/SF/PF if the engine ever supports 3+ | Yes | The namesake of "positionless basketball"; has played all 5 positions across his career. This season's data alone gives him none of that (see the earlier session's finding) — a hand-edit is the only way to represent it. |
| Giannis Antetokounmpo | PF | PF/SG or PF, Positionless-only | Yes | Brings the ball up and initiates like a guard at 6'11"; switches 1-5 defensively. |
| Nikola Jokić | C | C, Positionless-only (position string arguably fine as-is) | Yes | The "point-center" — elite live-dribble passing and ball-handling for a 5, functionally runs a lot of possessions like a guard. |
| Victor Wembanyama | PF/C (already a crossover) | Keep PF/C | Yes | Already correctly flagged by T1's stats-driven blend; the badge adds the "guards the perimeter AND protects the rim" narrative on top, which the position string alone can't carry. |
| Scottie Barnes | PF | PF/SG or SF/PF | Yes | Known as a jumbo point-forward — initiates offense, guards 1-5. Surprising that bref/bio gave him a plain PF this season with no crossover; worth checking his bio.csv row if you want the eligibility to follow, separately from the badge. |
| Draymond Green | PF | PF, Positionless-only (no position change) | Yes | The defensive Swiss-army-knife/small-ball-5 archetype; more a badge case than a position-string case since he doesn't need extra depth-chart columns to feel right. |

Recommendation: add a **`Positionless`** trait (cosmetic/narrative for now, same tier as
`Legend`) rather than only editing the position string — it's the cleaner way to say "this
card feels versatile" without touching depth-chart eligibility or the OVR profile weighting
for players whose *position*, not just their badge collection, doesn't need to change (Jokić,
Draymond). Position-string edits (LeBron, Giannis, Barnes) are separate, optional, and would
touch `engine/positions.ts` eligibility and `ratings.ts`'s `getPool` weighting — flag which
of the six you want each treatment for.

## B. `LEGENDARY_PLAYERS` update — proposed, awaiting approval

Verified via live search (2026-09-16), not assumed:

| Player | Status | Action |
|---|---|---|
| Chris Paul | **Retired** February 2026 after being waived by Toronto following a trade from the Clippers. [NBA.com](https://www.nba.com/news/chris-paul-announces-nba-retirement) | **Drop** |
| Damian Lillard | **Injured** — Achilles tear, out all of 2025-26 with Portland, targeting a 2026-27 return. [Yahoo Sports](https://sports.yahoo.com/article/blazers-damian-lillard-confirms-achilles-201757096.html) | **Keep** (fallback bump for the return season) |
| Kyrie Irving | **Injured** — ACL reconstruction, shut down for all of 2025-26 with Dallas, targeting 2026-27. [NBA.com](https://www.nba.com/mavs/news/kyrie-irving-to-miss-remainder-of-2025-26-season-as-he-continues-acl-recovery) | **Keep** |
| Bradley Beal | **Injured** — hip fracture after 6 games, season-ending surgery, re-signed with the Clippers for 2026-27. [Heavy.com](https://heavy.com/sports/nba/los-angeles-clippers/bradley-beal-injury-update/) | **Keep** |

The other 14 names are all in the pool and stay untouched under the pedigree paradigm —
including Gobert, Butler and Kawhi, whose in-engine underperformance is now a feature per
the locked paradigm above, not something to prune for.

**Proposed diff** (one line in `engine/balance.ts`'s `LEGENDARY_PLAYERS`): remove
`'Chris Paul'`, keep the rest as-is. Say go and I'll apply it.

## Root-cause review of the earlier eyeball pass, under the corrected paradigm

The four players the owner named, with real stat lines pulled from `cards.json`:

- **Jalen Duren** (Mythic 90, C): real 2025-26 All-NBA 3rd Team (verified against
  basketball-reference's awards page, not the old hardcoded fallback). `perimeter` rating is
  literally 0 — zero three-point attempts all season — `playmaking` 29, `perimeterDefense` 60
  and `postDefense` 62 are both merely average for a starting center, not elite. Elite
  `finishing` 91 and `rebounding` 99 driving the OVR. **Makes sense**: a real double-double
  machine with zero shooting range, weak passing and average-not-plus defense for his size —
  exactly the profile that racks up All-NBA-caliber counting stats without swinging modern
  NBA possessions the way spacing or defense does. A splashy Mythic with a real flaw, not a bug.
- **LaMelo Ball** (Rare 87, PG): `playmaking` 99 is the only elite rating on the card —
  `finishing` 62, `midRange` 67, `rebounding` 51 are all mediocre, `postDefense` 40 is the
  floor, `perimeterDefense` 64 is below average, and his actual DBPM is −0.1 (below replacement
  on defense per advanced stats, not just the rating formula's read of it). **Makes sense**,
  exactly the owner's own framing: a genuinely elite passer with nothing else elite and real,
  stat-confirmed bad defense — the textbook splashy-but-flawed Rare.
- **Josh Hart** (Uncommon 79, SG/SF): no rating above 81 anywhere on the card — nothing spikes,
  nothing is a badge-crossing outlier (only `Lockdown Defender` at level 1, barely over the
  threshold). No awards, no legendary bump, low shot volume (9 FGA for 12 PPG). **This is
  exactly the "value pick" case** — nothing about him trips a rarity bump, yet touching
  rebounding, passing, efficient scoring and defense all at once is precisely what the
  possession engine's math rewards. The rarity/win-shares gap here is the system working as
  designed: a clever drafter's reward, not a bug to fix.
- **Donovan Mitchell** (Mythic 93, SG): real 2025-26 All-NBA 2nd Team (verified, same fix as
  Duren). High-usage scoring (27.9 PPG on 20 FGA), `midRange` 96 is near-elite, but
  `rebounding` 48 and `postDefense` 42 are weak, `perimeterDefense` 71 isn't elite, and his
  real DBPM is −0.2 (negative). **Makes sense**: a real All-NBA volume scorer whose defense is
  a genuine minus per advanced stats — the same shot-creation-over-defense trade-off already
  flagged pool-wide in the 2026-09-16 win-shares bootstrap, now confirmed at the individual level.

All four check out as "makes sense" under the pedigree paradigm — none needs a rating fix.

## Systematic quirks found (these DO need attention — not pedigree, genuine noise)

1. **Awards.html scrape was being silently discarded and replaced by a hardcoded
   snapshot** (fixed, commit `264d71c` — see the plan doc). Harmless today (the hardcoded
   values matched this season's real scrape) but would have frozen every future season's
   awards to 2025-26's; also exposed a diacritic name-matching bug, fixed in the same commit.
2. **Defense ratings reward low-minute noise.** `PerimDef_Raw`/`PostDef_Raw` in
   `fetch_players.py` are `STL*15 + DBPM*5` / `BLK*15 + DBPM*5`; DBPM is a per-100-possession
   stat that gets extreme in small samples. Scanning the pool for elite (90+) defense ratings
   outside the real All-Defensive list: **Matisse Thybulle sits at `perimeterDefense` 99 — the
   pool's highest — at 16 MPG across 30 games**, driven by a DBPM of 6.1 (higher than almost
   any historically great full-season defender). Dru Smith (94), John Konchar (93), Alex
   Caruso (92) show the same 16-20 MPG-specialist pattern. Exactly the "amazing stats in a
   tiny role" exploit you asked about — real specialists, inflated past what a starter would
   show. Fix: scale DBPM's weight by minutes played (T2/T5-level).
3. **The All-Defensive floor targets whichever defense dimension is already higher, not the
   dimension matching the player's real role.** Bam Adebayo lands `perimeterDefense` 90
   (exactly the floor) and `postDefense` only 58, despite being a starting center. Worth a
   look during T2, not clearly wrong.
4. **Badge win-share correlations are confounded by play/archetype eligibility.** All seven
   skill badges double as archetype "colours" and playbook role gates: holding `Floor
   General` unlocks plays with a 2.0x `PLAY_SCORER_BOOST`, not just a playmaking rating.
   Floor General/Lockdown/Sharpshooter each gate five play roles (most of any badge), Paint
   Protector only two — roughly tracks bootstrap correlation strength, but Sharpshooter gates
   as many roles as the others yet has the weakest correlation, likely diluted by being the
   most commonly held badge (76/448) plus the already-flagged shot-volume over-crediting.
   Read a badge's bootstrap correlation as impact + play-eligibility boost + holder-count
   dilution, not a pure skill signal.

## The four levers, for future tuning sessions

- **Rarity** = pedigree signal with engineered noise — real awards, the manual
  `LEGENDARY_PLAYERS`/(now-fixed) award scrape, and a `RARITY_CUTOFFS` bump on top of OVR.
  Allowed to diverge from win-shares by design.
- **OVR** = raw power — the position-weighted sum of seven per-skill ratings, clamped 40-99,
  with the PER/VORP/DBPM composite multiplier. What "how good is this card on paper" means.
- **Win shares** (bootstrap-measured) = actual in-engine impact, including synergies, play
  activation, and the possession-events model. The only lever grounded in how the game
  actually plays out — but confounded by the play/badge-eligibility effect above.
- **Badges** = per-skill thresholds (80/90/96) on the same ratings that feed OVR, but also
  double as the mechanical gate for archetype colours and play roles — so a badge's
  real-world "does this help win" signal and its "does this unlock a play" signal are mixed
  together in anything measured from gameplay (the bootstrap's badge-correlation table).

## Next steps

1. Owner picks position-string edits and Positionless-badge holders from table A (per-player,
   not all-or-nothing).
2. Say go on table B's `LEGENDARY_PLAYERS` diff (drop Chris Paul, keep the rest).
3. Quirks 2-3 (DBPM shrinkage, All-D floor targeting) are real T2/T5 candidates — decide
   whether to fold them into the upcoming rating retune or treat as their own follow-up.
4. Quirk 4 (badge confound) doesn't need a code fix — it's interpretation guidance for
   reading future `player-bootstrap` runs, recorded here so it isn't relearned each time.
