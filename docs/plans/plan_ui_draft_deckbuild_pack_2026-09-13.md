# Plan: ui_draft_deckbuild_pack

File: `docs/plans/plan_ui_draft_deckbuild_pack_2026-09-13.md`. Status: in progress; waves 0-1 done 2026-09-13, remaining T7 items next (see Progress).
Sequence: **2a**, before `game_engine` and `draft_ai` (both edit `hooks/useDraftEngine.ts`;
this plan lands first, never touches `engine/draft.ts`). Depends on nothing.
Files owned: `frontend/src/components/{PackOpener,PackRevealCard,DraftRoom,DraftSidebar,
DeckBuilder,PlayPanel,TopKPIBand,PlayerCard,RadarChart,DonutChart}.tsx` + new components in
Tasks, `hooks/useDraftEngine.ts`, `lib/{sessionBuilder,draftTimer,packReveal,
rosterChecklist}.ts`, `app/{page,draft,roster,rosters,deckbuilder-test,
pack-opener-preview}/**`, new `src/audio/`, new `engine/{depthChart,positions}.ts`,
`engine/deckbuilder.ts` (eligibility + optional session fields), `tests/*.spec.ts`.

Why: pack opener has no rarity moment, draft room has no motion/clock, the deck builder
(1,217 lines) leans on drag-and-drop/`alert`/`confirm`/hidden lock reasons and disagrees
with the engine on position eligibility. Goal: MTG-Arena-style drafting, click-first
builder. Engine numbers untouched.

## Decisions (locked)

Draft modes and flow
- D1 Two CTAs on the home page; Premier is primary. Route `/draft?mode=quick|premier`,
  read server-side in `app/draft/page.tsx`; missing/unknown = `premier`. Optional
  `DraftSession.mode` and `DraftPickRecord.autoPicked` (old sessions load unchanged).
- D2 **Quick Draft**: opener before pack 1 only, no timer, no round summaries.
- D3 **Premier Draft**: opener before every pack (skippable). After the last pick of packs
  1 and 2 the draft pauses in a new state `round-summary`: Active roster and G-League side
  by side (G/F/C bars, rarity counts, badge tally, plays), "Next pack passes left/right",
  one button "Start round N" that runs the next opener. Pack 3 goes straight to the builder.
- D4 Premier picks are timed: seconds per pick 1..8 = `[60,55,50,40,30,20,15,10]`; ring
  amber under 10s, red+pulsing under 5s. `pickDeadline` (epoch ms, `useDraftEngine`) is
  drawn by `PickTimerRing`; arms once a pack is in place, null during
  openers/summaries/quick mode. Dev-only `?clock=fast` scales it.
- D5 On timeout `expirePick(overallPick)` picks for the human via `getBotPick` on a
  synthetic neutral seat (no engine change), zone **Active**, `autoPicked: true`, ticker
  "Clock took <name> for you". Guarded by `overallPick` (no double-pick). Bots unaffected.

Pack opener v2
- D6 Cards dealt face down in rarity order (Common→Mythic; play card by its own rarity)
  so the guaranteed Rare+ slot flips last. Auto-stagger 120ms; Rare holds 700ms glowing,
  other cards dimmed; Mythic holds 950ms with glow+edge flash+shake. Pure helper
  `lib/packReveal.ts` (`orderForReveal`, `buildRevealTimeline`); reduced motion = one
  200ms fade + static 400ms glow, no shake.
- D7 **Pick from the spread**: after the last flip the spread stays; click selects, "Take
  <name>" (Enter) confirms; zone always Active (a zoning default, not roster auto-fill).
  Skip (Esc) jumps to the revealed spread, pick still made there. Opener renders inside
  the real room's `<main>` (header/sidebar blurred behind, `DraftRoomIntroBackdrop`
  deleted); heading "Pack N of 3".
- D8 Handoff is the pass animation (D10) itself: seven remaining cards slide to the
  neighbour, next pack slides in; only the picked card flies to its sidebar row via a
  framer-motion `layoutId`/`LayoutGroup` (fallback: `getBoundingClientRect` fly-to-rect).
- D9 Sound: `src/audio/sfx.ts` synthesizes `tear`/`flip`/`rareSting(rarity)` via Web Audio
  (no files); AudioContext on first click; gain 0.15; toggle in opener + draft header;
  `localStorage['magicball.sfx']`; **off by default**.

Draft room v2
- D10 `PackPassStage`: pack exits 140px toward the passing side, next enters from the
  other side, 280ms each (~600ms total, skippable via click/key). Bot avatars pulse in
  passing order (40ms stagger), ticker rows animate with the same stagger.
- D11 Header adds the timer ring (Premier only), a mode pill, and the SFX toggle.

Deck builder v2
- D12 Slot model: 5 columns x 4 fixed slots (Starter, Bench 1-3); roster exactly 12; a
  full column's empty slots disabled ("Column full"), a 13th player refused via toast.
  Persisted shape stays the dense `Record<Position, string[]>`; pure helpers in
  `engine/depthChart.ts` (`placeFromBench`, `moveWithinChart`, `removeFromChart`, `countPlayers`).
- D13 One source of position eligibility: `engine/positions.ts` (`naturalPositions`,
  `positionFit`, `defaultColumn`); UI's four local copies and the engine's private
  `getEligiblePositions` deleted. Bots stay natural-only.
