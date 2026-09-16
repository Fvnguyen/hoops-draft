# Magic Ball - Game Mechanics

## Multi-Channel Shot Engine

The simulation engine evaluates possessions using a 3-channel shot system (Rim, Mid-range, 3PT).

### 1. Possessions
Teams get equal possessions apart from two things (engine_possession_model, 2026-09-16 —
there is no pre-game "possession battle" any more): pace noise, and play/identity
`possessionSwing`. Each side draws independent possession-count noise, home from a
skewed-positive range (-5.5%/+9% of the 100 baseline), away from a roughly centred one
(-7.5%/+7.5%) — that asymmetry, not a flat bonus, is the entire home-court advantage
(52-56% home win with identical rosters). Possessions are clamped to [85%, 115%] of
baseline. Everything a roster's playmaking, rebounding and defence are worth is resolved
per possession (sections 2-5) from the five on the floor.

### 1b. Who's on the floor
Each possession draws one player per position, weighted by `calcPossessionShares` —
starter/backup/deep-bench shares set by their OVR gap, blended 60/40 with real MPG where
available, with an age-35+ penalty. This is a fresh weighted draw every possession, not a
fixed rotation timeline: a team with a big starter/backup talent gap sees its starters on
the floor far more often, but there's no notion of continuous on-court stints. Overtime
is the one exception — it stays starters-only (rewarding top-heavy rosters, mimicking
real crunch-time basketball), capped at 3 periods; a tie past that goes to the team with
the higher average starter OVR, not a coin flip.

### 2. Lineup values (how five players become one number)
The engine never uses raw ratings for an edge (`engine/lineup.ts`, all numbers in the
"Lineup model" section of `balance.ts`):
1. **Standardise** — each rating maps to `50 + 15·(r − pool mean)/pool sd` for its
   dimension (`RATING_NORM`), so playmaking (raw mean 35) and perimeter defence (raw mean
   53) live on one scale. Raw ratings, badges and the UI are untouched.
2. **Aggregate** the five on the floor per dimension: `Σ r^(k+1) / Σ r^k` minus a hole tax
   `c · max(0, F − mean of the two lowest)`. `LINEUP_AGG` sets k / F / c per dimension —
   playmaking k=1.5 (a star channel: one elite creator carries, two are elite), shooting
   and rebounding k=0.5 (by committee: functional zeros lose their say), mid-range k=1,
   finishing 0.75, defence k=0 (everyone guards someone). Holes are the average of the two
   lowest players below 35 (one sd under average); one bad player is never a problem, two
   are — 0.40 per point for spacing (perimeter), 0.30 for perimeter defence and playmaking,
   0.20 for post defence. Real-lineup readings: Lakers playmaking 79 (Luka + LeBron +
   Reaves; Hachimura and Ayton at 13/12 do not matter), Pistons perimeter 44 (Cade,
   Robinson and Harris overruled by two non-shooters; a five-70s lineup is 57).
3. **Centre** — edges are measured from `LINEUP_CENTRE`, the expected value of that
   aggregate for lineups drawn the way the engine draws them (bot drafts → rosters →
   minutes-weighted fives), which sits 6-13 points above a random-pool lineup. Regenerate
   from the balance script header when the card pool changes.

### 3. A possession, step by step
1. **Turnover roll** (`turnoverChance`): base 13.5%, moved by the offence's playmaking
   value against the centre minus `TURNOVER_DEF_WEIGHT` of the defence's perimeter-defence
   edge (steals), clamped 6-24%. A turnover ends the possession; the ball-handler charged
   is drawn by playmaking (attribution only).
2. **Shot profile** for the five on the floor: plain means of standardised finishing /
   mid-range / perimeter blended 50/50 with the NBA baseline (35/25/40), plus identity and
   coverage share mods and a called play's share shift. Who shoots is a committee
   question, so a lineup with two non-shooters takes fewer threes.
3. **Creator steer** (`steerShotProfile`): a playmaking edge moves `STEER_SCALE · edge`
   of share (cap ±8pp) from the channel worth the fewest absolute expected points against
   THIS defence (base efficiency + matchup shift, times points per make) to the one worth
   the most. Matchup-based, so the good shot changes with the opponent; mid-range stays
   last by design unless a defence is genuinely soft there. Playmaking never touches make
   probability directly.
