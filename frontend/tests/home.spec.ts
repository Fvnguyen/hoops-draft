import { test, expect } from '@playwright/test';

/**
 * D1: mode is chosen before the draft. The two home CTAs ("In-Season Tournament" /
 * "82:0 Challenge") each open their own Premier-vs-Quick picker instead of routing
 * directly; picking a draft style there is what actually navigates to
 * `/draft?mode=&game=`. This only checks routing/opening behaviour, not visual
 * emphasis or exact board fidelity (that's a manual/screenshot check — see
 * docs/plans/plan_challenge_mode_2026-09-17.md, T5).
 */
test.describe('Home page mode + draft-style CTAs', () => {
  test('In-Season Tournament opens its picker; Premier routes with game=tournament', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-tournament').click();
    await expect(page.getByTestId('home-mode-picker')).toBeVisible();
    await page.getByTestId('pick-premier').click();
    await expect(page).toHaveURL(/\/draft\?mode=premier&game=tournament/);
  });

  test('In-Season Tournament picker: Quick Draft routes with game=tournament', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-tournament').click();
    await page.getByTestId('pick-quick').click();
    await expect(page).toHaveURL(/\/draft\?mode=quick&game=tournament/);
  });

  test('82:0 Challenge opens its picker; Premier routes with game=challenge', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-challenge').click();
    await expect(page.getByTestId('home-mode-picker')).toBeVisible();
    await page.getByTestId('pick-premier').click();
    await expect(page).toHaveURL(/\/draft\?mode=premier&game=challenge/);
  });

  test('82:0 Challenge picker: Quick Draft routes with game=challenge', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-challenge').click();
    await page.getByTestId('pick-quick').click();
    await expect(page).toHaveURL(/\/draft\?mode=quick&game=challenge/);
  });

  test('Back closes the picker without navigating', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-tournament').click();
    await expect(page.getByTestId('home-mode-picker')).toBeVisible();
    await page.getByText('Back').click();
    await expect(page.getByTestId('home-mode-picker')).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
