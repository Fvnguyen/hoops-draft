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

## Draft — 2026-09-22

A cube draft is a pure function of its seed: `generateCubePool` builds 24 packs (8 seats x
3 rounds, 7 players + 1 play each) from one `Rng`, then each bot draws a fixed profile from
the same `Rng` stream, so bots are fully deterministic once the seed is fixed. The record
of a draft is therefore the seed plus the pick log — not a snapshot of packs or seats.
`engine/draftReplay.ts`'s `replayDraft(seed, humanPicks, ...)` rebuilds the exact room
(seats, pick log, whose turn it is) from just the seed and each human seat's card ids in
pick order; this is what makes a draft resumable across a reload, crash or phone lock (the
app autosaves the seed + picks after every human pick) and is the same substrate a
same-room multiplayer draft stands on (two human seats instead of one).

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
defense plays: share of opponent possessions), raised by rarity and capped by team
budgets (40% offense, 35% defense; over-budget allocations are scaled down) — the
original 10 plays span Common ~10% to Mythic ~18%; the 4 plays added in card_balance T4
(Switch Everything, Drop Coverage, Post-Up Series, Drive-and-Kick Series) hold to a
tighter 8-12% band until they've been played and re-tuned. On a called possession the
assigned players are guaranteed on court in their own depth-chart position, their scorer
weight is doubled, and the play's share and efficiency modifiers apply to that possession
only — overtime possessions call plays exactly like regulation. 14 plays total, one per
skill-badge colour or colour-pair that's short a natural play (`tests/unit/play-catalog-
coverage.test.ts` tracks which plans still have none). Catalog: `frontend/src/engine/
playbook.ts`; simulation: `engine/game.ts`.

## 82:0 Challenge — the second game mode

Picked on the start page before the draft, not after it: a roster is drafted FOR a mode and
can only start the one it was drafted for (`DraftSession.gameMode`, missing = tournament).
The draft and deck builder are unchanged; what differs is what the roster then plays.

**The season.** 82 games against all 30 real NBA teams, built from the same card pool the
draft uses: each team's top 15 by OVR handed to `buildBotRoster` with the full play catalog,
so opponents pick the three plays they can actually staff and an identity to match. NBA
rosters are LOCKED IN — a card you drafted still suits up for his real team against you, so
a drafted Luka faces Lakers Luka. The schedule is the 30 teams shuffled by the run seed,
repeated three times, first 82 taken; you are home on even game indices.

**Difficulty.** Challenge games pass `CHALLENGE_TUNING` (efficiency scale 0.50, max shift
0.20, against the engine's 0.20/0.08) to `simulateGame`. The edge is steeper than the
tournament's, so a talent gap converts into wins more reliably — which is what makes 82-0
conceivable for a great draft and hopeless for an average one. Tournament balance is
untouched. Measured over 2,000 seat-seasons: the best drafted seat of eight averages 60
wins, its top decile reaches 70, and wins fall monotonically by seat rank (#1 60.0 -> #8
32.3). The draft decides the run.

**The reveal.** Nothing is simulated live. A half is 41 games resolved in one call and
committed to storage BEFORE a single flap turns, so the animation is pure presentation and
a reload replays it without re-rolling anything. The flip clock reads W:L slowly for the
first week, accelerates until the flaps blur, stays sealed through the break, and becomes
readable again for the last five games at a locked speed. The progress bar is never coloured
by result; streak call-outs at 10/25/41/60/82 are the only mid-reel signal.

**The front office**, once, at game 41. It shows a pace band on the grade ladder — projected
wins +/- 7, snapped outward to band edges — and never the record, which stays sealed until
game 82. Three quotes (coach, owner, fans) are generated from first-half data by a ranked
reason catalogue: the weakest four factor on either side of the ball against the league, a
bench player out-producing a starter, the worst rotation plus-minus, an unstaffed or idle
play, an identity one step from online. Each carries an action chip and an evidence line
built from season averages — never a rating, never a win-loss record. A band starting at
Historic tells you to do nothing instead.

You may adjust the lineup, plays and identity, and make ONE trade: drop a card, and five
offers are drawn from every card you do not own, weighted per rarity class with the dropped
card's class four times likelier. The pick lands on the bench, so confirming a trade drops
you straight into the lineup editor — otherwise the second half would be played a man short.
All of it writes a `rosterPost` snapshot; the roster you drafted is never mutated.

**The grade.** S+ 82 Immortal, S 80-81 Perfect, A+ 72-79 Historic, A/A- 62-71 Dynasty,
B+/B/B- 57-61 Contender, C+/C/C- 50-56 Playoff, D+/D/D- 40-49 Lottery, F 0-39 Tanking.
The results screen adds a win-trend line with a dashed GHOST: the same 41 second-half seeds
replayed with the roster as it stood before the deadline, so "the trade was worth +3 wins"
is a real counterfactual — identical schedule, identical seeds, one variable — rather than
an estimate. Change nothing at the break and there is no ghost and no verdict.

Engine: `engine/challenge.ts` (opponents, schedule, seeds, grades, `simulateHalf`, the trade
pack) and `engine/challengeAdvice.ts` (the front office). Tuning: `engine/balance.ts`.
Calibrate with `npm run challenge`.

## How much of a win is skill vs. luck?

Measured, not asserted — see the [Power Curve
report](https://claude.ai/code/artifact/17ace14e-ea53-40ff-be8c-9196c3415964)
(`npm run balance -- <n> --seed <s> --report`, `frontend/scripts/balance.ts`): every
play/identity's difficulty-vs-impact, and a variance decomposition of what decides a
game. Headline: real opponent talent (OVR gap) alone explains 7.6% of a single game but
24.4% of a full 7-game season — win rate climbs monotonically from 27% to 73% across
OVR-gap deciles, confirming talent is rewarded even though any one game carries real
possession-level variance by design (D5, `docs/completed/plan_game_engine_2026-09-13.md`).
