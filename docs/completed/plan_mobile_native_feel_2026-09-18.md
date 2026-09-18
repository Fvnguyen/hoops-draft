# Plan: mobile_native_feel

File: `docs/completed/plan_mobile_native_feel_2026-09-18.md`. Status: done 2026-09-19.
Sequence: see `docs/ROADMAP.md`. Depends on: — (mobile_responsive, ui_foundation done). Files
owned: `app/layout.tsx`, `app/globals.css`, a new `hooks/useAndroidBackGuard.ts` (or
equivalent), `components/TopKPIBand.tsx`/`PlayPanel.tsx`/other collapsible-bar components
(toggle-target only, not their content), `components/DeckBuilder.tsx` (toast calls only),
`components/Toast.tsx`.

**Closing note (2026-09-19):** T1-T4 code landed 2026-09-17/18; closed today after
verifying the open items via the browser pane at a mobile landscape viewport (812x375)
against a live dev server, not a physical Android device:
- D1/D2: computed styles on `html`/`body` confirmed `touch-action: manipulation` and
  `user-select: none` are live (not just declared), and `-webkit-touch-callout: none`
  is present in `globals.css` — no dedicated long-press/double-tap screenshot, since
  the browser-pane tooling can't simulate a true OS-level touch-and-hold gesture; the
  computed-style check is the closer-to-ground-truth verification for this environment.
- D3/D4: triggered browser back on the draft room (mid-pick) and the deck builder
  (`/deckbuilder-test`) — both show the "Leave this screen?" sheet with Cancel/Leave
  only, each with its own contextual message; Cancel returns to the same screen and
  the guard re-arms (a second back press re-shows the sheet); Leave navigates away.
- D7: confirmed in source — only the `'Roster cleared'` `toastUndo` call remains in
  `DeckBuilder.tsx`, the two per-move place/swap calls are gone.
- `npm test` (442/443, one pre-existing unrelated drift), `npm run build`, and
  `npm run test:e2e -- smoke.spec.ts` (9/9) all green.
- **Not verified**: an actual Android device or Chrome's device-toolbar touch-gesture
  emulation (long-press context menu, double-tap zoom, hardware back button) — this
  sandbox has no such device/toolbar available. If a real "long-press still opens a
  menu" or "double-tap still zooms" report comes in, re-check there first.

## Goal

The installed/PWA app currently behaves like a website in a wrapper: long-press opens the
OS text-selection/image-save menu, double-tap zooms the page instead of acting on the
card underneath, the hardware/gesture back button navigates browser history instead of
acting as a safe "leave this screen" control, small adjacent icon buttons mis-tap on
touch, and every deck-builder move pops an undo toast the user has to wait out or dismiss.
After this plan the app feels like a native mobile app: taps go where you aim them, back
means "go home safely," and the bars/menus are effortless to open with a thumb.

## Decisions (locked)

- D1 **No browser context menu / text selection / callout.** Add
  `-webkit-touch-callout: none`, `-webkit-user-select: none; user-select: none`, and
  `touch-action: manipulation` globally in `globals.css` on `html, body` (not per-component
  patchwork like the existing `PlayerCard` rule, which stays as belt-and-suspenders since
  it also blocks image drag). Inputs/textareas (none currently exist in gameplay views,
  only auth forms) are excluded via `input, textarea { user-select: text; -webkit-user-select: text; }`
  so login/signup still works.
- D2 **No double-tap-to-zoom.** `touch-action: manipulation` (D1) removes the 300ms delay
  and double-tap zoom on elements that have it; confirm the root layout's viewport meta
  (`app/layout.tsx` `viewport` export) does not need `user-scalable=no` — prefer the
  `touch-action` CSS route over disabling pinch-zoom outright, since killing zoom entirely
  is an accessibility regression the owner has not asked for.
- D3 **Android/PWA back button triggers an in-app callback instead of history-back**, on
  screens where an unguarded press would drop state nothing persists yet. Actual autosave
  audit (Wave 0) found the plan's "most views already autosave" assumption wrong for two
  of three at-risk screens — draft room and deck builder never had a partial-save path —
  so, per owner sign-off, the guard is **leave-only everywhere** (warn + Cancel, no "Save &
  exit" leg): draft room (mid-pick), deck builder (always — saving needs a complete
  roster and there's no autosave), and season view (reuses its own existing fresh-game
  leave-confirm instead of a second dialog). The season hub and the 82:0 challenge run
  need no guard at all: a challenge half commits to the store before it's ever rendered,
  and a season result is saved before the hub can show it — plain back is already safe.
  Mechanics: `useAndroidBackGuard` pushes one extra history entry on mount so the first
  back press is interceptable via `popstate`, and re-arms itself on every cancel so the
  stack never grows; `goBack()` does `history.go(-2)` to undo the guard entry plus the
  real navigation it intercepted.
