import { expect, type Page } from '@playwright/test';

/**
 * `WhatsNewSplash` (plan_ui_foundation D9) is an `Overlay` — `[data-overlay]`, fixed,
 * z-[100] — that shows once per unseen changelog release. Its seen-state lives in
 * `getGameStore().setMeta`, i.e. IndexedDB, which is per browser context and NOT part of
 * the saved `storageState` (cookies + localStorage only). So every fresh Playwright
 * context sees the splash, and any spec that clicks on an authenticated route must clear
 * it first or the click is intercepted. This is the one shared way to do that.
 *
 * It mounts only after `useCurrentProfile`/`useNotices` resolve, which on heavy routes
 * (the draft room) can be seconds after `goto` — hence the wait. Once dismissed for a
 * context it never returns, so later calls cost one quick DOM check.
 */
const OVERLAY = '[data-overlay="true"]';

export async function dismissSplash(page: Page, waitForMs = 5000): Promise<boolean> {
  const overlay = page.locator(OVERLAY);
  if (waitForMs > 0) {
    await overlay.waitFor({ state: 'visible', timeout: waitForMs }).catch(() => {});
  }
  if (!(await overlay.count())) return false;
  // The backdrop carries the same onClose handler as the Close button, and the corner is
  // always backdrop whatever the panel's size — the button itself can sit off-screen on
  // short viewports (the very bug D9 fixed).
  await page.mouse.click(6, 6);
  await expect(overlay).toHaveCount(0, { timeout: 5000 });
  return true;
}

/**
 * Wrap a click that must not be swallowed: clears a splash that may have mounted since
 * the last check (short wait), then clicks.
 */
export async function clickPastSplash(page: Page, click: () => Promise<void>) {
  await dismissSplash(page, 800);
  await click();
}
