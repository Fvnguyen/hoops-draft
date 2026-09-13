# Plan: ui_draft_deckbuild_pack

File: `docs/plans/plan_ui_draft_deckbuild_pack_2026-09-13.md`. Status: in progress;
D1-D19 shipped 2026-09-13 (commit `1bdc599`); **wave 3 (D20-D25) code-complete
2026-09-13**, T8-T11 all done and unit/type/lint-clean — three verification gaps remain
(full-draft click-through, native-drag confirmation, a Playwright login fixture), see
Verification section.
Sequence: **2a**, before `game_engine`/`draft_ai` (both edit `hooks/useDraftEngine.ts`).
Depends on nothing.
Files owned: `frontend/src/components/{PackOpener,PackRevealCard,DraftRoom,DraftSidebar,
DeckBuilder,DepthSlotColumn,PlayPanel,TopKPIBand,PlayerCard,RadarChart,DonutChart}.tsx`,
`hooks/useDraftEngine.ts`, `lib/{sessionBuilder,draftTimer,packReveal,rosterChecklist}.ts`,
`app/{page,draft,roster,rosters,deckbuilder-test,pack-opener-preview}/**`, `src/audio/`,
`engine/{depthChart,positions}.ts`, `tests/*.spec.ts`.

## Goal

Pack opener/draft room/deck builder feel like a real MTG-Arena-style draft-to-roster flow,
click-first, no `alert`/`confirm`. Wave 3 goal specifically: opening a fresh draft's deck
builder gives a sane starting roster (a starter per position, bench filled by OVR, capped
at 12) instead of every guard piling into PG and every Center left in G-League; the KPI
band and G-League sidebar stay out of the way by default; cards are small enough to read
and drag onto slots that are actually big enough to hit.

## Decisions (locked)

D1-D19 (draft modes/timer, pack opener v2 motion+sound, draft room pass animation, deck
builder slot model/eligibility/click-first/toasts/readability/save flow) shipped
2026-09-13 — full text in commit `1bdc599` and git history; unchanged, not restated here.

**Wave 3 — reported deck builder problems, root-caused against current code:**

- D20 **Auto-distribution root cause**: `DeckBuilder.tsx`'s fresh-draft init effect pushes
  each Roster-zoned card via `defaultColumn(position)` (`engine/positions.ts`), which is
  `naturalPositions(raw)[0]` — always the *first* natural column (`G`→always `PG`, never
  `SG`; `F`→always `SF`, never `PF`), with no awareness of how full a column already is.
  Result: PG/SF overflow past their 4 slots (excess silently unrendered — see
  `DepthSlotColumn` reading only `players[0..3]`) while SG/PF/C sit empty. Fix: new pure
  `autoDistributeRoster(players: PlayerCardData[]): {chart: DenseDepthChart, overflow:
  PlayerCardData[]}` in `engine/depthChart.ts`. Two passes over `DEPTH_COLUMNS` (`['PG',
  'SG','SF','PF','C']`): pass 1 fills slot 0 (starter) per column, pass 2 fills slots 1-3;
  each pick takes the highest-OVR unplaced player with `positionFit === 'natural'` for
  that column, falling back to `'adjacent'` only if no natural candidate remains for that
  column in that pass. Placement stops entirely at `MAX_ROSTER` (12, already exported by
  `depthChart.ts`). Deterministic tie-break: OVR desc, then player id asc.
- D21 Wire-up: `DeckBuilder.tsx`'s init effect (lines ~145-186) calls
  `autoDistributeRoster` on the fresh-draft branch only (`initialDepthOrder` absent); the
  saved-roster edit branch (`initialDepthOrder` present) is untouched — it already
  restores an exact prior layout. `overflow` players are moved into the G-League zone
  (they're never discarded) with one `Toast`: "N player(s) moved to G-League — roster
  capped at 12" (only shown when `overflow.length > 0`).
- D22 **TopKPIBand**: already has a working collapse + `localStorage` persistence
  (`deckbuilder.reportCollapsed`) but defaults *expanded* (`useState(false)`,
  `readStoredCollapsed()` returns `false` when the key is unset). Flip both defaults to
  collapsed-first-visit; a user's own un-collapse still persists and wins on return
  visits. Also shrink the expanded layout: `RadarChart`/`DonutChart` 176px/124px →
  ~120px/90px so an intentionally-expanded band doesn't dominate the viewport (target
  expanded band height ≤ ~180px at 1280px wide, screenshot-verified, down from ~230px+).
- D23 **G-League sidebar**: code already defaults collapsed
  (`isGLeagueCollapsed = useState(true)`, `DeckBuilder.tsx:133`, `w-12` strip). No state
  change needed — T9 takes a fresh `/deckbuilder-test` screenshot to confirm; if it still
  renders expanded, that's a regression to root-cause and fix in the same task, not a
  redesign.
- D24 **Card sizing**: starter cards (`PlayerCard size="sm"`, used in
  `DepthSlotColumn.tsx:220`) drop the stats grid entirely for `size='sm'`
  (`PlayerCard.tsx:443-450` currently renders it regardless of size) and pin badges to a
  `cqw`-scaled variant of `BadgeIcon` (today `BadgeIcon`'s `xs`/`small`/`normal` sizes are
  fixed 18/24/32px — `PlayerCard.tsx:430-433`'s own comment already flags this as the
  cause of badge overflow on narrow cards) so badges shrink with the column instead of
  needing per-size manual variant picking. Bench cards (`compact`, currently `h-[46px]`,
  already stats-free) shrink further to `h-[36px]` and use `BadgeIcon`'s `xs` (18px)
  variant only. Drag-and-drop always uses a `compact`-rendered drag image
  (`e.dataTransfer.setDragImage`) regardless of the source card's own size, so dragging a
  starter card doesn't drag an oversized ghost around the screen.
