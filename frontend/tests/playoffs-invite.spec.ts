import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { dismissSplash, clickPastSplash } from './helpers/splash';

/**
 * pvp_match T4: two browser contexts. User A (the default `tests/.auth/user.json`) invites
 * user B (`E2E_TEST_EMAIL_2`, `tests/.auth/user2.json` from `auth2.setup.ts`) from
 * `/playoffs/new`; B accepts from the notification bell and lands in the draft room; A's bell
 * shows "Your move" (derived from its own RLS-scoped read of the row) and its "Open" link
 * leads to the same room. The row's status is also checked with the service role.
 *
 * Needs the matches migration (applied to production 2026-09-22) and the second account
 * (`npm run bootstrap:e2e` with `E2E_TEST_EMAIL_2`/`E2E_TEST_PASSWORD_2` set). Matches
 * between the two E2E accounts are deleted before and after, so runs never pile up.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

async function myId(page: Page): Promise<{ id: string; display_name: string }> {
  const res = await page.request.get('/api/auth/me');
  return res.json();
}

async function deleteMatchesBetween(a: string, b: string) {
  if (!admin) return;
  const { error } = await admin
    .from('matches')
    .delete()
    .or(`and(host_id.eq.${a},guest_id.eq.${b}),and(host_id.eq.${b},guest_id.eq.${a})`);
  if (error) throw error;
}

async function openBell(page: Page) {
  await clickPastSplash(page, () => page.getByRole('button', { name: /notifications/i }).first().click());
}

test.describe('playoffs invite', () => {
  const authFile2 = 'tests/.auth/user2.json';

  test.skip(
    !process.env.E2E_TEST_EMAIL_2 || !process.env.E2E_TEST_PASSWORD_2 || !admin,
    'Set E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 (and the Supabase keys) and run `npm run bootstrap:e2e`.',
  );

  test('A invites B from /playoffs/new; B accepts from the bell; both see drafting', async ({ page, browser }) => {
    // Checked here, not at load time: `auth2.setup.ts` writes this file in the same run,
    // after spec files have already been loaded.
    test.skip(!fs.existsSync(authFile2), `${authFile2} missing: auth2.setup.ts did not run.`);
    test.setTimeout(90_000);
    const contextB = await browser.newContext({ storageState: authFile2 });
    const pageB = await contextB.newPage();

    await page.goto('/');
    await pageB.goto('/');
    const [a, b] = await Promise.all([myId(page), myId(pageB)]);
    await deleteMatchesBetween(a.id, b.id);

    try {
      // A: invite B from the list.
      await page.goto('/playoffs/new');
      await dismissSplash(page);
      const inviteRow = page.getByText(b.display_name, { exact: false }).locator('..').locator('..');
      await clickPastSplash(page, () => inviteRow.getByRole('button', { name: /invite/i }).click());
      await expect(inviteRow.getByText(/invite sent/i)).toBeVisible({ timeout: 10_000 });

      // B: accept from the bell.
      await pageB.reload();
      await dismissSplash(pageB);
      await openBell(pageB);
      await expect(pageB.getByText('Playoffs invite')).toBeVisible({ timeout: 10_000 });
      await pageB.getByRole('button', { name: /^accept$/i }).click();
      // Accepting opens the draft room.
      await expect(pageB).toHaveURL(/\/playoffs\/[^/]+\/draft$/, { timeout: 15_000 });

      // A sees the same drafting match through its own session.
      await page.reload();
      await dismissSplash(page);
      await openBell(page);
      await expect(page.getByText('Your move')).toBeVisible({ timeout: 10_000 });
      // The notice links to the same room.
      await page.getByRole('link', { name: 'Open' }).first().click();
      await expect(page).toHaveURL(/\/playoffs\/[^/]+\/draft$/, { timeout: 15_000 });

      const { data, error } = await admin!
        .from('matches')
        .select('status, host_id, guest_id, version')
        .eq('host_id', a.id)
        .eq('guest_id', b.id);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].status).toBe('drafting');
    } finally {
      await deleteMatchesBetween(a.id, b.id);
      await contextB.close();
    }
  });
});
