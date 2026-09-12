import { test, expect } from '@playwright/test';

test.describe('Synergy UI & Team Stats Visual Tests', () => {
  test('DeckBuilder Top KPI Band', async ({ page }) => {
    await page.goto('/test-ui');
    const kpiBand = page.locator('#kpi-band-test');
    await expect(kpiBand).toBeVisible();
    await expect(kpiBand).toHaveScreenshot('top-kpi-band.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Season View Franchise Dashboard', async ({ page }) => {
    await page.goto('/test-ui');
    const dashboard = page.locator('#franchise-dashboard-test');
    await expect(dashboard).toBeVisible();
    await expect(dashboard).toHaveScreenshot('franchise-dashboard.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Game View Matchup Header and Tape', async ({ page }) => {
    await page.goto('/test-ui');
    const gameView = page.locator('#game-view-test');
    await expect(gameView).toBeVisible();
    
    // Default is matchup tab due to currentPoss < 0
    await expect(gameView).toHaveScreenshot('game-view-matchup.png', { maxDiffPixelRatio: 0.1 });
  });
});
