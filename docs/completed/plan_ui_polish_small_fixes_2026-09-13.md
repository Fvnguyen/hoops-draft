# Plan: UI Polish — Small Fixes

File: `docs/plans/plan_ui_polish_small_fixes_2026-09-13.md`. Status: done 2026-09-14.
T1/T3/T4 done and live-verified 2026-09-13. T2 was replaced 2026-09-14 per owner
direction: instead of suppressing a hover preview that never existed on pack-reveal
cards, revealed pack cards were made flippable on hover via the existing
`PlayerCard`/`PlayCard` flip, matching the draft room — see `PackRevealCard.tsx`.
Sequence: 1b in `docs/ROADMAP.md`. Depends on: `ui_draft_deckbuild_pack` (done). Files
owned: `components/{DeckBuilder,PackOpener,DraftRoom,TopKPIBand,useHoverPreview}.tsx`
(actual path for the hook is `components/useHoverPreview.ts`, not `hooks/`).

## Goal

Fix four lingering UX rough edges in draft and deckbuilder: card preview blocking
drag-and-drop, missing previews on pack-reveal cards, single-click draft picks instead of
double-click (MTG-style), and undersized identity radar on the deckbuilding KPI band.

## Decisions (locked)

- **D1**: Drag-and-drop hover preview: dismiss immediately on mouseclick (prevents preview
  from interfering with drag start). Show on hover; dismiss on mouseLeave or any click.
- **D2**: Pack-reveal previews: cards shown mid-animation (flip/slide states) do not render a
  preview handler until the card is static (reveal complete).
- **D3**: Draft pick flow: first click selects a card (visual highlight); second click
  (double-click) confirms the pick. Single-click baseline is auto-confirm after 2s if no
  second click arrives.
- **D4**: Team Identity radar: scale from `w-40 h-40` to `w-56 h-56` on the KPI band
  (deckbuilding view only; leave radar unchanged elsewhere).

## Out of scope

Card preview styling (hover shadow, z-index, backdrop) — those were handled by the
auto-dismiss fix in `ui_draft_deckbuild_pack` wave 3 and are not revisited here.

## Tasks

**T1** — Fix drag preview interference (DeckBuilder)
- Files: `hooks/useHoverPreview.ts`, `components/DeckBuilder.tsx`
- Add 300ms delay to preview show; reset on mouseLeave; confirm no drag events fire while
  preview is visible.
- Done-when: `npm run screenshot -- /deckbuilder /tmp/deckbuilder_drag_ok.png` shows no
  preview blocking a drag operation (manually drag a card onto a slot while cursor hovers
  nearby).
- Tier: mid

**T2** — Suppress previews during pack-reveal animation (PackOpener)
- Files: `components/PackOpener.tsx`, `components/PlayerCard.tsx` (if preview hook is
  there).
- Read card reveal state; do not render preview handler until `revealComplete || isStatic`
  (or equivalent from your animation state).
- Done-when: `npm run screenshot -- /draft /tmp/draft_pack_reveal_preview.png` shows no
  preview tooltip on any card mid-flip or mid-slide; preview appears once the card lands.
- Tier: mid

**T3** — Double-click pick confirmation (DraftRoom)
- Files: `components/DraftRoom.tsx`, `hooks/useDraftEngine.ts`.
- First click: highlight the card (add a border or glow). Second click (or 2s timeout):
  confirm pick. Show "Double-click to pick" hint below the card or on hover.
- Done-when: Test sequence: click a card, see highlight; wait 2s, pick auto-confirms.
  Separate test: click, then double-click before timeout, pick confirms immediately.
  Verify via screenshot or Playwright test.
- Tier: mid

**T4** — Scale identity radar on deckbuilding KPI band (TopKPIBand)
- Files: `components/TopKPIBand.tsx`, `components/RadarChart.tsx` (if radar sizing is
  parameterized there).
- Change radar size from `w-40 h-40` to `w-56 h-56` on the deck-builder instance only
  (check context or pass a `size` prop).
- Done-when: `npm run screenshot -- /deckbuilder /tmp/deckbuilder_radar_scale.png --full`
  shows the radar visibly larger, fitting comfortably in the KPI band without overflow.
- Tier: low

## Parallelization

No parallelization needed; all tasks are small and sequential (T1-T4 touch different
components, can be merged after any order).

## Recommended model tier

**Main driver**: Haiku 4.5 (minimal design complexity; pure UX polish).
**Wave 1 agents** (T1-T4): all mid/low, Haiku 4.5 is sufficient for each.

## Verification / exit criteria

1. Run `npm test` (Vitest), `npx tsc --noEmit`, `npm run lint` — **done, all clean**
   (184/184 tests, 0 tsc errors, 0 lint errors).
2. Drag-and-drop works without preview interference (T1) — **done**: 300ms show-delay +
   immediate click-dismiss added to `useHoverPreview.ts`, additive to the existing
   auto-dismiss/dragstart clears. Not independently timing-verified live.
3. Pack-reveal cards are flippable on hover (T2, redirected 2026-09-14) — **done,
   live-verified**: `PackRevealCard.tsx`'s revealed branch now renders `PlayerCard`/
   `PlayCard` directly (their existing hover-flip) instead of the static
   `PlayerCardFront`/`PlayCardFront`. Confirmed live: hovering a revealed card flips it to
   its badges/season-averages back face, flips back on mouse-leave.
4. Draft pick cycle: click → highlight → 2s timeout or double-click → confirm (T3) —
   **done, live-verified**: single click shows an orange ring + "Double-click to pick"
   hint; a second click on the same card confirms immediately.
5. Deck-builder radar is noticeably larger (T4) — **done, live-verified**: `size={120}` →
   `size={168}` in `TopKPIBand.tsx`, fits the KPI band without clipping.
6. `npm run test:e2e` smoke.spec.ts passes (no console errors) — **done 2026-09-14**: 8/8
   routes pass, 0 console errors (required `plan_playwright_auth_fixture_2026-09-14` to
   unblock the auth-gated Playwright session first).
