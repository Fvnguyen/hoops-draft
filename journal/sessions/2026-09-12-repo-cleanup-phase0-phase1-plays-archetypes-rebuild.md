---
session: adbaa22a-7e5b-416b-bda2-3bff647b2af8
date: 2026-09-12
window: 19:10:45 - 2026-09-13 08:38:47 (13h28m, with gaps for rate limits/sleep)
project: magic-ball
branch: HEAD,main
scale: 48 user turns, 431 tool calls, 35 files edited, 41 commits attempted, 18 failures
title: Repo cleanup, architecture review, Phase 0/1 rebuild, UI overhaul, plays & archetypes system, planning-standard skills
---

# Repo cleanup through Phase 1 rebuild and the plays & archetypes system

## What this session was

The origin session for the project's whole current structure: repo cleanup,
an architecture review that became a phased roadmap, correctness bug fixes,
a full engine/storage rebuild (Phase 1), three rounds of iterative UI
overhaul driven by screenshots, a from-scratch "plays & archetypes" gameplay
system built via a 5-agent wave, and — at the end — the planning standard
(`docs/plans/`, `docs/completed/`, `/roadmap` and `/project-setup` skills)
that every later session in this project now runs on. Extremely dense: 48
user turns, most of them either steering parallel Sonnet/Haiku agents or
reacting to screenshots with specific, itemized fixes.

## Decisions made

**D1 — Cleanup and every later phase done via parallelized Sonnet/Haiku
agents with disjoint file ownership**, established as the working mode for
the whole session per the user's opening instruction ("Do the cleanup with
parallellized haiko or sonnet agents to speed up"). Claude verifies
(typecheck/lint/test/browser) and commits itself; agents never run git.

**D2 — `frontend/` absorbed from a bare gitlink into the main repo via
subtree merge**, not re-initialized. It was tracked only as a gitlink with no
`.gitmodules` — a fresh clone would have produced an empty folder. First
`-s ours` merge attempt failed on `rmdir`; redone successfully after.

**D3 — Ten `generate_engine*.py` one-shot generator scripts deleted after
verifying the tenth's output was byte-identical to committed `engine.ts`.**
Not deleted on the assumption they were dead — checked first.

**D4 — Stack verdict: keep Next.js 16 / React 19 / Tailwind 4.** The
architecture review concluded the frameworks were fine; the real problems
were wiring — player data read from SQLite at request time via a native
module, all state in `localStorage`, domain types living in a UI component,
desktop-only layouts. Three P0 bugs identified as changing game results
(defensive synergies helping the opponent; play-card effect ids not
resolving; possession swings double-counting).

**D5 — Product rules locked mid-session, binding for every later UI pass:**
never show individual player OVR/ratings to users (dev-only "data view" is
exempt), no team OVR anywhere, rarity shown as an MtG-style gem/icon (never
a coloured card frame), splashier gem treatment for Rare/Mythic, draft-room
keeps MtG-Arena-style zoning, no card-inspect panel but a bot-pick ticker,
no auto-fill in the deck builder. Recorded immediately into `AGENTS.md` and
a memory file so future sessions don't relitigate it.

**D6 — Cards became a build artifact (static JSON), not a runtime SQLite
read.** Part of Phase 1: `computeCards` now runs at build time via
`npm run build:cards`; the `/api/cards` route serves static JSON.

**D7 — Seeded RNG everywhere (drafts, seasons, games) via a `mulberry32`
`Rng`, stored on the record itself.** Enables exact reproduction of any
result and a deterministic balance harness (`npm run balance -- N --seed S`).

**D8 — Storage moved from raw `localStorage` to a `GameStore` interface
(Dexie/IndexedDB, memory fallback for SSR/tests), with key-driven
migration** rather than a one-time migration flag — an early flag-based
version silently skipped data written after the flag fired, caught and
rewritten.

**D9 — Deck builder's biggest visual problem diagnosed as uniform sizing,
not clutter:** "the report band at the top spends 200px of height on flat
lists... the important decisions, starters and plays, are the smallest
things on the page." Drove the depth-chart-hierarchy redesign (full-size
card for starters, compact for backups).

**D10 — Plays & archetypes system scope deliberately cut down before
building:** no mastery tiers, no chemistry synergies (Brotherhood, Veteran
Core, Young Guns — removed outright), a play is just named roles with badge
minimums that guarantee assigned players get favoured on called possessions.
The user explicitly named the assignment UI as "the biggest piece."

