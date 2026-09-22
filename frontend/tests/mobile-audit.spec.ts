import fs from 'fs';
import path from 'path';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { dismissSplash as dismissSplashShared } from './helpers/splash';
import { clearAnyUnfinishedDraft } from './helpers/draft';
import { getAllCards } from '@/engine/cards';
import { PLAY_CATALOG } from '@/engine/plays';
import { buildBotRoster } from '@/engine/deckbuilder';
import { simulateMatchGame } from '@/lib/matchSimulate';
import type { Match } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import type { DraftCard } from '@/engine/types';

/**
 * plan_mobile_responsive T1 — the audit harness.
 *
 * This spec does not fix anything. It walks the four real flows (draft, deck builder,
 * game, season) plus home and the roster list at the two D1 touch viewports, measures
 * four mechanical failure modes, writes a full-page screenshot per screen, and dumps a
 * machine-readable report. The failures it prints are the punch list that T6 works
 * through — D5 says the audit comes before any redesign, so keep this spec descriptive:
 * add measurements here, never layout opinions.
 *
 * Artifacts (all under the gitignored `test-results/`):
 *   test-results/mobile-audit/<project>/<screen>.png    full-page screenshot
 *   test-results/mobile-audit/<project>/findings.json   every violation, structured
 *
 * Run: `npx playwright test mobile-audit --project=phone-landscape` (dev server up).
 */

// D1 acceptance thresholds.
const MIN_TAP_PX = 44;
const MIN_FONT_PX = 12;

const ROSTER_NAME = 'E2E Season Fixture';

/** game_canvas D2 (owner): these screens show everything without any page scroll on a
 *  phone. Game view and season are lists and scroll vertically by decision. */
const NO_SCROLL_SCREENS = new Set(['home', 'draft-entry', 'draft-pack', 'deck-builder']);
/** ...and on these three nothing at all scrolls, not even an inner region: the pack is
 *  one row. The deck builder's depth-chart columns may scroll (12 players never fit). */
const STRICT_NO_SCROLL_SCREENS = new Set(['home', 'draft-entry', 'draft-pack']);
/** Owner: "minor vertical scrolling would be okay" for the two-row pack — a tenth of the
 *  viewport, no more. */
const MINOR_SCROLL_FRACTION = 0.1;
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'season-fixture.json');

type Finding = {
  screen: string;
  kind: 'overflow-x' | 'tap-target' | 'font-size' | 'clipped' | 'clipped-x' | 'scroll-y';
  detail: string;
};

type ScreenReport = {
  screen: string;
  url: string;
  scrollWidth: number;
  innerWidth: number;
  scrollHeight: number;
  innerHeight: number;
  findings: Finding[];
};

const reports: ScreenReport[] = [];

/**
 * Everything is measured in one page.evaluate so a screen with hundreds of controls
 * costs one round-trip instead of hundreds of `boundingBox()` calls.
 *
 * Deliberate exclusions, so the punch list stays actionable rather than noisy:
 *  - invisible / zero-area elements (collapsed panels, `hidden` tab contents)
 *  - an `<a>` that merely wraps a block of content (a whole card linking to a page) —
 *    a tap target that big is not the problem D1 is about
 *  - elements whose own padding is supplied by a larger hit area (`::before` overlays)
 *    cannot be detected here; T7's real-device pass is the backstop for those.
 */
