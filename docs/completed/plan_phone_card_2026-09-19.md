# Plan: phone_card

File: `docs/completed/plan_phone_card_2026-09-19.md`. Status: done 2026-09-19.
Sequence: 8 in `docs/ROADMAP.md`. Depends on: — (game_canvas done). Files owned:
`frontend/src/components/PlayerCard.tsx` (`PlayerCard`, `PlayerCardFront`),
`frontend/src/components/PackRevealCard.tsx`, `frontend/src/components/PackOpener.tsx`,
`frontend/src/components/DraftRoom.tsx` (grid `max-w` only), `frontend/src/app/globals.css`
(none expected — see D1).

**Closing note (2026-09-19):** `globals.css` ended up untouched — the phone aspect/gap/
crop overrides landed as `pointer-coarse:max-lg:` Tailwind arbitrary-value classes
(matching the file's existing convention) rather than a new CSS custom property, so no
new media-query block was needed. `tsc`, 442/443 tests (the one pre-existing unrelated
`lineup.test.ts` drift), lint (0 errors), `check:styles` (0 violations), smoke 9/9 all
green. Verified visually at 760x385 with real `pointer: coarse` + the app's own 0.7 zoom
(the only way this sandbox reproduces the real device) — cards read noticeably wider
with full single-line names and better-spaced badges, matching the signed-off mock-up;
`DepthSlotColumn`'s starter row confirmed pixel-for-pixel unchanged in the same session.

## Goal

Design-first mock-up (canvas, real S26+ viewport, owner-signed-off 2026-09-19) showed the
draft-room card reading fine at today's size and structure — no redesign needed, just a
modest resize: a little more square, a little bigger, badges with a touch more room. After
this plan the phone-landscape pack/draft card uses that exact signed-off sizing; the deck
builder's 5-across starter row and every other `PlayerCard`/`PlayerCardFront` use (rosters
page, bench list, hover preview) are untouched.

## Decisions (locked)

- D1 **Scope is the `size="sm"` draft/pack card only, phone (`pointer-coarse`, `max-lg`)
  only** — not every `size="sm"` card. `DepthSlotColumn`'s 5-across starter row also
  passes `size="sm"` but is narrower and wasn't mock-up-verified; a new `wide?: boolean`
  prop (default `false`) threads through `PlayerCard` and `PlayerCardFront` so only
  `DraftRoom.tsx`'s pack grid and `PackRevealCard.tsx` opt in. `DepthSlotColumn.tsx` is
  not touched and does not pass `wide`.
- D2 **Aspect ratio 1.15/1** (was 5/7 ≈ 0.714), phone only. Height is unchanged (it's
  viewport-height-driven, already near its ceiling — confirmed by reading the live DOM:
  105.5×147.7 real px at 760px width, and the same at 830px since the grid's `max-w`
  formula is height-derived, not width-derived); width grows from ~106px to ~170px,
  consuming the ~195px/side margin the S26+ screenshot showed, down to ~67px/side —
  still comfortable, verified by hand before implementing (see mock-up notes).
  Applied as `pointer-coarse:max-lg:aspect-[1.15/1]!` next to the existing
  `aspect-[5/7]`, gated by D1's `wide` prop where the aspect lives in a shared component.
- D3 **Grid `max-w` formula's ratio constant updates from `10/7` to `2.3`** (= 2 × 1.15,
  same derivation as the existing `10/7` = 2 × 5/7) in both `DraftRoom.tsx:524` and
  `PackOpener.tsx:349` — the height-offset constants (200px / 128px) are unrelated to
  aspect and stay as-is.
- D4 **Badge row gap: `gap-1` (4px) → `pointer-coarse:max-lg:gap-1.5!` (6px)**, `wide`
  only. Matches the mock-up's "centered, a little more space" call (space-evenly read as
  too spread out and was reverted).
- D5 **Image crop**: `object-top` → `pointer-coarse:max-lg:object-[center_20%]!`, `wide`
  only. The image band gets shorter relative to its width at 1.15/1, so a flat top-anchor
  starts cropping into the hairline instead of the face; 20% is a hand-picked middle
  ground from the mock-up's computed heuristic, not per-photo tuned — a real fix (if
  20% reads wrong on some rosters) is a follow-up, not blocking this plan.
- D6 **No stats row added.** The mock-up showed one for illustration; the real
  `size="sm"` card already drops the stats grid entirely (D24, card_canvas) and that
  stays true here — this plan is a resize, not a new data display.

## Out of scope

`DepthSlotColumn`'s starter row, the rosters page's `size="md"` cards, `mode_picker`,
`android_twa`. Per-photo image-crop tuning beyond D5's single hand-picked value.

## Tasks

- T1 Thread `wide?: boolean` (default `false`) through `PlayerCard` and
  `PlayerCardFront`; apply D2 (aspect) and D4 (badge gap) in `PlayerCard.tsx`, D5 (image
  crop) in `PlayerCardFront`. `PlayerCard`'s aspect ratio moves from an inline style to a
  Tailwind class (`aspect-[5/7]` + conditional `pointer-coarse:max-lg:aspect-[1.15/1]!`)
  so the phone variant composes the same way the rest of the file already does. Tier: mid.
- T2 Wire `wide` at the two real call sites: `DraftRoom.tsx:566` (`<PlayerCard ... wide
  />`), `PackRevealCard.tsx:43,49` (both the `PlayerCardFront` and `PlayerCard` branches).
  Apply D2 directly to `PackRevealCard.tsx:27,42` and `PackOpener.tsx:422` (always-wide
  context, no prop needed there). Tier: low.
- T3 Update D3's grid `max-w` constant in `DraftRoom.tsx:524` and `PackOpener.tsx:349`.
  Tier: low.
- T4 Verify at the real S26+ viewport: dev server, browser pane resized to <768px width
  (forces `pointer: coarse` + the app's own 0.7 zoom, confirmed the only way this sandbox
  reliably reproduces the real device) then to 830×385, screenshot the pack grid and
  compare against the signed-off mock-up. Confirm `DepthSlotColumn`'s starter row is
  visually unchanged. Tier: mid.

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro (component prop threading, visual verification
judgment against the signed-off mock-up). No parallel waves — T1 is a small shared-file
change the rest depend on.

## Verification / exit criteria

- `npx tsc --noEmit` and `npm test` (443/443, minus the one pre-existing unrelated
  `lineup.test.ts` drift already tracked) clean.
- Screenshot of the pack grid at the real S26+ viewport (830×385, forced `pointer:
  coarse`) matches the signed-off mock-up's proportions and badge spacing.
- Screenshot (or DOM check) confirms `DepthSlotColumn`'s starter row is byte-for-byte
  unchanged — same aspect ratio, same badge gap.
- `npm run test:e2e -- smoke.spec.ts` 9/9 (no console errors from the new classes).
