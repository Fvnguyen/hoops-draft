import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { dismissSplash, clickPastSplash } from './helpers/splash';
import { replayDraft, type HumanPicks, type DraftState } from '@/engine/draftReplay';
import { getAllCards } from '@/engine/cards';
import { PLAY_CATALOG as playsDB } from '@/engine/plays';

/**
 * pvp_draft T3/T4: two browser contexts draft a full Playoffs match (24 picks each), build
 * a roster and lock it, and reach `series`. Needs the `202609220002_match_void.sql`
 * migration (applied to production 2026-09-22 — `void_reason` on `matches`) and the second
 * E2E account (`playoffs-invite.spec.ts`'s prerequisites: `E2E_TEST_EMAIL_2`/
 * `E2E_TEST_PASSWORD_2`, `npm run bootstrap:e2e`).
 *
 * The match row is created directly with the service-role client as fixture setup (status
 * 'drafting', a fixed seed) rather than going through `/playoffs/new` + the bell — that
 * invite flow is `playoffs-invite.spec.ts`'s job, not this one's.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

type Row = {
  id: string;
  seed: number;
  host_id: string;
  guest_id: string;
  status: string;
  host_picks: string[];
  guest_picks: string[];
  host_autopicks: number[];
  guest_autopicks: number[];
  pick_deadline: string | null;
  host_locked_at: string | null;
  guest_locked_at: string | null;
  guest_seen_at: string | null;
  version: number;
};

let cachedPlayers: ReturnType<typeof getAllCards> | null = null;
function players() {
  if (!cachedPlayers) cachedPlayers = getAllCards();
  return cachedPlayers;
}

function replayRow(row: Row): DraftState {
  const humanPicks: HumanPicks = { 'human-0': row.host_picks, 'human-4': row.guest_picks };
  const autoPicked = { 'human-0': row.host_autopicks, 'human-4': row.guest_autopicks };
  return replayDraft(row.seed, humanPicks, players(), playsDB, { autoPicked });
}

/** Card display names the given seat's pack holds, sorted — compared against the DOM. */
function seatPackNames(row: Row, seatId: 'human-0' | 'human-4'): string[] {
  const state = replayRow(row);
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return [];
  return seat.currentPack
    .map((c) => (c.type === 'Play' ? c.name : c.player.name))
    .sort();
}

/** A pack shrinks by one card every pick within its 8-pick round (8, 7, 6, ... down to 1)
 *  — only the very first pick of a pack shows all 8. The pack-pass animation also briefly
 *  renders both the outgoing and incoming pack at once (framer-motion `AnimatePresence`)
 *  right when a round actually resolves. Waits for the DOM to show exactly `expectedCount`
 *  selectable cards (the settled pack) before reading names, so this never samples an
 *  in-between animation frame nor assumes a fixed pack size. */
async function domPackNames(page: Page, expectedCount: number): Promise<string[]> {
  const cards = page.locator('[role="button"][aria-label^="Select "]');
  await expect(cards).toHaveCount(expectedCount, { timeout: 20_000 });
  const labels = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  return labels.map((l) => l.replace(/^Select /, '')).sort();
}

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

async function fetchRow(id: string): Promise<Row> {
  const { data, error } = await admin!.from('matches').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Row;
}