async function measure(page: Page, screen: string): Promise<ScreenReport> {
  return page.evaluate(
    ({ screen, MIN_TAP_PX, MIN_FONT_PX, noScroll, strictNoScroll, MINOR_SCROLL_FRACTION }) => {
      const findings: { screen: string; kind: Finding['kind']; detail: string }[] = [];
      // game_canvas: under the phone `zoom` rule, client rects come back in real (zoomed)
      // pixels while the 44px/12px floors are design-space CSS px. `currentCSSZoom` is
      // the element's effective zoom (1 on desktop); divide rect sizes by it. Computed
      // font-size is already in CSS px and needs no correction.
      const zoomOf = (el: Element) => (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;

      const describe = (el: Element) => {
        const tag = el.tagName.toLowerCase();
        const label =
          (el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)) || '(no text)';
        const testid = el.getAttribute('data-testid');
        return `${tag}${testid ? `[data-testid=${testid}]` : ''} "${label}"`;
      };

      const visible = (el: Element) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const r = el.getBoundingClientRect();
        // <= 1px on both axes is the `sr-only` pattern: screen-reader text that is
        // clipped on purpose, not something a sighted player was meant to see.
        return r.width > 1 && r.height > 1;
      };

      // --- 1. horizontal overflow ---------------------------------------------------
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      if (scrollWidth > innerWidth + 1) {
        // Name the widest offenders so the fix has somewhere to start.
        const culprits = [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => visible(el) && el.getBoundingClientRect().right > innerWidth + 1)
          .filter((el) => getComputedStyle(el).position !== 'fixed')
          .slice(0, 5)
          .map((el) => `${describe(el)} → right edge ${Math.round(el.getBoundingClientRect().right)}px`);
        findings.push({
          screen,
          kind: 'overflow-x',
          detail: `page scrolls horizontally: scrollWidth ${scrollWidth} > innerWidth ${innerWidth}. Widest: ${culprits.join('; ') || 'none isolated'}`,
        });
      }

      // --- 2. tap targets -----------------------------------------------------------
      const controls = [...document.querySelectorAll('button, a, [role="button"], input, select')];
      const seen = new Set<string>();
      for (const el of controls) {
        if (!visible(el)) continue;
        if ((el as HTMLButtonElement).disabled) continue;
        const rr = el.getBoundingClientRect();
        const z = zoomOf(el);
        const r = { width: rr.width / z, height: rr.height / z };
        // An anchor wrapping a whole card is not the tap-target problem we're hunting.
        // Half-pixel tolerance: 30.8 real px / 0.7 is 43.9999.
        if (r.width >= MIN_TAP_PX - 0.5 && r.height >= MIN_TAP_PX - 0.5) continue;
        const key = `${describe(el)}|${Math.round(r.width)}x${Math.round(r.height)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          screen,
          kind: 'tap-target',
          detail: `${describe(el)} is ${Math.round(r.width)}x${Math.round(r.height)}px (min ${MIN_TAP_PX})`,
        });
      }

      // --- 3. text too small --------------------------------------------------------
      const smallText = new Map<string, number>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = (node.textContent || '').trim();
        if (!text) continue;
        const el = node.parentElement;
        if (!el || !visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size >= MIN_FONT_PX) continue;
        const key = `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 60)} @${size}px`;
        smallText.set(key, (smallText.get(key) || 0) + 1);
      }
      for (const [key, count] of smallText) {
        findings.push({
          screen,
          kind: 'font-size',
          detail: `${count}x text below ${MIN_FONT_PX}px: ${key}`,
        });
      }

      // --- 4. content clipped out of reach ------------------------------------------
      // Vertical scrolling is fine; content that overflows a container which cannot
      // scroll is not — that content is simply unreachable on a 385px-tall screen.
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (!visible(el)) continue;
        const style = getComputedStyle(el);
        if (style.overflowY !== 'hidden' && style.overflow !== 'hidden') continue;
        // A textless box is art (object-cover headshots, gradient/CSS-drawn court art):
        // a crop there loses the player nothing.
        if (!(el.textContent || '').trim()) continue;
        // A line-clamped name is a deliberate truncation (like text-overflow: ellipsis).
        const clamp = (style as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp;
        if (clamp && clamp !== 'none') continue;
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0) {
          findings.push({
            screen,
            kind: 'clipped',
            detail: `${describe(el)} [${el.className.toString().slice(0, 70)}] clips ${el.scrollHeight - el.clientHeight}px of content (overflow hidden, no scroll)`,
          });
        }
      }

      // --- 5. text pushed outside the viewport ---------------------------------------
      // game_canvas T4: the checks above missed the real-device bug — DraftRoom's header
      // centred three children in too little room and the left seat ended up at x=-60.
      // `scrollWidth` never sees leftward overflow, so this rule looks at where text
      // actually landed instead: any element with its own text whose box leaves the
      // viewport on either side is unreachable unless something scrolls it back. Skipped:
      // descendants of a horizontal scroll container (reachable), and of an element
      // translated by a transform (a collapsed drawer peeking in from the edge is
      // off-screen on purpose).
      const hasOwnText = (el: Element) =>
        [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim());
      const reachable = (el: Element) => {
        for (let a: Element | null = el; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.position === 'fixed') return true;
          if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true;
          if (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)') return true;
        }
        return false;
      };
      const seenX = new Set<string>();
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (!hasOwnText(el) || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.left >= -1 && r.right <= innerWidth + 1) continue;
        if (reachable(el)) continue;
        const key = describe(el);
        if (seenX.has(key)) continue;
        seenX.add(key);
        findings.push({
          screen,
          kind: 'clipped-x',
          detail: `${key} sits at x ${Math.round(r.left)}..${Math.round(r.right)} (viewport 0..${innerWidth}), nothing scrolls it into reach`,
        });
      }

      // --- 6. no page scroll on the fit-to-screen screens ------------------------------
      if (noScroll) {
        if (document.documentElement.scrollHeight > innerHeight + 1) {
          findings.push({
            screen,
            kind: 'scroll-y',
            detail: `page scrolls vertically: scrollHeight ${document.documentElement.scrollHeight} > innerHeight ${innerHeight} — this screen must fit without scrolling (owner UAT)`,
          });
        }
        // A scroll container that spans the whole viewport IS the page for the player
        // (home's <main>, a full-height shell). Smaller regions (a pack grid, a depth-chart
        // column) may scroll — that is the vertical-scroll option the owner accepted.
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const s = getComputedStyle(el);
          if (s.overflowY !== 'auto' && s.overflowY !== 'scroll') continue;
          const r = el.getBoundingClientRect();
          // Strict screens: any region taller than half the screen counts (the pack
          // grid); a card's flipped back face (a small detail well) does not.
          if (!strictNoScroll && r.height < innerHeight - 2) continue;
          if (strictNoScroll && r.height < innerHeight * 0.5) continue;
          // A well inside a transformed (flipped) card face is a detail view, not the page.
          if (strictNoScroll && (() => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).transform !== 'none') return true; } return false; })()) continue;
          if (!visible(el)) continue;
          const tolerated = strictNoScroll ? innerHeight * MINOR_SCROLL_FRACTION / zoomOf(el) : 1;
          if (el.scrollHeight > el.clientHeight + tolerated) {
            findings.push({
              screen,
              kind: 'scroll-y',
              detail: `${describe(el)} [${el.className.toString().slice(0, 60)}] fills the viewport and scrolls ${el.scrollHeight - el.clientHeight}px (CSS px) — this screen must fit without scrolling (owner UAT)`,
            });
          }
        }
      }

      return {
        screen,
        url: location.pathname + location.search,
        scrollWidth,
        innerWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        findings: findings.slice(0, 40),
      };
    },
    { screen, MIN_TAP_PX, MIN_FONT_PX, noScroll: NO_SCROLL_SCREENS.has(screen), strictNoScroll: STRICT_NO_SCROLL_SCREENS.has(screen), MINOR_SCROLL_FRACTION },
  );
}

/** Shared splash dismissal (tests/helpers/splash.ts); the first call waits for the
 *  overlay to mount, later calls only do a quick check. */
let splashHandled = false;

async function dismissSplash(page: Page) {
  if (await dismissSplashShared(page, splashHandled ? 800 : 5000)) splashHandled = true;
}

/** Measure + screenshot one screen and file its report. */
async function audit(page: Page, testInfo: TestInfo, screen: string) {
  // Let layout/animation settle — framer-motion entrances otherwise measure mid-flight.
  // Bounded: a live draft keeps a clock ticking, so networkidle never arrives there.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await dismissSplash(page);
  await page.waitForTimeout(400);

  // Measure first: a full-page screenshot resizes the viewport to the content box and,
  // under the phone `zoom` rule, the document's scrollHeight reads wrong afterwards.
  const report = await measure(page, screen);
  reports.push(report);

  const dir = path.join(testInfo.config.rootDir, '..', 'test-results', 'mobile-audit', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  // Fit-to-screen screens are captured as the player sees them; scrolling screens
  // full-page (Playwright's full-page capture is imprecise under `zoom`, but still shows
  // everything).
  await page.screenshot({ path: path.join(dir, `${screen}.png`), fullPage: !NO_SCROLL_SCREENS.has(screen) });

  // Soft: every screen still gets measured and screenshotted in one run (that is the
  // point of an audit), but the run ends red while anything is outstanding. T6's exit
  // criterion is this spec going green on both projects.
  expect.soft(
    report.findings,
    `[${screen}] ${report.findings.length} mobile-audit findings:\n` +
      report.findings.map((f) => `  - (${f.kind}) ${f.detail}`).join('\n'),
  ).toEqual([]);

  return report;
}

/** Delete a previous run's fixture roster so each run starts from the same state. */
async function resetFixture(page: Page) {
  await page.goto('/rosters');
  await dismissSplash(page);
  await expect(page.getByText('Loading Rosters...')).toHaveCount(0);
  const existing = page.locator('h2', { hasText: ROSTER_NAME }).first();
  if (!(await existing.count())) return;
  await existing
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
    .getByTitle('Delete Roster')
    .click();
  await expect(existing).toHaveCount(0);
}

/** Import the season fixture through the real UI flow (same path as season.spec.ts). */
async function importFixture(page: Page) {
  await page.goto('/rosters');
  await dismissSplash(page);
  await expect(page.getByText('Loading Rosters...')).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await expect(page.getByText('Import complete')).toBeVisible();
}

// One test, one walk. Findings are reported with `expect.soft`, and a soft failure would
// make a `serial` describe skip every later test -- so the screens live in a single test
// to guarantee all eight are measured and screenshotted on every run, however many
// findings the early ones produce. It plays a game, so the 30s default timeout does not fit.
test.setTimeout(180_000);

test.describe('Mobile audit', () => {
  test('all four flows at the D1 touch viewports', async ({ page }, testInfo) => {
    page.on('dialog', (d) => d.accept());

    // Clear the previous run's fixture roster FIRST. Left behind, it makes the cloud
    // store raise a "changed on another device" conflict toast that floats over every
    // later screen and pollutes the measurements.
    await resetFixture(page);

    await page.goto('/');
    await audit(page, testInfo, 'home');

    await clearAnyUnfinishedDraft(page);
    await audit(page, testInfo, 'draft-entry');

    // Open the pack and skip the reveal animation to reach the pick spread — the densest
    // layout in the app, and the one that has to work on a 385px-tall screen.
    await page.getByRole('button', { name: /^Open pack/i }).first().click();
    const skip = page.getByRole('button', { name: /Skip reveal/i });
    await skip.click({ timeout: 15000 }).catch(() => {});
    // The picking phase's CTA reads "Select a card" until one is chosen, then
    // "Take <player>" — its presence is how we know the spread is actually pickable.
    await expect(
      page.getByRole('button', { name: /Select a card|^Take /i }).first(),
    ).toBeVisible({ timeout: 20000 });
    await audit(page, testInfo, 'draft-pack');

    // draft_resume T4: confirm one pick, reload (simulating a phone lock / crash), and
    // audit the resume sheet that greets the player on the way back in.
    await page.locator('[role="button"][aria-label^="Select "]').first().click();
    await page.getByRole('button', { name: /^Confirm pick$/i }).click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.reload();
    await dismissSplash(page);
    await expect(page.locator('[data-draft-resume-sheet]')).toBeVisible({ timeout: 20000 });
    await audit(page, testInfo, 'draft-resume-sheet');
    // Abandon rather than resume: nothing after this needs the draft itself, and
    // abandoning leaves no dangling 'drafting' session behind for a later test run.
    await page.getByRole('button', { name: 'Abandon' }).click();
    await expect(page.locator('[data-draft-resume-sheet]')).toHaveCount(0);

    await importFixture(page);
    await audit(page, testInfo, 'rosters');

    // Deck builder for the fixture roster.
    const card = page.locator('h2', { hasText: ROSTER_NAME }).first()
      .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    // It's a <Link title="Edit Roster"> (or "View Roster (locked ...)" once the season
    // is complete), not a button — match the title, and fail loudly rather than
    // silently skipping the densest screen in the app.
    const edit = card.getByTitle(/(Edit|View) Roster/).first();
    await expect(edit, 'deck-builder link not found on the roster card').toHaveCount(1);
    await edit.click();
    await expect(page).toHaveURL(/\/roster\//);
    await audit(page, testInfo, 'deck-builder');
    // plan_mobile_native_feel D3: the deck builder guards the back button, so a back press
    // opens the "Leave this screen?" sheet instead of navigating. Confirm it, as a player
    // would; without this the walk silently stayed on the builder and timed out below.
    await page.goBack();
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(page).toHaveURL(/\/rosters/);
    await dismissSplash(page);
    await expect(page.getByText('Loading Rosters...')).toHaveCount(0);

    // Season schedule + standings.
    await page.locator('h2', { hasText: ROSTER_NAME }).first()
      .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
      .getByRole('button', { name: 'Play Season' }).click();
    await expect(page).toHaveURL(/\/season\?/);
    await audit(page, testInfo, 'season');

    // Game view, mid-game (the play-by-play tape is the tall/dense part).
    await page.getByText(/^Game 1 • /)
      .locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]')
      .click();
    await expect(page.getByRole('button', { name: 'Tip Off' })).toBeVisible();
    await audit(page, testInfo, 'game-tipoff');
    await page.getByRole('button', { name: 'Tip Off' }).click();
    await page.waitForTimeout(2500);
    await audit(page, testInfo, 'game-live');
  });

  test.afterAll(async ({}, testInfo) => {
    const dir = path.join(testInfo.config.rootDir, '..', 'test-results', 'mobile-audit', testInfo.project.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(reports, null, 2));

    const total = reports.reduce((n, r) => n + r.findings.length, 0);
    const lines = reports.map((r) => {
      const byKind = r.findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.kind] = (acc[f.kind] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(' ') || 'clean';
      return `  ${r.screen.padEnd(14)} ${String(r.scrollWidth).padStart(5)}x${r.scrollHeight}  ${summary}`;
    });
    console.log(
      `\n[mobile-audit ${testInfo.project.name}] ${total} findings across ${reports.length} screens\n` +
        lines.join('\n') +
        `\n  report: ${path.join(dir, 'findings.json')}\n`,
    );
    reports.length = 0;
  });

  // pvp_draft T3: the two-human draft room + WaitingFor overlay, the same D1 audit as the
  // solo screens above — a separate two-context test since it needs the second E2E
  // account, unlike everything walked in one context above.
  test.describe('pvp draft room', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = url && serviceKey
      ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : null;
    const authFile2 = 'tests/.auth/user2.json';

    test.skip(
      !process.env.E2E_TEST_EMAIL_2 || !process.env.E2E_TEST_PASSWORD_2 || !admin,
      'Set E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 (and the Supabase keys) and run `npm run bootstrap:e2e`.',
    );

    test.beforeAll(async () => {
      if (!admin) return;
      const { error } = await admin.from('matches').select('void_reason').limit(1);
      test.skip(!!error, `void_reason column missing — 202609220002_match_void.sql not applied: ${error?.message}`);
    });

    test('draft room + WaitingFor at the D1 touch viewport', async ({ page, browser }, testInfo) => {
      test.skip(!fs.existsSync(authFile2), `${authFile2} missing: auth2.setup.ts did not run.`);
      test.setTimeout(120_000);

      const contextB = await browser.newContext({ storageState: authFile2 });
      const pageB = await contextB.newPage();

      await page.goto('/');
      await pageB.goto('/');
      const [a, b] = await Promise.all([
        page.request.get('/api/auth/me').then((r) => r.json()) as Promise<{ id: string }>,
        pageB.request.get('/api/auth/me').then((r) => r.json()) as Promise<{ id: string }>,
      ]);
      await admin!.from('matches').delete()
        .or(`and(host_id.eq.${a.id},guest_id.eq.${b.id}),and(host_id.eq.${b.id},guest_id.eq.${a.id})`);

      try {
        const matchId = `e2e-mobile-audit-${Date.now()}`;
        const { error } = await admin!.from('matches').insert({ id: matchId, seed: 1, host_id: a.id, guest_id: b.id, status: 'drafting' });
        if (error) throw error;

        await page.goto(`/playoffs/${matchId}/draft`);
        await audit(page, testInfo, 'pvp-draft-room');

        // A picks first — B has not, so A's own room shows WaitingFor over its pack.
        const cardLocator = page.locator('[role="button"][aria-label^="Select "]').first();
        await expect(cardLocator).toBeVisible({ timeout: 20_000 });
        await cardLocator.click();
        await page.getByRole('button', { name: /^Confirm pick$/ }).click();
        await expect(page.locator('[data-waiting-for]')).toBeVisible({ timeout: 15_000 });
        await audit(page, testInfo, 'pvp-waiting-for');

        await admin!.from('matches').delete().eq('id', matchId);
      } finally {
        await admin!.from('matches').delete()
          .or(`and(host_id.eq.${a.id},guest_id.eq.${b.id}),and(host_id.eq.${b.id},guest_id.eq.${a.id})`);
        await contextB.close();
      }
    });
  });

  // pvp_series T4: the series page, a game page and the sideboard screen, same D1 audit.
  // Builds its own fixture (two locked rosters, two games already simulated so the strip
  // has something to show, plus a 2-0 row for the sideboard screen) directly with the
  // service role — mirrors `pvp-draft.spec.ts`/`playoffs-invite.spec.ts` but never runs
  // those specs' own cleanup, so it can't clobber a match between the two E2E accounts.
  test.describe('playoffs series', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = url && serviceKey
      ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : null;
    const authFile2 = 'tests/.auth/user2.json';

    test.skip(
      !process.env.E2E_TEST_EMAIL_2 || !process.env.E2E_TEST_PASSWORD_2 || !admin,
      'Set E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 (and the Supabase keys) and run `npm run bootstrap:e2e`.',
    );

    let cachedPlayers: DraftCard[] | null = null;
    function players(): DraftCard[] {
      if (!cachedPlayers) cachedPlayers = getAllCards();
      return cachedPlayers;
    }

    function draftedFor(offset: number): DraftCard[] {
      return [...players().slice(offset, offset + 21), ...PLAY_CATALOG.slice(0, 3)];
    }

    function rosterFrom(id: string, name: string, drafted: DraftCard[]): SavedRoster {
      const built = buildBotRoster(drafted);
      return {
        id,
        name,
        timestamp: new Date().toISOString(),
        draftedCards: drafted,
        depthChartOrder: built.depthChart,
        activePlays: built.activePlays,
        playAssignments: built.playAssignments,
        archetypes: built.archetypes,
        version: built.version ?? 2,
        sessionId: null,
      };
    }

    /** `winsForHost` games are simulated with the host winning every game (forced by
     *  swapping which side "wins" isn't controllable directly — this fixture only needs
     *  the games to exist and be watchable, not a particular score, so it takes whatever
     *  `simulateMatchGame` produces and just plays enough games to reach the count). */
    function buildFixtureBase(hostId: string, guestId: string, seed: number, id: string) {
      const rosterA = rosterFrom(`${id}-roster-a`, 'Host Roster', draftedFor(0));
      const rosterB = rosterFrom(`${id}-roster-b`, 'Guest Roster', draftedFor(60));
      const now = new Date().toISOString();
      return {
        id, seed, host_id: hostId, guest_id: guestId, status: 'series' as const,
        host_picks: draftedFor(0).map((c) => c.id), guest_picks: draftedFor(60).map((c) => c.id),
        host_autopicks: [], guest_autopicks: [], pick_deadline: null,
        host_roster: rosterA, guest_roster: rosterB,
        host_locked_at: now, guest_locked_at: now,
        sideboard: {}, host_seen: null, guest_seen: null,
        host_seen_at: now, guest_seen_at: now, winner_id: null, void_reason: null,
      };
    }

    test.beforeAll(async () => {
      if (!admin) return;
      const { error } = await admin.from('matches').select('void_reason').limit(1);
      test.skip(!!error, `void_reason column missing — 202609220002_match_void.sql not applied: ${error?.message}`);
    });

    test('series page, game page and sideboard at the D1 touch viewport', async ({ page }, testInfo) => {
      test.skip(!fs.existsSync(authFile2), `${authFile2} missing: auth2.setup.ts did not run.`);
      test.setTimeout(120_000);

      await page.goto('/');
      const a = await page.request.get('/api/auth/me').then((r) => r.json()) as { id: string };
      // Second account's id: `user_directory` filters by RLS against the CALLER's session,
      // which the service role has none of, so it comes back empty here — the auth admin
      // API (service-role only, bypasses RLS entirely) is the reliable way to resolve it.
      const { data: usersData } = await admin!.auth.admin.listUsers({ perPage: 1000 });
      const guestId = usersData?.users?.find((u: { email?: string }) => u.email === process.env.E2E_TEST_EMAIL_2)?.id as string | undefined;
      test.skip(!guestId, 'second E2E account not found');

      const seriesId = `e2e-mobile-audit-series-${Date.now()}`;
      const sideboardId = `e2e-mobile-audit-sideboard-${Date.now()}`;
      await admin!.from('matches').delete().like('id', 'e2e-mobile-audit-series-%');
      await admin!.from('matches').delete().like('id', 'e2e-mobile-audit-sideboard-%');

      try {
        // Series screen + game screen: two games already simulated.
        const base = buildFixtureBase(a.id, guestId!, 727272, seriesId);
        const matchForSim1 = { ...base, games: [] } as unknown as Match;
        const game1 = simulateMatchGame(matchForSim1, 1);
        const matchForSim2 = { ...base, games: [game1] } as unknown as Match;
        const game2 = simulateMatchGame(matchForSim2, 2);
        const { error: err1 } = await admin!.from('matches').insert({ ...base, games: [game1, game2] });
        if (err1) throw err1;

        await page.goto(`/playoffs/${seriesId}`);
        await dismissSplash(page);
        const goBtn = page.getByRole('button', { name: /let's go/i });
        if (await goBtn.isVisible().catch(() => false)) await goBtn.click();
        await expect(page.getByRole('heading', { name: 'Series' })).toBeVisible({ timeout: 15_000 });
        await audit(page, testInfo, 'playoffs-series');

        await page.goto(`/playoffs/${seriesId}/game/1`);
        await expect(page.getByRole('button', { name: /Tip Off/i })).toBeVisible({ timeout: 15_000 });
        await audit(page, testInfo, 'playoffs-game');

        // Sideboard screen: a fresh row already AT status 'sideboard' (skips playing out
        // to 2-0 — this fixture only needs the screen to be reachable and watchable).
        const sideboardBase = buildFixtureBase(a.id, guestId!, 828282, sideboardId);
        const { error: err2 } = await admin!.from('matches').insert({ ...sideboardBase, status: 'sideboard', games: [] });
        if (err2) throw err2;

        await page.goto(`/playoffs/${sideboardId}`);
        await dismissSplash(page);
        const goBtn2 = page.getByRole('button', { name: /let's go/i });
        if (await goBtn2.isVisible().catch(() => false)) await goBtn2.click();
        await page.waitForTimeout(1000);
        await audit(page, testInfo, 'playoffs-sideboard');
      } finally {
        await admin!.from('matches').delete().like('id', 'e2e-mobile-audit-series-%');
        await admin!.from('matches').delete().like('id', 'e2e-mobile-audit-sideboard-%');
      }
    });
  });
});
