import { test, expect } from '@playwright/test';

/**
 * D1: the home page's two draft CTAs route to the right `?mode=`. Premier is
 * the primary/emphasized CTA, Quick the secondary one — this only checks
 * routing, not visual emphasis (that's a manual/screenshot check, see
 * docs/plans/plan_ui_draft_deckbuild_pack_2026-09-13.md).
 */
test.describe('Home page draft CTAs', () => {
  test('Premier CTA routes to /draft?mode=premier', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-premier').click();
    await expect(page).toHaveURL(/\/draft\?mode=premier/);
  });

  test('Quick CTA routes to /draft?mode=quick', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-quick').click();
    await expect(page).toHaveURL(/\/draft\?mode=quick/);
  });
});