async function createDraftingMatch(hostId: string, guestId: string, seed: number): Promise<string> {
  const id = `e2e-pvp-draft-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { error } = await admin!.from('matches').insert({ id, seed, host_id: hostId, guest_id: guestId, status: 'drafting' });
  if (error) throw error;
  return id;
}

/** Selects the first selectable card in the pack and confirms it — same mechanics
 *  `draft.spec.ts`/`draft-resume.spec.ts` use for the solo room's own grid. PvP never
 *  shows the pack-intro opener (D7 Quick visuals), so no "Open pack"/skip-reveal step. */
async function pickOne(page: Page) {
  const card = page.locator('[role="button"][aria-label^="Select "]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await clickPastSplash(page, () => card.click());
  const confirm = page.getByRole('button', { name: /^Confirm pick$/ });
  await expect(confirm).toBeVisible({ timeout: 20_000 });
  await confirm.click();
}

/** Fills the depth chart greedily (select a roster row, place it on the first eligible
 *  slot the click lights up) until 12 players are placed, then activates 3 basic plays
 *  (no drafted-play eligibility to worry about) and presses "Lock roster". */
async function buildAndLock(page: Page) {
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 20_000 });
  await dismissSplash(page);

  // Open the roster panel if it's a drawer trigger (compact tier) or a collapsed strip
  // (regular/wide) — a no-op if it's already an open docked panel.
  const rosterDrawer = page.getByRole('button', { name: /^Roster,/ });
  const expandRoster = page.getByRole('button', { name: 'Expand roster' });
  if (await rosterDrawer.isVisible().catch(() => false)) await rosterDrawer.click();
  else if (await expandRoster.isVisible().catch(() => false)) await expandRoster.click();

  const filledSlots = page.locator('[data-testid^="depth-slot-filled-"]');

  // Tries every currently-listed roster row until one lights up an eligible slot matching
  // `columnFilter` (undefined = any column); places it there. Returns whether it placed one.
  async function placeOneMatching(columnFilter?: string): Promise<boolean> {
    const rows = page.getByTestId('roster-player-row');
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      if (!(await row.isVisible().catch(() => false))) continue;
      await row.click();
      const selector = columnFilter ? `[data-testid^="depth-slot-${columnFilter}-"]` : '[data-testid^="depth-slot-"]';
      const emptySlot = page.locator(selector, { hasText: /place here/i }).first();
      // A click's own effect (highlighting eligible slots) is synchronous React state —
      // no animation/network delay to wait out, so a short poll is enough.
      if (await emptySlot.isVisible({ timeout: 100 }).catch(() => false)) {
        await emptySlot.click();
        return true; // DOM re-rendered (one fewer roster row) — caller restarts from the top
      }
      await row.click(); // deselect, try the next row
    }
    return false;
  }

  // D8/checklist: every column needs a starter, and PF/C are the scarcest naturally —
  // a plain first-eligible-slot-wins greedy fill tends to spend PF/C-adjacent wings on
  // SF/SG first and starve them. Seat a starter for each column, hardest first, before
  // falling back to an unconstrained greedy fill for the remaining bench slots.
  for (const column of ['C', 'PF', 'SF', 'SG', 'PG']) {
    // "place here" only renders once a player is actively selected (it reads "Add <col>"
    // at rest) — check whether the starter is already FILLED instead, by testid prefix.
    const filledStarter = page.locator(`[data-testid="depth-slot-filled-${column}-0"]`);
    if (await filledStarter.count()) continue; // already filled
    await placeOneMatching(column);
  }

  // Greedy placement for the rest: try each currently-listed roster row in turn (a player
  // whose natural/adjacent columns are all already full lights up no slot — skip and try
  // the next one) until 12 are placed or every row has been tried with nothing left to do.
  for (let guard = 0; guard < 60; guard++) {
    if ((await filledSlots.count()) >= 12) break;
    if (!(await placeOneMatching())) break; // a full pass placed nobody — stop rather than spin
  }

  // 3 basic plays (no drafted-play role wiring needed — an unassigned role is fine).
  for (let i = 0; i < 3; i++) {
    const kind = i % 2 === 0 ? 'offense' : 'defense';
    const tile = page.getByRole('button', { name: new RegExp(`Add Basic ${kind === 'offense' ? 'Offense' : 'Defense'} to the first open play slot`, 'i') });
    if (await tile.isVisible().catch(() => false)) await tile.click({ timeout: 10_000 });
  }

  // The button's accessible name grows a " — <reason>" suffix while disabled (TopKPIBand).
  const lockButton = page.getByRole('button', { name: /^Lock roster/ });
  try {
    await expect(lockButton).toBeEnabled({ timeout: 10_000 });
  } catch (err) {
    const label = await lockButton.getAttribute('aria-label').catch(() => null);
    throw new Error(`roster never became complete (aria-label: ${label}): ${err}`);
  }
  // A bounded click: an overlay over the button (the fixed nav bar once did) fails here
  // in 10 s instead of hanging until the test timeout.
  await clickPastSplash(page, () => lockButton.click({ timeout: 10_000 }));
}

test.describe('pvp draft', () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL_2 || !process.env.E2E_TEST_PASSWORD_2 || !admin,
    'Set E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 (and the Supabase keys) and run `npm run bootstrap:e2e`.',
  );

  test.beforeAll(async () => {
    if (!admin) return;
    // The 202609220002_match_void.sql migration must be applied — void_reason column and
    // the match_void RPC. If it isn't, skip clearly instead of failing every case below.
    const { error } = await admin.from('matches').select('void_reason').limit(1);
    test.skip(!!error, `void_reason column missing — 202609220002_match_void.sql not applied: ${error?.message}`);
  });

  const authFile2 = 'tests/.auth/user2.json';

  test('both contexts draft all 24 picks, build a roster, lock it, and reach series', async ({ page, browser }) => {
    test.skip(!fs.existsSync(authFile2), `${authFile2} missing: auth2.setup.ts did not run.`);
    // Measured ~100 s: 24 rounds x 2 picks ~65 s, each greedy build + lock ~8 s.
    test.setTimeout(240_000);

    const contextB = await browser.newContext({ storageState: authFile2 });
    const pageB = await contextB.newPage();

    await page.goto('/');
    await pageB.goto('/');
    const [a, b] = await Promise.all([myId(page), myId(pageB)]);
    await deleteMatchesBetween(a.id, b.id);

    try {
      const matchId = await createDraftingMatch(a.id, b.id, 424242);

      await page.goto(`/playoffs/${matchId}/draft`);
      await dismissSplash(page);
      await pageB.goto(`/playoffs/${matchId}/draft`);
      await dismissSplash(pageB);

      for (let round = 1; round <= 24; round++) {
        // A (host) picks first every round.
        await pickOne(page);

        if (round === 1) {
          // D2: A picked first — A's room shows WaitingFor until B catches up.
          await expect(page.locator('[data-waiting-for]')).toBeVisible({ timeout: 15_000 });
        }

        if (round === 1 || round === 12 || round === 24) {
          // A picked, B has not — the shared replay halts before processing this round
          // (D2: WaitingFor sits over the still-full, still-unprocessed pack), so A's own
          // room shows exactly the pack `replayDraft` says seat human-0 holds right now.
          const row = await fetchRow(matchId);
          const expectedA = seatPackNames(row, 'human-0');
          const domA = await domPackNames(page, expectedA.length);
          expect(domA).toEqual(expectedA);
        }

        await pickOne(pageB);

        if (round === 1 || round === 12) {
          // Both have now picked this round — B's next pack (a fresh one) also matches
          // what the row-driven replay says seat human-4 holds.
          const row = await fetchRow(matchId);
          const expectedB = seatPackNames(row, 'human-4');
          const domB = await domPackNames(pageB, expectedB.length);
          expect(domB).toEqual(expectedB);
        }
      }

      // Reload mid-flow (right after the draft, before building) resumes the same room —
      // both routed to /build by now (D9: no resume sheet, rebuilt straight from the row).
      await page.reload();
      await dismissSplash(page);
      await expect(page).toHaveURL(new RegExp(`/playoffs/${matchId}/build$`), { timeout: 20_000 });

      await page.goto(`/playoffs/${matchId}/build`);
      await dismissSplash(page);
      await buildAndLock(page);

      // A locked first — sees WaitingFor until B locks too.
      await expect(page.locator('[data-waiting-for]')).toBeVisible({ timeout: 15_000 });

      await pageB.goto(`/playoffs/${matchId}/build`);
      await dismissSplash(pageB);
      await buildAndLock(pageB);

      await expect(page).toHaveURL(new RegExp(`/playoffs/${matchId}$`), { timeout: 20_000 });
      await expect(pageB).toHaveURL(new RegExp(`/playoffs/${matchId}$`), { timeout: 20_000 });

      const finalRow = await fetchRow(matchId);
      expect(finalRow.status).toBe('series');
    } finally {
      await deleteMatchesBetween(a.id, b.id);
      await contextB.close();
    }
  });

  test('offline finish: A finishes the draft for an absent B (D5)', async ({ page, browser }) => {
    test.skip(!fs.existsSync(authFile2), `${authFile2} missing: auth2.setup.ts did not run.`);
    test.setTimeout(240_000);

    const contextB = await browser.newContext({ storageState: authFile2 });
    const pageB = await contextB.newPage();

    await page.goto('/');
    await pageB.goto('/');
    const [a, b] = await Promise.all([myId(page), myId(pageB)]);
    await deleteMatchesBetween(a.id, b.id);

    try {
      const matchId = await createDraftingMatch(a.id, b.id, 909090);

      await page.goto(`/playoffs/${matchId}/draft`);
      await dismissSplash(page);
      await pageB.goto(`/playoffs/${matchId}/draft`);
      await dismissSplash(pageB);

      // Draft to ~pick 20 each with both present.
      for (let round = 1; round <= 20; round++) {
        await pickOne(page);
        await pickOne(pageB);
      }

      // B goes offline.
      await contextB.close();

      // Backdate B's heartbeat well past PVP_OFFLINE_FINISH_MS (5 min) and the current
      // pick_deadline into the past so A's "Finish the draft" is offered immediately.
      const staleSeenAt = new Date(Date.now() - 6 * 60_000).toISOString();
      const pastDeadline = new Date(Date.now() - 60_000).toISOString();
      {
        const { error } = await admin!
          .from('matches')
          .update({ guest_seen_at: staleSeenAt, pick_deadline: pastDeadline })
          .eq('id', matchId);
        if (error) throw error;
      }

      await page.reload();
      await dismissSplash(page);

      const finishButton = page.getByRole('button', { name: /^Finish the draft$/ });
      await expect(finishButton).toBeVisible({ timeout: 20_000 });
      await clickPastSplash(page, () => finishButton.click());

      // D5: A's client auto-picks for B one pick at a time, each gated on
      // `pick_deadline + PVP_AUTOPICK_GRACE_MS` — backdate the deadline again after each
      // one lands until the row reaches 'building' (both at 24 picks).
      let row = await fetchRow(matchId);
      for (let guard = 0; guard < 40 && row.status === 'drafting'; guard++) {
        const { error } = await admin!
          .from('matches')
          .update({ pick_deadline: pastDeadline })
          .eq('id', matchId);
        if (error) throw error;
        await page.waitForTimeout(1500);
        row = await fetchRow(matchId);
      }

      expect(row.status).toBe('building');
      expect(row.host_picks).toHaveLength(24);
      expect(row.guest_picks).toHaveLength(24);
      // Every one of B's picks beyond round 20 was the clock's doing.
      expect(row.guest_autopicks.length).toBeGreaterThanOrEqual(4);
    } finally {
      await deleteMatchesBetween(a.id, b.id);
    }
  });
});
