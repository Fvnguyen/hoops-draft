# Plan: game_canvas

File: `docs/plans/plan_game_canvas_2026-09-15.md`. Status: **D0 decided 2026-09-15: no canvas.** T4 + T0 done and
committed; T1-T3 dropped; only T5 (owner real-device pass) is open, and it is the one
thing that could reopen the canvas (see D0).
Sequence: 3 in `docs/ROADMAP.md` (replaces the remaining scope of `mobile_responsive`;
its T1-T4/T6 work and tests are kept as-is). Depends on: `ui_foundation` (done),
`deckbuilder_ux` (done). Files owned: `frontend/src/components/GameCanvas.tsx` (new),
`frontend/src/app/layout.tsx`, `frontend/src/components/OrientationGate.tsx` (merges into
GameCanvas), `DraftRoom.tsx`, `DeckBuilder.tsx`, `TopKPIBand.tsx`, `FranchiseDashboard.tsx`,
`SeasonView.tsx`, `app/page.tsx`, `app/rosters/page.tsx` (T0 fixes + `dvh` removal), `TopNav.tsx` (T1 mount),
`frontend/tests/mobile-audit.spec.ts`, `frontend/playwright.config.ts`.
Excluded: `/data`, `/debug`, `/admin/*`, and the auth routes `/login`, `/signup`, `/pending`.

## Goal

On a phone in landscape, the app behaves like a game client (MTG Arena, not a responsive
website): every game screen renders at one fixed reference resolution and is uniformly
scaled to fit the real viewport via CSS `transform: scale()`, so nothing can clip by
construction. Desktop, mouse and tablet users keep the fluid, breakpoint-based layouts
already built by `ui_foundation`/`deckbuilder_ux`.

## What the audit actually found (T4, run first, 2026-09-15)

The original plan assumed 830x385 was "audited clean" and only 780px broke. The audit's
overflow check used `scrollWidth`, which never sees leftward overflow and ignores anything
inside an `overflow-hidden` box. Replaced by a rule that measures where text actually
lands ("own text outside the viewport, no scrollable ancestor, not inside a translated
drawer") and added a `phone-narrow` 780x360 project. Result, identical at 830x385 and 780x360:

| Screen | Clipped content | Cause |
|---|---|---|
| home | "DRAFT PACK" column at x=792 | `app/page.tsx` right column `w-[450px] shrink-0` |
| draft (entry + pack) | left opponent seat at x=-35 (830) / -60 (780) | `DraftRoom.tsx` header centres three children in too little room; the uncommitted `hidden lg:flex` + `min-w-0` edit does not fix it |
| deck builder | plays pill "3 active plays" at x=786 | HUD band's right group pushed behind the gear menu |
| season | "Shot Diet", "Active Mechanics" at x=800..1219 | `FranchiseDashboard.tsx` `flex gap-8` of `shrink-0` blocks inside SeasonView's `overflow-hidden` panel |
| rosters, game tip-off, game live | none | — |

So the reference layout itself has four real bugs, all width-independent. They must be
fixed whichever approach wins; after them, a canvas is insurance for widths nobody has
audited, not the fix for a known defect. That is the owner's call (D0).

## Decisions (locked)

- D0 **No canvas (owner, 2026-09-15).** With the four T0 bugs fixed and the audit clean
  at 780x360, 830x385 and 1244x778, a scale transform would add a second rendering mode
  (nine `position: fixed` components re-based, 44px controls at 41px real, nav/toasts
  moved inside a wrapper, softer text) to insure against widths the harness can now
  cover with a five-line project. Reopen only if T5 finds a screen usable in the
  emulator but not in the hand (URL bar / keyboard eating height) — that is the case a
  canvas answers and breakpoints cannot. D1-D7 below are kept as the design of record
  for that case, not as work to do.
- D1 **Activation: phone width, coarse pointer, game routes only.** The canvas is on
  when `(pointer: coarse)` matches AND the viewport is under 1000px wide. Tablet
  (1244x778) already passes the audit at native size and would only lose real estate to
  a 1.5x blown-up phone UI with 100px bars; touch laptops must never get it. The auth
  routes stay portrait-usable (mobile_responsive D2) and are excluded along with
  `/data`, `/debug`, `/admin/*`. Desktop and tablet keep the fluid layout, unchanged.
- D2 **Reference resolution: 830x385**, taken as ground truth only once T0 has it at
  zero findings under the new text-position rule.
- D3 **Letterboxing: themed bar** (`--surface-inverse-deep`) on whichever axis has slack.
- D4 **No scale floor.** `k = min(vw/830, vh/385)`, no clamp. A floor cannot letterbox
  (there is no slack below it), it can only overflow, which is the bug the plan exists to
  remove. Consequence stated plainly: at k < 1 every 44px control shrinks in real pixels
  (41px at 780x360). The audit measures tap targets in *canvas* space (divide by k), so the
  44px floor is a design invariant, not a device promise; T5 is where the owner feels it.
- D5 **Mechanism and what moves inside the box.** `GameCanvas.tsx` wraps `TopNav`,
  `Toast`, `WhatsNewSplash`, `SyncConflictPrompt` AND `{children}` — everything below
  `StorageProvider` — so the 56px nav and the pages' `pt-nav` scale together (otherwise
  they differ by 56·(1−k) and overlap). The box is `830px` by `385px`, `overflow: hidden`,
  `transform: scale(k)`, origin top-left, centred by margin in a full-viewport backdrop
  that also carries the safe-area insets (`viewportFit: cover`). Known consequence: a
  transformed ancestor is the containing block for every `position: fixed` descendant
  (Overlay, RoundSummary, SeasonView modal, DeckBuilder drawers, PlayerCard modals and
  its clientX/Y tooltip, DraftRoom save banner). That is the wanted behaviour for a game
  client (modals live in the canvas); the tooltip divides pointer coordinates by k. The
  wrapper always renders (no hydration branch); activation is a `data-canvas` attribute
  set in a `useLayoutEffect` from `matchMedia` + `ResizeObserver`, with styles keyed on
  it, so desktop has the same DOM and a snapshot-clean result. Rotate overlay from
  `OrientationGate` moves into the same component, unchanged.
