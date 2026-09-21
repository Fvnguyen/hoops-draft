import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { SupabaseGameStore } from '@/storage/supabase';
import { createSeason, playNextGame } from '@/engine/season';
import type { DraftSession } from '@/engine/deckbuilder';
import { loadPlayers, PLAYS, runHeadlessDraft } from '../unit/helpers';
import { makeChallengeRun, makeDraftSession, makeSavedRoster } from './fixtures';
import { FakeCloud } from './fakeCloud';

const OWNER = 'owner-1';

/** Every push now goes through the background drain, so "has the cloud caught up?" means
 *  "has the pull/drain chain settled?" rather than a fixed number of microtask ticks. */
async function flush(store: SupabaseGameStore): Promise<void> {
  await store.settle();
}

describe('SupabaseGameStore', () => {
  let cloud: FakeCloud;
  let store: SupabaseGameStore;

  beforeEach(async () => {
    cloud = new FakeCloud();
    store = new SupabaseGameStore(new MemoryGameStore(), cloud);
    await store.setOwnerId(OWNER);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a new roster to the cloud on save', async () => {
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await flush(store);

    const row = cloud.rows.get('rosters')!.get(roster.id);
    expect(row).toBeDefined();
    expect((row!.data as typeof roster).name).toBe(roster.name);
  });

  it('deleteRoster/deleteSeason/deleteDraftSession tombstone the cloud row (D5)', async () => {
    const roster = makeSavedRoster();
    const session = makeDraftSession();
    await store.saveRoster(roster);
    await store.saveDraftSession(session);
    await flush(store);
    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(cloud.live('draft_sessions', session.id)).toBeDefined();

    await store.deleteRoster(roster.id);
    await store.deleteDraftSession(session.id);
    await flush(store);

    // The row stays, tombstoned — that is how the other device learns about the delete.
    expect(cloud.rows.get('rosters')!.get(roster.id)!.deleted_at).toBeTruthy();
    expect(cloud.rows.get('draft_sessions')!.get(session.id)!.deleted_at).toBeTruthy();
    expect(await store.getRoster(roster.id)).toBeNull();
    expect(await store.getDraftSession(session.id)).toBeNull();
    expect(store.getSyncStatus().pending).toBe(0);
  });

  it('re-saving after the known baseline row was deleted server-side re-inserts instead of silently queuing', async () => {
    // Regression: a stale baseline pointing at a since-deleted row used to make push()
    // treat the CAS rejection (current_row: null) as "needs a merge", find nothing to
    // merge against, and queue forever without ever writing the new save.
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await flush(store);
    expect(cloud.live('rosters', roster.id)).toBeDefined();

    // Simulate another device deleting it without this store knowing (its baseline for
    // the id is still the old updated_at). A hard delete, not a tombstone: the row is gone.
    cloud.rows.get('rosters')!.delete(roster.id);

    const renamed = { ...roster, name: 'Renamed after delete' };
    await store.saveRoster(renamed);
    await flush(store);

    expect(store.getSyncStatus().pending).toBe(0);
    expect(await store.listConflicts()).toEqual([]);
    const row = cloud.rows.get('rosters')!.get(roster.id);
    expect(row).toBeDefined();
    expect((row!.data as typeof renamed).name).toBe('Renamed after delete');
  });

  it('pulls a cloud-only row into a fresh local store on setOwnerId', async () => {
    const roster = makeSavedRoster();
    cloud.writeDirect('rosters', roster.id, roster);

    const second = new SupabaseGameStore(new MemoryGameStore(), cloud);
    await second.setOwnerId(OWNER);
    await flush(second);

    expect(await second.getRoster(roster.id)).toMatchObject({ id: roster.id, name: roster.name });
  });

  it('a fresh login does not report a conflict for a roster nothing actually changed on', async () => {
    // Reproduces the "changed on another device" toast appearing on every login: a brand
    // new SupabaseGameStore has an empty in-memory `baselines` map, so without a content
    // check every already-synced row looks "unbacked" on the first pull — and rosters
    // always report a conflict from mergeRoster, which never auto-resolves.
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await flush(store);

    const local = new MemoryGameStore();
    await local.saveRoster(roster);
    const freshLogin = new SupabaseGameStore(local, cloud);
    await freshLogin.setOwnerId(OWNER);
    await flush(freshLogin);

    expect(await freshLogin.listConflicts()).toEqual([]);
  });

  it('does not report a conflict on login just because the pushed roster omitted cardSetVersion', async () => {
    // Regression: indexedDb.ts/memory.ts stamp `cardSetVersion` onto the LOCAL record on
    // save, but saveRoster/saveDraftSession used to push the caller's pre-stamp object to
    // the cloud. That permanently desynced local vs. remote content for any roster saved
    // without cardSetVersion pre-set, so every later login saw a false "changed on another
    // device" conflict for it — reported for a user (teomads/"Swagger") on every roster.
    const roster = makeSavedRoster();
    expect(roster.cardSetVersion).toBeUndefined();
    await store.saveRoster(roster);
    await flush(store);

    // Second "device": same owner set BEFORE saving, so its local record is directly
    // comparable to what the first device pushed (avoids the ownerId-mismatch path in the
    // test above, which short-circuits straight to "adopt cloud row" either way).
    const local = new MemoryGameStore();
    await local.setOwnerId(OWNER);
    await local.saveRoster(roster);
    const freshLogin = new SupabaseGameStore(local, cloud);
    await freshLogin.setOwnerId(OWNER);
    await flush(freshLogin);

    expect(await freshLogin.listConflicts()).toEqual([]);
  });

  it('auto-merges a draft session pushed further on another device (no conflict)', async () => {
    const session = makeDraftSession({ pickLog: [] });
    await store.saveDraftSession(session);
    await flush(store);

    // Another device resumed the same draft and picked further.
    const ahead = { ...session, pickLog: [{ packNumber: 1, pickNumber: 1, overallPick: 1, seatId: 'human-0', packContents: ['a'], pickedCardId: 'a' }] };
    cloud.writeDirect('draft_sessions', session.id, ahead);

    // This device still only has the shorter log locally when it saves again.
    await store.saveDraftSession(session);
    await flush(store);

    const merged = await store.getDraftSession(session.id);
    expect(merged?.pickLog).toHaveLength(1);
    expect(await store.listConflicts()).toEqual([]);
  });

  it('auto-merges a season played further on another device and recomputes standings', async () => {
    const players = loadPlayers();
    const seats = runHeadlessDraft(players, PLAYS);
    const session: DraftSession = { id: 'session-1', timestamp: new Date().toISOString(), seats, pickLog: [] };
    await store.saveDraftSession(session);
    await flush(store);

    const season = createSeason(session, 'roster-1');
    await store.saveSeason(season);
    await flush(store);

    const ahead = playNextGame(season, session)!.season;
    cloud.writeDirect('seasons', season.id, ahead);

    await store.saveSeason(season); // still at currentGame 0 locally
    await flush(store);

    const merged = await store.getSeason(season.id);
    expect(merged?.currentGame).toBe(1);
    expect(await store.listConflicts()).toEqual([]);
  });

  it('pushLocalToCloud migrates local-only rows once and never overwrites an existing cloud row', async () => {
    // A record this device already has locally but the cloud has never seen.
    const localOnly = makeSavedRoster();
    await store.saveRoster(localOnly);
    await flush(store);
    expect(cloud.live('rosters', localOnly.id)).toBeDefined();

    // Simulate a second, never-synced device: fresh local store, same owner, plus a row
    // the cloud already has under a *different* name (must NOT be overwritten).
    const alreadyCloud = makeSavedRoster({ name: 'Cloud Name' });
    cloud.writeDirect('rosters', alreadyCloud.id, alreadyCloud);
    const local = new MemoryGameStore();
    await local.saveRoster({ ...alreadyCloud, name: 'Stale Local Name' });
    const fresh = new SupabaseGameStore(local, cloud);
    await fresh.setOwnerId(OWNER);
    await flush(fresh);

    await fresh.pushLocalToCloud();
    await flush(fresh);

    expect((cloud.rows.get('rosters')!.get(alreadyCloud.id)!.data as { name: string }).name).toBe('Cloud Name');
  });

  it('auto-resolves a roster race to the newer edit, without prompting', async () => {
    // Changed 2026-09-18: this used to park a conflict. Both sides always hold identical
    // `draftedCards` (a roster's card list is fixed at draft time), so a race can only
    // differ in arrangement — nothing worth stopping the user for.
    const roster = makeSavedRoster({ activePlays: ['play-a'], timestamp: '2026-09-18T10:00:00.000Z' });
    await store.saveRoster(roster);
    await flush(store);

    // Another device saved LATER than the edit we are about to make locally.
    cloud.writeDirect('rosters', roster.id, {
      ...roster, activePlays: ['play-b'], timestamp: '2026-09-18T12:00:00.000Z',
    });
    await store.saveRoster({ ...roster, activePlays: ['play-c'], timestamp: '2026-09-18T11:00:00.000Z' });
    await flush(store);

    expect(await store.listConflicts()).toEqual([]);
    expect((await store.getRoster(roster.id))?.activePlays).toEqual(['play-b']);
  });

  it('keeps the local edit when it is the newer one', async () => {
    const roster = makeSavedRoster({ activePlays: ['play-a'], timestamp: '2026-09-18T10:00:00.000Z' });
    await store.saveRoster(roster);
    await flush(store);

    cloud.writeDirect('rosters', roster.id, {
      ...roster, activePlays: ['play-b'], timestamp: '2026-09-18T10:30:00.000Z',
    });
    await store.saveRoster({ ...roster, activePlays: ['play-c'], timestamp: '2026-09-18T13:00:00.000Z' });
    await flush(store);

    expect(await store.listConflicts()).toEqual([]);
    expect((await store.getRoster(roster.id))?.activePlays).toEqual(['play-c']);
    // And the winning side is what the cloud ends up holding — no endless merge/push loop.
    expect((cloud.rows.get('rosters')!.get(roster.id)!.data as { activePlays: string[] }).activePlays)
      .toEqual(['play-c']);
  });

  it('pushes a new challenge run to the cloud on save', async () => {
    const run = makeChallengeRun();
    await store.saveChallengeRun(run);
    await flush(store);

    const row = cloud.rows.get('challenge_runs')!.get(run.id);
    expect(row).toBeDefined();
    expect((row!.data as typeof run).phase).toBe('first');
  });

  it('deleteChallengeRun tombstones the cloud row', async () => {
    const run = makeChallengeRun();
    await store.saveChallengeRun(run);
    await flush(store);
    expect(cloud.live('challenge_runs', run.id)).toBeDefined();

    await store.deleteChallengeRun(run.id);
    await flush(store);

    expect(cloud.live('challenge_runs', run.id)).toBeUndefined();
    expect(await store.getChallengeRun(run.id)).toBeNull();
  });

  it('auto-merges a challenge run advanced further on another device by taking the later phase (no conflict)', async () => {
    const run = makeChallengeRun({ phase: 'first' });
    await store.saveChallengeRun(run);
    await flush(store);

    // Another device moved this run into the front office (break) and then the second
    // half (second) while this device still only knows about `first`.
    const ahead = { ...run, phase: 'second' as const, halves: [] };
    cloud.writeDirect('challenge_runs', run.id, ahead);

    await store.saveChallengeRun(run); // still `first` locally
    await flush(store);

    const merged = await store.getChallengeRun(run.id);
    expect(merged?.phase).toBe('second');
    expect(await store.listConflicts()).toEqual([]);
  });

  it('pushLocalToCloud migrates local-only challenge runs once', async () => {
    const localOnly = makeChallengeRun();
    await store.saveChallengeRun(localOnly);
    await flush(store);
    expect(cloud.live('challenge_runs', localOnly.id)).toBeDefined();

    const alreadyCloud = makeChallengeRun({ phase: 'done' });
    cloud.writeDirect('challenge_runs', alreadyCloud.id, alreadyCloud);
    const local = new MemoryGameStore();
    await local.saveChallengeRun({ ...alreadyCloud, phase: 'first' });
    const fresh = new SupabaseGameStore(local, cloud);
    await fresh.setOwnerId(OWNER);
    await flush(fresh);

    await fresh.pushLocalToCloud();
    await flush(fresh);

    expect((cloud.rows.get('challenge_runs')!.get(alreadyCloud.id)!.data as { phase: string }).phase).toBe('done');
  });

  it('queues a write when the RPC throws and pushes it on the backoff retry', async () => {
    vi.useFakeTimers();
    const local = new MemoryGameStore();
    const flaky = new SupabaseGameStore(local, cloud);
    await flaky.setOwnerId(OWNER);
    cloud.onRpc = () => { throw new Error('network down'); };

    const roster = makeSavedRoster();
    await flaky.saveRoster(roster);
    await flush(flaky);
    expect(flaky.getSyncStatus().pending).toBe(1);
    expect(cloud.rows.get('rosters')!.size).toBe(0);

    cloud.onRpc = null;
    await vi.advanceTimersByTimeAsync(5_000);
    await flush(flaky);

    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(flaky.getSyncStatus().pending).toBe(0);
    expect(await local.listOutbox()).toEqual([]);
  });
});
