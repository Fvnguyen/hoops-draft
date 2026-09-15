import { test, expect } from '@playwright/test';

/**
 * plan_mobile_responsive T4/D4: an installed PWA with a valid session must open on `/`
 * and never render `/login` — no bounce, no splash-then-redirect flash. Runs with the
 * `chromium` project's authenticated `storageState` (tests/.auth/user.json, produced by
 * `auth.setup.ts`), the same fixture `smoke.spec.ts` uses, so this exercises `proxy.ts`'s
 * real cookie-gated redirect logic rather than a mock.
 */
test.describe('Auto-login: authenticated session lands on / without /login', () => {
  test('loading / does not navigate to /login', async ({ page }) => {
    const navigatedUrls: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigatedUrls.push(frame.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toMatch(/\/login/);
    const loginNavigations = navigatedUrls.filter((url) => url.includes('/login'));
    expect(loginNavigations, `navigated through /login: ${loginNavigations.join(', ')}`).toEqual([]);
  });

  test('no request to /login is made while loading /', async ({ page }) => {
    const loginRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/login') loginRequests.push(request.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(loginRequests, `requests to /login: ${loginRequests.join(', ')}`).toEqual([]);
  });
});
