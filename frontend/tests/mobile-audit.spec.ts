import fs from 'fs';
import path from 'path';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { dismissSplash as dismissSplashShared } from './helpers/splash';

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
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'season-fixture.json');

type Finding = {
  screen: string;
  kind: 'overflow-x' | 'tap-target' | 'font-size' | 'clipped' | 'clipped-x';
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
    ({ screen, MIN_TAP_PX, MIN_FONT_PX }) => {
      const findings: { screen: string; kind: Finding['kind']; detail: string }[] = [];

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
        const r = el.getBoundingClientRect();
        // An anchor wrapping a whole card is not the tap-target problem we're hunting.
        if (r.width >= MIN_TAP_PX && r.height >= MIN_TAP_PX) continue;
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
        // A textless box whose overflow is an image/svg is a deliberate crop
        // (object-cover headshots, gradient art), not content the player loses.
        if (!(el.textContent || '').trim() && el.querySelector('img, svg, video')) continue;
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
    { screen, MIN_TAP_PX, MIN_FONT_PX },
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

  const dir = path.join(testInfo.config.rootDir, '..', 'test-results', 'mobile-audit', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${screen}.png`), fullPage: true });

  const report = await measure(page, screen);
  reports.push(report);

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

    await page.goto('/draft?mode=quick&clock=fast');
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
    await page.goBack();
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
});
