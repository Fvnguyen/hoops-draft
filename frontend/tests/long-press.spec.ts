import fs from 'fs';
import path from 'path';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { dismissSplash } from './helpers/splash';

/**
 * render_and_engine_perf T14 — D10's touch-attach half. `hooks/useLongPressPreview.ts`
 * (hold a card still for 450ms -> screen-centred preview; a short tap keeps its normal
 * meaning; a press that opened the preview swallows the click that follows) is wired on
 * three more sites: `PlayerCard`'s `compact` branch, `RosterSidebar.tsx`'s
 * `RosterPlayerRow` (the deck builder's bench row) and `DepthSlotColumn.tsx`'s
 * `StarterFront` (a placed starter). This spec proves all three the same way the hook
 * itself works: the handlers only ever look at the event TYPE (touchstart/touchmove/
 * touchend), never at touch coordinates, so a bare `locator.dispatchEvent('touchstart')`
 * exercises them identically to a real finger — meaningful on both `chromium` (no real
 * touch hardware; the events are synthetic either way) and `phone-landscape`.
 *
 * `PlayerCard`'s `compact` branch has exactly one reachable caller in the app
 * (`DepthSlotColumn.tsx:275`, a filled Bench 1-3 slot) — grep confirms `PlayCard`'s own,
 * unrelated `compact` branch is the only other `compact` prop in the codebase, and no
 * route renders a bare compact `PlayerCard` outside a depth column. The "starter" and
 * "compact PlayerCard" cases below are therefore covered by ONE seeded roster: two
 * players stacked in the same column, slot 0 (starter) and slot 1 (Bench 1, compact).
 *
 * Unlike a real touch input, a JS-dispatched touchstart/touchend pair does NOT make the
 * browser synthesize a trailing `click` — that synthesis only happens for genuine OS
 * touch events the browser's own input pipeline processes. So the "swallowed click"
 * assertions below dispatch the touch pair, THEN issue a real `.click()` (Playwright's
 * mouse click) to stand in for that trailing tap, and check it did nothing — exactly the
 * scenario `onClickCapture` exists for.
 */

const HOLD_MS = 650; // hooks/useLongPressPreview.ts LONG_PRESS_MS = 450; comfortably past it.
const SHORT_MOVE_WAIT_MS = 100; // well under 450ms, before dispatching touchmove.
// `PlayerCardBack`'s "Season Averages" header — unconditionally rendered, and at every
// site this spec touches the ONLY way a `PlayerCardBack` mounts is inside the portalled
// `PlayerHoverPreview` (none of RosterPlayerRow/StarterFront/compact PlayerCard ever flip
// or render a back face of their own).
const PREVIEW_TEXT = 'Season Averages';

const ROSTER_ID = 'e2e-long-press';
const allCards = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'src', 'data', 'cards.json'), 'utf-8'),
) as Array<{ id: string; type: string }>;
const [starterFixture, benchFixture] = allCards.filter(c => c.type === 'Player');

/**
 * Seeds a roster with two players already stacked in one depth column (PG slot 0 =
 * starter, slot 1 = Bench 1). `initBuilderState` (engine/deckbuilder.ts) loads a saved
 * `depthChartOrder` verbatim with no eligibility re-check, so any two distinct player ids
 * work regardless of real position — this only needs a stable, non-flaky DOM shape, not a
 * game-valid lineup.
 */