- D14 Click-first: select a G-League row then click a slot; empty-slot click opens the
  same **AssignPopover** an empty play role uses (extracted from `PlayPanel.RoleRow`);
  ▲/▼ and native HTML5 drag stay for pointer devices (no framer `drag` prop — conflicts).
- D15 Feedback: `ToastProvider` (no library) replaces `alert`/`confirm`; the move happens
  immediately, toast offers Undo (5s) from a snapshot; ineligible drops/clicks toast the
  engine reason. **Roster ready** checklist (12 players, 5 starters naming the missing
  column, 3 plays, roles valid, identity optional) replaces tooltip-only Save blockers.
- D16 Why-locked hints: each identity lane shows, after its unlocked plans, the
  highest-progress locked plan with up to two `ArchetypeStatus.missing` conditions,
  muted, not clickable (amends "locked plans hidden" to "not selectable, one hint per
  lane"; AGENTS.md updated).
- D17 Fluid layout: builder body is a container; plays column/G-League sidebar use `cqw`
  min/max, not fixed widths; report band wraps under 1000px; radar/donut become viewBox
  SVGs. Verified 1024-1920px; phone landscape unverified but no fixed-width region.
- D18 Readability: small cards show 2 badges + "+N", list rows 3 + "+N"; PlayPanel role/
  player names 11px, requirement text 10px, name truncates before the position pill.
- D19 Save flow: "Save" (`/rosters`) and "Save & play season" (`/season?rosterId&sessionId`,
  only with a session). New `/roster/[id]` edit route passes `sessionId` through;
  `/deckbuilder-test?rosterId=` redirects there (else keeps its sandbox); `/rosters` links
  to the new route. (Restates AGENTS.md: no OVR to users, rarity as gem not frame, no
  inspect panel, no roster auto-fill.)

## Progress

- 2026-09-13: wave 0 (T0, driver) done — contracts/stubs for D1-D19 landed and compiled
  (`lib/draftTimer.ts`, `engine/{positions,depthChart}.ts`, `Toast.tsx`, `audio/sfx.ts`
  stub, `RosterDistribution`/`AssignPopover` extractions, widened `useDraftEngine`/
  `PackOpener`/`DraftRoom` APIs). Commit `cfa1858`.
- 2026-09-13: wave 1 (T1-T6, six parallel agents) done, followed by a driver T7
  integration pass — real hook behaviour (round-summary, pick clock, timeout auto-pick),
  reworked opener (D6-D9), draft room v2 (D10-D11 + home CTAs), deck builder v2 (D12-D15,
  D17, D19), presentation polish (D16, D18), `/roster/[id]` route. T7 fixed cross-agent
  integration gaps: opener's `onPick` wasn't wired to `pickFromIntro` (picks were never
  recorded), clock scale wasn't passed to `armIntroClock`, `RoundSummary`'s pack numbers
  were off by one, `PickTimerRing` duplicated the timer schedule. `tsc`/lint (0 errors)/
  `npm test` (184 tests)/`next build` all clean; live verification blocked by the
  parallel `auth_approval` session's login gate. Commit `1bdc599`. Remaining: Playwright
  specs beyond `home.spec.ts`, screenshots, and a manual click-through once auth allows it.

## Out of scope

Engine/balance numbers (game_engine), bot valuation (draft_ai), season/game views, phone
portrait (mobile_pwa), audio files/music, resuming a draft after a page reload.

## Tasks

- T0 Contracts (driver): done — see Progress.
- T1 Hook (mid): done. T2 Opener (top): done. T3 Draft room (mid): done. T4 Builder
  (top, longest pole): done. T5 Presentation (mid): done. T6 Routes/docs (low): done.
  All six — see Progress for what shipped and file names.
- T7 Integration (driver, top): cross-agent wiring fixes done (see Progress); remaining —
  Playwright specs beyond `home.spec.ts`, screenshots, type-check/lint/tests, commits.

## Parallelization

Wave 0 (T0, driver) done. Wave 1: T1-T6 in parallel, disjoint files. Wave 2: T7 (driver;
agents never run git). Wall-clock with agents: 1.5-2 days.

## Recommended model tier

Driver: Fable 5.1/Opus 5/Gemini 3 Pro (T0, T2 motion design, T7). Agents: Opus 5/Gemini 3
Pro for T4; Sonnet 5/Gemini 3 Pro for T1, T3, T5; Haiku 4.5/Gemini 3 Flash for T6.

## Verification / exit criteria

- Vitest: `draftTimer`, `packReveal` (rare last, holds inserted, reduced-motion total),
  `depthChart`, `positions` (engine/UI agree on `G-F`, `F/C`, `G`), `rosterChecklist`,
  `bots.test.ts` still green. `npm test`, `tsc --noEmit`, `npm run lint` clean.
- Playwright (dev server running): `draft-quick` (no second opener), `draft-premier`
  ("Round 1 complete" / "Pack 2 of 3"), `draft-timer` (`?clock=fast` → "Clock took"),
  `deckbuilder` (click-to-add, empty-slot popover, 13th add toasts), `save-play`
  (→ `/season?rosterId=…&sessionId=…`; premier spec also at 1024x768).
- Screenshots of `/pack-opener-preview?pack=2&timed=1` (Mythic hold), `/draft?mode=premier`
  round summary, `/roster/[id]` at 1024-1920px wide; checked for clipping.
- Manual: one full Premier draft with SFX on, one Quick draft, one roster built by click
  only (no drag), one edited roster keeps its Play Season button.
