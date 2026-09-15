# Plan: game_canvas

File: `docs/plans/plan_game_canvas_2026-09-15.md`. Status: planned
Sequence: 3 in `docs/ROADMAP.md` (replaces the remaining scope of `mobile_responsive`,
which is folded into this plan's History; its T1-T4/T6 work and tests are kept as-is).
Depends on: `ui_foundation` (done), `deckbuilder_ux` (done). Files owned:
`frontend/src/components/GameCanvas.tsx` (new), `frontend/src/app/layout.tsx`,
`frontend/src/components/OrientationGate.tsx` (merges into GameCanvas), every route under
`frontend/src/app/**/page.tsx` and its screen component (`DraftRoom.tsx`, `DeckBuilder.tsx`,
`GameView.tsx`, `SeasonView.tsx`, `app/rosters/page.tsx`, `app/page.tsx`) for `dvh`/`vh`
unit removal, `frontend/tests/mobile-audit.spec.ts`, `frontend/playwright.config.ts`.
Excluded: `/data`, `/debug`, `/admin/*` (dev/admin tools, not part of the game canvas).

## Goal

On a touch device (phone or tablet, landscape), the app behaves like a game client
(MTG Arena, not a responsive website): every non-admin screen renders at one fixed
reference resolution and is uniformly scaled to fit the real viewport via CSS
`transform: scale()`. There is no horizontal or vertical scrolling and nothing is ever
clipped, by construction — the DOM never reflows per device, only its rendered pixels
change size. Desktop/mouse users are unaffected and keep the fluid, breakpoint-based
layouts already built by `ui_foundation`/`deckbuilder_ux`. This replaces the fluid-width
approach `mobile_responsive` T6 was pursuing, which today's real-device test proved
brittle: `DraftRoom`'s header overflowed and was silently clipped (`overflow-hidden`,
not scrollable) at 780px wide even though the automated audit was green at 830px — one
pixel of "target viewport" is not the same as actually responsive.

## Decisions (locked)

- D1 **Scope: touch devices only, all non-admin routes.** The canvas activates exactly
  when `(pointer: coarse)` matches (same signal `OrientationGate` already uses) —
  phone and tablet, portrait or landscape. It applies to every route except `/data`,
  `/debug`, `/admin/*`. Mouse/desktop users always get the existing fluid layout,
  unscaled, unchanged.
- D2 **Reference resolution: 830x385** (the phone-landscape number `mobile_responsive`
  D1 already targeted and audited against). Reusing it means today's layout — already
  fixed to have zero audit findings at exactly this size — becomes the canvas's
  ground truth with no re-design; only tablet and other real widths get scaled instead
  of re-verified pixel-by-pixel.
- D3 **Letterboxing: themed color bar.** Where the device aspect ratio doesn't match
  830:385, the leftover margin (top/bottom or left/right, whichever axis has slack) is
  painted with the current theme's `--surface-inverse-deep` token — a plain bar, not
  stretched/blurred background art.
- D4 **Scale floor: 0.85.** `k = min(vw/830, vh/385)`, clamped to >= 0.85. Below that
  (a device narrower than ~706px landscape — not a target device per D1, but a safety
  floor) the canvas stops shrinking further and lets more of the frame letterbox
  instead of shrinking tap targets below ~37px.
- D5 **Mechanism:** `GameCanvas.tsx` (client component) replaces `OrientationGate`'s
  mount point in `layout.tsx` (keeps D2's rotate-overlay behavior — that still applies
  independent of scale). It listens via `matchMedia('(pointer: coarse)')` +
  `ResizeObserver` on `window`, computes `k` per D4, and renders: `pointer:fine` ->
  `{children}` unchanged; `pointer:coarse` -> a fixed `830x385` (or route's natural
  height if taller — see D6) inner box, `transform: scale(k)`, `transform-origin: center`,
  centered in a `--surface-inverse-deep` full-viewport backdrop.
- D6 **Taller-than-385 screens (rosters, season) keep native vertical scroll inside the
  canvas.** The inner box is `830px` wide (fixed) but its height is `min-height: 385px`
  with normal document flow and `overflow-y: auto` — so the *width* never causes
  clipping (the actual bug this plan fixes) while a content-heavy list screen still
  scrolls vertically inside its scaled frame, exactly like it would on desktop. Only
  width is rigid; unbounded vertical content was never the complaint.
