# Magic Ball: Roster Identities and Assigned-Player Plays

## Purpose

This proposal separates two things that currently compete for the same design space:

- **Archetypes** are persistent roster identities. They are the draft's large, deliberate commitment and reshape the team's normal style of play.
- **Plays** are an equipped playbook. Each Play assigns named players to tactical roles and reserves a share of possessions for lineups that feature those players.

The intended result is a Magic-style spectrum of builds:

- **Mono-color:** deep commitment to one core skill badge, such as Sharpshooter or Paint Protector.
- **Two-color:** a focused pairing, such as Finisher plus Sharpshooter for Inside-Out.
- **Gold:** a demanding, cross-axis identity supported by a special trait, such as 3-and-D Paradigm.
- **Soup:** individually powerful, flexible cards with no concentrated identity. Soup may use good Plays, but does not receive a large roster-level payoff merely for being unfocused.

The roster has twelve active players. Archetype eligibility counts all active players, not G-League players. The existing depth-chart system still determines lineups possession by possession.

---

## 1. Badge colors and trait keystones

The seven skill badges are the game's colors. A player's badge level contributes that many **affinity points** to the corresponding color.

| Color / core badge | Team identity it represents |
|---|---|
| Finisher | Rim pressure, foul pressure, interior scoring |
| Mid-Range Maestro | Half-court shot creation and elbow offense |
| Sharpshooter | Spacing, catch-and-shoot volume, perimeter pressure |
| Floor General | Pace, decision-making, creation |
| Glass Cleaner | Rebounding and extra possessions |
| Lockdown Defender | Perimeter containment and pressure |
| Paint Protector | Interior denial and paint deterrence |

The fixed-level trait badges are not colors. They are **keystones**: small upgrades, named role qualifications, and signposts for Gold plans. They should not replace the need to draft enough actual players of a color.

Examples:

- `Sniper` improves a shooting role or upgrades Shooting Gallery.
- `Playmaking Maestro` improves a handler role or upgrades The Beautiful Game.
- `Two-Way Disruptor` is a keystone for a cross-offense/defense plan.
- `Efficiency Savant` improves Mid-Range Maestro and precision-oriented Plays.
- `Volume Scorer` improves scorer-focused Finisher or Sharpshooter Plays.

`Legend`, `League Leader`, `Young Phenom`, `Veteran Presence`, `Ironman`, `Microwave`, and `Stat Sheet Stuffer` should remain valuable card traits, but should not by themselves unlock a major archetype. Several describe status, age, durability, or volatility that the current three-channel engine does not model as a distinct team style.

---

## 2. Archetype rules

### Philosophy slots

At roster lock, the player chooses eligible archetypes rather than the game silently activating every qualifying bonus.

| Slot | Eligible plans |
|---|---|
| Offensive Philosophy | One mono-color or two-color offensive plan |
| Defensive Philosophy | One mono-color or two-color defensive plan |
| Gold Philosophy | A Gold plan occupies both slots |

This permits a balanced build such as **Shooting Gallery + Paint Wall**, while a Gold plan such as **3-and-D Paradigm** trades that flexibility for a more concentrated payoff.

### Qualification and depth

Archetypes have an **Online** and **Dedicated** level. Online is a real payoff; Dedicated is the printed, full-strength payoff. A player may select only eligible plans, and all selected plan effects are subject to global caps.

| Plan kind | Online requirement | Dedicated requirement |
|---|---|---|
| Mono-color | 5 distinct carriers, 10 affinity points, 2 starters carrying the color | 6 carriers, 12 points, 3 starters carrying the color |
| Two-color | 4 primary carriers / 9 points, 2 support carriers / 4 points, 5 distinct players total, 2 primary starters | 5 primary / 11 points, 3 support / 6 points, 6 distinct players total, 3 primary starters |
| Gold | 4 primary carriers / 9 points, 2 secondary carriers / 4 points, 2 tertiary carriers / 4 points, 6 distinct players, a listed keystone trait, 3 relevant starters | 5 primary / 11 points, 3 secondary / 6 points, 2 tertiary / 5 points, 7 distinct players, 4 relevant starters |

