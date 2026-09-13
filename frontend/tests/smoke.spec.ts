import { test, expect } from '@playwright/test';

/**
 * Cheap sanity net: every real, linked page (see AGENTS.md "Not junk") loads
 * without throwing or logging a console error. Run this before committing —
 * it catches the class of regression (a bad import, an unguarded null, a
 * hook rule violation) that a type check or unit test doesn't see because
 * nothing actually renders the page.
 */
const ROUTES = ['/', '/draft', '/rosters', '/season', '/data', '/debug', '/deckbuilder-test', '/pack-opener-preview'];

test.describe('Smoke: every real route renders without error', () => {
  for (const route of ROUTES) {
    test(`${route} has no page errors or console errors`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const pageErrors: Error[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(route);
      await page.waitForLoadState('networkidle');

      expect(pageErrors, `pageerror on ${route}: ${pageErrors.map((e) => e.message).join('; ')}`).toEqual([]);
      expect(consoleErrors, `console.error on ${route}: ${consoleErrors.join('; ')}`).toEqual([]);
    });
  }
});
