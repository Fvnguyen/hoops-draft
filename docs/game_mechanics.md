# Magic Ball - Game Mechanics

## Multi-Channel Shot Engine

The simulation engine evaluates possessions using a 3-channel shot system (Rim, Mid-range, 3PT).

### 1. Possession Battle
Before a game, a team-wide possession rating is calculated based on:
- Playmaking (40%)
- Rebounding (35%)
- Defense (25% - average of perimeter/post defense)

Starters are weighted 2x, bench 1x.
The difference between team ratings shifts the total number of possessions (baseline 100 per team, max swing ±8%).

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

The edge scales the baseline efficiency by a factor of `0.3`, clamped to a maximum shift of ±10 percentage points.
- **Rim Baseline**: 65%
- **Mid Baseline**: 42%
- **3PT Baseline**: 36%

### 4. Scoring Outcomes
- **3PT Makes**: 3 points
- **Mid-Range Makes**: 2 points
- **Rim Makes**: Averaged to 1.5 points (50% chance for 2pts, 50% chance for 1pt to simulate drawing 2 free throws and making ~1.5)
- **And-1**: All channels have a chance for a bonus point on makes (descending by distance: Rim 8%, Mid 3%, 3PT 1%)

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
defense plays: share of opponent possessions), capped by team budgets (30% offense, 25%
defense; over-budget allocations are scaled down). On a called possession the assigned
players are guaranteed on court in their own depth-chart position, their scorer weight
is doubled, and the play's share and efficiency modifiers apply to that possession only.
Catalog: `frontend/src/engine/playbook.ts`; simulation: `engine/game.ts`.
