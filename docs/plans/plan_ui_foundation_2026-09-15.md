# Plan: ui_foundation

File: `docs/plans/plan_ui_foundation_2026-09-15.md`. Status: planned
Sequence: 3 in `docs/ROADMAP.md`. Depends on: none. Blocks: mobile_responsive T5/T6.
Files owned: `globals.css`, `app/layout.tsx` (html attrs + providers; mobile T2 may edit
only the `metadata`/`viewport` exports), `src/lib/cn.ts` (new), `src/components/ui/*`
(new), `src/components/cardColors.ts` (new), `scripts/check-styles.mjs` (new),
`package.json`, `.github/workflows/ci.yml`, `AuthProvider.tsx`, `TopNav.tsx`,
`WhatsNewSplash.tsx`, `SyncConflictPrompt.tsx`, `Toast.tsx`, `ErrorRecovery.tsx`,
`PlayerCard.tsx`, `PackOpener.tsx`, `PackPassStage.tsx`, `PackRevealCard.tsx`,
`DraftRoom.tsx`, `DraftSidebar.tsx`, `PickTimerRing.tsx`, `RoundSummary.tsx`,
`DeckBuilder.tsx`, `DepthSlotColumn.tsx`, `PlayPanel.tsx`, `AssignPopover.tsx`,
`RosterChecklist.tsx`, `RosterDistribution.tsx`, `TopKPIBand.tsx`, `GameView.tsx`,
`SeasonView.tsx`, `FranchiseDashboard.tsx`, `DonutChart.tsx`, `RadarChart.tsx`,
`app/page.tsx`, `app/rosters/page.tsx`, `app/roster/[id]/page.tsx`, `app/season/page.tsx`,
`app/(auth)/**`, `tests/visual.spec.ts` + snapshots, `tests/draft.spec.ts` (new).
Conflicts: overlaps mobile_responsive's list on purpose; this plan lands first and
mobile T5/T6 start from its result. Mobile T2/T3/T4 (manifest, OrientationGate, proxy)
are disjoint and may run alongside.

## Goal

One styling system instead of 27 hand-rolled components. Today there are ~1,100 raw
palette classes (`stone-*` 744, `amber-*` 80, ...), 182 arbitrary `text-[Npx]` sizes
(down to 6px), 20 `100vh` shells, three different offsets for one 56px nav bar, and no
shared Button. Changing a colour means touching every file. When this is done: a theme
is one attribute on `<html>`; product screens use semantic tokens and five primitives
only; a CI gate stops raw classes coming back; and the four owner-reported defects
(confirm button, late header, website chrome on game screens, pack-pass flicker) plus
the cross-cutting mobile-audit findings (type floor, 44px controls, clipped card back,
undismissable splash) are fixed once, for every device. Mobile T6 then re-runs the audit
and fixes only what is left.

## Decisions (locked)

- D1 **Semantic tokens, theme by attribute.** `globals.css` defines CSS variables under
  `:root` (theme `court`, today's cream) and `[data-theme="night"]` (today's stone-950
  dark, used to prove the switch), mapped into Tailwind via `@theme inline` so classes
  are `bg-surface`, `text-ink`. Token set: `surface`, `surface-raised`, `surface-sunken`,
  `surface-inverse`, `ink`, `ink-muted`, `ink-inverse`, `line`, `line-strong`, `accent`,
  `accent-hover`, `accent-ink`, `positive`, `warn`, `danger`, `info`, each with a `-soft`
  background variant where used. `layout.tsx` sets `data-theme="court"`; no toggle UI,
  no persistence yet. Game data colours (position, rarity, team) are not theme: they move
  to `components/cardColors.ts`, the only product file allowed hex literals.
