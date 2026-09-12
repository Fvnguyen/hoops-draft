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
