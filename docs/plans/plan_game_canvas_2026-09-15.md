# Plan: game_canvas

File: `docs/plans/plan_game_canvas_2026-09-15.md`. Status: **built 2026-09-16 (zoom
mechanism + fit-to-screen rules + feedback round 1); open: T2 phone card design, T5
owner real-device pass.**
Sequence: 3 in `docs/ROADMAP.md` (replaces the remaining scope of `mobile_responsive`;
its T1-T4/T6 work and tests are kept as-is). Depends on: `ui_foundation` (done),
`deckbuilder_ux` (done). Files owned: `frontend/src/app/globals.css` (zoom rule, `dvh-z`
utilities), every `h-dvh` user (`DraftRoom`, `DeckBuilder`, `SeasonView`, `PackOpener`,
`ErrorRecovery`, `app/page.tsx`, `app/rosters`, `app/season`, `app/roster/[id]`,
`(auth)/layout`), `TopKPIBand.tsx`, `FranchiseDashboard.tsx`,
`frontend/tests/mobile-audit.spec.ts`, `frontend/playwright.config.ts`.
Excluded: `/data`, `/debug`, `/admin/*` (dev tools, not audited; the zoom still applies).

## Goal (owner, 2026-09-15 evening)

On the owner's phones in landscape, the five main screens — Home, Draft room, Deck
builder, Game view, Season — each show everything they show on desktop, on one screen,
without scrolling. Where that is impossible at a readable scale the fallback is vertical
scrolling (never horizontal) or, as a last resort, a mobile-only UI. Starting point per
the owner: proportionally scale everything down, type included — the non-responsive
Vercel build "almost worked" that way because Chrome zoomed the desktop layout to fit.

## How it got here

D0 first said "no canvas" after T0 fixed four sideways clips (see History). The owner's
UAT then showed the real failure was *height*: Home needed a scroll to reach two of its
three buttons on a 385px-tall phone. That reopened the idea as scaling, not clipping.

## Decisions (locked)

- D1 **Mechanism: CSS `zoom`, not `transform`.** `html { zoom: var(--zoom) }` with
  `--zoom: 0.7` under `@media (pointer: coarse) and (max-width: 999px)`, 1 everywhere
  else. `zoom` reflows, so fixed positioning, inner scroll regions, hit-testing and the
  drag/drop all keep working with no JavaScript, no hydration branch and no
  containing-block surprises. Verified: viewport units DO shrink with the root zoom
  (100dvh renders as 70% of the screen), so every full-height shell uses the
  `h-dvh-z` / `min-h-dvh-z` utilities (`calc(100dvh / var(--zoom))`) — one code path,
  desktop unchanged. Tablet (1244px) and touch laptops are above the width gate and
  stay fluid, which the audit shows is already right for them.
- D2 **Fit-to-screen contract per screen** (owner):
  | Screen | Rule | How |
  |---|---|---|
  | Home | nothing scrolls | `lg:`-only 600px floor, compact spacing under `lg`, hero glow without `scale-150` (a transformed box adds scrollable overflow) |
  | Draft room, pack intro + pick spread | two rows of four, nothing scrolls; minor scroll (<=10% of the viewport) tolerated on the shortest phones | draft header + ticker `pointer-coarse:max-lg:hidden` while inert during the intro; grid width derived from viewport height so two 5/7 rows fit |
  | Draft room, later picks | same two rows, header + ticker stay | grid cap = `(100dvh/zoom - 200px)*10/7 + gaps` |
  | Deck builder | no page scroll; depth-chart columns may scroll (12 players never fit) | `h-dvh-z` shell, band tiers from the zoomed container (1186px -> `regular`) |
  | Game view, Season | vertical scroll accepted (759 / 1521 CSS px of content) | unchanged |
  Tap targets and type are measured in design space: the 44px/12px floors hold in CSS
  px, i.e. 31px / 8.4px real on the phone — the owner's "floor at 0.7".