A player with several badges may contribute to several colors, but cannot satisfy the distinct-player requirement more than once. This is what prevents one elite all-around player from becoming an entire archetype.

Online effects are approximately 70% of the listed full effect, rounded to legible whole values. Dedicated effects use the full values below. A plan does not continue scaling beyond Dedicated; surplus density is valuable because it protects the plan from lineup or roster changes, not because it creates runaway bonuses.

### Effect caps

After selected archetypes and active Play effects are combined:

- A team's net shot-share adjustment in any channel is capped at **+/-15 percentage points**.
- A team's net channel-efficiency adjustment is capped at **+/-5 percentage points**.
- Net possession swing from roster identity and Plays is capped at **+/-5 possessions**.
- Net and-one adjustment is capped at **+/-4 percentage points**.

Every offensive share package sums to zero. Defensive share packages also sum to zero, so suppressing an opponent's preferred channel visibly redirects attempts elsewhere rather than silently changing the total shot distribution.

---

## 3. Initial archetype catalog

### Mono-color foundations

| Archetype | Color | Dedicated effect |
|---|---|---|
| **Rim Pressure** | Finisher | Rim +10%, Mid -7%, 3PT -3%; Rim efficiency +2%, and-one chance +2% |
| **Midrange Clinic** | Mid-Range Maestro | Rim -5%, Mid +10%, 3PT -5%; Mid efficiency +3% |
| **Shooting Gallery** | Sharpshooter | Rim +3%, Mid -13%, 3PT +10%; 3PT efficiency +3% |
| **The Beautiful Game** | Floor General | +3 possessions; Rim +3%, Mid +3%, 3PT -6%; Rim and Mid efficiency +1% |
| **Second-Chance Engine** | Glass Cleaner | +4 possessions; Rim +6%, Mid -3%, 3PT -3%; Rim efficiency +1% |
| **No-Fly Zone** | Lockdown Defender | Opponent 3PT -6%, Rim +2%, Mid +4%; opponent 3PT efficiency -3% |
| **Paint Wall** | Paint Protector | Opponent Rim -6%, Mid +2%, 3PT +4%; opponent Rim efficiency -4% |

### Two-color archetypes

| Archetype | Primary + support | Dedicated effect |
|---|---|---|
| **Inside-Out** | Finisher + Sharpshooter | Rim +10%, Mid -15%, 3PT +5%; Rim and 3PT efficiency +2% |
| **Elbow Orchestra** | Mid-Range Maestro + Floor General | Rim -5%, Mid +11%, 3PT -6%; Mid efficiency +4% |
| **Pick-and-Roll Republic** | Floor General + Finisher | +3 possessions; Rim +8%, Mid -4%, 3PT -4%; Rim efficiency +2%, and-one chance +1% |
| **Four-Out One-In** | Sharpshooter + Glass Cleaner | Rim -4%, Mid -8%, 3PT +12%; 3PT efficiency +2%, Rim efficiency +1% |
| **Grit and Grind** | Lockdown Defender + Glass Cleaner | +3 possessions; opponent Rim efficiency -2%, Mid efficiency -2%, 3PT efficiency -2% |
| **Glass Fortress** | Paint Protector + Glass Cleaner | Opponent Rim -7%, Mid +3%, 3PT +4%; opponent Rim efficiency -3%; +2 possessions |

### Gold archetypes

Gold plans deliberately span an offensive and defensive axis. Each uses both Philosophy slots.

| Archetype | Primary + secondary + tertiary | Keystone | Dedicated effect |
|---|---|---|---|
| **3-and-D Paradigm** | Lockdown Defender + Sharpshooter + Floor General | Two-Way Disruptor | Own Mid -5%, 3PT +5%; own 3PT efficiency +2%. Opponent 3PT -5%, Rim +2%, Mid +3%; opponent 3PT efficiency -4% |
| **Switchblade Pressure** | Lockdown Defender + Floor General + Finisher | Playmaking Maestro or Two-Way Disruptor | +4 possessions; Rim +5%, Mid -3%, 3PT -2%; opponent 3PT efficiency -3%, opponent Rim efficiency -2% |
| **Five-Out Fortress** | Sharpshooter + Glass Cleaner + Paint Protector | Sniper or Two-Way Disruptor | Own Rim -3%, Mid -7%, 3PT +10%; own 3PT efficiency +2%. Opponent Rim -5%, Mid +2%, 3PT +3%; opponent Rim efficiency -3% |

