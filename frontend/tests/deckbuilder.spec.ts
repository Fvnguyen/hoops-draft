import { test, expect, type Page } from '@playwright/test';
import { dismissSplash } from './helpers/splash';

/**
 * plan_deckbuilder_ux T4/D4/D7: the deck builder's three container-query tiers
 * (compact < 960, regular 960-1439, wide >= 1440) on `/deckbuilder-test` — the
 * fixture page that seeds a fresh, empty-depth-chart roster with 30 random
 * players and 6 play cards, no session (see `src/app/deckbuilder-test/page.tsx`).
 *
 * The fixture renders slowly (up to ~10s: it waits on storage readiness and a
 * random card fetch) — every navigation below waits out "Loading Deckbuilder..."
 * with a generous timeout before touching the page.
 */

type Tier = 'compact' | 'regular' | 'wide';

async function gotoDeckbuilder(page: Page) {
  await page.goto('/deckbuilder-test');
  await expect(page.getByText('Loading Deckbuilder...')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);
}

/** Opens the Roster sidebar regardless of tier: the compact-tier drawer trigger
 *  in the depth-chart title row, or the docked/strip toggle at wider tiers. */
async function openRosterSidebar(page: Page, tier: Tier) {
  if (tier === 'compact') {
    await page.getByRole('button', { name: /^Roster,/ }).click();
    return;
  }
  const expandButton = page.getByRole('button', { name: 'Expand roster' });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding
}

/** D7: no interactive control renders under the 44x44 hit-area floor (D2). Zero-size
 *  (hidden, `display:none`) elements are excluded — only what's actually rendered counts. */
async function assertEveryControlAtLeast44px(page: Page) {
  const undersized = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false; // not rendered
        return r.width < 44 || r.height < 44;
      })
      .map((el) => ({
        text: el.textContent?.trim().slice(0, 40),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      }));
  });
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
}

function playsChip(page: Page) {
  return page.getByRole('button', { name: /Plays\s+\d+\/3/ });
}

function playersChip(page: Page) {
  return page.getByRole('button', { name: /Players\s+\d+\/12/ });
}

const TIERS: { name: Tier; width: number; height: number }[] = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'regular', width: 1100, height: 800 },
  { name: 'compact', width: 900, height: 700 },
];

for (const { name: tier, width, height } of TIERS) {
  test.describe(`Deckbuilder @ ${tier} tier (${width}x${height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoDeckbuilder(page);
    });

    test('no horizontal overflow', async ({ page }) => {
      await assertNoHorizontalOverflow(page);
    });

    test('every button/link/[role=button] is at least 44x44', async ({ page }) => {
      // Open every collapsible surface first so its controls are on-screen and counted.
      await openRosterSidebar(page, tier);
      await assertEveryControlAtLeast44px(page);
    });

    test('Plays chip goes 0/3 -> 3/3 by clicking three roster Add buttons', async ({ page }) => {
      await expect(playsChip(page)).toHaveText(/0\/3/);

      await openRosterSidebar(page, tier);

      const addButton = page.getByRole('button', { name: 'Add', exact: true });
      for (let i = 0; i < 3; i++) {
        await expect(addButton.first()).toBeVisible();
        await addButton.first().click();
      }

      await expect(playsChip(page)).toHaveText(/3\/3/);
    });

    test('clicking a roster player then a highlighted slot places them (Players 1/12)', async ({ page }) => {
      await expect(playersChip(page)).toHaveText(/0\/12/);

      await openRosterSidebar(page, tier);

      const row = page.getByTestId('roster-player-row').first();
      await expect(row).toBeVisible();
      await row.click();

      const eligibleSlot = page.locator('[data-testid^="depth-slot-"]', { hasText: 'Place here' }).first();
      await expect(eligibleSlot).toBeVisible();
      await eligibleSlot.click();

      await expect(playersChip(page)).toHaveText(/1\/12/);
    });
  });
}

/**
 * D4 (amended after the owner's review): in every docked tier both sidebars may be
 * open at once — dragging a play from the roster into a slot needs that. Plays starts
 * docked by default; Roster starts as a strip.
 */
test.describe('Deckbuilder @ D4 both sidebars dock', () => {
  for (const { name, width, height } of [{ name: 'regular', width: 1100, height: 800 }, { name: 'wide', width: 1440, height: 900 }]) {
    test(`${name} tier (${width}): Roster and Plays can both stay docked`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoDeckbuilder(page);

      await expect(page.getByRole('button', { name: 'Collapse plays' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Expand roster' })).toBeVisible();

      await page.getByRole('button', { name: 'Expand roster' }).click();

      await expect(page.getByRole('button', { name: 'Collapse roster' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Collapse plays' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

/**
 * render_and_engine_perf T10: the Roster body unmounts whenever the compact drawer closes,
 * so its position filter must live above it. Picking a filter, closing the drawer and
 * opening it again has to come back to the same filter.
 */
test('compact tier: the roster position filter survives closing and reopening the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await gotoDeckbuilder(page);
  const openDrawer = page.getByRole('button', { name: /^Roster,/ });
  const guards = page.getByRole('button', { name: 'G', exact: true });

  await openDrawer.click();
  await expect(guards).not.toHaveClass(/bg-surface-inverse/);
  await guards.click();
  await expect(guards).toHaveClass(/bg-surface-inverse/);

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(guards).toHaveCount(0);

  await openDrawer.click();
  await expect(guards).toHaveClass(/bg-surface-inverse/);
});
