# Plan: ui_draft_deckbuild_pack

File: `docs/plans/plan_ui_draft_deckbuild_pack_2026-09-13.md`. Status: in progress;
D1-D19 shipped 2026-09-13 (commit `1bdc599`); wave 3 (D20-D25) code-complete, three
verification gaps remain (see Verification). **Wave 4 (D26-D29) planned 2026-09-13**:
removes the draft-time zone split and wave 3's auto-distribution (superseded, see D27),
adds a hover-preview auto-dismiss timer, fixes a quarter-score spoiler.
Sequence: **2a**, before `game_engine`/`draft_ai` (both edit `hooks/useDraftEngine.ts`).
Depends on nothing.
Files owned: `frontend/src/components/{PackOpener,PackRevealCard,DraftRoom,DraftSidebar,
DeckBuilder,DepthSlotColumn,PlayPanel,TopKPIBand,PlayerCard,RadarChart,DonutChart,
RoundSummary,useHoverPreview}.tsx`, `hooks/useDraftEngine.ts`,
`lib/{sessionBuilder,draftTimer,packReveal,rosterChecklist}.ts`,
`app/{page,draft,roster,rosters,deckbuilder-test,pack-opener-preview}/**`, `src/audio/`,
`engine/{depthChart,positions,deckbuilder}.ts`, `storage/{types,safeLoad,indexedDb}.ts`,
`tests/*.spec.ts`, `tests/unit/{depthChart,storage-migration,rosterChecklist}.test.ts`.
D29 also touches `GameView.tsx` (`game_theater`'s file, one-line borrow).

## Goal

Pack opener/draft room/deck builder feel like a real MTG-Arena-style draft-to-roster flow,
click-first, no `alert`/`confirm`. Wave 4 goal: drop the draft-time Roster/G-League zone
split for one unified pick list, let the deckbuilder start from an empty depth chart
instead of an auto-distributed one, and fix two reported UX bugs (hover preview blocking
drag, a quarter-score spoiler).

## Decisions (locked)

D1-D19 (draft modes/timer, pack opener v2 motion+sound, draft room pass animation, deck
builder slot model/eligibility/click-first/toasts/readability/save flow) shipped
2026-09-13 — full text in commit `1bdc599` and git history; unchanged, not restated here.

D20-D25 (wave 3, code-complete, **superseded by D27** — kept as the record of what wave 3
shipped and why wave 4 removes it): `autoDistributeRoster` (`engine/depthChart.ts`) fixed
a bug where `defaultColumn()` always picked a position's first natural column, piling
every guard into PG — two passes over `['PG','SG','SF','PF','C']`, natural-fit before
adjacent-fallback, OVR-desc tie-break, capped at 12, overflow to G-League with a toast.
Also: `TopKPIBand`/G-League sidebar default collapsed; starter cards drop the stats grid,
`cqw`-scaled badges, bench cards `h-[36px]`; empty-slot drop targets match a real card's
footprint.

**Wave 4 — remove draft-time zoning, empty-start deckbuilder, hover-preview fix,
quarter-score spoiler:**

- D26 **Draft screen: unify to one "Roster" list.** Drop the `Zone` type and the
  Roster/G-League toggle from `DraftSidebar.tsx`/`RoundSummary.tsx` — one list of
  everything picked, labeled "Roster." Remove the zone parameter end-to-end:
  `useDraftEngine.applyPick/processPickAndPass/pickFromIntro`, `PackOpener.tsx`'s
  hardcoded `zone: 'Roster'` argument, `DraftRoom.tsx`'s `activeZone`/`humanZones` state
  and the drag/confirm/reassign handlers that maintained them, `DraftPickRecord.zone`
  (`engine/deckbuilder.ts`) and its `RoundSummary` display.
- D27 **Deckbuilder starts empty — supersedes D20/D21.** `DeckBuilder.tsx`'s fresh-draft
  init effect (`initialDepthOrder` absent) drops the `initialZones` prop and the
  `autoDistributeRoster` call; every drafted card starts in the "Roster" sidebar list, the
  depth chart starts empty (matches the existing "no auto-fill" rule). Delete
  `autoDistributeRoster` and its Vitest cases entirely, not kept as dead code. Saved-roster
  edit branch untouched.
  **Rename, don't restructure**, away from G-League language: `BuiltRoster.gLeaguePlayers
  /gLeaguePlays` (`engine/deckbuilder.ts`) → `rosterPlayers/rosterPlays` (the full,
  non-active pool, "Roster" per the new naming); the 12-man placed side keeps its existing
  depth-chart/`activePlays` fields, surfaced in the UI as "Active Roster." Update every
  call site: `DeckBuilder.tsx` (sidebar list, drag zone ids, collapse state, save-time
  zone computation), `buildBotRoster` (bots otherwise unaffected — never used zones or
  auto-distribution), `lib/sessionBuilder.ts`, `DepthSlotColumn.tsx`/`PlayPanel.tsx` copy.
  `SavedRoster.zones` (`storage/types.ts`) is dropped — membership is fully derivable from
  the saved depth chart/`activePlays`; `safeLoad.ts`'s `roster.zones` requirement becomes
  optional so old saves still load. Update `storage-migration.test.ts`/
  `rosterChecklist.test.ts` fixtures. Rewrite `AGENTS.md`'s "Draft zoning stays" rule and
  the matching sections of `docs/game_mechanics.md` §4 / `docs/ARCHITECTURE.md:97`.
- D28 **Hover-preview auto-dismiss. Done.** `useHoverPreview.ts`'s `isHovered` only cleared
  on real mouse movement off the trigger's rect — a stationary hover-then-drag left the
  preview parked over drop targets, blocking drag-and-drop. Added a
  `HOVER_PREVIEW_AUTO_DISMISS_MS = 1500` timer (named constant, easy to retune) plus a
  `document`-level `dragstart` listener that clears `isHovered` immediately — at `document`
  since `dragstart` bubbles there regardless of whether the draggable node is the hover
  trigger or an ancestor of it (e.g. a depth-chart slot wrapping its starter card),
  covering all 7 call sites (not 4 as first estimated — `PlayerCard.tsx` alone has 3) with
  one change. Mousemove-based clear unchanged, still fires immediately on real movement.
  `tsc`/lint/`npm test` (190/190) clean. Not confirmed live — this session's browser
  automation couldn't trigger a synthetic hover React's event system picks up (same class
  of gap as T8/T11's native-drag limitation); correctness rests on code review.
- D29 **Quarter-score spoiler in `GameView.tsx:372`. Done.** `filter(q => q.quarter <=
  quarter)` included the in-progress quarter's own row — `quarterSummaries` holds every
  quarter's precomputed final score up front (fully simulated ahead of playback), so
  `q.quarter === quarter` revealed that quarter's outcome before its last possession
  played. Fixed to `q.quarter < quarter || (isComplete && q.quarter === quarter)`. `tsc`/
  lint/`npm test` clean. Not confirmed live (needs a played-out game); a one-line,
  easily-reasoned boolean fix.

## Out of scope

Engine/balance numbers (game_engine), bot valuation beyond the field renames in D27
(draft_ai), season/game views and narration beyond D29's one-line fix (game_theater),
phone portrait (mobile_pwa), redesigning the depth-chart slot model itself (D12 stands).

## Tasks

- T0-T7: done, see commit `1bdc599`.
- T8 (mid): **done.** `autoDistributeRoster` (D20/D21) + Vitest cases. `npm test`/`tsc`/
  lint clean. Not live-verified through a full draft (see Verification gap 1).
- T9 (low): **done.** D22/D23 — KPI band/G-League sidebar collapsed by default. Confirmed
  live, screenshotted.
- T10 (mid): **done.** D24 — card sizing, badge scaling, drag-image swap. Confirmed live
  at 1400px; drag-image swap itself not screenshot-verifiable (see Verification gap 2).
- T11 (mid): **done.** D25 — empty-slot sizing. Confirmed live; click-to-place works;
  native HTML5 drop not automatable (Verification gap 2); Playwright spec not written
  (Verification gap 3).
- T12 (mid): D26 — strip the zone type/param/UI from `DraftSidebar.tsx`, `RoundSummary.tsx`,
  `DraftRoom.tsx`, `useDraftEngine.ts`, `PackOpener.tsx`. Done-when: `tsc`/lint/`npm test`
  clean, a screenshot of the draft room showing one unified pick list, no zone toggle.
- T13 (mid): D27 — delete `autoDistributeRoster` + its tests, empty-start deckbuilder init,
  rename `gLeaguePlayers/gLeaguePlays`→`rosterPlayers/rosterPlays` and every call site,
  drop `SavedRoster.zones` + relax `safeLoad.ts`, update `AGENTS.md`/`game_mechanics.md`/
  `ARCHITECTURE.md`. Done-when: `tsc`/lint/`npm test` clean, `storage-migration.test.ts`
  still passes against an old fixture, a `/deckbuilder-test` screenshot showing an empty
  depth chart with a full "Roster" sidebar right after a fresh draft.
- T14 (low): **done.** D28 as specced (document-level listener, not per-call-site). Manual
  hover-timing verification still owed (automation gap, see D28).
- T15 (low): **done.** D29 one-line filter fix. Manual played-out-game verification still
  owed.

## Parallelization

Wave 3: T8 and T9 ran in parallel (disjoint files); T10 then T11 sequentially (both touch
`DepthSlotColumn.tsx`).

Wave 4: T12 and T14 run in parallel (disjoint files). T13 runs after T12 (both touch the
`DraftRoom.tsx`/`DeckBuilder.tsx` hand-off) — same agent or a diff review between. T15 is
fully independent. Driver reviews against a live `/deckbuilder-test` and a played-out
`/season` game before commit.

## Recommended model tier

T8/T12/T13 mid (multi-file rename/removal, easy to miss a call site). T9/T14/T15 low
(mechanical). T10/T11 mid (careful CSS + native DnD).

## Verification / exit criteria

- `npm test`, `tsc --noEmit`, `npm run lint` clean — done for wave 3; re-run after wave 4.
- Wave 3, confirmed live: KPI band/G-League sidebar collapsed, smaller starter/bench
  cards, empty-slot sizing matches real footprint, click-to-place + ineligible toast work.
- Wave 3 open gaps: (1) full-draft click-through of `autoDistributeRoster` — moot, dropped;
  (2) native-HTML5-drag confirmation (only click-to-place was automatable); (3) a
  Playwright login fixture for the suite (broken by the Supabase auth gate) — own plan.
- Wave 4 exit (T12/T13 not started; T14/T15 code-complete 2026-09-13, manual verification
  owed — see D28/D29): one unified "Roster" list, no zone toggle (T12); fresh draft opens
  empty, old saves still load (T13); preview auto-dismisses (T14); quarter row appears only
  after that quarter ends (T15).
- On full completion: `git mv` to `docs/completed/`, update `docs/HANDOVER.md` and the
  roadmap row, `/roadmap done ui_draft_deckbuild_pack`.
