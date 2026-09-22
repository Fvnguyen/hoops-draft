import { expect, type Page } from '@playwright/test';
import { dismissSplash } from './splash';

/**
 * draft_resume: every spec shares one cloud-synced E2E account, and a draft left mid-pick
 * (any spec that picks a few cards and stops) makes `/draft` open on the resume sheet.
 * Call this before a spec's own `/draft` visit: it abandons every unfinished draft (only
 * the newest shows at a time, hence the loop) and leaves the page on a fresh draft.
 */
export async function clearAnyUnfinishedDraft(page: Page, url = '/draft?mode=quick&clock=fast') {
  await page.goto(url);
  await dismissSplash(page);
  const sheet = page.locator('[data-draft-resume-sheet]');
  for (let i = 0; i < 40; i++) {
    if (!(await sheet.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await sheet.getByRole('button', { name: 'Abandon' }).click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    await dismissSplash(page);
  }
}
