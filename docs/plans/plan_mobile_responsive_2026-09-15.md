# Plan: mobile_responsive

File: `docs/plans/plan_mobile_responsive_2026-09-15.md`. Status: **superseded 2026-09-15
by [game_canvas](plan_game_canvas_2026-09-15.md)** — T1-T4 and T6 below are done and kept
as-is (their manifest/icons/OrientationGate/audit-harness/fluid-width work is the
foundation `game_canvas` builds on); T5 was already absorbed by `deckbuilder_ux`; T7
(owner real-device pass) is superseded by `game_canvas` T5. Reason: today's real-device
test (780x360, narrower than this plan's 830x385 target) showed the fluid-width approach
is brittle — `DraftRoom`'s header silently clipped content the audit's one fixed
viewport didn't catch. `game_canvas` replaces "make every width fit" with "scale one
known-good width to fit any device," per owner decision.
Sequence: 5 in `docs/ROADMAP.md`. Depends on: ui_foundation (#3, done) and deckbuilder_ux (#4) for T6; T2-T4 may run now.
Files owned: `frontend/playwright.config.ts`, `frontend/tests/mobile-audit.spec.ts` (new),
`frontend/tests/visual.spec.ts`, `frontend/src/app/layout.tsx`, `frontend/src/app/manifest.ts`
(new), `frontend/public/icons/*` (new), `frontend/src/components/OrientationGate.tsx` (new),
`DeckBuilder.tsx`, `DepthSlotColumn.tsx`, `DraftRoom.tsx`, `GameView.tsx`, `SeasonView.tsx`,
`FranchiseDashboard.tsx`, `TopNav.tsx`, `app/page.tsx`, `app/rosters/page.tsx`.
Conflicts: `DraftRoom.tsx` pack play card is owned by draft_ai — coordinate, do not restyle
that block here.

## Goal

The game is played on the owner's Samsung phones (S24+/S26+) and Galaxy Tab S10+ in
landscape, installed from the browser to the home screen, opening straight into the app
without a login screen. All four flows (draft, deck builder, game, season) are usable at
phone-landscape height; the deck builder gets tap-to-place. This supersedes the old
mobile_responsive + mobile_pwa_shell pair: manifest/icons move in here, service worker and
offline are dropped (auth is server-gated, so an offline shell cannot work yet), and the
Play Store TWA stays a separate, conditional plan. Audit first, design second: the D-list
from the 2026-09-12 review is replaced by a measured punch list (T1).

## Decisions (locked)

- D1 **Target viewports** (CSS px, Chromium, `isMobile`+`hasTouch`): phone-landscape
  830x385 (S24+/S26+, dpr 3; assume 300-340 px usable height under browser chrome) and
  tablet-landscape 1244x778 (Tab S10+, dpr 2.25). iOS is secondary: WebKit smoke run
  only, no snapshots. Desktop 1280x800 stays the primary snapshot baseline.
- D2 **Landscape only after login.** `manifest.ts` sets `orientation: 'landscape'` (honoured
  when installed). In the browser, `OrientationGate` renders a full-screen "rotate your
  device" overlay under `@media (orientation: portrait) and (pointer: coarse)` on every
  route except `/login`, `/signup`, `/pending`, which stay usable in portrait. No
  portrait layouts are built or tested. Tablets are gated too.
- D3 **Add to Home Screen, no service worker.** `app/manifest.ts`: `display: 'standalone'`,
  `start_url: '/'`, `theme_color`/`background_color` from the current dark palette, icons
  192/512 px plus a maskable 512; `apple-touch-icon` and `apple-mobile-web-app-capable`
  meta for iOS. `viewport` export adds `viewportFit: 'cover'` only (Next already emits
  `width=device-width, initial-scale=1`). No offline page, no precache, no Lighthouse gate.
- D4 **Auto-login** = an installed app with a valid session opens on `/` and never renders
  `/login` or a splash flash. Acceptance: 30 days idle on the phone still lands in the
  app. Work: verify `@supabase/ssr` cookie max-age (default 400 d) and the project's
  refresh-token inactivity setting; fix whichever is shorter than 90 days; confirm
  `proxy.ts` does not redirect an authenticated `/` load; `WhatsNewSplash` must not show
  on every standalone launch.
- D5 **Audit before redesign.** T1's punch list (overflow, unreachable controls, tap targets
  < 44 px, text < 12 px, content cut off at 385 px height) is the task list for T6. Each
  screen gets a "general improvement" pass (container queries, wrapping, scroll regions)
  first; a bespoke phone layout is built only where the punch list shows the improved
  screen is still unusable at phone-landscape, and the deck builder is the only screen
  pre-approved for a full phone redesign (compact rows, plays/identity in a sheet).
- D6 **Deck builder touch input:** tap a bench card, eligible slots highlight, tap a slot to
  place; tap a placed card for promote/demote/remove. Works on all devices; existing
  drag-and-drop stays for pointer devices. Same for play assignments.
- D7 **Not in this plan, not to be added by an agent:** bottom tab bar, pack carousel,
  bottom-sheet pick confirm, virtualised play-by-play, service worker, offline page, TWA,
  passkeys. Any of these needs an owner decision appended here first.
- D8 **Product rules hold** (AGENTS.md): no OVR/ratings shown, rarity as gem, one roster list,
  empty depth chart on entry.
- D9 **Snapshots:** new visual snapshots for the four flows at both D1 viewports, taken on the
  owner's win32 machine (existing convention). CI still does not run Playwright.

## Out of scope

Play Store listing / Bubblewrap (android_twa, #8, conditional). Offline play and service
worker (no plan; needs an offline-tolerant auth design first). Portrait layouts. iOS
snapshots. Draft bot behaviour (draft_ai). Any engine or balance change.

## Tasks

- T1 **Audit harness + punch list** (mid). Files: `playwright.config.ts` (projects
  `phone-landscape`, `tablet-landscape` with D1 viewports, `storageState` from `setup`),
  `tests/mobile-audit.spec.ts`. Screenshots + asserts overflow/tap-target/font-size for
  each of `/`, `/draft`, `/rosters`, deck builder, a game view, `/season`. **Done
  2026-09-15** — findings transcribed below.
- T2 **Manifest, icons, meta** (low). Files: `app/manifest.ts`, `public/icons/`,
  `app/layout.tsx` (`viewport`, apple meta). Done when Chrome on the S24+ offers "Install
  app" and the installed app launches standalone in landscape (owner photo/screenshot).
  **Done 2026-09-15** — standalone/landscape manifest, night-theme `#0c0a09` colors,
  hand-drawn SVG icons (no image pipeline in the repo, PNG was out of scope), apple meta
  in `layout.tsx`. `/manifest.webmanifest` verified 200. Owner still needs to confirm the
  "Install app" prompt + standalone launch on the S24+ (folds into T7).
- T3 **OrientationGate** (mid). Files: `components/OrientationGate.tsx`, `app/layout.tsx`,
  `app/(auth)/layout.tsx` (opt-out). Done when a Playwright test at 385x830 with
  `hasTouch` sees the overlay on `/` and not on `/login`, and desktop snapshots are
  unchanged. **Done 2026-09-15** — pure-CSS `portrait:pointer-coarse:flex` overlay
  (z-[300]), opt-out via `usePathname()` against `/login`/`/signup`/`/pending` (same
  pattern as `TopNav`'s bare-route check). `tests/orientation-gate.spec.ts` (3/3). The
  gate sits above `WhatsNewSplash` (z-100) by design — nothing reachable while rotated
  wrong.
- T4 **Auto-login verification** (mid). Files: `proxy.ts`, `components/WhatsNewSplash.tsx`,
  Supabase dashboard settings (record values in the plan). Done when D4 acceptance holds
  on the installed app and a Playwright test with the saved `storageState` loads `/`
  with no `/login` navigation in the trace. **Done 2026-09-15 (audit, no code bugs
  found)** — `proxy.ts` never redirects an authenticated `/` load to `/login`;
  `@supabase/ssr` cookie has no `maxAge` override, so it runs on the library default (400
  days, over the 90-day bar); `WhatsNewSplash` already persists "seen" via
  `getGameStore().setMeta` (IndexedDB, not session-scoped). `tests/auto-login.spec.ts`
  (3/3) guards the no-redirect behavior. **Owner action required** (not repo-controlled):
  Supabase dashboard, Authentication → Sessions, confirm "Refresh token expiry" /
  inactivity timeout is >= 90 days.
- T5 **Tap-to-place deck builder** — ABSORBED by deckbuilder_ux D3/T2 (click assigns on
  every device). Left here only so the numbering holds; the phone-viewport proof lands in
  `tests/deckbuilder.spec.ts` (tier `compact`) and is re-checked in T7.
- T6 **Layout fixes from the punch list** (mid; one agent per screen, disjoint files).
  Known offenders to start from: `DraftRoom.tsx` `max-w-[1500px]` + 5-col grid,
  `DeckBuilder.tsx` `grid-cols-5`, `app/page.tsx` `w-[450px]`, `FranchiseDashboard.tsx`
  `min-w-[250px]`, `app/rosters/page.tsx` `grid-cols-5`, `PlayerCard` fixed 300/140 px
  wrappers → `@container`. Done when T1's audit spec is green on both projects for every
  screen and the D9 snapshots are committed.
- T7 **Real-device pass** (owner). S24+ and Tab S10+ on the Vercel preview URL, one full
  loop draft → deck → game → season, installed and in-browser. Findings go back into
  the table; exit when the owner signs off.

## Audit findings (T1, measured 2026-09-15) — resolved

Both projects, 8 screens. First pass: phone 200 findings, tablet 201 — near-identical
absolute-px hit-area/type-scale defects, not width breakpoints (blocker: unbounded
`WhatsNewSplash` panel; high: TopNav rows, 8-11px text everywhere, `PlayerCard` back-face
clipping, deck-builder icon buttons; med: game/draft/season 44px targets, deck-builder
depth slots; low: home footer links). All fixed by `ui_foundation` (tokens/primitives,
12px/44px floors) except one screen it didn't touch: `/rosters` `grid-cols-5` squeezed
Starting Lineup cards to 87x19px at 830px wide. **Fixed 2026-09-15**: `app/rosters/page.tsx`
Starting Lineup `grid grid-cols-5` -> `flex` with `flex-1 min-w-[148px]` per card (same
pattern as `DeckBuilder.tsx`'s docked columns), scrolling inside the existing
`overflow-x-auto` parent instead of squeezing 5-across. `tests/mobile-audit.spec.ts` is
now green (0 findings) on all 8 screens, both projects.

## Verification / exit criteria

- `npm test`, `tsc --noEmit`, `npm run lint` clean; `npm run test:e2e` green on
  `chromium`, `phone-landscape`, `tablet-landscape` (smoke + audit + visual).
- Installed app on the S24+: launches landscape, standalone, straight into `/` with a
  session; portrait in-browser shows the gate except on auth pages.
- Deck builder: full roster built by taps on the phone; drag still works on desktop.
- Owner sign-off from T7; then `/roadmap done mobile_responsive`.