- D6 **Vertical: fixed 385px box, each screen scrolls its own region.** No `min-height`
  growth (a transformed box that grows leaks a scrollbar onto the outer page, which
  contradicts the goal). Rosters and season already scroll inside; the others are
  full-height apps.
- D7 **`dvh`/`vh` audit.** Every `h-dvh`/`min-h-dvh` in a canvas route becomes `h-full`
  / `min-h-full`, and the height comes from the wrapper in both modes (`100dvh` on
  desktop, `385px` in the canvas). One code path, no `--canvas-h` custom property, desktop
  visually unchanged. `DraftRoom`, `DeckBuilder`, `SeasonView`, `rosters`, `page.tsx`,
  `PackOpener`, `ErrorRecovery`. `(auth)/layout.tsx` is excluded and keeps `dvh`.
- D8 **`mobile_responsive`'s finished work is kept, not redone.**

## Out of scope

A tablet reference size (tablet stays fluid, D1). Desktop/mouse behaviour. Re-tuning the
830x385 layout beyond T0. `/data`, `/debug`, `/admin/*`, auth routes.

## Tasks

- T4 **Audit: text-position rule + 780x360 project** — **done 2026-09-15** (uncommitted:
  `tests/mobile-audit.spec.ts` rule 5 `clipped-x`, `playwright.config.ts` `phone-narrow`).
  Note: the three touch projects share one fixture roster, so run them with `--workers=1`
  or the deck-builder step races. Remaining: measure tap targets in canvas space once
  D5 lands (divide by the wrapper's `k`), and drop the old `scrollWidth` rule's
  `position !== 'fixed'` exclusion comment, which no longer describes the check.
- T0 **Fix the four reference-layout bugs** — **done 2026-09-15** (uncommitted). Home:
  the 450px pack fan is `hidden lg:flex` (decorative; 320+300+450 never fit under 1134px).
  DraftRoom header: both 256px side blocks appear from `lg` together, seats `shrink-0`
  with `max-w-24 truncate` names, progress bar `w-40/56/72` and chevrons from `lg`.
  `TopKPIBand.tsx` (not DeckBuilder — the pill lives in the band): peak/valley pair and the
  "Save & play season" label hide under an 1100px container, a Play icon stands in.
  FranchiseDashboard: `flex-wrap` below `lg`, `lg:flex-nowrap` keeps the desktop row and
  its snapshot byte-identical. Verified: `mobile-audit` 0 findings at 780x360, 830x385,
  1244x778; chromium 40/40 (one run had the deck-builder fixture time out, green on rerun).
- **Owner checkpoint (D0) — done: no canvas.** T1, T2, T3 below are dropped.
- T1 **`GameCanvas` component + mount** (top). D5/D6/D7 in one change: wrapper in
  `layout.tsx` around nav + overlays + children, `OrientationGate` folded in. Done when a
  Playwright test at 780x360 and 830x385 with `hasTouch` sees the box at exactly 830 CSS
  px wide, scaled, no outer scrollbar, and 1280x800 chromium + 1244x778 tablet render
  with `data-canvas` off and unchanged snapshots.
- T2 **`dvh` -> `h-full`** (mid). D7. Done when no canvas route sizes against the real
  viewport and desktop snapshots are unchanged.
- T3 **Letterboxing** (low). D3. Done when a 2000x400 and a 400x800 viewport show themed
  bars and the box never exceeds the viewport on either axis.
- T5 **Real-device pass** (owner) — the only open task. S24+/S25/S26+ in-browser and
  installed, Tab S10+: one full draft -> deck -> game -> season loop, zero clipped or
  unreachable content. Clean = `/roadmap done game_canvas`; a height-only failure = reopen
  D0 and schedule T1-T3.

## Parallelization

Done: T4, T0. Open: T5 (owner). If D0 is reopened: T1 (driver), then T2 + T3 in parallel.

## Recommended model tier

T0, T2, T3: mid (Sonnet 5). T1: top — the transform + fixed-descendant + nav-inside-box
interaction is where this fails subtly.

## Verification / exit criteria

- `npm test`, `tsc --noEmit`, `npm run lint` clean; `mobile-audit` 0 findings on all
  three touch projects (`--workers=1`); chromium `test:e2e` green with unchanged 1280x800
  snapshots.
- If the canvas ships: live check at 780x360 and 830x385 in a touch-emulated tab shows
  the letterboxed box, modals inside it, nav scaled with the page; tablet shows no box.
- Owner sign-off from T5; then `/roadmap done game_canvas`, `mobile_responsive` stays
  marked superseded.