4. **Channel edge** = `off·(offence value − centre) − def·(defence value − centre)` in
   rating points / 100, with per-side `EDGE_WEIGHT` per channel (rim / mid / three): the
   deliberate "unequal by design" sizes, checked with `npm run balance -- --levers`. Rim:
   finishing vs post defence; mid: mid-range vs 0.4 perimeter + 0.6 post defence; three:
   perimeter vs perimeter defence. Efficiency = baseline + `EFFICIENCY_SCALE` (0.20) × edge,
   capped at ±`MAX_EFF_SHIFT` (8pp); the edge clamp coincides with that cap.
   Baselines: rim 65%, mid 42% (deliberately the lowest-efficiency channel), three 36%.
5. **Offensive rebound** (`offensiveReboundChance`): a missed field goal (not a free-throw
   trip) is rebounded by the offence with base 26%, moved by rebounding value vs the
   defence's rebounding value, clamped 12-42%; the possession continues with another shot
   (same lineup and profile), at most `OREB_MAX_CHAIN` (2) extra times. Rebounding acts on
   both ends, which is why its scale is half the turnover scale.

### 4. Scoring Outcomes
- **3PT Makes**: 3 points
- **Mid-Range Makes**: 2 points
- **Rim Makes**: 50% chance of a clean 2pt make; the other 50% draws a shooting foul and
  goes to the line for two free throws at `RIM_FT_PCT` (77%), averaging ~1.54 points —
  not a flat 1pt trip, which used to understate PPP badly. Only a clean make (rim, mid,
  or three) is eligible for an and-1 or an assist; a free-throw trip is never either.
- **And-1**: All channels have a chance for a bonus point on a clean make (descending by
  distance: Rim 8%, Mid 3%, 3PT 1%), capped at 30% combined with archetype/play bonuses.
- Box score: points, 2s/3s/and-1s, assists, turnovers (charged in step 1) and offensive
  rebounds (step 5). Events carry `turnoverPlayerId` / `offensiveRebounders`.

## Synergies and Plays
Synergies and Plays act as modifiers on the engine. They can influence the following dimensions:
- `rimShareBonus`, `midShareBonus`, `perShareBonus`: Additive shifts to the team's shot distribution.
- `rimEffBonus`, `midEffBonus`, `perEffBonus`: Additive shifts to the specific channel's shot efficiency.
- `possessionSwing`: Fixed bonus possessions added/removed from the team.
- `and1Bonus`: Additive shift to the chance of drawing an and-1 on a made shot.

## Roster identities (archetypes) — 2026-09-13

The seven skill badges are the game's colours. At roster lock the player chooses up to
two plans in two philosophy slots (Offense, Defense), or one Gold plan that takes both.
A plan is **Online** when the active 12-man roster meets its carrier / badge-point /
starter thresholds and **Dedicated** at the higher thresholds; Online delivers ~70% of
the printed effect. Effects are zero-sum shot-share shifts plus efficiency, possession
and and-one modifiers, capped after combining (±15pp share, ±5pp efficiency, ±5
possessions, ±4pp and-one). Chemistry synergies no longer exist. Catalog and thresholds:
`frontend/src/engine/archetypes.ts`; the thresholds were tuned with
`npm run feasibility` so a drafter who chases one colour reaches Online in most drafts.

## Plays — assigned-player tactics

A play card names roles with badge minimums (for example High Pick & Roll: Handler =
Floor General 1+, Roller = Finisher 1+). The player assigns active-roster players to the
roles; a play is **active** only when every role holds a distinct eligible player. Each
card has a fixed allocation of possessions (offense plays: share of own possessions;
defense plays: share of opponent possessions), raised by rarity (Common ~10%, Uncommon
~13%, Rare ~15%, Mythic ~18%) and capped by team budgets (40% offense, 35% defense;
over-budget allocations are scaled down). On a called possession the assigned players
are guaranteed on court in their own depth-chart position, their scorer weight is
doubled, and the play's share and efficiency modifiers apply to that possession only —
overtime possessions call plays exactly like regulation. Catalog:
`frontend/src/engine/playbook.ts`; simulation: `engine/game.ts`.

## How much of a win is skill vs. luck?

Measured, not asserted — see the [Power Curve
report](https://claude.ai/code/artifact/17ace14e-ea53-40ff-be8c-9196c3415964)
(`npm run balance -- <n> --seed <s> --report`, `frontend/scripts/balance.ts`): every
play/identity's difficulty-vs-impact, and a variance decomposition of what decides a
game. Headline: real opponent talent (OVR gap) alone explains 7.6% of a single game but
24.4% of a full 7-game season — win rate climbs monotonically from 27% to 73% across
OVR-gap deciles, confirming talent is rewarded even though any one game carries real
possession-level variance by design (D5, `docs/completed/plan_game_engine_2026-09-13.md`).
