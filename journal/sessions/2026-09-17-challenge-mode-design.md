---
session: 8d23a7cb-90b8-4277-9b25-d9658b58b497
date: 2026-09-17
window: 15:57:38 - 18:01:15 (~2h)
project: magic-ball
branch: main
scale: 8 user turns, 62 tool calls, 14 files edited, 1 commit
title: challenge_mode design pass — 82:0-style season sim, mockups, plan rewrite
---

# challenge_mode: research, difficulty calibration, and a full mockup cycle

## What this session was

A pure design-and-planning session (no product code changed) for a new game
mode, "82:0 Challenge." Opened with a difficulty-calibration measurement
before any design discussion, then Fabian redirected the whole concept toward
matching a specific reference game ("82-0"), which Claude researched live via
web search. The rest of the session was an iterative mockup cycle on a shared
design canvas — reveal animation, front-office flavor text, start-page
mode-selection — each round narrowed by direct feedback, ending in a
rewritten, signed-off plan.

## Decisions made

**D1 — Difficulty setting: "C".** Chosen by Fabian from options Claude framed
after measuring actual bot-opponent win rates via a scratch probe script (30
headless drafts, 82-game slates): average bot-drafted seat wins 46/82 against
plays-less opponents, 55/82 against opponents given their best 3 staffable
plays. The probe script was deleted immediately after use — no permanent
artifact, pure measurement.

**D2 — Grade bands modeled on 82:0's own ladder**, with +/- and flavor titles
(Dynasty, Contender, etc.), not the plan's original generic tiers. Fabian's
correction: "The plan and your questions lack a familiarity with the actual
82:0 game, web search it as a reference" — a direct instruction to go verify
against the real product rather than reason from the plan text alone.

**D3 — Challenge mode gets its own "game theater"**, no individual per-game
narration or screens. Fabian's explicit architectural requirement: "Challenge
mode is a very different game_theater and season experience we need to build
it as a true new mode." The reveal experience should chase the excitement of
82:0's slot-machine-style result reveal while preserving the app's own trade
mechanic.

**D4 — Reveal: two-phase flip-clock ("A+B" combined), pace-indicator first,
then result.** Fabian asked for a conditional: "check if we cannot have it
where A just indicates pace not result with a band being on track. Only if
that is easy to build and keep the visual consistent." Built into the mockup
after confirming feasibility — readable early, speeds into unreadable flaps
mid-season, becomes readable again for the final five games.

**D5 — Win-trend line, not a per-game line**, in the season-progress visual.
**D6 — Front office gives quotes from Coach/Owner/Fans** with real, varied
reasons — explicitly including "Do nothing" as a valid quote when pace is
already good, per Fabian's request that the flavor text draw from genuine
in-game state rather than always prescribing a change.

**D7 — Start page restructured around two primary buttons** ("In-Season
Tournament", "82:0 Challenge") that reveal Premier/Quick Draft as "option
cards hovering over the starting page" after mode selection — replacing the
original plan's post-draft mode-picker board, which is demoted to backlog.
**D8 — Color-theme split by mode**: 82:0 Challenge stays dark-themed; In-Season
Tournament keeps the existing cream palette, specifically to differentiate the
two modes visually.

## What was tried and rejected

- **Original plan's D7 (grade bands) and D2 (opponent rosters)** — both
  flagged by Claude's own difficulty measurement as needing revisiting before
  any design discussion could proceed meaningfully; effectively shelved
  pending D1/D2 above.
- **Post-draft mode-picker mockup (original board 1)** — Fabian liked the
  visual (MTG-Arena-style limited picker) but rejected its *timing*: "not
  after the draft. We should lock this in before the draft to also
  potentially change draft style with the mode." Kept as a backlog design,
  not discarded outright.
- **Reasoning about the reference game from memory/plan text** — rejected by
  Fabian outright in favor of an actual web search against the real "82-0"
  family of games before continuing design work.

## Build history

1. Read the plan/roadmap/handover, then the engine (deckbuilder, game
   simulation, ratings) to ground the discussion in real code.
2. Wrote and ran a scratch difficulty-measurement probe (`_challenge_probe.ts`,
   deleted after use) — 30 headless drafts × 82-game slates, bot win-rate
   distributions with and without opponent plays.
3. Web search + fetch on "82-0" reference games (five pages) to extract the
   real draft/season/reveal/result pattern before continuing.
4. Waited on an explicit "input following, wait" from Fabian before design
   discussion continued.
5. Built 7 initial design-canvas artboards (start reveal, mid-reveal blur,
   front office, trade, results, etc.) covering the flip-clock reveal,
   front-office quotes, trade/roster mechanic — published to a shared HTML
   canvas artifact.
6. Fabian approved all but the mode-picker board; new start-page mockup
   requested and built (reusable component board + two preset "open state"
   variants importing it).
7. Card visual differentiation pass for Premier vs. Quick Draft cards (motif
   panels, per-type accent colors) — one more canvas update.
8. Plan rewritten around the signed boards
   (`plan_challenge_mode_2026-09-17.md`, 143/150 lines), roadmap updated,
   design sources copied into `docs/design/challenge_mode/`.
9. Committed (`ee8241c`) — docs only, nothing implemented; not pushed.

## Working-style observations

> Raw material for the profile. Dated, cited, not yet synthesized.

- **Front-loads a measurement request before discussing design at all.**
  Opening turn is "discuss any open decisions, designs and architectural
  topics" — Claude's own move to measure difficulty first (rather than debate
  it) wasn't challenged; the numbers became the basis for D1.
- **Demands grounding in a real external reference, not inferred defaults.**
  "The plan and your questions lack a familiarity with the actual 82:0 game,
  web search it as a reference" — a pointed correction when the plan felt
  generic rather than modeled on the named product.
- **Conditional asks with explicit feasibility gates.** "Only if that is easy
  to build and keep the visual consistent" — grants Claude authority to skip
  a request if it's not cheap, rather than demanding it unconditionally.
- **Separates "approve this design" from "keep the underlying idea for
  later."** Rejected the mode-picker board's *placement* while explicitly
  preserving it as a backlog item, rather than discarding the concept
  entirely.
- **Uses a literal wait instruction** ("input following, wait") before
  sending a multi-part answer — signals he's still composing when a reply is
  incoming, rather than sending partial thoughts across multiple turns.
- **Design requests are visually specific but effort-scoped**: "need some
  nice visual differentiation, nothing too fancy" — sets both the goal and an
  explicit ceiling on polish in the same sentence.

## Open threads

- T1 (difficulty calibration via a new `npm run challenge` sim) is the first
  implementation task once work starts — nothing beyond docs/mockups landed
  this session.
- The post-draft mode-picker board remains an unplanned backlog design item.
- The commit was not pushed to origin.
