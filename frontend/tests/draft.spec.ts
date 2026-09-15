import { test, expect } from '@playwright/test';

/**
 * plan_ui_foundation T5 (D7/D8): the confirm control is one component docked at a fixed
 * screen position, and a pack pass never remounts the settled pack.
 *
 * `?mode=quick&clock=fast` keeps this fast and deterministic (no premier pick clock, no
 * long reveal animation to sit through — "Skip reveal" short-circuits it anyway). Only
 * the very first of the three picks below goes through the pack-intro opener
 * (`PackOpener`); picks 2 and 3 land inside `DraftRoom`'s own pack spread — between them
 * they exercise both places the shared `ConfirmPickDock` renders.
 */
test.describe('Draft room: confirm dock + pack pass', () => {
  test('confirm button stays docked at the same spot across picks; the settled pack node never remounts', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/draft?mode=quick&clock=fast');

    // `WhatsNewSplash` (D9) is a `data-overlay` modal that shows once per unseen
    // changelog release and swallows every click underneath it — clear it before
    // interacting with the draft room. No-op once already seen for this profile.
    // Dismissed via a backdrop click rather than Escape: PackOpener's own reveal
    // screen also listens for Escape globally (its "skip reveal" shortcut), so an
    // Escape sent here could leak through and skip straight past the pack-intro.
    const overlay = page.locator('[data-overlay="true"]');
    await overlay.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await overlay.count()) {
      await page.mouse.click(6, 6);
      await expect(overlay).toHaveCount(0);
    }

    let confirmPos: { x: number; y: number } | null = null;

    for (let pick = 0; pick < 3; pick++) {
      if (pick === 0) {
        const openButton = page.getByRole('button', { name: /^Open pack/ });
        await expect(openButton).toBeVisible();
        await openButton.click();

        const skipButton = page.getByRole('button', { name: 'Skip reveal (Esc)' });
        if (await skipButton.isVisible().catch(() => false)) {
          await skipButton.click();
        }
      }

      // Wait for the shared confirm dock, disabled until a card is selected.
      const confirmButton = page.getByRole('button', { name: /^Take |^Select a card$/ });
      await expect(confirmButton).toBeVisible();

      // Pick the first selectable card in the spread (PackOpener and DraftRoom's own
      // grid both mark a pickable card the same way: role=button, "Select <name>").
      const spread = page.locator('[role="button"][aria-label^="Select "]').first();
      await expect(spread).toBeVisible();
      await spread.click();

      const takeButton = page.getByRole('button', { name: /^Take / });
      await expect(takeButton).toBeVisible();

      const box = await takeButton.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

        if (confirmPos) {
          expect(box.x).toBeCloseTo(confirmPos.x, 0);
          expect(box.y).toBeCloseTo(confirmPos.y, 0);
        }
        confirmPos = { x: box.x, y: box.y };
      }

      await takeButton.click();

      // Right after confirming, the pack pass is either mid-flight or (on a slow
      // runner) already settled — either way `[data-pass-node]` must be the single,
      // still-connected node the whole way through: no third "settled" element swap.
      await page.waitForTimeout(100);
      const passNode = page.locator('[data-pass-node]').first();
      const elementHandle = await passNode.elementHandle();
      expect(elementHandle).not.toBeNull();

      await page.waitForTimeout(1200);

      const stillConnected = elementHandle
        ? await elementHandle.evaluate((el) => el.isConnected)
        : false;
      expect(stillConnected).toBe(true);
      await expect(page.locator('[data-pass-node]')).toHaveCount(1);
    }
  });
});
