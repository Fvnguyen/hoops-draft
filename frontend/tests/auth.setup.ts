import { test as setup, expect } from '@playwright/test';

const authFile = 'tests/.auth/user.json';

// Logs in through the real /login form (not a raw API call) so the browser context picks
// up Supabase's session cookies with their real attributes, no manual cookie plumbing.
// The account itself is a dedicated E2E-only login (never the real admin) created by
// `npm run bootstrap:e2e` — see plan_playwright_auth_fixture_2026-09-14.
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD (see frontend/.env.example), then run `npm run bootstrap:e2e`.');
  }

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /enter the league/i }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