- D3 **Audit rules that encode D2** (`tests/mobile-audit.spec.ts`): rule 5 flags own
  text outside the viewport with no scroll container or translated drawer to bring it
  back (the rule that found the four T0 clips `scrollWidth` could not see); rule 6 flags
  page scroll on `NO_SCROLL_SCREENS` and, on the strict set (home, draft), any visible
  scroll region taller than half the screen that scrolls more than a tenth of it.
  Rects are divided by `currentCSSZoom`; measurement runs before the full-page
  screenshot (which misreads under zoom); textless overflow-hidden boxes are art.
- D4 **Known trade-off for T5:** at 830x385 the draft's later picks show 126 CSS px cards
  (88 real px) with names cut to two letters. Two rows that fit was the owner's stated
  priority over readability; if it is unreadable in the hand, the fallback is a
  slightly larger cap with the tolerated minor scroll, or a compact landscape card for
  phones (mobile-only UI, needs a design pass).
- D5 **Draft header:** both 256px side blocks appear from `lg` together, seats never
  shrink, bot names truncate at 96px, bar and chevrons scale under `lg`.
- D6 **Owner feedback round 1 (2026-09-16), what landed:** season schedule + standings
  side by side from `md` (`md:grid-cols-[3fr_2fr]`, one-line rows at `min-h-control`);
  Basic Offense/Defense tiles click/tap to auto-slot via the engine's
  `assignPlayToFirstOpenSlot` (drag kept, drag never double-fires the click); home fan
  shown on phones (380px column, 130px cards); card names wrap to two lines at the 12px
  floor on cards under 200px (`@max-[200px]:line-clamp-2`); long-press (450ms, held
  still) opens the screen-centred preview on Player and Play cards and swallows the
  following click, short tap keeps its flip/select meaning; pack reveal renders the
  STATIC front while the outer flip animates (the nested flippable card's own 3D context
  is what painted text through the card backs) and swaps to the interactive card in the
  picking phase. Merged `claude/swagger-cloud-version-chip-b28092` (cloud save fix, card
  back art, new pack image).
- D7 **Phone card (open, design-first).** The owner wants a wider "phone card" for the
  draft room so the unused horizontal space carries the name and badges. That is a new
  card variant, not a class tweak: it goes through a canvas mock-up and sign-off before
  implementation (see memory/workflow: design-first). Until then the two-row 5/7 grid
  stands.

## History

- 2026-09-15: T4 audit rule + `phone-narrow` 780x360 project found four real sideways
  clips at both 830 and 780 (home fan, draft seat at x=-35, KPI band pill, franchise
  dashboard). T0 fixed them in the fluid layout (`4decbb5`). D0 then said "no canvas";
  the owner's height UAT the same night reversed that into D1-D4 above.

## Tasks

- T4 audit harness — done 2026-09-15/16. T0 four clips — done 2026-09-15.
- T1 zoom + `dvh-z` + fit-to-screen — **done 2026-09-16**: audit 0 findings on
  `phone-landscape`, `phone-narrow`, `tablet-landscape`; chromium 40/40; desktop
  snapshots unchanged.
- T2 **Phone card design** (owner + design canvas) — mock the wider draft-room card at
  830x385, sign off, then implement as a `PlayerCard` variant used by the pack spread
  and draft grid on phones. Blocks nothing else.
- T5 **Real-device pass** (owner) — the only open verification task. S24+/S26+ in-browser and
  installed: Home, Draft (intro, pick 1, pick 2+), Deck builder, Game, Season. Judge D4
  on the device. Clean = `/roadmap done game_canvas`.

## Verification / exit criteria

- `npm test`, `tsc --noEmit`, `npm run lint`, `check:styles` clean; `mobile-audit` 0
  findings on all three touch projects (`--workers=1`, they share one fixture roster);
  chromium `test:e2e` green with unchanged 1280x800 snapshots.
- Owner sign-off from T5; then `/roadmap done game_canvas`, `mobile_responsive` stays
  marked superseded.
