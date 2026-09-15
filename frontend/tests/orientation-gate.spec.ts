import { test, expect } from '@playwright/test';
import { dismissSplash } from './helpers/splash';

/**
 * plan_mobile_responsive T3 — `OrientationGate` (D2).
 *
 * The gate is pure CSS (`portrait:pointer-coarse:flex` in OrientationGate.tsx, i.e.
 * `@media (orientation: portrait) and (pointer: coarse)`), so this spec only needs to put
 * a real browser context in that media state (`viewport` portrait + `hasTouch: true`) and
 * check the overlay's actual visibility — no matchMedia mocking required.
 *
 * Runs under the `chromium` project (Desktop Chrome), overriding viewport/hasTouch per
 * test rather than adding a new project — D1's `phone-landscape`/`tablet-landscape`
 * projects are fixed to landscape viewports and are not to be touched by this task.
 */

const GATE = 'text=Rotate your device';

test.describe('OrientationGate', () => {
  test.use({
    viewport: { width: 385, height: 830 }, // same phone numbers as D1, swapped to portrait
    hasTouch: true,
  });

  test('shows on a protected route in portrait + touch', async ({ page }) => {
    await page.goto('/');
    // Don't dismiss the splash here: the gate (z-[300]) sits above WhatsNewSplash's
    // overlay (z-100) by design — while rotated wrong nothing underneath should be
    // reachable, splash included — so the gate must be checked without going through it.
    await expect(page.locator(GATE)).toBeVisible();
  });

  test('does not show on /login in portrait + touch', async ({ browser }) => {
    // /login is public but the `chromium` project's default storageState is an
    // authenticated session, and proxy.ts redirects an authenticated visitor away from
    // /login back to `/` — so this test needs its own signed-out context, not the
    // project's storageState.
    const context = await browser.newContext({
      viewport: { width: 385, height: 830 },
      hasTouch: true,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(GATE)).toBeHidden();
    await context.close();
  });
});

test.describe('OrientationGate desktop', () => {
  // Default `chromium` project settings: Desktop Chrome viewport, no touch.
  test('never shows on desktop', async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
    await expect(page.locator(GATE)).toBeHidden();
  });
});