async function seedStackedRoster(page: Page) {
  await page.goto('/rosters');
  await expect(page.getByText('Loading Rosters…')).toHaveCount(0, { timeout: 20_000 });
  await page.evaluate(async ({ rosterId, starter, bench }) => {
    const me = (await fetch('/api/auth/me').then(r => r.json())) as { id: string };
    const roster = {
      id: rosterId,
      ownerId: me.id,
      name: 'E2E long-press',
      timestamp: '2026-09-21T00:00:00.000Z',
      draftedCards: [starter, bench],
      depthChartOrder: { PG: [(starter as { id: string }).id, (bench as { id: string }).id], SG: [], SF: [], PF: [], C: [] },
      activePlays: [],
      playAssignments: [],
      archetypes: {},
      version: 2,
      sessionId: null,
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('MagicBallDB');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('rosters', 'readwrite');
      tx.objectStore('rosters').put(roster);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { rosterId: ROSTER_ID, starter: starterFixture, bench: benchFixture });
}

async function gotoStackedRoster(page: Page) {
  await seedStackedRoster(page);
  await page.goto(`/roster/${ROSTER_ID}`);
  await expect(page.getByText('Loading Roster...')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);
}

async function gotoDeckbuilder(page: Page) {
  await page.goto('/deckbuilder-test');
  await expect(page.getByText('Loading Deckbuilder...')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);
}

/** Regular/wide tier: the Roster sidebar starts as a 48px strip (docked state defaults
 *  off, `useDockLayout`'s `ROSTER_DOCK_KEY`) — expand it once. */
async function openRosterSidebar(page: Page) {
  const expandButton = page.getByRole('button', { name: 'Expand roster' });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }
}

function previewLocator(page: Page) {
  return page.getByText(PREVIEW_TEXT);
}

function eligibleEmptySlot(page: Page) {
  // Filled slots (`depth-slot-filled-...`) also match the `depth-slot-` prefix but their
  // text content is a player card, never "place here" — the `hasText` filter alone is
  // enough to exclude them.
  return page.locator('[data-testid^="depth-slot-"]', { hasText: /place here/i });
}

async function pressAndHold(locator: Locator, page: Page) {
  await locator.dispatchEvent('touchstart');
  await page.waitForTimeout(HOLD_MS);
}

async function releasePress(locator: Locator) {
  await locator.dispatchEvent('touchend');
}

test.describe('Long-press preview (touch has no hover) — T14', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
  });

  test.describe('bench row — RosterSidebar.tsx RosterPlayerRow', () => {
    test('long-press shows the preview and swallows the click that follows', async ({ page }) => {
      await gotoDeckbuilder(page);
      await openRosterSidebar(page);
      const row = page.getByTestId('roster-player-row').first();
      await expect(row).toBeVisible();

      await pressAndHold(row, page);
      await expect(previewLocator(page)).toBeVisible();

      await releasePress(row);
      await expect(previewLocator(page)).toBeHidden();

      // The trailing tap a real touch would fire is swallowed: no roster player gets
      // selected, so no depth-chart slot lights up "place here".
      await row.click();
      await expect(eligibleEmptySlot(page)).toHaveCount(0);

      // The swallow is one-shot: a second, ordinary click on the same row still selects.
      await row.click();
      await expect(eligibleEmptySlot(page).first()).toBeVisible();
    });

    test('short tap still selects the player (place-here slot lights up)', async ({ page }) => {
      await gotoDeckbuilder(page);
      await openRosterSidebar(page);
      const row = page.getByTestId('roster-player-row').first();
      await expect(row).toBeVisible();

      await row.dispatchEvent('touchstart');
      await row.dispatchEvent('touchend');
      await row.click();

      await expect(eligibleEmptySlot(page).first()).toBeVisible();
    });

    test('touchmove before 450ms cancels the press — no preview, next tap still works', async ({ page }) => {
      await gotoDeckbuilder(page);
      await openRosterSidebar(page);
      const row = page.getByTestId('roster-player-row').first();
      await expect(row).toBeVisible();

      await row.dispatchEvent('touchstart');
      await page.waitForTimeout(SHORT_MOVE_WAIT_MS);
      await row.dispatchEvent('touchmove');
      await page.waitForTimeout(HOLD_MS);
      await expect(previewLocator(page)).toBeHidden();

      await row.dispatchEvent('touchend');
      // Not swallowed: the cancelled press never armed `fired`, so the next tap is a
      // normal one.
      await row.click();
      await expect(eligibleEmptySlot(page).first()).toBeVisible();
    });
  });

  test.describe('starter — DepthSlotColumn.tsx StarterFront', () => {
    test('long-press shows the preview and does not send the starter back to Roster', async ({ page }) => {
      await gotoStackedRoster(page);
      const starterFront = page.getByTestId('starter-front');
      await expect(starterFront).toBeVisible();
      await expect(page.locator('[data-testid^="depth-slot-filled-"]')).toHaveCount(2);

      await pressAndHold(starterFront, page);
      await expect(previewLocator(page)).toBeVisible();

      await releasePress(starterFront);
      await expect(previewLocator(page)).toBeHidden();

      // Swallowed: the starter (a click on a filled slot sends it back to Roster,
      // `DeckBuilder.tsx`'s `handlePlacedPlayerClick`/`sendPlacedToRoster`) is still there.
      await starterFront.click();
      await expect(page.locator('[data-testid^="depth-slot-filled-"]')).toHaveCount(2);
      await expect(starterFront).toBeVisible();
    });

    test('short tap still sends the starter back to Roster', async ({ page }) => {
      await gotoStackedRoster(page);
      await expect(page.locator('[data-testid^="depth-slot-filled-"]')).toHaveCount(2);
      const starterFront = page.getByTestId('starter-front');

      await starterFront.dispatchEvent('touchstart');
      await starterFront.dispatchEvent('touchend');
      await starterFront.click();

      await expect(page.locator('[data-testid^="depth-slot-filled-"]')).toHaveCount(1);
    });
  });

  test.describe('compact PlayerCard — PlayerCard.tsx compact branch (Bench 1 slot)', () => {
    test('long-press shows the preview and does not send the player back to Roster', async ({ page }) => {
      await gotoStackedRoster(page);
      const compactCard = page.getByTestId('player-card-compact');
      await expect(compactCard).toBeVisible();

      await pressAndHold(compactCard, page);
      await expect(previewLocator(page)).toBeVisible();

      await releasePress(compactCard);
      await expect(previewLocator(page)).toBeHidden();

      await compactCard.click();
      // Still there: a swallowed click never reached `handlePlacedPlayerClick`.
      await expect(page.getByTestId('player-card-compact')).toHaveCount(1);
    });

    test('short tap still sends the player back to Roster', async ({ page }) => {
      await gotoStackedRoster(page);
      const compactCard = page.getByTestId('player-card-compact');
      await expect(compactCard).toBeVisible();

      await compactCard.dispatchEvent('touchstart');
      await compactCard.dispatchEvent('touchend');
      await compactCard.click();

      await expect(page.getByTestId('player-card-compact')).toHaveCount(0);
    });
  });
});
