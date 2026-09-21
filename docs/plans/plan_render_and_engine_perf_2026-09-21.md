# Plan: render_and_engine_perf

File: `docs/plans/plan_render_and_engine_perf_2026-09-21.md`. Status: in progress. Sequence: 13 in `docs/ROADMAP.md`.
Depends on: nothing. Line numbers refreshed 2026-09-21 (after `sync_outbox`/`mobile_load`); the symbol name wins.
Files owned (all under `frontend/src/` unless noted): `engine/{game,lineup,challenge,season,cards,rosterStats,
synergies,deckbuilder,boxscore,gameTypes,rotation,shot,possession,teamInfo}.ts` (last 5 new),
`narration/{render,types}.ts`, `app/challenge/[rosterId]/page.tsx`, `components/{DeckBuilder,TopKPIBand,GameView,
DraftRoom,PlayerCard,useHoverPreview,DepthSlotColumn,TopNav,PlayArt(new)}.tsx`,
`components/deckbuilder/{SaveRosterModal,RosterSidebar,PlaysSidebar}.tsx` (new),
`hooks/{useRosterBuilder,useDockLayout,useLongPressPreview}.ts` (new), `app/rosters/page.tsx`, `app/globals.css`,
`frontend/scripts/{bench-engine.ts,balance-baseline.mjs}`, `docs/ARCHITECTURE.md`, `tests/unit/*`.

## Goal

The deck builder, game view and 82:0 sim do far more work per render or possession than needed, and the two
biggest files (`game.ts` 1,566 lines, `DeckBuilder.tsx` 1,535 lines) are hard to change safely. Cut wasted engine
work (lineup aggregation, discarded event arrays, a duplicated-object ghost re-sim) and wasted React work
(whole-tree re-renders per keystroke or tick), and split both files into single-purpose modules. Output stays
identical throughout: `node scripts/balance-baseline.mjs` and the `npm run bench` checksum never change.

## Decisions (locked)

- D1 (E1, top). Precompute standardised ratings once per `TeamInfo`; add a `Map` keyed by the 5 sorted on-court
  player ids, scoped to one `simulateGame` call, memoizing `lineupValue`/`lineupMidDefence` per (key, dim).
  Replaces ~15 recomputes/possession (`game.ts:447,485,486,489,490,493,494,508,509,515,516,553,887`).
- D2 (E2, top). `simulateGame(home, away, opts)` gains `opts.events?: boolean` (default true); `false` skips
  pushing to `possessions`/narrative/shots but consumes the RNG identically and still fills `boxScore`.
  `challenge.ts:335` passes `events: false`.
- D3 (E3+E4, mid). New pure `rosterChanged(pre, post)` in `engine/challenge.ts`: structural compare of depth
  chart/assignments/archetypes/card ids, no reference equality; `page.tsx:162` uses it instead of
  `rosterPost !== rosterPre`. `page.tsx:151` memoizes `buildNbaTeams` on `cards` (rebuilt in a `setTimeout` every
  half today). Delete the never-read `ChallengeTeamTotals.possessions` field (`challenge.ts:275,399`,
  `season.ts:555`).
- D4 (E5, mid). Salt `narration/render.ts:68`'s picker seed with a constant distinct from `game.ts:806`'s
  attribution draw (both compute the identical `seed ^ Math.imul(index+1, 0x9e3779b1)` today). Engine stream
  untouched; update tests pinning a narrated line.
- D5 (E6, top). `playNextGame` (`season.ts:193`) derives each matchup's seed mixSeed-style from `Season.seed`
  (line 188, write-only today) plus matchup index, not one shared stream. `createSeason`'s `Date.now()`(180)/
  `new Date()`(183) become caller args. `sync_outbox` landed first: `GameStore.getOrCreateSeason` overrides the
  id with `season_<rosterId>`, so the caller-supplied id only matters to tests and headless tools.