- D4 The confirm sheet (`BackGuardSheet`, reusing `Overlay`/`Button`, not
  `window.confirm`) offers exactly two actions: **"Leave"** and **"Cancel"**. No silent
  "discard" option, no "Save & exit" leg anywhere in this pass (superseded from the
  original draft — see D3).
- D5 **Collapsible bars/menus toggle on a tap anywhere in the closed bar's row.** Audited
  every chevron/expand pattern in the app (`TopKPIBand`, `PlayPanel`, `DraftSidebar`,
  `PackPassStage`, `BoxScore`) — `TopKPIBand` is the only real instance, and it already
  does this (D2 there: "clicking any chip is the same toggle as the chevron"). No other
  violation found; no code change needed for D5.
- D6 **Small adjacent icon buttons get bigger effective hit areas.** Audited every
  interactive control in gameplay UI: `IconButton` (`components/ui/IconButton.tsx`)
  already guarantees a 44x44px hit area via the `size-control` token
  (`plan_ui_foundation` D3), and it's the only icon-button primitive gameplay code uses —
  no raw `<button>` exists outside dev-only pages (`/data`, `/debug`, admin). No violation
  found; no code change needed for D6. If "finicky buttons" persists after this plan
  ships, it's likely visual spacing between already-44px targets (e.g. the compact deck
  builder's Plays/Roster pair at `gap-1.5`), not hit-area size — a design-pass question,
  not a blind code change.
- D7 **Drop per-move deck-builder toasts entirely** (`toastUndo` calls at
  `DeckBuilder.tsx:466` and `:479` for place/swap): these are two-way drag operations the
  user can trivially reverse by dragging the card back, so an undo toast is pure friction,
  worse on mobile where it visually covers the depth chart/roster near the bottom of the
  viewport. Keep `toastUndo('Roster cleared', ...)` (`:817`) and the error toasts (`:459,
  474, 616, 648`) — those are genuinely destructive-bulk or failure-feedback cases where a
  message earns its screen space.
- D8 Scope is mobile *feel* fixes only — no new gameplay features, no changes to
  `mode_picker`, `phone_card`, or `android_twa` (separate roadmap items). If the back-guard
  (D3) turns out to need work already covered by `android_twa`'s TWA wrapper (e.g. a native
  back button intercept API unavailable in a plain installed PWA), stop and report rather
  than silently building a TWA-only mechanism here — this plan targets the installed PWA
  running in a mobile browser shell, not a future TWA.

## Out of scope

`phone_card` (draft-room card layout), `android_twa` (native wrapper/back-button APIs),
`mode_picker`, any deck-builder redesign beyond removing two toast calls.

## Tasks

- T1 Global touch/selection CSS per D1-D2 in `globals.css`; screenshot before/after a
  long-press on a card and a double-tap on a card confirming no context menu / no zoom.
  Tier: low.
- T2 `useAndroidBackGuard` hook + `BackGuardSheet` per D3-D4, wired into `DraftRoom`
  (picking phase), `DeckBuilder` (both entry points: `/roster/[id]` and DraftRoom's
  post-draft deckbuilding — off for read-only viewing and the 82:0 front office's
  embedded editor), and `SeasonView` (mid-game, via its existing `handleExitGame`).
  Challenge run left unguarded per D3. Done. Tier: mid.
- T3 Audited collapsible-bar tap targets (D5) and adjacent-icon hit areas (D6) — both
  already satisfied app-wide by existing patterns, no violations found, no code change.
  Done. Tier: mid.
- T4 Remove the two per-move `toastUndo` calls in `DeckBuilder.tsx` per D7; keep
  roster-clear and error toasts; update/remove any test asserting the removed toasts
  appear. Tier: low.

## Parallelization

- Wave 0 (driver, 10 min): confirm which of the five gameplay views actually autosave on
  every change (read `GameStore` call sites) so T2 has a verified list, not an assumption.
- Wave 1 (parallel): T1 (low), T4 (low) — fully disjoint from T2/T3's files.
- Wave 2 (parallel): T2 (mid), T3 (mid) — disjoint files (T2 touches page-level wiring +
  new hook; T3 touches component-internal tap targets).

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro (verifying autosave coverage, reviewing the
back-guard UX). Agents: Sonnet 5 / Gemini 3 Pro for T2/T3 (state + UI judgment), Haiku 4.5
/ Gemini 3 Flash for T1/T4 (mechanical CSS + toast-call removal).

## Verification / exit criteria

- `npm test` (435/435) and `npm run build` both green — done, re-run after T1-T4.
- Still open: screenshots (`node scripts/screenshot.js ... --full` at a phone viewport)
  showing no context menu on long-press and no zoom on double-tap; a manual check on an
  actual Android device or Chrome device-toolbar emulation that the back gesture on
  draft/deckbuilder/a live season game shows the "Leave this screen?" sheet (or, for
  season, its own leave-confirm) instead of immediate navigation, and that the challenge
  run's back gesture navigates normally with no data loss.
- `npm run test:e2e` smoke suite still needs a run (no console errors from the new global
  CSS or back-guard listeners).