- D25 **Drop-zone hit areas**: empty-slot buttons (`DepthSlotColumn.tsx:139`, currently a
  fixed `min-h-[62px]`) grow to match the occupied-card footprint at that column's actual
  width (same box a placed card would occupy, not a fixed small pad), so a dragged card —
  which after D24 is still noticeably taller than 62px — isn't aimed at a target much
  smaller than itself. Occupied-slot drop targets (already the full card `div`) unchanged.

## Out of scope

Engine/balance numbers (game_engine), bot valuation (draft_ai), season/game views, phone
portrait (mobile_pwa), redesigning the depth-chart slot model itself (D12 stands), moving
auto-distribution logic into the engine's bot-roster builder (bots are unaffected).

## Tasks

- T0-T6: done, see commit `1bdc599`.
- T7 (driver, top): cross-agent wiring — done. Remaining: Playwright specs beyond
  `home.spec.ts`, screenshots, manual click-through — still open, folded into T11 below.
- T8 (mid): **done.** `autoDistributeRoster` (D20) + 6 Vitest cases, incl. one that
  caught a real ordering bug (an earlier column's adjacent-fit fallback could steal a
  player a later column would have fit naturally — fixed with a natural-fit sub-pass
  across all columns before any adjacent fallback runs). Wired per D21. `npm test`
  (190/190)/`tsc`/lint clean. Not live-verified through a full draft — browser-automation
  coordinate clicks kept mis-hitting the draft room's "Back to Home" link mid-draft;
  correctness rests on the Vitest cases + code review, still owed a human click-through.
- T9 (low): **done.** D22/D23 as specced. `tsc`/lint/`npm test` clean. **Confirmed live**
  (test account, `/deckbuilder-test`): KPI band and G-League sidebar both render
  collapsed on first load, screenshotted.
- T10 (mid): **done.** D24 as specced — `cqw` badge scaling (`clamp(14px, 13cqw, 22px)`,
  needs the `@container` ancestor; added to `PackRevealCard.tsx` too), starter stats grid
  removed, bench card `h-[46px]`→`h-[36px]`, drag-image swap via an imperative hidden
  ghost node (not React state — must be correct before the synchronous
  `setDragImage` call). `tsc`/lint/`npm test` clean. **Confirmed live**: starter/bench
  sizing correct on `/deckbuilder-test` at 1400px. Drag-image swap itself not
  screenshot-verified — synthetic mouse automation doesn't reliably trigger native HTML5
  `dragstart`, and OS-rendered drag images aren't reliably capturable by a page
  screenshot regardless; deferred to T11's manual pass.
- T11 (mid): **done.** D25: starter empty slots `aspect-[5/7]` (real card footprint),
  bench empty slots `h-[36px]` (compact-card height) — replaces the old uniform
  `min-h-[62px]` pad. `tsc`/lint/`npm test` clean. **Confirmed live** (test account,
  1400px): empty-slot sizing screenshotted; click-to-place (G-League→PG starter) works;
  an ineligible click toasts "Not eligible for this position"; placed starter shows no
  stats row. Native HTML5 drag: `dragover` tinting fired and the ghost name updated
  correctly, but the browser tool's synthetic drag never completed a `drop` — an
  automation limitation, not evidence of a bug (click-to-place exercises the same
  `handleDropOnSlot`/`handleDropOnZone` code). Playwright `deckbuilder` spec **not
  written** — every existing spec, `home.spec.ts` included, already fails against the
  Supabase login gate added after this plan started; one new spec without a shared login
  fixture would be shallow. Flagged below as a separate follow-up.

## Parallelization

Wave 3: T8 and T9 run in parallel (disjoint files). T10 then T11 run sequentially after
(both touch `DepthSlotColumn.tsx`) — same agent or handed off with a diff review between.
Driver reviews all four against a live `/deckbuilder-test` before commit.

## Recommended model tier

T8 mid (Sonnet 5/Gemini 3 Pro — algorithm correctness, needs real test cases). T9 low
(Haiku 4.5/Gemini 3 Flash — mechanical). T10/T11 mid (careful CSS + native DnD).

## Verification / exit criteria

- `npm test` (190/190), `tsc --noEmit`, `npm run lint` — done, clean, every wave-3 task.
- KPI band collapsed by default, G-League sidebar collapsed by default, starter/bench
  card sizes visibly smaller with no starter stats, empty-slot sizing matches the real
  card footprint, click-to-place and its ineligible-drop toast all work — done,
  confirmed live with a real account (screenshots taken this session, not committed).
- Still open before this plan can close: (1) a full 24-pick draft click-through to see
  `autoDistributeRoster` seed a real skewed-position roster end-to-end (T8's gap) —
  automation kept mis-hitting nav chrome mid-draft; (2) an actual native-HTML5-drag
  confirmation, since only click-to-place was verified (T11's gap) — both need a human
  in the browser, not another automation attempt. (3) A login fixture so the Playwright
  suite (currently 100% broken by the Supabase auth gate, including `home.spec.ts`) can
  run at all — a repo-wide fix, belongs in its own plan, not this one.
- On completion of (1)-(2): `git mv` this file to `docs/completed/`, update
  `docs/HANDOVER.md` and the roadmap row, `/roadmap done ui_draft_deckbuild_pack`.
