import { test, expect } from '@playwright/test';
import { clearAnyUnfinishedDraft } from './helpers/draft';

/**
 * plan_ui_foundation T4/D6: the header never reflows once the auth status settles, and
 * game routes (draft/roster/season) drop the chrome bar entirely for a single gear menu.
 * The chromium project carries the saved auth state (tests/.auth/user.json, see
 * auth.setup.ts), so `status` here always resolves to 'signed-in'.
 */

test.describe('TopNav: no layout shift while auth resolves', () => {
  test('/rosters: nav bar and cluster rect are stable across the auth fetch', async ({ page }) => {
    await page.goto('/rosters', { waitUntil: 'domcontentloaded' });

    const bar = page.getByTestId('top-nav-bar');
    const cluster = page.getByTestId('top-nav-cluster');

    await expect(bar).toBeVisible();
    const barRectBefore = await bar.boundingBox();
    const clusterRectBefore = await cluster.boundingBox();
    expect(barRectBefore).not.toBeNull();
    expect(clusterRectBefore).not.toBeNull();

    // Wait for the real, signed-in cluster (profile trigger) to replace the placeholders.
    // The trigger is a <summary> (Menu primitive), not exposed with role "button" in
    // every engine, so match on its aria-label instead of getByRole.
    const profileTrigger = page.locator('[aria-label="Profile menu"]');
    await expect(profileTrigger).toBeVisible();

    const barRectAfter = await bar.boundingBox();
    const clusterRectAfter = await cluster.boundingBox();
    expect(barRectAfter).not.toBeNull();
    expect(clusterRectAfter).not.toBeNull();

    expect(barRectAfter).toEqual(barRectBefore);

    const widthBefore = clusterRectBefore!.width;
    const widthAfter = clusterRectAfter!.width;
    expect(Math.abs(widthAfter - widthBefore)).toBeLessThanOrEqual(8);
  });

  test('/rosters: Back to Home control is at least 44x44', async ({ page }) => {
    await page.goto('/rosters');
    const homeButton = page.getByRole('button', { name: 'Back to Home' });
    await expect(homeButton).toBeVisible();
    const box = await homeButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('TopNav: game routes have no bar, just the gear menu', () => {
  test('/draft?mode=quick: no page title, gear menu opens with Sign out', async ({ page }) => {
    await clearAnyUnfinishedDraft(page, '/draft?mode=quick');

    await expect(page.getByText('Draft Room', { exact: true })).toHaveCount(0);

    // The trigger is a <summary> (Menu primitive), matched by aria-label rather than role.
    const gameMenuTrigger = page.locator('[aria-label="Game menu"]');
    await expect(gameMenuTrigger).toBeVisible();
    const box = await gameMenuTrigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await gameMenuTrigger.click();
    await expect(page.getByText('Sign out', { exact: true })).toBeVisible();
  });
});
