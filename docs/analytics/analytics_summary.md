# Game Data Analytics Report & User Notes

> **Stale**: measured before Phase 0 and the plays & identities milestone; regenerate
> with `npm run analyze`.

I've successfully run the `analyze_game_data.js` script on your recent draft and season logs. We've gathered data from **5 Draft Sessions, 5 Seasons, and 35 Games**. 

Here is the breakdown of the most important findings from the analysis, alongside your architectural notes:

## 🚨 Critical Balance Issues

> [!WARNING]
> Turnovers are almost non-existent!
> **Turnover Rate:** 0.8% (NBA average is ~13-14%). The game engine is drastically under-calculating turnovers, leading to inflated possessions and offensive stats.
> 
> **User Note:** *In the game mechanics docs, turnovers are not real turnovers. They are artifacts of the game theater and a function of the delta between a team's real possessions (determined by noise + possession battle result) and nominal possessions (100). So comparing them to real TO rate is moot.*

> [!WARNING]
> Offense is generally too powerful. 
> **Points Per Possession (PPP):** 1.290. This is exceptionally high (NBA average is ~1.15). Only 36% of game scores fall into a realistic NBA range [90-130].
>
> **User Note:** *This is a function of edge and output scale. Maybe edge scales too much. My hypothesis is that edge always rewards the same team (likely if a team has an offensive edge once, it has it always and therefore scores a lot).*

## 🏀 Gameplay & Drafting Mechanics

**OVR Impact (Skill vs. Luck):**
- **Win Rate for Higher OVR Team:** 70.6%
- **Upset Rate (Lower OVR Wins):** 29.4%
- **Pearson Correlation (OVR diff to Score Margin):** 0.544
*Verdict:* The balance here is actually **great**. A 0.544 correlation means team quality drives the outcomes, but there's a healthy ~30% variance/upset rate so games don't feel entirely predetermined.

**AI Drafting Capability:**
There is a massive gap in drafted team strength between the best drafter (usually you) and the worst AI drafter (up to 11.1 OVR difference). The AI draft logic might need to be tightened up to prioritize high-value cards better, as the draft can feel a bit "swingy" currently.

**Home Court Advantage:**
- Home teams won 17-18 (48.6%) with a 0.1 point average edge.
*Verdict:* Home court advantage is currently non-existent in the engine.

## ✨ Synergies & Plays

### Synergies are way too easy to trigger
Most synergies are triggering in 85%+ of games, meaning they don't feel special or require strategic deckbuilding.
- **Point God System:** 91.4%
- **Court Vision:** 90.0%
- **Inside-Out:** 90.0%
- **Paint Dominance:** 87.1%
- **Midrange Money, Young Guns, Boards Brigade:** ~90%+

> **User Note:** *We need to reduce the number of synergies and how they are triggered.*

*Conversely, some are too rare:*
- **Brotherhood:** 7.1%
- **Lockdown Squad:** 18.6%

### Play Effects are Imbalanced
- **High Pick & Roll:** Fully activates 64.7% of the time (Strong).
- **Horns:** *Never* fully activates (91.7% of the time it fails completely).
- **Four Out One In:** 100% fail rate.

---
### Next Steps
We should prioritize fixing the **turnover rate formula** in the game engine first, as fixing that will naturally lower the inflated PPP and bring game scores back into the realistic 90-130 range. We also need to tighten the requirements for the most common synergies. 

How would you like to proceed?