These are an initial release, not a mandate to support every possible badge pairing. The draft pool should be tuned so a focused roster generally sees one or two plausible plans, while a Gold plan is an unusual but achievable lane.

---

## 4. Plays: assigned-player tactical packages

Plays are equipped in three tactical slots. They no longer inspect aggregate badge totals across the entire roster. Instead, the user assigns active-roster players to the Play's named roles.

### Core behaviour

1. The player equips up to three Plays and assigns a distinct active player to each role slot.
2. Every role has a minimum badge requirement. If a role is not filled legally, the Play is inactive.
3. The user assigns a call allocation to each active offensive Play and a coverage allocation to each active defensive Play.
4. On a called possession, the lineup selector boosts or forces the assigned players into a legal five-player lineup, then the normal per-possession lineup and shot engine resolves the play.
5. On a defensive coverage possession, the same rule boosts or forces the assigned defenders into the defending lineup before the normal defensive calculation.

This guarantees **lineup presence on the Play's allocated possessions**, not necessarily that the named player takes every shot. If individual shot-taker resolution is added later, the same role definitions can also supply a target-usage split.

### Lineup and position rules

- Every role must be assigned to a different player.
- Each assigned player must fit a legal lineup position for the called possession. The interface should show the position column used by the role.
- The Play's allocated possession is eligible only if a legal lineup containing its assigned roles can be formed. Otherwise the possession reverts to normal lineup selection.
- Bench players may be assigned. Their depth-chart probability still matters on ordinary possessions; on a called or covered possession the Play temporarily raises their selection probability. This gives bench specialists a real tactical job without making them permanent starters.

### Possession budgets

| Budget | Limit | Use |
|---|---:|---|
| Offensive tactical budget | 30% of team possessions | Distributed among active offensive Plays |
| Defensive coverage budget | 25% of opponent possessions | Distributed among active defensive Plays |

Each card has a maximum allocation. The player may lower an allocation, but allocations in a budget cannot exceed its cap. Unallocated possessions use the current normal lineup process and the selected archetype's team profile.

### Mastery states

| State | Condition | Result |
|---|---|---|
| **Inactive** | A role is empty or fails its minimum badge requirement | No allocation and no effect |
| **Online** | All roles are filled with eligible players | The Play receives its base call/coverage allocation and line-up-selection priority |
| **Refined** | The assigned players meet the listed relevant-level total | The Play receives its printed tactical modifier |
| **Mastered** | Refined, plus the listed keystone trait *or* a matching selected archetype | A small signature rider; never a second large team-wide archetype effect |

Traits apply to the assigned player in the relevant role. A `Sniper` on a wing is better than a Sniper sitting elsewhere on the bench.

---

## 5. Proposed Play catalog

The printed shot-share and efficiency modifiers below apply **only on the Play's called possessions** (or on covered opponent possessions for defensive Plays). This keeps Plays narrower than archetypes. Each listed call/coverage share is a card maximum, not an automatic allocation.

### Basic Plays

| Play | Rarity / slots | Roles | Online | Refined | Mastered | Maximum allocation |
|---|---|---|---|---|---|---:|
| **Basic Offense** | Basic, 1 slot | Featured player: no badge requirement | Assigned player is prioritized into the offensive lineup | None | None | 6% offense |
| **Basic Defense** | Basic, 1 slot | Featured defender: no badge requirement | Assigned player is prioritized into the defensive lineup | None | None | 6% defense |

Basic cards are no longer empty UI fillers. They are low-ceiling ways to guarantee a role player a small tactical presence when the draft did not provide a real Play.

### Common Plays

