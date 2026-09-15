# Plan: mobile_responsive

File: `docs/plans/plan_mobile_responsive_2026-09-15.md`. Status: in progress (T1 done)
Sequence: 4 in `docs/ROADMAP.md`. Depends on: ui_foundation (#3) for T5/T6; T2-T4 may run alongside it.
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
  `tests/mobile-audit.spec.ts`. For each of `/`, `/draft` (mid-draft via the fixture
  builder), `/rosters`, a roster's deck builder, a game view, `/season`: full-page
  screenshot to `test-results/mobile-audit/<project>/<route>.png` (gitignored), and
  assert-and-report `document.scrollWidth <= innerWidth`, every `button, a, [role=button]`
  bounding box >= 44x44, no computed font-size < 12 px. Done when the spec runs green
  or red on both projects and the failures are transcribed into the "Audit findings"
  table below. **Done 2026-09-15** — harness runs both projects red; table filled.
  Owner reviews the table before T6 starts.
- T2 **Manifest, icons, meta** (low). Files: `app/manifest.ts`, `public/icons/`,
  `app/layout.tsx` (`viewport`, apple meta). Done when Chrome on the S24+ offers "Install
  app" and the installed app launches standalone in landscape (owner photo/screenshot).
- T3 **OrientationGate** (mid). Files: `components/OrientationGate.tsx`, `app/layout.tsx`,
  `app/(auth)/layout.tsx` (opt-out). Done when a Playwright test at 385x830 with
  `hasTouch` sees the overlay on `/` and not on `/login`, and desktop snapshots are
  unchanged.
- T4 **Auto-login verification** (mid). Files: `proxy.ts`, `components/WhatsNewSplash.tsx`,
  Supabase dashboard settings (record values in the plan). Done when D4 acceptance holds
  on the installed app and a Playwright test with the saved `storageState` loads `/`
  with no `/login` navigation in the trace.
- T5 **Tap-to-place deck builder** (mid). Files: `DeckBuilder.tsx`, `DepthSlotColumn.tsx`,
  `PlayPanel.tsx`. Done when a Playwright test on `phone-landscape` builds a legal 12-man
  roster and assigns a play by taps only, and `npm test` + desktop drag snapshots pass.
- T6 **Layout fixes from the punch list** (mid; one agent per screen, disjoint files).
  Known offenders to start from: `DraftRoom.tsx` `max-w-[1500px]` + 5-col grid,
  `DeckBuilder.tsx` `grid-cols-5`, `app/page.tsx` `w-[450px]`, `FranchiseDashboard.tsx`
  `min-w-[250px]`, `app/rosters/page.tsx` `grid-cols-5`, `PlayerCard` fixed 300/140 px
  wrappers → `@container`. Done when T1's audit spec is green on both projects for every
  screen and the D9 snapshots are committed.
- T7 **Real-device pass** (owner). S24+ and Tab S10+ on the Vercel preview URL, one full
  loop draft → deck → game → season, installed and in-browser. Findings go back into
  the table; exit when the owner signs off.

## Audit findings (T1, measured 2026-09-15)

Both projects, 8 screens. Phone 200 findings, tablet 201 — near-identical, so these are
absolute-px hit-area and type-scale defects, **not** width breakpoints. T6 is therefore
mostly "general improvement" passes; the deck builder stays the only redesign (D5).

| Screen | Project | Breaks | Severity | Fix | General / redesign |
|---|---|---|---|---|---|
| all | both | `WhatsNewSplash` panel has no max-height; at 385px it overflows, its Close button is off-screen, and it blocks every route (only the backdrop/CTA dismiss it) | blocker | `max-h-[90dvh] overflow-y-auto` on the panel | general — fixed by ui_foundation D9 (`Overlay`), not here |
| all | both | TopNav profile menu rows 238x36; "Back to Home" 34x34 | high | 44px min height on menu rows and icon buttons | general |
| all | both | 8–11px text everywhere (7–34 instances per screen) | high | 12px floor on the type scale | general |
| home, rosters | both | PlayerCard back face clips 122–285px of badges/season averages (`overflow:hidden`, no scroll) | high | scroll region or taller back face | general |
| deck-builder | both | "Expand team report" 14x14, "Return to Roster" 20x20 | high | 44px hit areas | general |
| deck-builder | both | depth slots 89x36 (11 sub-44px controls total) | med | taller rows; feeds T5 tap-to-place | redesign (pre-approved) |
| game | both | Exit Game / Tip Off / Pause / End / Matchup all 34–36px tall | med | 44px control height | general |
| draft | both | sound toggles 26–28px; "Turn sound on" label clips 15px | med | 44px hit areas | general |
| season | both | "Back to Rosters" 105x16; 8px SVG chart labels | med | 44px target; chart min font | general |
| home | both | footer dev links 44x16 (Deckbuilder, Debug) | low | pad to 44px or hide on touch | general |
| all | both | **No horizontal overflow** — `scrollWidth == innerWidth` on all 8 screens, both projects | — | none needed | — |

Re-measured after ui_foundation (2026-09-15 evening): phone 2 findings, tablet 0. The table
above is resolved except one new T6 row: `/rosters` `grid-cols-5` squeezes each card's front
body to 87x19px at 830px wide (headshot and badge row unusable) — layout, not tokens.

## Parallelization

Wave 0 (driver): T1, then owner review of the table. Wave 1 (parallel, disjoint files):
T2 (low), T3 (mid), T4 (mid), T5 (mid). Wave 2 (parallel, one agent per screen): T6.
Wave 3: T7 owner. Agents never run git.

## Recommended model tier

Main driver: top (Fable 5.1 / Opus 5) — the punch-list triage and the deck-builder
redesign decision are design calls. Wave 1-2 agents: mid (Sonnet 5), T2 low (Haiku 4.5).

## Verification / exit criteria

- `npm test`, `tsc --noEmit`, `npm run lint` clean; `npm run test:e2e` green on
  `chromium`, `phone-landscape`, `tablet-landscape` (smoke + audit + visual).
- Installed app on the S24+: launches landscape, standalone, straight into `/` with a
  session; portrait in-browser shows the gate except on auth pages.
- Deck builder: full roster built by taps on the phone; drag still works on desktop.
- Owner sign-off from T7; then `/roadmap done mobile_responsive`.
