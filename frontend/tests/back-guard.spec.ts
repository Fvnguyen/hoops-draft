import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { dismissSplash, clickPastSplash } from './helpers/splash';

/**
 * plan mobile_load D10: the hardware/gesture back button on guarded screens.
 *
 * The guard must keep exactly ONE extra history entry. It used to add one per mount
 * (StrictMode in dev, the draft room -> deck builder hand-off in production, a reload,
 * every opened season game), so "Leave" went back two entries, landed on a leftover guard
 * entry with the same URL and visibly did nothing, and the season hub collected one dead
 * back press per game opened. `page.goBack()` is the hardware back button.
 */

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'season-fixture.json');
const ROSTER_NAME = 'E2E Season Fixture';
const sheet = (page: Page) => page.getByRole('heading', { name: 'Leave this screen?' });

async function importFixture(page: Page) {
  await page.goto('/rosters');
  await dismissSplash(page);
  await expect(page.getByText('Loading Rosters...')).toHaveCount(0);
  const existing = page.locator('h2', { hasText: ROSTER_NAME }).first();
  if (await existing.count()) {
    const card = existing.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    await clickPastSplash(page, () => card.getByTitle('Delete Roster').click());
    await expect(existing).toHaveCount(0);
  }
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await expect(page.getByText('Import complete')).toBeVisible();
  return page.locator('h2', { hasText: ROSTER_NAME }).first()
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
});

test('deck builder: back asks, Cancel stays, Leave leaves — however often it is cancelled', async ({ page }) => {
  const card = await importFixture(page);
  await card.getByTitle(/(Edit|View) Roster/).first().click();
  await expect(page).toHaveURL(/\/roster\//);
  await expect(page.getByText('Loading Roster...')).toHaveCount(0);
  const lengthOnArrival = await page.evaluate(() => window.history.length);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goBack();
    await expect(sheet(page)).toBeVisible();
    await expect(page).toHaveURL(/\/roster\//);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
  }
  // Cancelling must not grow the stack: one guard entry, re-used every time.
  expect(await page.evaluate(() => window.history.length)).toBe(lengthOnArrival);

  await page.goBack();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page).toHaveURL(/\/rosters$/);
});

test('deck builder: after a reload, back still gets you out in one go', async ({ page }) => {
  const card = await importFixture(page);
  await card.getByTitle(/(Edit|View) Roster/).first().click();
  await expect(page).toHaveURL(/\/roster\//);
  await page.reload();
  // The guard arms when the builder mounts, which is after storage and the roster load.
  await expect(page.getByText(/depth chart/i).first()).toBeVisible({ timeout: 20_000 });
  await dismissSplash(page, 1500);

  // A reload has already discarded any unsaved edits, so there is nothing left to protect
  // and Chromium may traverse straight past the guard entry (the entries below it belong
  // to the pre-reload document). What must never happen again is the old failure: a
  // second, stacked guard entry that made "Leave" land on the builder itself.
  await page.goBack();
  if (await sheet(page).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/rosters$/);
});

test('season: closing games leaves no dead back presses at the hub', async ({ page }) => {
  const card = await importFixture(page);
  await clickPastSplash(page, () => card.getByRole('button', { name: 'Play Season' }).click());
  await expect(page).toHaveURL(/\/season\?/);
  const game = (n: number) =>
    page.getByText(new RegExp(`^Game ${n} • `))
      .locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
  const tipOff = page.getByRole('button', { name: 'Tip Off' });

  // An unplayed game is a "fresh play": leaving it asks first (SeasonView's own confirm).
  const leaveAnyway = page.getByRole('button', { name: 'Leave Anyway' });

  // Open and close a game twice: once with the hardware back button, once in-app.
  await game(1).click();
  await expect(tipOff).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/season\?/); // back asked instead of leaving the season
  await leaveAnyway.click();
  await expect(tipOff).toHaveCount(0);

  await game(1).click();
  await expect(tipOff).toBeVisible();
  await page.getByRole('button', { name: 'Exit Game' }).click();
  await leaveAnyway.click();
  await expect(tipOff).toHaveCount(0);

  // ONE back press from the hub must leave the season. It used to take one extra press
  // per game opened.
  await page.waitForTimeout(250); // the guard entry is removed a tick after the game closes
  await page.goBack();
  await expect(page).toHaveURL(/\/rosters$/);
});