| Play | Slots and role requirements | Refined / Mastered threshold | Called or covered effect | Maximum |
|---|---|---|---|---:|
| **Horns** | 2: `Elbow big` — Glass Cleaner 1+ or Mid-Range Maestro 1+; `Cutter` — Finisher 1+ | Refined: relevant assigned levels total 4. Mastered: total 5 + Elbow Orchestra or Second-Chance Engine | On calls: Rim +6%, Mid +8%, 3PT -14%; Rim efficiency +1%, Mid efficiency +2%. Mastered: Mid efficiency +1% more. | 7% offense |
| **Full Court Press** | 2: `Point defender` — Lockdown Defender 1+; `Back-line helper` — Lockdown Defender 1+ or Glass Cleaner 1+ | Refined: total 4. Mastered: total 5 + No-Fly Zone, Grit and Grind, or Two-Way Disruptor | On coverage: opponent Rim efficiency -1%, Mid efficiency -1%; Refined adds one possession. Mastered adds a second possession. | 7% defense |

### Uncommon Plays

| Play | Slots and role requirements | Refined / Mastered threshold | Called or covered effect | Maximum |
|---|---|---|---|---:|
| **High Pick & Roll** | 2: `Handler` — Floor General 1+; `Roller` — Finisher 1+ | Refined: relevant assigned levels total 4. Mastered: total 5 + Inside-Out, Pick-and-Roll Republic, or Playmaking Maestro on the Handler | On calls: Rim +10%, Mid -4%, 3PT -6%; Rim efficiency +2%, and-one chance +2%. Mastered: Rim +2% more and and-one chance +1% more. | 9% offense |
| **Box-and-One** | 2: `Chaser` — Lockdown Defender 2+; `Helper` — Lockdown Defender 1+ or Paint Protector 1+ | Refined: total 5. Mastered: total 6 + 3-and-D Paradigm or Two-Way Disruptor on the Chaser | On coverage: opponent 3PT efficiency -3%, Mid efficiency -1%. Mastered: opponent 3PT share -2%, Rim +1%, Mid +1%. | 9% defense |

### Rare Plays

| Play | Slots and role requirements | Refined / Mastered threshold | Called or covered effect | Maximum |
|---|---|---|---|---:|
| **Motion Offense** | 3: `Lead organizer` — Floor General 2+; `Connector` — Floor General 1+ or Mid-Range Maestro 1+; `Spacer` — Sharpshooter 1+ | Refined: total 6. Mastered: total 8 + The Beautiful Game or Playmaking Maestro on the organizer | On calls: Rim +4%, Mid +4%, 3PT -8%; all channel efficiencies +1%. Refined adds one possession. Mastered adds a second possession. | 10% offense |
| **Grit and Grind** | 3: `Perimeter stopper` — Lockdown Defender 1+; `Anchor` — Paint Protector 1+; `Rebounder` — Glass Cleaner 1+ | Refined: total 6. Mastered: total 8 + Paint Wall, Glass Fortress, or Ironman on any assigned player | On coverage: opponent Rim efficiency -3%, Mid efficiency -2%; Refined adds one possession. Mastered adds opponent Rim share -2%, Mid +1%, 3PT +1%. | 10% defense |
| **Four Out One In** | 3: `Shooter 1` — Sharpshooter 1+; `Shooter 2` — Sharpshooter 1+; `Interior anchor` — Glass Cleaner 1+ | Refined: total 6. Mastered: total 8 + Shooting Gallery, Five-Out Fortress, or Sniper on either Shooter | On calls: Rim -4%, Mid -10%, 3PT +14%; 3PT efficiency +2%, Rim efficiency +1%. Mastered: 3PT efficiency +1% more. | 10% offense |

### Mythic System Plays

| Play | Slots and role requirements | Refined / Mastered threshold | Called or covered effect | Maximum |
|---|---|---|---|---:|
| **Triangle Offense** | 3: `Initiator` — Floor General 1+; `Elbow scorer` — Mid-Range Maestro 2+; `Interior scorer` — Finisher 1+ | Refined: total 6. Mastered: total 8 + Elbow Orchestra, Midrange Clinic, or Efficiency Savant on the elbow scorer | On calls: Rim +8%, Mid +16%, 3PT -24%; Rim efficiency +2%, Mid efficiency +3%. Mastered: Mid efficiency +1% more. | 12% offense |
| **7 Seconds or Less** | 3: `Advance passer` — Floor General 2+; `Trail shooter` — Sharpshooter 1+; `Lead shooter` — Sharpshooter 1+ | Refined: total 6. Mastered: total 8 + Shooting Gallery, The Beautiful Game, or Sniper / Playmaking Maestro in a matching role | On calls: Rim +4%, Mid -18%, 3PT +14%; 3PT efficiency +3%. Refined adds one possession. Mastered adds a second possession. | 12% offense |

