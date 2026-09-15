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

  // plan_ui_foundation T2: every primitive in every variant, both themes. The gallery
  // flips `data-theme` on <html> itself, so the second shot proves the theme switch is
  // one attribute and not a component change.
  test('UI primitives gallery, court and night', async ({ page }) => {
    await page.goto('/test-ui');
    const gallery = page.locator('#ui-primitives-test');
    await expect(gallery).toBeVisible();

    // D2: nothing interactive in the gallery is under 44px on either axis.
    const boxes = await gallery.locator('button, a, summary').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.textContent?.trim() || el.getAttribute('aria-label'), w: r.width, h: r.height };
      }),
    );
    for (const b of boxes) {
      expect(b.w, `${b.label} width`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${b.label} height`).toBeGreaterThanOrEqual(44);
    }

    await expect(gallery).toHaveScreenshot('ui-primitives-court.png', { maxDiffPixelRatio: 0.1 });
    await page.getByTestId('theme-flip').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    await expect(gallery).toHaveScreenshot('ui-primitives-night.png', { maxDiffPixelRatio: 0.1 });
  });
});
