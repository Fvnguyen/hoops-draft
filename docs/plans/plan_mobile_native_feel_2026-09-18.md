# Plan: mobile_native_feel

File: `docs/plans/plan_mobile_native_feel_2026-09-18.md`. Status: planned.
Sequence: see `docs/ROADMAP.md`. Depends on: — (mobile_responsive, ui_foundation done). Files
owned: `app/layout.tsx`, `app/globals.css`, a new `hooks/useAndroidBackGuard.ts` (or
equivalent), `components/TopKPIBand.tsx`/`PlayPanel.tsx`/other collapsible-bar components
(toggle-target only, not their content), `components/DeckBuilder.tsx` (toast calls only),
`components/Toast.tsx`.

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
- D3 **Android/PWA back button acts as a guarded "safe home" control**, not history-back.
  Scope: only pages inside active gameplay state (draft room, deck builder, game view,
  season view, challenge run) — the home page and read-only pages (`/data`, `/whatsnew`)
  keep native back behavior. Implementation: on mount, push one extra history entry
  (`history.pushState`) so the first back press is interceptable via `popstate`; on that
  event, `preventDefault`-equivalent (re-push state to cancel the actual navigation) and
  show a confirm sheet instead of a native `confirm()` (reuse the `Toast`/modal pattern,
  not `window.confirm`, per the existing "no `confirm`" convention in `DeckBuilder.tsx`).
- D4 The back-guard confirm sheet offers exactly two actions: **"Save & exit"** (persists
  current state via the existing `GameStore` autosave path — most views already autosave;
  confirm each of draft/deckbuilder/game/season/challenge already writes on every state
  change before wiring this in, since D4 assumes no separate save step is needed) and
  **"Cancel"** (dismiss, stay on the page). No silent "discard" option — there is currently
  no discardable local-only state this plan is aware of; if one is found during T2, flag it
  rather than adding a third button silently.
- D5 **Collapsible bars/menus toggle on a tap anywhere in the closed bar's row**, not just
  the chevron icon — `TopKPIBand` already does this (D2 there: "clicking any chip is the
  same toggle as the chevron"). Audit every other collapsible surface (`PlayPanel`,
  `DepthSlotColumn`, any accordion/menu using a chevron affordance) and apply the same
  pattern: the chevron button becomes visual-only inside a larger tap target that is the
  whole closed-state row/header, with `min-height` and `min-width` of at least 44px per
  tap target (WCAG/iOS HIG minimum) even where the visible icon is smaller.
- D6 **Small adjacent icon buttons get bigger effective hit areas.** Where two+ icon
  buttons sit edge-to-edge (audit during T3 — likely candidates: `DraftSidebar`,
  `BoxScore` controls, `SeasonView` tab strip), add invisible padding so each tap target is
  >=44x44px without changing the visual icon size or spacing, using the existing spacing
  tokens (no new pixel constants).
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
- T2 `useAndroidBackGuard` hook (or equivalent) per D3-D4: pushState guard, popstate
  listener, confirm-sheet UI reusing existing modal/toast primitives, wired into draft
  room, deck builder, game view, season view, challenge run. Verify each of those five
  views' autosave path fires before wiring (or note where it doesn't and defer "Save &
  exit" wiring for that view, flagged in the plan doc, not silently skipped). Tier: mid.
- T3 Audit + fix collapsible-bar tap targets (D5) and adjacent-icon hit areas (D6) across
  `TopKPIBand` (confirm existing pattern still holds), `PlayPanel`, `DepthSlotColumn`,
  `DraftSidebar`, `BoxScore`, `SeasonView`; screenshot each changed surface at a phone
  viewport (375px) before/after. Tier: mid.
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

- Screenshots (`node scripts/screenshot.js ... --full` at a phone viewport) showing: no
  context menu on long-press, no zoom on double-tap, a collapsed bar opening from a tap
  anywhere in its row, the back-guard confirm sheet.
- Manual check on an actual Android device or Chrome device-toolbar emulation: back
  gesture on draft/deckbuilder/game/season/challenge shows the confirm sheet, not
  immediate navigation; "Save & exit" leaves state resumable; "Cancel" stays put.
- `npm test` green; any test asserting the removed deck-builder toasts is updated, not
  deleted-and-forgotten.
- `npm run test:e2e` smoke suite still passes (no console errors from the new global CSS
  or back-guard listener).
