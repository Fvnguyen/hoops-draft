import { test, expect } from '@playwright/test';
import { dismissSplash } from './helpers/splash';
import fs from 'fs';
import path from 'path';

/**
 * render_and_engine_perf T13/D11: the /rosters page's 5-card starter summary used to
 * render the full flip `PlayerCard` (front + back face + long-press/hover-preview
 * plumbing) for every starter of every saved roster, even though nothing on this page
 * ever flips them (no `onClick` was wired to that `PlayerCard`, hover-flip just showed
 * the back and nothing read that state). It now renders `PlayerCardFront` directly.
 * This spec seeds one full 5-position roster (same IndexedDB-seeding approach as
 * tests/roster-reopen.spec.ts) and checks: the 5 starter cards render, none of them ever
 * mount a back face (`PlayerCardBack`'s "Season Averages" text is a concrete marker of
 * that — it only exists once a back face is in the DOM), and the page loads clean.
 */
const ROSTER_ID = 'e2e-rosters-page-d11';

const allCards = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'src', 'data', 'cards.json'), 'utf-8'),
) as { id: string; player: { name: string; position: string } }[];

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function starterFor(position: (typeof POSITIONS)[number]) {
  const card = allCards.find((c) => c.player.position.split(/[/-]/).includes(position));
  if (!card) throw new Error(`No fixture card found for position ${position}`);
  return card;
}

test('a saved roster shows its 5 starter summary cards with no flip wrapper or back face', async ({ page }) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const starters = POSITIONS.map(starterFor);

  // Any authenticated route first: StorageProvider opens (and migrates) MagicBallDB.
  await page.goto('/rosters');
  await expect(page.getByText('Loading Rosters…')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);

  const playerNames = await page.evaluate(
    async ({ rosterId, starters, positions }) => {
      const me = await fetch('/api/auth/me').then((r) => r.json()) as { id: string };
      const play = { type: 'Play', id: 'basic-offense-rosters-page', name: 'Basic Offense', rarity: 'Common', playCategory: 'basic', mechanicText: '', badges: [], imageUrl: '' };
      const depthChartOrder: Record<string, string[]> = {};
      positions.forEach((pos, i) => { depthChartOrder[pos] = [starters[i].id]; });
      const roster = {
        id: rosterId,
        ownerId: me.id,
        name: 'D11 rosters-page spec',
        timestamp: new Date().toISOString(),
        draftedCards: [...starters.map((c: unknown) => ({ ...(c as object), type: 'Player' })), play],
        depthChartOrder,
        activePlays: [play.id],
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
      return starters.map((c: { player: { name: string } }) => c.player.name);
    },
    { rosterId: ROSTER_ID, starters, positions: POSITIONS as unknown as string[] },
  );

  await page.goto('/rosters');
  await expect(page.getByText('Loading Rosters…')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);

  // Not `exact: true`: the heading also contains a "#N" rank span as a sibling node, so
  // the roster name is a substring of the heading's full text, not the whole of it.
  await expect(page.getByText('D11 rosters-page spec')).toBeVisible();

  // The 5 starter names are visible (one card each, PG through C). This is a fresh,
  // isolated test context (Playwright gives each test its own browser context/IndexedDB),
  // so this seeded roster is the only content on the page.
  for (const name of playerNames) {
    await expect(page.getByText(name).first()).toBeVisible();
  }

  // Concrete DOM evidence that no flip wrapper/back face exists: `PlayerCardBack` only
  // ever renders once mounted (hover-flip or a fine pointer), and its body always
  // includes this "Season Averages" heading. `PlayerCardFront`-only rendering never
  // mounts it, hovering or not.
  await expect(page.getByText('Season Averages')).toHaveCount(0);

  const firstStarter = page.getByText(playerNames[0]).first();
  await firstStarter.hover();
  await page.waitForTimeout(400); // longer than PlayerCard's old flip transition (300ms)
  await expect(page.getByText('Season Averages')).toHaveCount(0);

  expect(pageErrors, `pageerror on /rosters: ${pageErrors.map((e) => e.message).join('; ')}`).toEqual([]);
  expect(consoleErrors, `console.error on /rosters: ${consoleErrors.join('; ')}`).toEqual([]);
});