---

## 6. Archetype-to-Play alignment

Archetypes do not grant Plays for free. They are a matching condition for Mastery, making a coherent playbook stronger without preventing an off-plan splash.

| Archetype | Native Plays |
|---|---|
| Rim Pressure | High Pick & Roll, Horns |
| Midrange Clinic | Triangle Offense, Horns |
| Shooting Gallery | Four Out One In, 7 Seconds or Less |
| The Beautiful Game | Motion Offense, 7 Seconds or Less, High Pick & Roll |
| Second-Chance Engine | Horns, Four Out One In |
| No-Fly Zone | Full Court Press, Box-and-One |
| Paint Wall | Grit and Grind, Box-and-One |
| Inside-Out | High Pick & Roll, Four Out One In |
| Elbow Orchestra | Triangle Offense, Horns, Motion Offense |
| Pick-and-Roll Republic | High Pick & Roll, Motion Offense |
| Four-Out One-In | Four Out One In, Horns |
| Grit and Grind | Grit and Grind, Full Court Press |
| Glass Fortress | Grit and Grind, Horns |
| 3-and-D Paradigm | Box-and-One, Full Court Press, Four Out One In |
| Switchblade Pressure | Full Court Press, High Pick & Roll, Motion Offense |
| Five-Out Fortress | Four Out One In, Box-and-One |

---

## 7. Play call resolution

The simulation can keep its existing possession-by-possession depth-chart model. A Play only changes the order in which lineups are selected for its allocated possessions.

### Offensive possession

1. Decide whether the possession belongs to the offensive tactical budget and, if so, select an allocated offensive Play.
2. Validate that the assigned role players can form a legal five-player lineup.
3. Raise or force the assigned players' selection probability in their designated position columns.
4. Select the remaining lineup positions normally from the depth chart.
5. Resolve the possession through the current three-channel engine, then apply the Play's on-call modifier if Online/Refined/Mastered.

### Defensive possession

1. Decide whether the opponent possession belongs to the defensive coverage budget and, if so, select an allocated defensive Play.
2. Validate and prioritize the assigned defenders in a legal defensive lineup.
3. Resolve the opponent's normal offensive profile.
4. Apply the defensive Play's coverage modifiers through `defenseMods`.

If no legal play lineup is available, the possession falls back to the normal depth-chart process. No hidden automatic reroll should force an illegal lineup.

---

## 8. Recommended user experience

During the draft and roster-building screens, show visible progress rather than hiding the system completely:

```text
Inside-Out — Online
Finisher: 4 / 4 carriers, 9 / 9 affinity
Sharpshooter: 2 / 2 carriers, 5 / 4 affinity
Starter condition: met

High Pick & Roll — Refined
Handler: Chris Paul, Floor General 3
Roller: Amar'e Stoudemire, Finisher 3
Allocation: 9% of offensive possessions
Mastery: available if Inside-Out is selected
```

The opponent need not see the exact effects before the game. The drafting player, however, must be able to understand what they are building toward.

---

## 9. Tuning and rollout

1. Implement the Play assignment and lineup-priority framework first with **High Pick & Roll** and **Box-and-One**. They validate the core offensive and defensive cases.
2. Run simulations comparing normal depth-chart lineup shares against 7%, 9%, 10%, and 12% allocated Plays. Confirm that a called Play noticeably raises the featured players' appearance rates without erasing the depth chart.
3. Add the 30% offensive and 25% defensive budget caps before enabling multiple Plays.
4. Introduce mono and two-color archetypes. Measure how often a typical draft finishes with zero, one, two, or more eligible plans.
5. Add Gold plans only after card-pool data shows their keystone traits and relevant badge carriers appear often enough to be a real lane, but rarely enough to remain special.

The most important balance target is not equal win rate between every identity. It is that a focused roster normally obtains one strong identity, a few Plays it can run well, and a visible reason to choose its draft path over generic high-overall-value selections.