- D2 **Scale tokens.** Controls: `h-control` 44px, `h-control-lg` 52px; icon hit area
  44x44 via padding even when the glyph is 16-20px. Type: Tailwind sizes only, `text-xs`
  = 12px is the floor; `text-[Npx]` is banned. Nav: `--nav-h: 56px`, utility `pt-nav`;
  the `pt-[56|60|70px]` variants go. Viewport: `h-dvh`/`min-h-dvh` replace every
  `h-screen`/`min-h-screen` (the 100vh-under-browser-chrome bug behind the hidden
  confirm button). Radius: `rounded-panel` 12px, `rounded-control` 8px.
- D3 **Five primitives in `components/ui/`**, variants via `class-variance-authority`,
  merged with `tailwind-merge` (`lib/cn.ts`); no Radix/shadcn. `Button` (variant
  primary|secondary|ghost|danger, size md|lg, `href` renders `Link`), `IconButton`
  (required `label` -> aria-label + title), `Panel`, `Menu` (details/summary, from
  TopNav's two dropdowns), `Overlay` (fixed scrim + panel `max-h-[90dvh] overflow-y-auto`,
  Escape and backdrop close). New UI must use them; a raw `<button>` in product code
  fails the gate.
- D4 **Style gate.** `scripts/check-styles.mjs` scans className literals in
  `src/components/**` and `src/app/**`, excluding `app/(debug|data|test-ui|admin|
  deckbuilder-test|pack-opener-preview)/**` and `cardColors.ts`. Fails on: raw palette
  classes (`(bg|text|border|from|to|via|ring|fill|stroke)-(stone|amber|yellow|orange|
  emerald|red|blue|teal|green|gray|neutral|zinc|slate|purple|violet)-\d+`), `text-[`,
  `h-screen`, `min-h-screen`, `pt-[`, `#[0-9a-f]{3,6}` inside className, and `<button`
  outside `components/ui/`. `npm run check:styles`, wired into CI after lint.
- D5 **12px floor; unreadable flavour is removed, not shrunk.** PlayerCard's `micro`/
  `xs`/`cqw` badge tiers render icon-only (no level digit), overflow count goes to a
  `title`; `MiniPlayerCard` shows name, position, rarity gem, team stripe only, no stat
  strip. Any text that cannot fit at 12px in a given card size is dropped for that size.
- D6 **Header.** `AuthProvider` exposes `status: 'loading' | 'signed-out' | 'signed-in'`.
  `TopNav` always reserves `--nav-h` and renders fixed-width placeholder pills while
  loading (no layout shift). On game routes (`/draft`, `/roster/*`, `/season`) the cream
  bar and title are replaced by a single 44px gear `IconButton` fixed top-right opening
  the `Menu` (home with the existing leave-confirm, notifications, sync, profile). The
  full game-chrome redesign is a later plan.
- D7 **One confirm control.** PackOpener and DraftRoom both use `Button primary lg`
  labelled `Take <player>` (disabled: `Select a card`), docked fixed `bottom-4 right-4`
  (safe-area aware), never moving. DraftRoom's gradient scrim and `pb-32` go. Enter still
  confirms.
- D8 **PackPassStage: two elements, no timers.** An absolutely positioned exit ghost
  (snapshot) animates out while the live pack, keyed by `passSeq`, animates in; phases
  advance on `onAnimationComplete`; the settled state keeps the same key (no remount).
  `prefers-reduced-motion` skips the motion.
- D9 **Overlays.** `WhatsNewSplash` and `SyncConflictPrompt` render through `Overlay`.
- D10 **PlayerCard back face** becomes a scroll region (`overflow-y-auto overscroll-contain`).
- D11 **Snapshots** are re-baselined once, in one commit, after the owner eyeballs them
  (fixes the two known-failing ones). win32 convention stays.
- D12 Product rules hold (AGENTS.md): no OVR/ratings, rarity as gem, one roster list.

## Out of scope

Game chrome redesign beyond D6 (later `game_chrome` plan). Theme toggle UI and per-user
persistence. Dev pages restyle. Tap-to-place, orientation gate, manifest (mobile plan).
Engine, balance, card data.

## Tasks

