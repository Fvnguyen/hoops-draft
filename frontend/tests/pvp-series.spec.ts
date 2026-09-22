import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { dismissSplash, clickPastSplash } from './helpers/splash';
import { getAllCards } from '@/engine/cards';
import { PLAY_CATALOG } from '@/engine/plays';
import { buildBotRoster } from '@/engine/deckbuilder';
import { simulateMatchGame } from '@/lib/matchSimulate';
import type { Match } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import type { DraftCard } from '@/engine/types';

/**
 * pvp_series T7: two browser contexts play a full best-of-seven series from a fixture row
 * seeded directly at status 'series' with two locked rosters (mirrors
 * `mobile-audit.spec.ts`'s "playoffs series" fixture builder) — the draft itself is
 * `pvp-draft.spec.ts`'s job, not this one's. Games 1-2 and the sideboard go through the
 * real UI for both players (coin flip, the strip, the game page's fast-forward "End"
 * control, the front office trade/hold flow); once the sideboard has resumed the series,
 * later games are also watched through the UI (this repo's games simulate almost
 * instantly, so there is no need to shortcut via the advance endpoint directly — doing so
 * would skip real product code this plan needs proven).
 *
 * Needs `202609220002_match_void.sql` applied and the second E2E account (see
 * `playoffs-invite.spec.ts`). Matches between the two accounts are deleted before and
 * after so runs never pile up.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

async function myId(page: Page): Promise<{ id: string; display_name: string }> {
  const res = await page.request.get('/api/auth/me');
  return res.json();
}

async function deleteMatchesBetween(a: string, b: string) {
  if (!admin) return;
  const { error } = await admin
    .from('matches')
    .delete()
    .or(`and(host_id.eq.${a},guest_id.eq.${b}),and(host_id.eq.${b},guest_id.eq.${a})`);
  if (error) throw error;
}

let cachedPlayers: DraftCard[] | null = null;
function players(): DraftCard[] {
  if (!cachedPlayers) cachedPlayers = getAllCards();
  return cachedPlayers;
}

/** Same fixture shape as `mobile-audit.spec.ts`'s "playoffs series" block: 21 player
 *  cards + 3 basic plays, run through `buildBotRoster` for a complete depth chart. */
function draftedFor(offset: number): DraftCard[] {
  return [...players().slice(offset, offset + 21), ...PLAY_CATALOG.slice(0, 3)];
}

function rosterFrom(id: string, name: string, drafted: DraftCard[]): SavedRoster {
  const built = buildBotRoster(drafted);
  return {
    id,
    name,
    timestamp: new Date().toISOString(),
    draftedCards: drafted,
    depthChartOrder: built.depthChart,
    activePlays: built.activePlays,
    playAssignments: built.playAssignments,
    archetypes: built.archetypes,
    version: built.version ?? 2,
    sessionId: null,
  };
}

type FixtureRow = Omit<Match, 'games' | 'created_at' | 'updated_at'>;

function buildFixtureBase(hostId: string, guestId: string, seed: number, id: string): FixtureRow {
  const rosterA = rosterFrom(`${id}-roster-a`, 'Host Roster', draftedFor(0));
  const rosterB = rosterFrom(`${id}-roster-b`, 'Guest Roster', draftedFor(60));
  const now = new Date().toISOString();
  return {
    id, seed, host_id: hostId, guest_id: guestId, status: 'series' as const,
    host_picks: draftedFor(0).map((c) => c.id), guest_picks: draftedFor(60).map((c) => c.id),
    host_autopicks: [], guest_autopicks: [], pick_deadline: null,
    host_roster: rosterA, guest_roster: rosterB,
    host_locked_at: now, guest_locked_at: now,
    sideboard: {}, host_seen: null, guest_seen: null,
    host_seen_at: now, guest_seen_at: now, winner_id: null, void_reason: null,
    version: 1,
  };
}

/** Postgres jsonb stores keys in its own order (shortest first). The engine used to depend
 *  on depth-chart key order, so this search simulated a key-sorted copy to predict what the
 *  server would play; `buildTeamInfo` now canonicalises the depth chart
 *  (`tests/unit/depth-chart-key-order.test.ts`), so the sort is belt and braces. */
function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return value;
}

/** Finds a seed where the host wins games 1 AND 2 (a clean 2-0, so the sideboard opens
 *  right after game 2) by simulating in-process with `simulateMatchGame` — no DB writes,
 *  exactly the D1 helper both `mobile-audit.spec.ts` and the real advance route use, over
 *  a key-sorted copy of the fixture (see `sortKeysDeep`) so the predicted result matches
 *  what the server simulates from the DB-loaded row. */
