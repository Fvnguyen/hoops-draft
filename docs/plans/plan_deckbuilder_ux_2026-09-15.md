# Plan: deckbuilder_ux

File: `docs/plans/plan_deckbuilder_ux_2026-09-15.md`. Status: planned
Sequence: 4 in `docs/ROADMAP.md`. Depends on: ui_foundation (#3, tokens + primitives).
Blocks: mobile_responsive T6 (deck-builder rows). Files owned: `DeckBuilder.tsx`,
`DepthSlotColumn.tsx`, `PlayPanel.tsx`, `AssignPopover.tsx`, `TopKPIBand.tsx`,
`DonutChart.tsx`, `RadarChart.tsx`, `PlayerCard.tsx` (the `PlayCard`, `PlayCardFront`,
`PlayHoverPreview`, `RoleTag` sections only), `engine/deckbuilder.ts` (assign helper),
`app/test-ui/page.tsx`, `tests/deckbuilder.spec.ts` (new), `tests/visual.spec.ts` +
snapshots, `docs/design/deckbuilder_ux/*` (new, the signed-off artboards as PNG).
Conflicts: absorbs mobile_responsive T5 (tap-to-place) and D6; mobile T6 runs after this.

## Goal

The owner's live review of ui_foundation (2026-09-15): the deck builder is still hard to
use. Elements do not scale sensibly with what is expanded, the identity radar was tiny,
the top band hides everything when collapsed and shows too much when open, play cards
are hard to read, and plays can only be assigned by drag. When this is done: the builder
lays itself out from its own container in three tiers; the collapsed band is a real HUD
(validity chips, best/worst axis, shot diet) and the expanded band is the detail view;
plays are compact tiles you can read at a glance; a click assigns a play or a player, on
every device, with drag kept for pointer users. The look is designed on a canvas first
and signed off by the owner before any agent implements it.

## Decisions (locked)

- D1 **Design first, then build to the artboards.** T1 produces a design canvas (the
  `design` skill) with three artboards at 1280 wide: (a) the collapsed band, (b) the
  expanded band, (c) a play tile in its three states (empty slot, assigned, needs-role)
  plus the roster-list variant. The owner edits and signs off in the canvas; the signed
  artboards are exported to `docs/design/deckbuilder_ux/` and are the spec for T3 and
  T5. An agent implementing those tasks matches the artboard; it does not restyle.
- D2 **Collapsed band content** (owner choice): chips `Players n/12`, `Plays n/3`,
  `Identity: <name|none>`; the radar's peak and valley as words (`▲ Playmaking`,
  `▼ 3PT`); a shot-diet mini (`RIM 34 · MID 29 · 3PT 37`); one 44px expand control.
  Band height 56px (`h-nav`) so it lines up with the game-route gear. Each chip is a
  44px `Button variant=ghost` that expands the band to its section. Colours: tokens
  only; positive/danger for peak/valley; chart series from `cardColors`/CSS variables.
- D3 **Click assigns, drag stays.** `engine/deckbuilder.ts` gains
  `assignPlayToFirstOpenSlot(roster, playId)` and `placePlayerInSlot(...)`, the same
  rule path `handleDropOnZone`/`handleDropOnSlot` already use (they are refactored to
  call these). In the UI: click a play in the roster list -> it lands in the first open
  slot for its side (offense/defense), or shows the existing "roster full" toast; click
  a placed play -> `AssignPopover` with remove/swap. Click a bench player -> eligible
  depth slots highlight (`ring-positive`, already the assigning affordance) -> click a
  slot to place; click a placed player -> promote/demote/remove. Escape or clicking
  empty space clears. Double-click never opens or resizes any panel.
- D4 **Three container tiers, no viewport media queries.** On DeckBuilder's existing
  `@container`: `compact` < 960px, `regular` 960-1279px, `wide` >= 1280px (cqw-based via
  `@min-[...]`). compact: plays panel is a 44px-tabbed drawer over the depth chart,
  depth chart scrolls horizontally with `snap-x`, columns min 148px, roster sidebar is an
  overlay drawer. regular: plays panel docked `w-[clamp(200px,20cqw,280px)]` (as now),
  depth chart 5 columns, roster sidebar collapsed to its 48px strip by default. wide:
  everything docked, roster `w-[clamp(280px,24cqw,400px)]`. Starter card keeps
  `aspect-[5/7]`; bench rows are exactly `h-control`. Card and tile type never drops
  below `text-xs`; what does not fit is dropped per ui_foundation D5, not shrunk.
