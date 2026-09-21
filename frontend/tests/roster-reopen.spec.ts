import { test, expect } from '@playwright/test';
import { dismissSplash } from './helpers/splash';

/**
 * Regression: opening a saved roster wiped every play-role assignment. The builder seeded
 * its state from an effect, and the activePlays -> playAssignments sync effect ran in the
 * same commit while the play slots were still empty, so the saved roles were reduced to
 * `{}` and the next Save persisted inactive plays. `initBuilderState` (engine/deckbuilder)
 * now seeds everything at mount; this spec opens a seeded roster and checks the role is
 * still filled.
 */
const ROSTER_ID = 'e2e-roster-reopen';

test('a saved roster reopens with its play-role assignments intact', async ({ page }) => {
  // Any authenticated route first: StorageProvider opens (and migrates) MagicBallDB.
  await page.goto('/rosters');
  await expect(page.getByText('Loading Rosters…')).toHaveCount(0, { timeout: 20_000 });

  const playerName = await page.evaluate(async (rosterId) => {
    const me = await fetch('/api/auth/me').then(r => r.json()) as { id: string };
    const cards = await fetch('/api/cards').then(r => r.json()) as { id: string; player: { name: string; position: string } }[];
    const guard = cards.find(c => c.player.position.split(/[/-]/).includes('PG'))!;
    const play = { type: 'Play', id: 'basic-offense-e2e', name: 'Basic Offense', rarity: 'Common', playCategory: 'basic', mechanicText: '', badges: [], imageUrl: '' };
    const roster = {
      id: rosterId,
      ownerId: me.id,
      name: 'E2E reopen',
      timestamp: '2026-09-21T00:00:00.000Z',
      draftedCards: [{ ...guard, type: 'Player' }, play],
      depthChartOrder: { PG: [guard.id], SG: [], SF: [], PF: [], C: [] },
      activePlays: [play.id],
      playAssignments: [{ cardId: play.id, playId: 'basic-offense', roles: { featured: guard.id } }],
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
    return guard.player.name;
  }, ROSTER_ID);

  await page.goto(`/roster/${ROSTER_ID}`);
  await expect(page.getByText('Loading Roster...')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);

  // "Clear role" only renders on a FILLED role row; an emptied one shows "Assign".
  await expect(page.getByRole('button', { name: 'Clear role' })).toHaveCount(1);
  await expect(page.getByText(playerName).first()).toBeVisible();
});
