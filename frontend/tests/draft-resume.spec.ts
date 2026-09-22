import { test, expect, type Page } from '@playwright/test';
import { dismissSplash, clickPastSplash } from './helpers/splash';

/**
 * draft_resume T4: a reload mid-draft (OS kill, phone lock, browser crash) must come back
 * to the exact same pick — same seed, same pack, same cards on screen — via the resume
 * sheet on `/draft`. `?mode=quick&clock=fast` keeps this deterministic and fast (no
 * round-summary pause, no real pick clock), same as `draft.spec.ts`.
 */

const RESUME_SHEET = '[data-draft-resume-sheet]';

async function openFirstPack(page: Page) {
  const openButton = page.getByRole('button', { name: /^Open pack/ });
  await expect(openButton).toBeVisible();
  await openButton.click();
  const skipButton = page.getByRole('button', { name: 'Skip reveal (Esc)' });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

/** Confirms the first selectable card in whatever spread is currently showing (the
 *  post-reveal grid, same mechanics `draft.spec.ts` exercises). */
async function makePick(page: Page) {
  const confirmButton = page.getByRole('button', { name: /^Confirm pick$|^Select a card$/ });
  await expect(confirmButton).toBeVisible();
  const spread = page.locator('[role="button"][aria-label^="Select "]').first();
  await expect(spread).toBeVisible();
  await clickPastSplash(page, () => spread.click());
  const takeButton = page.getByRole('button', { name: /^Confirm pick$/ });
  await expect(takeButton).toBeVisible();
  await takeButton.click();
  // Let the pack-pass animation (and, at a pack boundary, the full-pack swap) settle
  // before the next read — a shorter wait leaves stale AnimatePresence exit nodes in the
  // DOM and over-counts the pack's cards.
  await page.waitForTimeout(600);
}

/** The card names currently offered to the human, sorted — a stable fingerprint of "this
 *  exact pack", independent of on-screen order/animation. */
async function currentPackFingerprint(page: Page): Promise<string[]> {
  const labels = await page
    .locator('[role="button"][aria-label^="Select "]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  return labels.sort();
}

/** Each test starts fresh: if a PREVIOUS run (or a failed earlier test) left an unfinished
 *  draft behind, the resume sheet would otherwise block `/draft` before this test's own
 *  scripted picks even start. Abandon it so every test is self-contained. */
async function clearAnyUnfinishedDraft(page: Page) {
  await page.goto('/draft?mode=quick&clock=fast');
  await dismissSplash(page);
  const sheet = page.locator(RESUME_SHEET);
  // Loop: only the single newest unfinished session shows at a time, so a run with
  // several stale ones left behind (e.g. an earlier failed run) needs more than one pass.
  for (let i = 0; i < 40; i++) {
    if (!(await sheet.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await sheet.getByRole('button', { name: 'Abandon' }).click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    await dismissSplash(page);
  }
}

test.describe('Draft resume', () => {
  test('reload at pack 2 pick 5 resumes to the same pack; finishing opens the deck builder with all 24 cards', async ({ page }) => {
    test.setTimeout(240_000);

    await clearAnyUnfinishedDraft(page);
    await page.goto('/draft?mode=quick&clock=fast');
    await dismissSplash(page);

    await openFirstPack(page);
    // Pack 1 (8 picks) + pack 2 picks 1-4 (4 picks) = 12 picks total, landing on pack 2 pick 5.
    for (let i = 0; i < 12; i++) {
      await makePick(page);
    }

    await expect(page.getByText(/Pick 5 of 8/)).toBeVisible();
    const packBeforeReload = await currentPackFingerprint(page);
    // 4 picks already taken from this 8-card pack (picks 1-4 of pack 2) — 4 remain.
    expect(packBeforeReload.length).toBe(4);

    // Give the autosave (fires after every human pick) time to land before killing the page.
    await page.waitForTimeout(500);
    await page.reload();
    await dismissSplash(page);

    const sheet = page.locator(RESUME_SHEET);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Resume draft, pack 2 pick 5')).toBeVisible();
    await sheet.getByRole('button', { name: 'Resume' }).click();
    await expect(sheet).toHaveCount(0);

    // Same pack on screen: same pick counter, same 4 remaining cards (order-independent).
    await expect(page.getByText(/Pick 5 of 8/)).toBeVisible();
    const packAfterResume = await currentPackFingerprint(page);
    expect(packAfterResume).toEqual(packBeforeReload);

    // Finish the draft: 4 more picks of pack 2, then all 8 of pack 3.
    for (let i = 0; i < 12; i++) {
      await makePick(page);
    }

    // Deck builder opens with the full 24-card pod on the bench (no auto-fill). The
    // players/plays split isn't fixed (which seat ends up with a given pack's one play
    // card, among the 8 that pick from it as it rotates, depends on pick order) — only
    // the 24-card total is guaranteed (3 packs x 8 cards). `RosterSidebarPanel`'s
    // collapsed-strip badges carry the exact counts as `title="N players"` / `"N plays"`
    // (distinct from `PlaysSidebar`'s "N of 3 plays" active-play counter).
    await expect(page.locator('span[title$=" players"]')).toBeVisible({ timeout: 15000 });
    const total = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span[title]'));
      const players = spans.find((s) => /^\d+ players$/.test(s.getAttribute('title') ?? ''));
      const plays = spans.find((s) => /^\d+ plays$/.test(s.getAttribute('title') ?? ''));
      return Number(players?.textContent) + Number(plays?.textContent);
    });
    expect(total).toBe(24);
  });

  test('abandon deletes the unfinished session — a later reload starts fresh, no sheet', async ({ page }) => {
    test.setTimeout(180_000);

    await clearAnyUnfinishedDraft(page);
    await page.goto('/draft?mode=quick&clock=fast');
    await dismissSplash(page);
    await openFirstPack(page);
    for (let i = 0; i < 3; i++) {
      await makePick(page);
    }

    await page.waitForTimeout(500);
    await page.reload();
    await dismissSplash(page);

    const sheet = page.locator(RESUME_SHEET);
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Abandon' }).click();
    await expect(sheet).toHaveCount(0);

    // The abandoned draft is gone: a second reload finds nothing to resume.
    await page.reload();
    await dismissSplash(page);
    await expect(page.locator(RESUME_SHEET)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Open pack/ })).toBeVisible();
  });
});