- D5 **Play tiles replace play cards inside the builder.** Per artboard (c): fixed
  height 72px (56px in the roster list), category colour bar from `cardColors`, name,
  `OFF`/`DEF` chip, role avatars as 28px circles (filled headshot / dashed empty), one
  status line (`Needs: Finisher x2` or `Ready`). No hover-only information; the play's
  full description moves to a `title` and the existing hover preview.
- D6 Product rules hold (AGENTS.md): no OVR/ratings, rarity as gem, depth chart starts
  empty, one roster list. No engine or balance change beyond the pure assign helpers.
- D7 **Tests.** `tests/deckbuilder.spec.ts` (chromium) builds a legal 12-man roster and
  assigns three plays by clicks only, once per tier (`setViewportSize` 900, 1100,
  1440); asserts no control < 44px and no horizontal overflow at any tier. Visual
  snapshots on `/test-ui`: collapsed band, expanded band, the three play-tile states.
  Mobile audit re-run afterwards; its deck-builder rows must be clean at both projects.

## Out of scope

Identity/plan catalogue content and thresholds (card_balance). Draft-room UI. Game and
season screens. Phone orientation, manifest, auto-login (mobile_responsive). Theme
toggle UI. Any change to how plays resolve in `engine/game.ts`.

## Tasks

- T1 **Design canvas** (top, driver). Files: canvas artifact; exports to
  `docs/design/deckbuilder_ux/`. Done: owner signs off all three artboards; PNGs
  committed; D2/D5 amended here if the sign-off changed anything.
- T2 **Assign helpers + click-to-assign** (mid). Files: `engine/deckbuilder.ts`,
  `DeckBuilder.tsx`, `AssignPopover.tsx`, `tests/unit/deckbuilder-assign.test.ts` (new).
  Done: unit tests for both helpers (legal, full, wrong side, duplicate); the click flows
  of D3 work in the browser; drag still passes existing tests.
- T3 **Collapsed + expanded band** (mid). Files: `TopKPIBand.tsx`, `DonutChart.tsx`,
  `RadarChart.tsx`. Done: matches artboards (a)/(b); band is 56px collapsed; chips
  expand to their section; snapshot on `/test-ui`.
- T4 **Container tiers** (mid). Files: `DeckBuilder.tsx`, `DepthSlotColumn.tsx`. Done:
  D4 tiers verified by `deckbuilder.spec.ts` at 900/1100/1440; screenshots at each.
- T5 **Play tiles** (mid). Files: `PlayerCard.tsx` (play sections), `PlayPanel.tsx`.
  Done: matches artboard (c); roster-list and slot variants; snapshot on `/test-ui`.
- T6 **Spec, snapshots, re-audit** (driver). Files: `tests/deckbuilder.spec.ts`,
  `tests/visual.spec.ts` + snapshots, `app/test-ui/page.tsx`. Done: exit criteria below.

## Parallelization

Wave 0: T1 (driver + owner sign-off; nothing else starts before it). Wave 1 (parallel,
disjoint files): T2, T3, T5. Wave 2: T4 (needs T2's DeckBuilder refactor landed).
Wave 3: T6. Agents never run git; the driver verifies and commits each wave.

## Recommended model tier

Driver top (Fable 5.1 / Opus 5 or Gemini 3 Pro): the canvas and the tier rules are
design. T2-T5 mid (Sonnet 5 / Gemini 3 Pro). No low-tier tasks.

## Verification / exit criteria

- `npm test` green including `deckbuilder-assign.test.ts`; `tsc --noEmit`, `npm run lint`,
  `npm run check:styles` clean.
- `npx playwright test tests/deckbuilder.spec.ts --project=chromium` green at all three
  tiers; `visual.spec.ts` green on the new snapshots.
- Mobile audit: deck-builder screen 0 findings on `phone-landscape` and `tablet-landscape`.
- Owner: one roster built and three plays assigned by clicks only on the laptop and on
  the S24+; the collapsed band reads without expanding.