function findSweepSeed(hostId: string, guestId: string): number {
  for (let seed = 1; seed < 5000; seed++) {
    const base = sortKeysDeep(buildFixtureBase(hostId, guestId, seed, 'seed-search'));
    const m1 = { ...base, games: [] } as unknown as Match;
    const g1 = simulateMatchGame(m1, 1);
    if (g1.score.host <= g1.score.guest) continue;
    const m2 = { ...base, games: [g1] } as unknown as Match;
    const g2 = simulateMatchGame(m2, 2);
    if (g2.score.host > g2.score.guest) return seed;
  }
  throw new Error('pvp-series fixture: no seed in range gave the host a 2-0 sweep');
}

async function fetchRow(id: string): Promise<Match> {
  const { data, error } = await admin!.from('matches').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Match;
}

/** Coin flip plays once per viewer — click through it (D5's "Let's go", enabled once the
 *  reveal animation finishes) so both contexts reach the series strip. */
async function passCoinFlip(page: Page) {
  await dismissSplash(page);
  const goBtn = page.getByRole('button', { name: /let's go/i });
  if (await goBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(goBtn).toBeEnabled({ timeout: 5000 });
    await clickPastSplash(page, () => goBtn.click());
  }
  await expect(page.getByRole('heading', { name: 'Series' })).toBeVisible({ timeout: 15_000 });
}

/** Watches series game `n` to the end via the fastest route GameView offers — "Tip Off"
 *  then "End" (D6's "show the result now", not a speed setting) — rather than waiting out
 *  real-time playback. Waits for the Final banner (onCompletionChange has fired, so `seen`
 *  and `/advance` are already in flight) before returning. */
async function watchGameToEnd(page: Page, matchId: string, n: number) {
  await page.goto(`/playoffs/${matchId}/game/${n}`);
  await dismissSplash(page);
  const tipOff = page.getByRole('button', { name: /^Tip Off$/ });
  await expect(tipOff).toBeVisible({ timeout: 20_000 });
  await clickPastSplash(page, () => tipOff.click());
  const endBtn = page.getByRole('button', { name: /^End$/ });
  await expect(endBtn).toBeVisible({ timeout: 10_000 });
  await endBtn.click();
  await expect(page.getByText(/^Final:/)).toBeVisible({ timeout: 15_000 });
  // Let the `seen` RPC + `/advance` fetch (fired from onCompletionChange) settle before
  // the caller navigates on — both are fire-and-forget network calls, not awaited by the UI.
  await page.waitForTimeout(1200);
}

/** Reads the strip's per-game scores/home marks for a fully-loaded `/playoffs/[id]` page,
 *  from `me`'s point of view — used to assert both contexts see the same story. */
async function stripSummary(page: Page): Promise<string[]> {
  const slots = page.locator('[data-game-slot]');
  const count = await slots.count();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push((await slots.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  }
  return out;
}

async function gotoSeriesPage(page: Page, matchId: string) {
  await page.goto(`/playoffs/${matchId}`);
  await passCoinFlip(page);
}

test.describe('pvp series', () => {
  const authFile2 = 'tests/.auth/user2.json';

  test.skip(
    !process.env.E2E_TEST_EMAIL_2 || !process.env.E2E_TEST_PASSWORD_2 || !admin,
    'Set E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 (and the Supabase keys) and run `npm run bootstrap:e2e`.',
  );

  test.beforeAll(async () => {
    if (!admin) return;
    const { error } = await admin.from('matches').select('void_reason').limit(1);
    test.skip(!!error, `void_reason column missing — 202609220002_match_void.sql not applied: ${error?.message}`);
  });

  test('coin flip, two watched games, a sideboard trade, and a 4-x result on both profiles', async ({ page, browser }) => {
    test.skip(!fs.existsSync(authFile2), `${authFile2} missing: auth2.setup.ts did not run.`);
    test.setTimeout(600_000);

    const contextB = await browser.newContext({ storageState: authFile2 });
    const pageB = await contextB.newPage();

    await page.goto('/');
    await pageB.goto('/');
    const [a, b] = await Promise.all([myId(page), myId(pageB)]);
    await deleteMatchesBetween(a.id, b.id);

    const matchId = `e2e-pvp-series-${Date.now()}`;

    try {
      const seed = findSweepSeed(a.id, b.id);
      const base = buildFixtureBase(a.id, b.id, seed, matchId);
      const { error: insertError } = await admin!.from('matches').insert({ ...base, games: [] });
      if (insertError) throw insertError;

      // ── Coin flip + strip, both contexts ──────────────────────────────────
      await gotoSeriesPage(page, matchId);
      await gotoSeriesPage(pageB, matchId);

      // Visiting the series page nudges /advance — with no games yet and both rosters
      // locked, it simulates game 1 by itself (D2 rule 3). Give the debounced POST a
      // moment, then reload both to see game 1 land in the strip.
      await page.waitForTimeout(1500);
      await page.reload();
      await passCoinFlip(page);
      await pageB.reload();
      await passCoinFlip(pageB);

      let row = await fetchRow(matchId);
      expect(row.games.map((g) => g.game)).toEqual([1]);

      // ── Reveal gate: before tip-off on game 1, the opponent's identity/mechanics are
      //    hidden (D3) — check from A's page, whose opponent is host or guest depending
      //    on who's home; either way the Away/Home "Mechanics" block for the OTHER side
      //    must read "Hidden until the box score.", never real content.
      await page.goto(`/playoffs/${matchId}/game/1`);
      await dismissSplash(page);
      await expect(page.getByRole('button', { name: /^Tip Off$/ })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Hidden until the box score.')).toBeVisible({ timeout: 10_000 });
      // The viewer's OWN mechanics are never hidden — exactly one hidden block on screen.
      await expect(page.getByText('Hidden until the box score.')).toHaveCount(1);

      // ── Watch game 1, both contexts ────────────────────────────────────────
      await watchGameToEnd(page, matchId, 1);
      await watchGameToEnd(pageB, matchId, 1);

      // After both have seen game 1, the second `seen`'s /advance call simulates game 2
      // immediately (D2 rule 4) — poll briefly for it to land.
      for (let guard = 0; guard < 20; guard++) {
        row = await fetchRow(matchId);
        if (row.games.length >= 2) break;
        await page.waitForTimeout(500);
      }
      expect(row.games.map((g) => g.game)).toEqual([1, 2]);
      // The fixture seed was chosen so the host (A) sweeps 1-2 — sideboard opens now.
      expect(row.games[0].score.host).toBeGreaterThan(row.games[0].score.guest);
      expect(row.games[1].score.host).toBeGreaterThan(row.games[1].score.guest);

      // ── Both watch game 2 too (it was auto-simulated, not yet watched) so the strip
      //    agrees on both sides before the sideboard. ─────────────────────────────────
      await watchGameToEnd(page, matchId, 2);
      await watchGameToEnd(pageB, matchId, 2);

      for (let guard = 0; guard < 20; guard++) {
        row = await fetchRow(matchId);
        if (row.status === 'sideboard') break;
        await page.waitForTimeout(500);
      }
      expect(row.status).toBe('sideboard');

      // ── Both strips agree after games 1-2 ──────────────────────────────────
      await page.goto(`/playoffs/${matchId}`);
      await dismissSplash(page);
      await pageB.goto(`/playoffs/${matchId}`);
      await dismissSplash(pageB);
      const stripA = await stripSummary(page);
      // B's own strip reads scores from B's side (mirrored), so compare the raw row
      // instead of DOM text between the two contexts — the row itself is the shared
      // truth both UIs must be consistent with. Text renders uppercase via CSS
      // (`uppercase tracking-wide`), so match case-insensitively.
      expect(stripA.slice(0, 2).join('|')).toMatch(/watch/i);
      const stripB = await stripSummary(pageB);
      expect(stripB.slice(0, 2).join('|')).toMatch(/watch/i);

      // ── Sideboard: A (host) trades, B (guest) holds ────────────────────────
      await expect(page.getByText('Sideboard', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText('Sideboard', { exact: true })).toBeVisible({ timeout: 15_000 });

      // B holds: press Lock straight away.
      const lockBtnB = pageB.getByRole('button', { name: /^Lock$/ });
      await expect(lockBtnB).toBeVisible({ timeout: 10_000 });
      await clickPastSplash(pageB, () => lockBtnB.click());
      await expect(pageB.locator('[data-waiting-for]')).toBeVisible({ timeout: 15_000 });

      // A trades: drop the first roster row, take the first offer.
      const tradeBtn = page.getByRole('button', { name: /^Make a trade/ });
      await expect(tradeBtn).toBeVisible({ timeout: 10_000 });
      await clickPastSplash(page, () => tradeBtn.click());
      await expect(page.getByText('Trade deadline')).toBeVisible({ timeout: 10_000 });

      const rosterRowsInTrade = page.locator('div[role="button"]').filter({
        has: page.getByText(/^(PG|SG|SF|PF|C)$/, { exact: true }),
      });
      const firstRosterRow = rosterRowsInTrade.first();
      await expect(firstRosterRow).toBeVisible({ timeout: 10_000 });
      const droppedName = (await firstRosterRow.innerText()).trim();
      await firstRosterRow.click();

      // The trade pack is a real `PackOpener` (unlike the pvp draft room's packs) — it
      // opens sealed and needs a click before any card is selectable.
      const openPackBtn = page.getByRole('button', { name: /^Five offers on the table$/ });
      await expect(openPackBtn).toBeVisible({ timeout: 10_000 });
      await openPackBtn.click();

      const firstOffer = page.locator('[role="button"][aria-label^="Select "]').first();
      await expect(firstOffer).toBeVisible({ timeout: 15_000 });
      const acquiredLabel = (await firstOffer.getAttribute('aria-label')) ?? '';
      const acquiredName = acquiredLabel.replace(/^Select /, '');
      await clickPastSplash(page, () => firstOffer.click());
      const confirmTrade = page.getByRole('button', { name: /^Confirm pick$/ });
      await expect(confirmTrade).toBeVisible({ timeout: 10_000 });
      await confirmTrade.click();
      void droppedName;

      // A trade forces the lineup editor open (the acquired card lands on the bench) —
      // place it on any eligible slot the click lights up, then Save. The roster panel
      // may be a collapsed strip/drawer trigger at this viewport (same as the deck
      // builder's own build screen — `pvp-draft.spec.ts`'s `buildAndLock`), so open it
      // first or `roster-player-row` never renders and a click on it would hang forever
      // (no default Playwright action timeout is configured for this repo).
      await expect(page.getByText('Close without saving')).toBeVisible({ timeout: 15_000 });
      const rosterDrawer = page.getByRole('button', { name: /^Roster,/ });
      const expandRoster = page.getByRole('button', { name: 'Expand roster' });
      if (await rosterDrawer.isVisible().catch(() => false)) await rosterDrawer.click();
      else if (await expandRoster.isVisible().catch(() => false)) await expandRoster.click();

      const rosterRows = page.getByTestId('roster-player-row');
      await expect(rosterRows.first()).toBeVisible({ timeout: 10_000 });
      const rowToPlace = rosterRows.filter({ hasText: acquiredName }).first();
      const anyEligibleRow = (await rowToPlace.count()) > 0 ? rowToPlace : rosterRows.first();
      await anyEligibleRow.click();
      const openSlot = page.locator('[data-testid^="depth-slot-"]', { hasText: /place here/i }).first();
      const slotLit = await openSlot.isVisible({ timeout: 3000 }).catch(() => false);
      if (slotLit) {
        await openSlot.click();
      } else {
        // The acquired card wasn't eligible for the one open slot — fall back to trying
        // every unrostered row against every open slot (same greedy approach
        // `pvp-draft.spec.ts` uses to fill a roster from scratch) until the roster reads
        // complete. The acquired card may end up on the bench in this fallback path.
        for (let guard = 0; guard < 15; guard++) {
          const saveProbe = page.getByRole('button', { name: /^Save/ });
          if (await saveProbe.isEnabled().catch(() => false)) break;
          const rows = page.getByTestId('roster-player-row');
          const rowCount = await rows.count();
          let placed = false;
          for (let i = 0; i < rowCount; i++) {
            const row = rows.nth(i);
            if (!(await row.isVisible().catch(() => false))) continue;
            await row.click();
            const slot = page.locator('[data-testid^="depth-slot-"]', { hasText: /place here/i }).first();
            if (await slot.isVisible({ timeout: 300 }).catch(() => false)) {
              await slot.click();
              placed = true;
              break;
            }
            await row.click();
          }
          if (!placed) break;
        }
      }
      const saveBtn = page.getByRole('button', { name: /^Save/ });
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
      await clickPastSplash(page, () => saveBtn.click());

      // Back at the quotes screen — lock.
      const lockBtnA = page.getByRole('button', { name: /^Lock$/ });
      await expect(lockBtnA).toBeVisible({ timeout: 10_000 });
      await clickPastSplash(page, () => lockBtnA.click());

      // ── Both locked: series resumes ────────────────────────────────────────
      for (let guard = 0; guard < 20; guard++) {
        row = await fetchRow(matchId);
        if (row.status === 'series' && row.sideboard.host && row.sideboard.guest) break;
        await page.waitForTimeout(500);
      }
      expect(row.status).toBe('series');
      expect(row.sideboard.host).toBeTruthy();
      expect(row.sideboard.host!.trade).toBeTruthy();
      expect(row.sideboard.guest).toBeTruthy();
      // jsonb round-trips an absent optional field as `null`, not `undefined`.
      expect(row.sideboard.guest!.trade ?? null).toBeNull();
      const acquiredCardId = row.sideboard.host!.trade!.acquiredCardId;
      expect(row.sideboard.host!.roster.draftedCards.some((c) => c.id === acquiredCardId)).toBe(true);

      // ── Play out the rest of the series: watch every remaining game as it lands,
      //    from both sides, until the match is 'done'. ──────────────────────────────
      for (let guard = 0; guard < 20 && row.status !== 'done'; guard++) {
        // Nudge /advance (a visit does this too, but be explicit and fast).
        await page.goto(`/playoffs/${matchId}`);
        await dismissSplash(page);
        await page.request.post(`/api/match/${matchId}/advance`).catch(() => {});
        await page.waitForTimeout(800);
        row = await fetchRow(matchId);
        if (row.status === 'done') break;

        const lastGame = row.games.length;
        const hostSeenLast = (row.host_seen?.game ?? 0) >= lastGame;
        const guestSeenLast = (row.guest_seen?.game ?? 0) >= lastGame;
        if (!hostSeenLast) await watchGameToEnd(page, matchId, lastGame);
        if (!guestSeenLast) await watchGameToEnd(pageB, matchId, lastGame);
        row = await fetchRow(matchId);
      }

      expect(row.status).toBe('done');
      expect(row.winner_id).toBeTruthy();
      const state = row.games.reduce(
        (acc, g) => (g.score.host > g.score.guest ? { ...acc, host: acc.host + 1 } : { ...acc, guest: acc.guest + 1 }),
        { host: 0, guest: 0 },
      );
      expect(Math.max(state.host, state.guest)).toBe(4);

      // The trade landed: from game 3 on (the sideboard rosters), the acquired player
      // shows up in the box score of whichever side is host — A traded, A is host.
      const gamesFrom3 = row.games.filter((g) => g.game >= 3);
      expect(gamesFrom3.length).toBeGreaterThan(0);
      for (const g of gamesFrom3) {
        expect(g.box.host.some((b) => b.playerId === acquiredCardId)).toBe(true);
      }

      // ── Results screen, both sides ──────────────────────────────────────────
      await page.goto(`/playoffs/${matchId}`);
      await dismissSplash(page);
      await pageB.goto(`/playoffs/${matchId}`);
      await dismissSplash(pageB);

      const aIsWinner = row.winner_id === a.id;
      await expect(page.getByRole('heading', { name: aIsWinner ? 'Series won' : 'Series lost' })).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByRole('heading', { name: aIsWinner ? 'Series lost' : 'Series won' })).toBeVisible({ timeout: 15_000 });

      if (aIsWinner) {
        await expect(page.getByText(/can call a rematch/i)).toBeVisible();
        await expect(pageB.getByRole('button', { name: /^Rematch$/ })).toBeVisible();
      } else {
        await expect(pageB.getByText(/can call a rematch/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /^Rematch$/ })).toBeVisible();
      }

      // Same line from each side's perspective: winner's score first on their own view.
      const finalA = (await page.getByText(/^\d+-\d+$/).first().innerText()).trim();
      const finalB = (await pageB.getByText(/^\d+-\d+$/).first().innerText()).trim();
      const [fa1, fa2] = finalA.split('-').map(Number);
      const [fb1, fb2] = finalB.split('-').map(Number);
      expect(fa1).toBe(fb2);
      expect(fa2).toBe(fb1);

      // ── Profile menu line, both accounts ────────────────────────────────────
      const profileBtnA = page.getByRole('button', { name: 'Profile menu' }).first();
      await clickPastSplash(page, () => profileBtnA.click());
      const wantA = aIsWinner ? '1-0' : '0-1';
      await expect(page.getByText(`Playoffs: ${wantA} series`)).toBeVisible({ timeout: 10_000 });

      const profileBtnB = pageB.getByRole('button', { name: 'Profile menu' }).first();
      await clickPastSplash(pageB, () => profileBtnB.click());
      const wantB = aIsWinner ? '0-1' : '1-0';
      await expect(pageB.getByText(`Playoffs: ${wantB} series`)).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteMatchesBetween(a.id, b.id);
      await contextB.close();
    }
  });
});
