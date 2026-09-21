import path from 'path';
import { test, expect } from '@playwright/test';
import { dismissSplash, clickPastSplash } from './helpers/splash';

/**
 * T11/D9: proves GameView's memoization by counting renders instead of asserting it in
 * the abstract. `TeamBlock` (GameView.tsx) exposes a dev-only counter
 * (`window.__gameViewRenderCounts`, compiled away in production —
 * `process.env.NODE_ENV === 'production'` short-circuits it) that increments once per
 * *actual* render — `React.memo` bails before it fires when the props it was given
 * (game, side, score, isUser, seasonLine, archetypes) haven't changed. The same object
 * also carries `__currentPoss`, GameView's own possession counter, so the spec can
 * correlate "ticks elapsed" against "TeamBlock renders" from one read.
 *
 * Uses the same fixture/flow as season.spec.ts (fixed-id `season-fixture.json` imported
 * through the real Import flow) to reach a live game, then drives playback at 4x for a
 * few seconds. Before this task's fix, TeamBlock re-ran `evaluateArchetypes` and
 * re-rendered on every tick (home+away combined, ~2 renders per possession); after it,
 * a side only re-renders when ITS score actually changes, which happens on a minority of
 * possessions (misses, turnovers and the other team's plays don't move it) — so the
 * combined TeamBlock render count over the window must land well under the possession
 * count, not track it 1:1.
 */

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'season-fixture.json');
const ROSTER_NAME = 'E2E Season Fixture';

test('TeamBlock render count rises far slower than the possession counter during playback', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/rosters');
  await dismissSplash(page);
  await expect(page.getByText('Loading Rosters...')).toHaveCount(0);
  const existingRow = page.locator('h2', { hasText: ROSTER_NAME }).first();
  if (await existingRow.count()) {
    const card = existingRow.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    await clickPastSplash(page, () => card.getByTitle('Delete Roster').click());
    await expect(existingRow).toHaveCount(0);
  }

  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await expect(page.getByText('Import complete')).toBeVisible();

  const rosterCard = page.locator('h2', { hasText: ROSTER_NAME }).first()
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  await clickPastSplash(page, () => rosterCard.getByRole('button', { name: 'Play Season' }).click());
  await expect(page).toHaveURL(/\/season\?/);

  const scheduleEntry = (n: number) =>
    page.getByText(new RegExp(`^Game ${n} • `))
      .locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
  await expect(scheduleEntry(1).getByText('Play')).toBeVisible();
  await scheduleEntry(1).click();

  await expect(page.getByRole('button', { name: 'Tip Off' })).toBeVisible();
  await page.getByRole('button', { name: 'Tip Off' }).click();

  // Tip Off already starts playback at 1x (500ms/possession) — switch to 4x (125ms) so a
  // short, fixed wall-clock window covers enough possessions for a stable measurement.
  const speed4x = page.getByRole('button', { name: '4×' });
  await speed4x.click();
  await expect(speed4x).toHaveAttribute('aria-pressed', 'true');

  const readCounts = () => page.evaluate(() => window.__gameViewRenderCounts ?? {});

  // A handful of possessions in a 3s window is normally guaranteed at 125ms/tick, but a
  // dev-server Fast Refresh from an unrelated file mid-window (two other agents are
  // editing other components concurrently, see AGENTS.md) can occasionally stall a
  // sampling pass to ~0 ticks — retry once rather than flake the whole run on that.
  let possDelta = 0;
  let teamBlockDelta = 0;
  for (let attempt = 0; attempt < 2 && possDelta < 10; attempt++) {
    const before = await readCounts();
    await page.waitForTimeout(3000);
    const after = await readCounts();
    possDelta = (after.__currentPoss ?? 0) - (before.__currentPoss ?? 0);
    teamBlockDelta = (after.TeamBlock ?? 0) - (before.TeamBlock ?? 0);
  }

  // Sanity: playback actually advanced enough possessions for the comparison to mean
  // anything (the task's own bar: "at least 10" over the sampling window).
  expect(possDelta).toBeGreaterThanOrEqual(10);

  // The bug: TeamBlock re-ran `evaluateArchetypes` and re-rendered (home + away, both
  // sides) on every single tick regardless of whether either score changed — teamBlockDelta
  // would land close to 2x possDelta (measured: 23 possessions / 46 renders on the
  // unmemoized code). The fix hoists archetype evaluation out of TeamBlock and only lets
  // a side re-render when its own score prop changes, which is not every possession
  // (misses/turnovers/the other team's possessions don't score) — measured: 24
  // possessions / 10 renders after the fix. So the combined render count across both
  // sides must stay clearly below one-per-possession.
  expect(teamBlockDelta).toBeLessThan(possDelta);
});
