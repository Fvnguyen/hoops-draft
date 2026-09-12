import { test, expect } from '@playwright/test';

test.describe('Home Page redesign', () => {
  test('has correct navigation links and visual sections', async ({ page }) => {
    // Test against the actual home route
    await page.goto('/');

    // Wait for the font to load so visual tests are stable
    await page.evaluate(() => document.fonts.ready);

    // Verify main title
    await expect(page.getByRole('heading', { name: /HOOPS DRAFT/i })).toBeVisible();
    await expect(page.getByText('ALL-STARS')).toBeVisible();

    // Verify main game links
    const startDraftLink = page.getByRole('link', { name: /START DRAFT/i });
    await expect(startDraftLink).toBeVisible();
    await expect(startDraftLink).toHaveAttribute('href', '/draft');

    const myRostersLink = page.getByRole('link', { name: /MY ROSTERS/i });
    await expect(myRostersLink).toBeVisible();
    await expect(myRostersLink).toHaveAttribute('href', '/rosters');

    // Verify Dev Tools
    await expect(page.getByText('Dev Tools')).toBeVisible();
    await expect(page.getByRole('link', { name: /Deckbuilder/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Test UI/i })).toBeVisible();

    // Verify right column "DRAFT PACK" exists
    await expect(page.getByRole('heading', { name: /DRAFT PACK/i })).toBeVisible();
  });
});