- D7 **`dvh`/`vh`/`100vw` audit.** Any element sized against the real viewport
  (`h-dvh`, `min-h-dvh`, raw `vh`/`vw`) inside a canvas-wrapped route must switch to a
  size relative to the 830px canvas box instead — otherwise it lays out against the
  unscaled device viewport before the transform applies and no longer matches the
  830x385 reference. `DraftRoom.tsx`'s `h-dvh` is the known instance from today; T2
  greps for the rest.
- D8 **`mobile_responsive`'s finished work is kept, not redone.** T1's audit harness,
  T2 (manifest/icons), T3 (`OrientationGate`'s rotate-check, merged into `GameCanvas`),
  T4 (auto-login), and T6's fluid-width fixes (rosters flex row, `DraftRoom` header
  breakpoint) all stay — they're what make the 830x385 reference render correctly,
  which is now the only width that has to.

## Out of scope

Re-tuning the reference resolution's own layout (it's already audited clean). A second
reference size for tablet specifically — tablet gets letterboxed instead, revisit only
if the owner's real-device pass (T7, still pending) finds it unacceptably small.
Desktop/mouse behavior — untouched. `/data`, `/debug`, `/admin/*`.

## Tasks

- T1 **`GameCanvas` component + mount** (top; the scaling math and dvh interaction are
  the risky part). Files: `components/GameCanvas.tsx` (new, absorbs
  `OrientationGate`'s rotate-check), `app/layout.tsx`. Done when a Playwright test at
  780x360 (today's failing width) and 830x385 shows the canvas box laid out at a fixed
  830px CSS width regardless of device width, scaled to fit, no scrollbar on the outer
  page, and desktop (`chromium`, no touch) renders `{children}` with zero wrapper
  (snapshot-diff clean).
- T2 **`dvh`/`vh` audit + fix** (mid). Grep `frontend/src` for `h-dvh|min-h-dvh|100vh|vw\b`
  inside routes covered by D1; replace with canvas-relative sizing (a `--canvas-h: 385px`
  custom property, or plain fixed px) inside the wrapped subtree. `DraftRoom.tsx` is the
  known instance. Done when no canvas-wrapped route uses a real-viewport unit.
- T3 **Letterboxing + scale floor** (low). D3/D4 in `GameCanvas.tsx`. Done when a
  Playwright test at an extreme aspect ratio (e.g. 400x800 portrait-forced or 2000x400
  ultra-wide) shows themed bars, not stretched content, and scale never drops under 0.85.
- T4 **Re-run + extend the mobile audit** (mid). `tests/mobile-audit.spec.ts` gains the
  780x360 width (today's real-device number) alongside 830x385/1244x778; the overflow
  check adds "any descendant with `scrollWidth > clientWidth` and `overflow: hidden`"
  (not just the document-level check, which is what missed today's bug) as a hard
  failure, not just soft-reported. Done when all three widths are green.
- T5 **Real-device pass** (owner) — supersedes `mobile_responsive` T7. S24+/S25/S26+ and
  Tab S10+, installed and in-browser: confirm the canvas fills usefully (letterbox bars
  aren't excessive on the actual tablet aspect ratio — if they are, that's the trigger
  to revisit D2/the "out of scope" tablet-reference note above) and one full
  draft -> deck -> game -> season loop has zero clipped/unreachable content.

## Parallelization

Wave 0 (driver, top tier): T1 — every other task depends on the component existing and
its scaling contract being settled. Wave 1 (parallel, disjoint files): T2, T3, T4.
Wave 2: T5 owner.

## Recommended model tier

T1: top (Fable 5.1 / Opus 5) — the transform-scale + dvh interaction is easy to get
subtly wrong and hard to unit-test, needs careful real-browser verification. T2-T4: mid
(Sonnet 5).

## Verification / exit criteria

- `npm test`, `tsc --noEmit`, `npm run lint` clean; `npm run test:e2e` green including
  the new 780x360 audit width.
- Live-browser check (not just the audit spec) at 780x360 and 830x385: draft pack,
  deck builder, game view, season, rosters all show zero clipped content, canvas box
  visibly letterboxed where aspect ratio doesn't match, no page-level scrollbar except
  the intentional vertical scroll inside taller screens (D6).
- Desktop (chromium, 1280x800) visual snapshots unchanged from before this plan.
- Owner sign-off from T5; then `/roadmap done game_canvas` (and `mobile_responsive` is
  marked superseded, not separately "done").