- D6 (E7, mid, before D1/D2). Split `game.ts` into `gameTypes.ts` (interfaces, ~44-199), `rotation.ts`
  (calcPossessionShares/drawLineup/segmentForQuarter/starterLineupMap/closersOnly), `shot.ts`
  (calcPossessionSplit through applyCalledShareShift incl. channelEdge/turnoverChance/offensiveReboundChance/
  resolvePossession, ~309-748), `possession.ts` (playOnePossession:771-1050 + its play-call helpers),
  `boxscore.ts` (exists since wave 0 with `accumulateBoxRow(total,row)`; gains emptyBoxScore/boxScoreThrough and
  replaces the duplicate sums at `season.ts:541-576`/`challenge.ts:392-418`), `teamInfo.ts` (buildTeamInfo:1051-1133). `game.ts`
  keeps `simulateGame:1134-1415`/`distributeQuarters:1525`, re-exports the public API. Keep `challenge.ts:368`'s
  `topPerformerOf` separate from `narration/summary.ts:13`'s `gameScore`, different weightings, do not unify
  (correction to the source audit).
- D7 (E8+E9, low). Delete, after grepping every importer: `cards.ts`'s `getCardById`, `rosterStats.ts:110`'s
  `getBadgeTally`, `narration/types.ts`'s `BeatType`, `engine/types.ts:84-85`'s `ComputedRatings._baseOvr`/
  `._multiplier` (fixture JSON only), `synergies.ts:333`'s `TeamBonuses.playstyle` (always `[]`),
  `synergies.ts:56`'s `defenseMods.possessionSwing` (always 0). `'partial'` activation is used
  (`PlayerCard.tsx:1090`), leave it; `advancePick` duplication (`useDraftEngine.ts:112-175`/
  `tests/unit/helpers.ts:78`) is deliberate for a React-free harness, leave it. Unused `calcTeamBonuses`/
  `calcRosterShotDiet` params move to D8. Fix stale `docs/ARCHITECTURE.md`: §2's `PROFILES`/`TOP1`/`CORE_PEN`/
  PER-VORP language (gone per `card_ratings_rebalance`, `balance.ts:300-307`; describe the real
  `rawOvrMean -> idx()` two-pass), §3's PER-based/hate-draft floor (neither exists, `draft.ts:218-222` uses
  `ratings.overall`), §5's `calcTeamPossRating`/`calcTeamShotProfile`/`generateQuarterRotation` (none exist,
  rename to `calcPossessionSplit`) and its stale "0.30" edge scale (real values `balance.ts:207-208`); plus stale
  headers/docstrings at `game.ts:8,298`, `synergies.ts:343`, `challenge.ts:311` (use T1's measured ms), and
  `plays.ts:14-19`.
- D8 (U1, mid). `hooks/useRosterBuilder.ts` (new): reducer owning `depthChart`/`rosterPlayers`/`activePlays`/
  `rosterPlays`/`playAssignments`, actions `place`/`move`/`sendToRoster`/`activatePlay`/`swapPlay`/`removePlay`/
  `assignRole`/`clearRole`/`clear`/`undo`; contract (`BuilderAction`, `BuilderActionResult`, the four invariants)
  locked in `engine/deckbuilder.ts` in wave 0, initial state = `initBuilderState`. Replaces the setter-inside-
  setter in `handleDropOnZone` (`DeckBuilder.tsx:525`) and `handlePlaySwap` (`:637`). `hooks/useDockLayout.ts` (new) owns `tier` (from
  `containerWidth`, set by the `ResizeObserver` at `:288`) plus docked/drawer flags. `SaveRosterModal.tsx`
  (new) owns `rosterName` (top-level state today, re-renders the whole builder every keystroke).
  `RosterSidebar.tsx` (new: current `renderRosterHeader`/`renderRosterBody`, `posFilter` state) and
  `PlaysSidebar.tsx` (new: current `renderPlaySlots` + docked panel JSX). `BasicPlayTile`+`makeBasicPlay(kind)`
  replace the basic-play literal repeated at three call sites. `TopKPIBand.tsx:226`'s own `evaluateArchetypes`
  re-run is replaced by an `archetypeStatuses` prop fed from `DeckBuilder.tsx`'s existing `useMemo` (`:797`);
  delete the dead `bonuses` prop (`TopKPIBand.tsx:163`) and its `calcTeamBonuses` call (`DeckBuilder.tsx:788`,
  grep other reads first), trim its and `calcRosterShotDiet`'s unused params (D7). Keep `mobile_load`'s
  `useAndroidBackGuard` `exitTo` wiring and the `headshotThumb` drag ghost intact.
- D9 (U2+U3, mid/low). `GameView.tsx`: `React.memo` on `TeamBlock`(307)/`TaleOfTheTape`(139); `liveBox`
  (`useMemo` ~368) gates on `activeTab === 'boxScore'`; delete dead `onComplete` prop plus effect (`423-428`,
  zero callers); `teamArchetypeStatuses` computed once per team via `useMemo` in the parent. `DraftRoom.tsx`:
  `podAverageIdentity` (`256-266`, calls `buildBotRoster` for every seat unconditionally) wraps in
  `useMemo(..., [seats])` gated on `draftState === 'deckbuilding'` (the only reader).
- D10 (U4+U6, mid). `PlayerCard.tsx`: delete `PlayCard`'s dead `status`/`players`/`selectedRoleId`/`onRole*`/
  `evaluation` props (signature at `:1144`) and the branches they gate (the role-list view and the requirement
  list; zero callers, re-confirm with grep at `DraftRoom.tsx`, `rosters/page.tsx`, `PackRevealCard.tsx`). Move
  `PlayBoardGraphicGeneric`/`PlayMotifSvg`/`PlayBoardGraphic` (`873-1143`) to new `PlayArt.tsx`; move
  `useLongPressPreview` (inline, `:21`) to new `hooks/useLongPressPreview.ts` and attach it in the compact
  branch (`:793`, unattached today), in `RosterPlayerRow` and `StarterFront`; move the Mythic gem `<style>`
  (`:381`) into `globals.css`; `useHoverPreview.ts`'s `onMouseEnter` ignores coarse pointers (reuse
  `mobile_load`'s `useHasFinePointer`, do not add a second matchMedia listener). The touch-attach half needs
  an owner on-device or touch-emulation round, flagged, not auto-verified here.
- D11 (U5, mid). `rosters/page.tsx`: the 5-card roster summary renders `PlayerCardFront` not the full flip
  `PlayerCard` (`:355`); the per-roster stagger (`delay: i * 0.1`, `:250`, compounding across the whole list) caps at
  `Math.min(i*0.1, 1.0)`; roster wrapper gets `content-visibility:auto`. `TopNav.tsx`: one `ProfileSummary`
  replaces the duplicated block at `116-141`/`253-273`; `useUserSeasonStats` (`107` and `208`) called once.

## Out of scope

Web Worker for `simulateHalf` (revisit only if D1-D3 still leave a task over 500 ms on device). `narrativeText`
fallback removal, `legacyTheater`/`LegacyScheduleEntry` (`season.ts:325-430`), the pre-D9 branch
(`game.ts:1477-1481`), owner already skipped this once. `PLAY_EFFECTS` vs `PLAYBOOK` parallel truth, noted not
resolved. Any `balance.ts` tuning constant. Identity or plan catalogue content. `mode_picker`'s seed input wiring.

## Tasks

T1 (mid, wave 0, driver). DONE 2026-09-21: `npm run bench` (medians: game 3.8 ms, half 1 140, half 2 136, half 2 +
ghost 263 ms; checksum 219438687), `balance-baseline.mjs` + committed report, and the three contracts (`events`
option, `accumulateBoxRow`, `BuilderAction`).
T2 (mid). D6 split. Done: `game.ts` < 500 lines, `tsc`/`engine-purity.test.ts`/`npm test` green, `balance` == baseline.
T3 (top). D1. Done: `npm test` green, balance baseline identical, checksum unchanged, half 2 <= 100 ms and half 2 + ghost <= 190 ms.
T4 (top). D2. Done: new test, `events:false` vs `true` equal over 50 seeds; bench recorded before/after.
T5 (top). D5. Done: season tests green, no inline `Date.now()`/`new Date()` in the call path; note for
`sync_outbox` left in the commit body.
T6 (mid). D3. Done: unit test proves an identical structural roster does not retrigger the ghost after a round-trip clone.
T7 (mid). D4. Done: narration tests green, pinned-line tests updated.
T8 (low). D7. Done: `tsc`/`lint`/`npm test` green, docs diff is doc-only.
T9 (mid). D8 reducer half. Done: `deckbuilder-assign.test.ts` covers every action, `deckbuilder.spec.ts` zero
visual diff at 900/1100/1440.
T10 (mid, after T9). D8 layout/sidebars/wiring. Done: `DeckBuilder.tsx` < 700 lines, spec zero
diff, `check:styles` clean.
T11 (mid/low). D9 GameView+DraftRoom halves. Done: render-count assertion shows `TeamBlock` skips an unrelated
tick; `tsc` clean; smoke 9/9.
T12 (mid). D10 trim/extractions/gate. Done: `visual.spec.ts` snapshots unchanged, `tsc`/
`lint` clean.
T13 (mid, after T12). D11. Done: `screenshot.js /rosters` before/after comparison, smoke 9/9.
T14 (mid, after T12, owner-verified). D10's touch-attach half. Done: touch-emulation Playwright pass at
`--workers=1`, plus an owner on-device round.

## Parallelization

Wave 0 (driver): T1. Wave 1 (solo, touches all of `game.ts`): T2. Wave 2 (parallel, after T2): T3, T5, T7, T8.
Wave 3 (after T3, same post-split files): T4, T6. Wave 4 (parallel, disjoint components): T9 then T10 in
sequence, alongside T11. Wave 5: T12, then T13 and T14 (T12 may join wave 4: its file is free now). Agents never run git; the
driver verifies (`tsc`, `lint`, `check:styles`, `npm test`, `balance`, screenshots) and commits each wave.

## Recommended model tier

Driver: top (Fable 5.1 / Opus 5), coordinates balance-sensitive edits and reviews every diff against the
bit-identical requirement. T3-T5 (engine maths, determinism, cross-plan conflicts): top (Opus 5 / Gemini 3 Pro).
T2, T6, T7, T9, T10, T12-T14 (locked-decision refactors, UI components): mid (Sonnet 5 / Gemini 3 Pro). T8
(mechanical deletions): low (Haiku 4.5 / Gemini 3 Flash). T11 (a `useMemo` gate plus two small memoizations):
mid (Sonnet 5).

## Verification / exit criteria

`npm run bench`: half 2 <= 80 ms (from 136) and half 2 + ghost <= 155 ms (from 263), about -42% from D1 + D2; D3
additionally removes the ghost entirely when the roster did not change. Checksum 219438687 unchanged. `npm test` green. `node scripts/balance-baseline.mjs` IDENTICAL after every wave. `tsc --noEmit`, `npm run lint`, `npm run check:styles`
clean. `smoke.spec.ts` 9/9. `deckbuilder.spec.ts` zero visual diff at all three tiers. `DeckBuilder.tsx` < 700
lines, `game.ts` < 500 lines. A render-count assertion showing `TeamBlock` skips a tick when its team is
unchanged. D10's touch-attach half needs an owner on-device or touch-emulation round before `/roadmap done`,
call this out explicitly rather than marking it green from CI alone.
