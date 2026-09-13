# Plan: ui_draft_deckbuild_pack

File: `docs/plans/plan_ui_draft_deckbuild_pack_2026-09-13.md`. Status: in progress (2026-09-13).
Sequence: **2a**, before `game_engine` and before `draft_ai` (both this plan and draft_ai edit
`hooks/useDraftEngine.ts`; this plan lands first and never touches `engine/draft.ts`). Depends
on: nothing; a second session can run `analytics_tooling` or `data_storage` in parallel.
Files owned: `frontend/src/components/{PackOpener,PackRevealCard,DraftRoom,DraftSidebar,DeckBuilder,PlayPanel,TopKPIBand,PlayerCard,RadarChart,DonutChart}.tsx`
plus new components listed in Tasks, `hooks/useDraftEngine.ts`, `lib/sessionBuilder.ts`,
`app/{page,draft,roster,rosters,deckbuilder-test,pack-opener-preview}/**`, new `src/audio/`,
`src/lib/{draftTimer,packReveal,rosterChecklist}.ts`, new `engine/{depthChart,positions}.ts`,
`engine/deckbuilder.ts` (position eligibility + optional session fields only), `tests/*.spec.ts`.

## Context

Drafting is the first thing a player does and the deck builder is where every strategic
choice lands, yet both are functional rather than exciting. The pack opener (shipped
2026-09-13) runs once, flips all eight cards on a timer with no rarity moment, then hard-cuts
to the grid over a hand-built fake backdrop. The draft room has no motion between picks and
no clock. The deck builder is a 1,217-line component that relies on drag and drop, reports
errors through `alert`, `confirm` and tooltips, hides why an identity is locked, duplicates
the engine's position rules with different results, and drops the season link when a roster
is edited. This plan makes drafting feel like MTG Arena (two modes, timed premier picks, a
pack ceremony every round, round summaries), makes the reveal a rarity event, and makes the
deck builder click-first, self-explaining and fluid. Engine numbers are untouched.

## Decisions (locked)

Draft modes and flow
- D1 Two CTAs on the home page; Premier is primary. Route `/draft?mode=quick|premier`,
  read server-side in `app/draft/page.tsx`; missing/unknown = `premier`. New optional
  `DraftSession.mode` and `DraftPickRecord.autoPicked` (old sessions load unchanged).
- D2 **Quick Draft**: opener before pack 1 only, no timer, no round summaries.
- D3 **Premier Draft**: opener before every pack (skippable). After the last pick of packs
  1 and 2 the draft pauses in a new state `round-summary`: Active roster and G-League side
  by side (G/F/C bars, rarity counts, badge tally, plays), "Next pack passes left/right",
  one button "Start round N" that runs the next opener. After pack 3 the deck builder
  opens directly.
