# Magic Ball - Game Mechanics

## Multi-Channel Shot Engine

The simulation engine evaluates possessions using a 3-channel shot system (Rim, Mid-range, 3PT).

### 1. Possession Battle
Before a game, a team-wide possession rating is calculated based on:
- Playmaking (40%)
- Rebounding (35%)
- Defense (25% - average of perimeter/post defense)

Starters are weighted 2x, bench 1x. The difference between team ratings shifts the total
number of possessions (baseline 100 per team, max swing ±3.5%, `STRENGTH_SWING_PCT`).
Each side also draws independent possession-count noise: home from a skewed-positive
range (-5.5%/+9% of baseline), away from a roughly centered one (-7.5%/+7.5%) — this
asymmetry, not a flat bonus, is the entire home-court advantage (52-56% home win with
identical rosters). Possessions are clamped to [85%, 115%] of baseline either way.

### 1b. Who's on the floor
Each possession draws one player per position, weighted by `calcPossessionShares` —
starter/backup/deep-bench shares set by their OVR gap, blended 60/40 with real MPG where
available, with an age-35+ penalty. This is a fresh weighted draw every possession, not a
fixed rotation timeline: a team with a big starter/backup talent gap sees its starters on
the floor far more often, but there's no notion of continuous on-court stints. Overtime
is the one exception — it stays starters-only (rewarding top-heavy rosters, mimicking
real crunch-time basketball), capped at 3 periods; a tie past that goes to the team with
the higher average starter OVR, not a coin flip.

### 2. Shot Distribution (Team-wide)
A team's offensive profile dictates where they take shots. It is computed as a blend:
- 50% NBA Baseline (35% Rim, 25% Mid, 40% 3PT)
- 50% Team Lineup Tendency (calculated from Finishing/Mid-Range/Perimeter ratings)

### 3. Shot Efficiency (Per-Possession)
When a possession occurs, the shot channel is selected from the team's distribution.
An edge is calculated comparing the offensive lineup's rating to the defensive lineup's rating:
- **Rim Edge**: Off Finishing vs Def Post Defense
- **Mid Edge**: Off Mid-Range vs Def (40% Perimeter Def / 60% Post Def)
- **3PT Edge**: Off Perimeter vs Def Perimeter Defense

The edge scales the baseline efficiency by a factor of `0.10` (`EFFICIENCY_SCALE`),
clamped to a maximum shift of ±4 percentage points (`MAX_EFF_SHIFT`).
- **Rim Baseline**: 65%
- **Mid Baseline**: 42% — deliberately the lowest-efficiency channel; any play or
  identity that shifts shots into mid-range is self-sabotaging by design (see
  `card_balance`'s catalog work).
- **3PT Baseline**: 36%

### 4. Scoring Outcomes
- **3PT Makes**: 3 points
- **Mid-Range Makes**: 2 points
- **Rim Makes**: 50% chance of a clean 2pt make; the other 50% draws a shooting foul and
  goes to the line for two free throws at `RIM_FT_PCT` (77%), averaging ~1.54 points —
  not a flat 1pt trip, which used to understate PPP badly. Only a clean make (rim, mid,
  or three) is eligible for an and-1 or an assist; a free-throw trip is never either.
- **And-1**: All channels have a chance for a bonus point on a clean make (descending by
  distance: Rim 8%, Mid 3%, 3PT 1%), capped at 30% combined with archetype/play bonuses.

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