- T1 **Tokens, theme, scale** (top). `globals.css`, `layout.tsx`, `lib/cn.ts`, deps.
  Done: `npm run build` green; devtools `data-theme="night"` recolours `/` (screenshot).
- T2 **Primitives** (mid). `components/ui/*`, `/test-ui` gallery section. Done: new
  `ui-primitives.png` snapshot in `visual.spec.ts`; every Button/IconButton box >= 44px.
- T3 **Style gate** (low). `scripts/check-styles.mjs`, `package.json`, `ci.yml`. Done:
  `npm run check:styles` prints a per-file violation count on the current tree and exits
  1; exits 0 on an allowlisted dev page.
- T4 **Header + auth status** (mid). `AuthProvider.tsx`, `TopNav.tsx`. Done: Playwright
  asserts nav `getBoundingClientRect()` identical at first paint and after `networkidle`;
  screenshot of `/draft` shows gear only.
- T5 **Draft confirm + pack pass** (mid). `DraftRoom.tsx`, `PackOpener.tsx`,
  `PackPassStage.tsx`, `tests/draft.spec.ts` (new). Done: spec asserts the confirm
  button box is inside the viewport and at the same coordinates across 3 picks, and that
  a `data-pass-node` element keeps DOM identity across a pass (no remount).
- T6 **Overlays + PlayerCard** (mid). `WhatsNewSplash.tsx`, `SyncConflictPrompt.tsx`,
  `PlayerCard.tsx`, `cardColors.ts`. Done: mobile-audit `clipped` = 0 and PlayerCard
  `font-size` findings = 0 on `home` and `rosters`.
- T7 **Migration, four groups** (mid, one agent each; each group also does dvh, `pt-nav`
  and type sizes in its own files). A: draft (`DraftSidebar`, `PackRevealCard`,
  `PickTimerRing`, `RoundSummary`). B: deck (`DeckBuilder`, `DepthSlotColumn`,
  `PlayPanel`, `AssignPopover`, `RosterChecklist`, `RosterDistribution`, `TopKPIBand`).
  C: game/season (`GameView`, `SeasonView`, `FranchiseDashboard`, `DonutChart`,
  `RadarChart`). D: pages (`app/page.tsx`, `rosters`, `roster/[id]`, `season`, `(auth)`,
  `ErrorRecovery`, `Toast`). Done per group: `check:styles` clean for its files, smoke
  green, screenshots unchanged in `court` and recoloured in `night`.
- T8 **Re-baseline + audit** (driver). Done: `visual.spec.ts` green; mobile-audit rerun
  numbers in HANDOVER.

## Parallelization

Wave 0 (driver): T1, then T2 and T3 (T3 low agent). Wave 1 (parallel, disjoint): T4,
T5, T6. Wave 2 (parallel): T7 A-D. Wave 3: T8. Agents never run git.

## Recommended model tier

Driver top (Opus 5 / Gemini 3 Pro): the token set and primitive API are the design.
T1 top. T2, T4-T7 mid (Sonnet 5 / Gemini 3 Pro). T3 low (Haiku 4.5 / Gemini 3 Flash).

## Verification / exit criteria

- `npm run check:styles` exits 0. `grep -rnE "h-screen|min-h-screen|text-\[|pt-\[" src`
  hits only allowlisted dev pages.
- `tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:e2e --project=chromium` green
  (smoke, home, draft, season, visual on the re-baselined snapshots).
- Theme proof: `git diff` for flipping `data-theme` touches only `layout.tsx`; screenshots
  of `/`, `/draft`, a deck builder and `/season` in `night` show no unthemed element.
- Mobile audit: phone from 200 findings to <= 40, tablet from 201 to <= 40, with
  `font-size` = 0 and `clipped` = 0 on every screen; remaining items are deck-builder
  layout rows for mobile T6.
- Owner check on the S24+: confirm button visible without scrolling; pack pass without
  flicker; header present at first paint.