- D4 Premier picks are timed. Seconds per pick within a pack, index = pick 1..8:
  `[60, 55, 50, 40, 30, 20, 15, 10]`; ring turns amber under 10 s, red and pulsing under
  5 s. The deadline (`pickDeadline`, epoch ms) lives in `useDraftEngine`; the countdown
  is drawn by a `PickTimerRing` component. The clock arms when a pack is in place (after
  the pass animation, or when the opener's spread is ready) and is null during openers,
  summaries and in quick mode. Dev-only `?clock=fast` scales it for tests.
- D5 On timeout `expirePick(overallPick)` picks for the human with `getBotPick` on a
  synthetic neutral-profile seat (no engine change), zone **Active**, record `autoPicked`,
  ticker line "Clock took <name> for you". Guarded by `overallPick` so a late timer
  cannot double-pick. Bots keep picking instantly.

Pack opener v2
- D6 Cards are dealt face down in rarity order (Common, Uncommon, Rare, Mythic; the play
  card ranked by its own rarity), so the guaranteed Rare+ slot flips last. Flips
  auto-stagger at 120 ms; a Rare holds 700 ms with a gem-coloured glow ring and the other
  cards dimmed; a Mythic holds 950 ms with glow, edge flash and a short shake. Timeline is
  a pure helper (`lib/packReveal.ts`: `orderForReveal`, `buildRevealTimeline`).
  Reduced motion: cards appear revealed in one 200 ms fade, static 400 ms glow, no shake.
- D7 **Pick from the spread**: after the last flip the spread stays; click selects, a
  "Take <name>" button (Enter) confirms; zone is always Active (a zoning default, not
  roster auto-fill). Skip (Esc) at any earlier phase jumps to the fully revealed spread;
  the pick is still made there. The opener renders inside the real draft room's `<main>`
  with the grid's own column classes, header and sidebar blurred behind it; the
  hand-built `DraftRoomIntroBackdrop` is deleted. Heading is "Pack N of 3".
- D8 Handoff is the pass animation itself (D10): the seven remaining cards slide out to
  the neighbour and the next pack slides in; only the picked card flies to its sidebar row
  via a framer-motion `layoutId` inside one `LayoutGroup` in `DraftRoom`. Fallback if the
  shared layout proves unreliable: a fly-to-rect using `getBoundingClientRect`.
- D9 Sound: `src/audio/sfx.ts` synthesizes `tear`, `flip`, `rareSting(rarity)` with the
  Web Audio API (no files); AudioContext created on the first click; master gain 0.15;
  toggle in the opener and draft header; `localStorage['magicball.sfx']`; **off by
  default**.

Draft room v2
- D10 `PackPassStage`: on each pass the pack exits 140 px toward the passing side and the
  new one enters from the other side, 280 ms each, about 600 ms total; any click or key
  finishes it instantly. Bot avatars pulse in passing order (40 ms stagger) and ticker
  rows animate in with the same stagger. Header shows all 8 seats compactly.
- D11 Header adds the timer ring (Premier only), a mode pill, and the SFX toggle.

Deck builder v2
- D12 Slot model: 5 columns x 4 fixed slots (Starter, Bench 1-3); roster exactly 12; a
  full column's empty slots are disabled with "Column full", a 13th player is refused with
  a toast. Persisted shape stays the dense `Record<Position, string[]>`. Pure helpers in
  `engine/depthChart.ts` (`placeFromBench`, `moveWithinChart`, `removeFromChart`,
  `countPlayers`) with unit tests.
- D13 One source of position eligibility: `engine/positions.ts` (`naturalPositions`,
  `positionFit` natural/adjacent/none, `defaultColumn`); the UI's four local copies and
  the engine's private `getEligiblePositions` are deleted. Bots stay natural-only
  (behaviour unchanged).
- D14 Click-first: select a G-League row then click a slot; click an empty slot to open
  the same **AssignPopover** an empty play role uses (extracted from `PlayPanel.RoleRow`);
  ▲/▼ and native HTML5 drag between slots stay for pointer devices. No framer `drag` prop
  (known conflict with native drag).
- D15 Feedback: a small `ToastProvider` (no library) replaces `alert` and both `confirm`
  calls; the move happens immediately and the toast offers Undo (5 s) from a snapshot of
  depth chart + assignments. Ineligible drops/clicks toast the engine reason. A
  **Roster ready** checklist (12 players, 5 starters naming the missing column, 3 plays,
  roles valid, identity chosen as optional) replaces the tooltip-only Save blockers.
- D16 Why-locked hints: each identity lane shows, after its unlocked plans, the highest-
  progress locked plan for that lane with up to two `ArchetypeStatus.missing` conditions in
  muted text, not clickable. This amends the earlier "locked plans hidden" rule to
  "locked plans not selectable; one nearest hint per lane"; AGENTS.md is updated.
- D17 Fluid layout: builder body is a container; plays column and G-League sidebar use
  `cqw` bases with min/max instead of `w-[300px]`/`w-[350px]`; report band wraps under
  1000 px container width; radar and donut become viewBox-scaled SVGs. Verified at 1024,
  1280, 1536 and 1920 px wide. Phone landscape is not verified but no main region has a
  fixed width.
- D18 Readability: small cards show 2 badges + "+N", list rows 3 + "+N"; PlayPanel role
  and player names 11 px, requirement text 10 px, the name truncates before the position
  pill.
- D19 Save flow: "Save" (to `/rosters`) and "Save & play season" (to
  `/season?rosterId&sessionId`, shown only when a session exists). New `/roster/[id]`
  edit route passes `sessionId` through; `/deckbuilder-test?rosterId=` redirects there
  and the route keeps its random sandbox otherwise; `/rosters` links to the new route.

Product rules restated: no OVR/ratings to users; rarity as gem never a frame; Roster /
G-League zoning stays; no inspect panel; no roster auto-fill.

## Out of scope

Engine or balance numbers (game_engine), bot valuation (draft_ai), season/game views,
phone portrait (mobile_pwa), audio files or music, resuming a draft after a page reload.

## Tasks

- T0 Contracts (driver): hook state union + new API (`mode`, `pickDeadline`,
  `pickFromIntro`, `startNextRound`, `expirePick`, `armIntroClock`, `passSeq`); signatures
  of `lib/draftTimer.ts`, `lib/packReveal.ts`, `engine/depthChart.ts`,
  `engine/positions.ts`, `Toast.tsx` API, `audio/sfx.ts` no-op interface; extract
  `RosterDistribution.tsx` from `DraftSidebar` and `AssignPopover.tsx` from `PlayPanel`
  with both callers wired; optional session fields; `PackOpener` props; `DraftRoom` `mode`
  prop. Everything compiles with stubs. Tier: top.
- T1 Hook: `useDraftEngine.ts` (shared `applyPick`, states, timer, timeout, `passSeq`),
  `lib/draftTimer.ts`, `lib/sessionBuilder.ts`; Vitest for the schedule. Tier: mid.
- T2 Opener: `PackOpener.tsx`, `PackRevealCard.tsx` (glow prop), `lib/packReveal.ts`,
  `audio/sfx.ts`, preview page with `?pack=2&timed=1` and a Rare + Mythic fixture;
  Vitest for order and timeline. Tier: top.
- T3 Draft room: `DraftRoom.tsx`, `DraftSidebar.tsx`, `PackPassStage.tsx`,
  `PickTimerRing.tsx`, `RoundSummary.tsx`, `app/draft/page.tsx`, home CTAs in
  `app/page.tsx`, `tests/home.spec.ts`. Tier: mid.
- T4 Builder: `DeckBuilder.tsx`, `DepthSlotColumn.tsx`, `RosterChecklist.tsx`, `Toast.tsx`
  body, `engine/depthChart.ts`, `engine/positions.ts`, `engine/deckbuilder.ts` eligibility
  swap, `lib/rosterChecklist.ts`; Vitest for the three pure modules. Tier: top.
- T5 Presentation: `TopKPIBand.tsx` (why-locked, wrap), `RadarChart.tsx`, `DonutChart.tsx`
  (viewBox), `PlayerCard.tsx` (badge caps), `PlayPanel.tsx` (readability). Tier: mid.
- T6 Routes and docs: `app/roster/[id]/page.tsx`, `deckbuilder-test` redirect, `rosters`
  links, AGENTS.md rule line, HANDOVER milestone. Tier: low.
- T7 Integration (driver): opener embedded in the real room, picked-card layout handoff,
  Playwright specs, screenshots at four widths, type-check, lint, tests, commits. Tier: top.

## Parallelization

- Wave 0: T0 by the driver (about 1 hour), committed so agents start from a compiling tree.
- Wave 1 (parallel, disjoint files): T1, T2, T3, T4, T5, T6. T4 is the longest pole.
- Wave 2: T7 by the driver. Agents never run git.
- Wall-clock estimate with agents: 1.5 to 2 days.

## Recommended model tier

Main driver: Fable 5.1 or Opus 5 / Gemini 3 Pro (T0 contracts, T2 motion design, T7
integration). Agents: Opus 5 / Gemini 3 Pro for T4; Sonnet 5 / Gemini 3 Pro for T1, T3,
T5; Haiku 4.5 / Gemini 3 Flash for T6.

## Verification / exit criteria

- Vitest: `draftTimer`, `packReveal` (rare last, holds inserted, reduced-motion total),
  `depthChart`, `positions` (engine and UI agree on `G-F`, `F/C`, `G`), `rosterChecklist`;
  existing `bots.test.ts` still passes after the eligibility swap. `npm test` green,
  `npx tsc --noEmit` and `npm run lint` clean in `frontend/`.
- Playwright (`npm run test:e2e`, dev server running): `draft-quick.spec.ts` (quick mode
  reaches the deck builder with no second opener), `draft-premier.spec.ts` ("Round 1
  complete" after pick 8, "Pack 2 of 3" after Start round), `draft-timer.spec.ts`
  (`?clock=fast` produces a "Clock took" ticker line), `deckbuilder.spec.ts` (click-to-add
  fills a slot, empty-slot popover fills a slot, 13th add toasts), `save-play.spec.ts`
  (Save & play season lands on `/season?rosterId=…&sessionId=…`); the premier spec also
  runs at 1024x768.
- Screenshots via `scripts/screenshot.js` of `/pack-opener-preview?pack=2&timed=1` (during
  the Mythic hold), `/draft?mode=premier` round summary, `/roster/[id]` at 1024, 1280,
  1536 and 1920 wide; element geometry checked for clipping at each width.
- Manual: one full Premier draft in the browser with SFX on, one Quick draft, one roster
  built by click only (no drag), one edited roster keeps its Play Season button.
