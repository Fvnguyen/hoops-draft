import { test as setup, expect } from '@playwright/test';

const authFile = 'tests/.auth/user2.json';

// pvp_match D9: the second dedicated E2E login (never the real admin), for specs that need
// two signed-in browser contexts at once (invites, accepting from the bell, ...). Mirrors
// auth.setup.ts exactly, against E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2. Skips (does not fail)
// when those are unset, so a single-account checkout still runs every other spec.
setup('authenticate second account', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL_2;
  const password = process.env.E2E_TEST_PASSWORD_2;
  setup.skip(!email || !password, 'E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 not set — see frontend/.env.example.');

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: /enter the league/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