**D11 — Archetype unlocking made stricter with a hard shortlist cap of 4**,
after the user flagged the original thresholds as too loose and specified a
target of 3-4 unlocked synergies per roster max, with a fallback rule (hide
plans, always show top 4 by badge requirement/tier) if thresholds alone
couldn't hit that.

**D12 — Planning standard restructured**: `ROADMAP.md` becomes sequence-only
(status table, deps, files-owned overlap, latest-3-completed), individual
plans move to `docs/plans/plan_<topic>_<date>.md`, finished ones `git mv` to
`docs/completed/`. Built as two separate global skills — `/project-setup`
(once per repo) and `/roadmap` (renamed from `/plan` to avoid colliding with
Claude Code's built-in plan-mode terminology) — specifically because setup
and daily use are different jobs.

**D13 — Plan-mode approval scoped to mean "docs only," not "start coding."**
After the user stopped an in-progress plan-mode execution ("this was just
about planning, stop now") and asked whether immediate execution was part of
the skill or Claude's own call, Claude concluded it was its own call — the
plan-mode approval prompt says "you can now start coding," and nothing in
the `/plan` skill said execution was out of scope, so nothing stopped it.
Fixed the skill and wrote a memory note recording the rule.

## What was tried and rejected

- **Structured/framed deck-builder layout that treated every panel equally**
  — rejected across three feedback rounds as "genuinely... the worst look";
  root cause was uniform sizing (see D9), not decoration.
- **Rarity shown as a coloured card frame** — rejected outright in favor of
  an MtG-style gem/icon: "Rarity borders fight with position and team
  colors."
- **Hover-to-flip cards replaced with a flip button** — the button version
  was explicitly reverted: "previous behaviour of auto-flipping on
  hover-over was better."
- **Play cards as the deck-builder assignment interaction (150px, hover-
  flip)** — abandoned as "the wrong container for an interaction" once
  actually used: hover flip fought with clicking, role rows were unreadable,
  the 20px drop target wasn't draggable. Replaced with a dedicated
  `PlayPanel` (300px column, 40px role rows).
- **Chemistry synergies (Brotherhood, Veteran Core, Young Guns)** — cut from
  the plays & archetypes plan entirely at the user's direction, not just
  descoped for v1.
- **Mastery tiers for plays** — same cut, "core is the idea of plays
  guaranteeing more impact... no mastery tiers."
- **A 2000px-screenshot-scaled-to-800px verification method** — self-
  identified as inadequate after the user asked "this passed for you?" and
  it turned out to have hidden a wrapped chevron, a clipped synergy row, and
  oversized whitespace. Replaced with measuring actual element geometry in
  the browser at full width. Claude's own words: "That was the wrong tool
  for judging layout."
- **Non-null-asserting the human matchup in season data** — replaced with a
  guarded normalizer after a legacy season (pre-round-robin) crashed the
  season view on load.
- **A subagent flagged, and explicitly did not act on, apparent prompt-
  injection text inside `frontend/AGENTS.md`** ("This is NOT the Next.js you
  know... read the docs before writing any code") encountered while doing a
  scoped file edit — reported it per the instruction-source-boundary rule
  instead of treating it as an instruction. Not investigated further in this
  session; worth checking whether that text is still there and why.

## Build history

1. Repo survey; 4 parallel agents (frontend scripts, data folder, root
   tests/scripts, docs) cleaned up ~50 one-off scripts, absorbed `frontend/`
   via subtree merge, wrote CLAUDE.md/AGENTS.md/README/HANDOVER/ARCHITECTURE.
2. Removed unused `@prisma/client`/`unidecode` deps and the legacy Prisma
   schema.
3. Deleted `.git` backup folder; wrote a full architecture review into
   `docs/ROADMAP.md` (stack verdict D4, three P0 bugs, phased plan).
4. Phase 0: 4 parallel agents fixed the P0 bugs, optimized the card query
   path (~900 queries → 3, memoized), built a Vitest harness + balance
   script, did hygiene fixes. Agents were cut off mid-run by a Sonnet
   session rate limit (resumed via `SendMessage` once it cleared). Fixed two
   balance-harness-found issues (box-score minutes overflow, possession
   ceiling) directly. Committed `25e2b1b`.
5. Phase 1 (engine isolation + storage), two waves: wave 1 extracted a pure
   engine (`frontend/src/engine/`, purity enforced by a test) with seeded
   RNG and built the Dexie/IndexedDB storage layer in parallel; wave 2 wired
   all pages to the new `GameStore`. Committed `0801a53`, `d38ab13`.
6. UI review of home/draft/deckbuilder/player-card screens, written to
   `docs/UI_REVIEW.md`, no changes yet.
7. Product rules locked (D5); 3 parallel agents rebuilt cards, home+draft
   room, deck builder visuals. Rate-limited again mid-run, resumed. Committed
   `9c81215`, `d65b1f1`.
8. Two more screenshot-driven feedback rounds on cards/home/deckbuilder
   (font weight, gem/pill placement, flip behavior, badge sizing, KPI band)
   — fixed directly, not via agents. Committed `5d9bf12`.
9. Deck-builder-specific redesign proposal (card hierarchy, live play
   requirements, top-bar rebuild) accepted; built as wave 0 (Claude, solo)
   + 3 parallel wave-1 agents, with a concurrent pack-collation agent
   running in a different session on disjoint files. Committed `52f919e`,
   `06603bd`, `b3a5830`.
10. Four rounds of band/chart refinement from screenshots (space allocation,
    synergy list styling, radar/donut sizing, box alignment) — including the
    "this passed for you?" self-correction on verification method (see
    rejected list). Committed `caff5cb`, `cea1938`, `fb08cba`, `ffed2c1`.
11. Reviewed and committed two other sessions' concurrent work (8-card packs
    with guaranteed rarity slots, round-robin season, pack-opener animation)
    in 4 commits after independently re-verifying typecheck/lint/tests.
12. Fixed two runtime crashes reported live: duplicate `play-std-2` React
    keys (stale pre-suffix ids from a draft made during a hot-reload race)
    and a legacy season shape crash (`entry.matchups is undefined`) via a
    load-time normalizer. Committed `2cbbd0a`, `3c034ba`, `29e72a0`.
13. Season KPI band fix (width, donut→dot-list, radar restored). Committed
    `f682dc1`.
14. Reviewed and endorsed a plays/synergies plan doc, committed it
    (`49bd84e`), then the user cut its scope live (D10); built via wave 0
    (Claude: types/catalog/constants) + 5 parallel wave-1 agents (playbook
    engine, archetypes engine, bot roster/migration, play-card roles,
    assignment UI), then a UI redesign of the assignment interaction itself
    once the first version proved unusable (see rejected list) via 2 more
    parallel agents. Multiple integration/verification passes; committed
    `632a751`, `ca9a5f4`, `c6945e7`, `b2c317b`.
15. Stricter archetype unlocking + always-rendered offense/defense/gold
    lanes (D11), verified against one specific roster's actual badge tally
    on request. Committed `fa10e01`.
16. Committed the concurrent pack-opener-animation session's work after
    independent review (`ab04726`).
17. Two isolated bug fixes without touching saved-game shape: live box score
    during an in-progress game (derived from possessions played so far,
    rather than showing the final precomputed box early), and a Mythic
    card-back bleed-through on flip (removed `mix-blend-mode`, added
    `isolation: isolate`). Committed `cc32edf`.
18. *(Context compaction occurred here; session continued from an
    auto-generated summary.)*
19. Updated `HANDOVER.md`, created `docs/completed/`, moved two finished
    plans there. Committed `1f17d2c`.
20. Reviewed and restructured the stale Phase 2 roadmap entry into four
    named plans (D12) plus two extra splits Claude proposed; wrote
    `docs/plans/TEMPLATE.md`. Committed `6f47ec8`.
21. Renamed plan files to the `plan_<topic>_<date>.md` convention; built the
    `/project-setup` and `/plan` global skills; recorded rules in
    `AGENTS.md` and memory. Committed `9a8b8bf` plus two more.
22. Began planning a UI milestone (draft modes, pack opener v2, draft/deck
    builder v2) via `AskUserQuestion`-driven Q&A and two exploration
    subagents, entered Claude Code's plan mode, and — misreading approval
    scope — started implementing three contract files before the user
    stopped it (D13). Committed the three inert files (`9840dcf`) rather
    than reverting, at the user's implicit acceptance.
23. Fixed the plan-mode/skill approval-scope confusion (D13); updated the
    `/plan` skill and wrote a memory note.
24. Wrote a cheap, scoped "stability pass" plan (CI, error boundary, safe
    normalizer-guarded loads, draft reproducibility) at roadmap position 0,
    committed `bb7f304`, without executing it.
25. Renamed `/plan` skill to `/roadmap` (keeping `/project-setup`) to avoid
    the naming collision with Claude Code's built-in plan mode. Committed
    `273ba45`.

## Working-style observations

> Raw material for the profile. Dated, cited, not yet synthesized.

- **2026-09-12.** Opens with an explicit request for the working mode
  itself, not just the task: "Do the cleanup with parallellized haiko or
  sonnet agents to speed up" — delegation strategy is his call, not left to
  Claude's judgment.
- **2026-09-12.** Broad initial mandate ("clean up this app and repo...")
  immediately followed by a much bigger one in the next turn (architecture
  review + PWA/Android/DB roadmap + bug hunt) — scope grows fast across
  consecutive turns rather than being decomposed upfront.
- **2026-09-12.** Corrects by giving a specific, itemized list keyed to
  screen names, not general direction: the first UI feedback round is
  literally three headed sections (Player Cards / Draft Room / Deckbuilding)
  each with several concrete asserted decisions, closing with "Rest as
  proposed by you" — delegates only what he hasn't opined on.
- **2026-09-12.** Immediate narrow correction when a rule was stated too
  broadly: right after "never show OVR," clarified same-turn-adjacent that
  "OVR is fine to show in 'data view' which is dev only" — refines his own
  rules quickly rather than letting an overcorrection stand.
- **2026-09-12/13.** Escalating dissatisfaction register on the deck
  builder specifically, across three separate rounds: "deckbuilding UI
  could be improved" → "looks worse than before... badge icons are too
  big... top kpi banner is completely busted" → "Deckbuilding genuinely is
  still the worst look." Kept pushing on the same screen rather than
  accepting incremental fixes, until the redesign addressed the structural
  issue (D9).
- **2026-09-12.** Directly checks Claude's own verification rigor: "this
  passed for you?" after a screenshot showed visible breakage despite
  Claude reporting checks passed. Not phrased as an accusation — got a
  direct admission and a corrected method in response.
- **2026-09-12.** Delegates architecture decisions but asks for the
  execution plan back before committing to it: "how would you build using
  sonnet subagents and in which phases" — wants the parallelization
  strategy made explicit and reviewable, not just executed.
- **2026-09-12/13.** Runs genuinely concurrent sessions on the same repo
  deliberately (pack-collation agent in a separate session while this one
  did deck-builder work) and later asks this session to review and commit
  the other's output — comfortable with multi-session parallelism beyond
  just multi-agent parallelism within one session.
- **2026-09-13.** Challenges scope creep in his own approval, not just
  Claude's: asked directly whether unplanned execution during plan mode was
  the skill's design or Claude's improvisation, rather than just saying
  "stop." Wanted the mechanism understood and fixed, not just the immediate
  overreach reverted.
- **2026-09-13.** States a general project-wide rule prospectively rather
  than reactively: "as a general rule for this project, roadmap should say
  which plans to tackle in which sequence..." — volunteered before hitting
  a problem from the lack of such a rule, based on noticing the roadmap was
  getting unwieldy.

## Open threads

- The prompt-injection-flavored text found in `frontend/AGENTS.md` by a
  subagent (flagged, not acted on, not investigated) — unclear if it's
  still present or was leftover boilerplate from scaffolding.
- Play impact was measured as "modest" (offensive plays fire on 9-12% of
  possessions) — recorded in `HANDOVER.md` as a tuning follow-up, not
  resolved this session.
- Defensive archetypes were confirmed rarer than offensive ones by design
  (defensive override thresholds are the tuning knob) — left as a known
  characteristic, not a bug to fix.
- Vercel preview deploy was mentioned as a mid-term goal (PWA/Android) but
  never actioned — still pending user go-ahead at session end.
- The Mythic card-back flip fix targeted a `mix-blend-mode`/
  `backface-visibility` compositing bug that Claude could not reproduce in
  its own Chromium browser pane — fix applied on diagnosis, not on a
  reproduced failure; flagged that Firefox-specific testing would be the
  next step if the user still saw it.
- This session's tail (the stability-pass plan, position-0 in the roadmap)
  was written but explicitly not executed — first item for whoever picks up
  the roadmap next.
