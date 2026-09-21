/**
 * sync_outbox T5: the drain engine itself — non-blocking writes, coalescing, per-key
 * serialization, backoff, permanent-vs-transient classification, tombstones, the two-phase
 * pull and persisted baselines.
 *
 * These are the paths that corrupt or silently lose a user's data when they are wrong, so
 * each case is written as the real-world scenario it stands for (offline for days, killed
 * mid-push, two devices, an account switch).
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { SupabaseGameStore } from '@/storage/supabase';
import { outboxKey, type OutboxRecord } from '@/storage/types';
import { makeChallengeRun, makeSavedRoster } from './fixtures';
import { FakeCloud } from './fakeCloud';

const OWNER = 'owner-1';

function makeStore(cloud: FakeCloud, local = new MemoryGameStore()) {
  return { local, store: new SupabaseGameStore(local, cloud) };
}

describe('SupabaseGameStore outbox', () => {
  let cloud: FakeCloud;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cloud = new FakeCloud();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  // ── (a) non-blocking writes ───────────────────────────────────────────

  it('resolves a save while the push is still in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    cloud.onRpc = () => gate;

    const { store } = makeStore(cloud);
    await store.setOwnerId(OWNER);

    const roster = makeSavedRoster();
    // Would hang forever if a save awaited the network.
    await store.saveRoster(roster);

    expect(await store.getRoster(roster.id)).not.toBeNull();
    expect(cloud.rows.get('rosters')!.size).toBe(0);
    expect(store.getSyncStatus()).toMatchObject({ state: 'syncing', pending: 1, blocked: 0 });

    release();
    await store.settle();
    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(store.getSyncStatus().pending).toBe(0);
  });

  // ── (b) coalescing ────────────────────────────────────────────────────

  it('coalesces ten offline saves into one record and pushes the LATEST content', async () => {
    vi.useFakeTimers();
    cloud.onRpc = () => ({ message: 'Failed to fetch' });

    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    for (let i = 0; i < 10; i++) {
      await store.saveRoster({ ...roster, name: `v${i}` });
      await store.settle();
    }

    const queued = await local.listOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ key: outboxKey(OWNER, 'rosters', roster.id), op: 'upsert' });
    expect(store.getSyncStatus().pending).toBe(1);

    cloud.onRpc = null;
    await vi.advanceTimersByTimeAsync(10_000);
    await store.settle();

    expect((cloud.live('rosters', roster.id)!.data as { name: string }).name).toBe('v9');
    expect(await local.listOutbox()).toEqual([]);
  });

  // ── (c) per-key serialization ─────────────────────────────────────────

  it('never runs two concurrent pushes for the same key', async () => {
    let active = 0;
    let peak = 0;
    cloud.onRpc = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    };

    const { store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster({ ...roster, name: 'one' });
    await store.saveRoster({ ...roster, name: 'two' });
    await store.settle();

    expect(peak).toBe(1);
    expect(cloud.upserts.length).toBeGreaterThan(0);
  });

  // ── (d) a save that lands mid-push ────────────────────────────────────

  it('does not lose a save that lands while its key is being pushed', async () => {
    let sawFirstCall!: () => void;
    const started = new Promise<void>((resolve) => { sawFirstCall = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    cloud.onRpc = async () => {
      sawFirstCall();
      await gate;
      cloud.onRpc = null; // only the first push is held open
    };

    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster({ name: 'v1', timestamp: '2026-09-21T10:00:00.000Z' });
    await store.saveRoster(roster);
    await started;

    // The user keeps working while the first push is in flight.
    await store.saveRoster({ ...roster, name: 'v2', timestamp: '2026-09-21T10:00:01.000Z' });
    release();
    await store.settle();

    expect((cloud.live('rosters', roster.id)!.data as { name: string }).name).toBe('v2');
    expect(await local.listOutbox()).toEqual([]);
  });

  // ── (e) transient vs permanent ────────────────────────────────────────

  it('retries a transient failure after the backoff window', async () => {
    vi.useFakeTimers();
    cloud.onRpc = () => { throw new TypeError('Failed to fetch'); };

    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();

    const [record] = await local.listOutbox();
    expect(record.attempts).toBe(1);
    expect(record.blocked).toBeFalsy();
    expect(record.lastError).toContain('Failed to fetch');
    expect(record.lastAttemptAt).toBeTruthy();

    // Inside the backoff window nothing is retried.
    cloud.resetCalls();
    await vi.advanceTimersByTimeAsync(1_000);
    await store.settle();
    expect(cloud.upserts).toHaveLength(0);

    cloud.onRpc = null;
    await vi.advanceTimersByTimeAsync(5_000);
    await store.settle();
    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(store.getSyncStatus()).toMatchObject({ pending: 0, blocked: 0 });
  });

  it('parks a permanent failure as blocked, never retries it, and clears it on the next save', async () => {
    vi.useFakeTimers();
    cloud.onRpc = () => ({ message: 'new row violates row-level security policy', code: '42501' });

    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();

    expect((await local.listOutbox())[0]).toMatchObject({ blocked: true });
    expect(store.getSyncStatus()).toMatchObject({ state: 'idle', pending: 0, blocked: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(`rosters/${roster.id}`);

    // Parked means parked: the retry timer must not pick it up again.
    cloud.resetCalls();
    await vi.advanceTimersByTimeAsync(120_000);
    await store.settle();
    expect(cloud.upserts).toHaveLength(0);

    // A new save of that key is a fresh start (the user fixed whatever it was).
    cloud.onRpc = null;
    await store.saveRoster({ ...roster, name: 'retry me' });
    await store.settle();
    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(store.getSyncStatus().blocked).toBe(0);
    expect(await local.listOutbox()).toEqual([]);
  });

  // ── (f) offline delete ────────────────────────────────────────────────

  it('an offline delete is never resurrected by a pull and tombstones the row on reconnect', async () => {
    vi.useFakeTimers();
    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();
    expect(cloud.live('rosters', roster.id)).toBeDefined();

    cloud.onRpc = () => { throw new TypeError('Failed to fetch'); };
    await store.deleteRoster(roster.id);
    await store.settle();
    expect(await store.getRoster(roster.id)).toBeNull();
    expect((await local.listOutbox())[0]).toMatchObject({ op: 'delete' });

    // A pull while the delete is still queued sees a LIVE cloud row — and must leave it
    // alone rather than adopting it back into the local store.
    const second = new SupabaseGameStore(local, cloud);
    await second.setOwnerId(OWNER);
    await second.settle();
    expect(await second.getRoster(roster.id)).toBeNull();

    cloud.onRpc = null;
    await vi.advanceTimersByTimeAsync(120_000);
    await second.settle();
    await store.settle();

    expect(cloud.deletes.length).toBeGreaterThan(0);
    expect(cloud.live('rosters', roster.id)).toBeUndefined();
    expect(await local.listOutbox()).toEqual([]);
  });

  // ── (g) remote tombstone on pull ──────────────────────────────────────

  it('a remote tombstone deletes the local row on pull', async () => {
    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();

    cloud.tombstone('rosters', roster.id); // the other device deleted it

    const second = new SupabaseGameStore(local, cloud);
    await second.setOwnerId(OWNER);
    await second.settle();

    expect(await second.getRoster(roster.id)).toBeNull();
    expect(await local.listOutbox()).toEqual([]);
  });

  it('a remote tombstone does NOT delete a local row that has a newer save waiting to go out', async () => {
    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();

    // Another device deleted it, but this device has since re-saved it offline.
    cloud.tombstone('rosters', roster.id);
    cloud.onRpc = () => { throw new TypeError('Failed to fetch'); };
    await store.saveRoster({ ...roster, name: 'edited after the remote delete' });
    await store.settle();

    const second = new SupabaseGameStore(local, cloud);
    await second.setOwnerId(OWNER);
    await second.settle();

    expect((await second.getRoster(roster.id))?.name).toBe('edited after the remote delete');
  });

  // ── (h) a push that hits a tombstone ──────────────────────────────────

  it('drops the local row when a push finds the cloud row tombstoned', async () => {
    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const run = makeChallengeRun();
    await store.saveChallengeRun(run);
    await store.settle();

    cloud.tombstone('challenge_runs', run.id); // deleted on the other device

    await store.saveChallengeRun({ ...run, phase: 'break' });
    await store.settle();

    expect(await store.getChallengeRun(run.id)).toBeNull();
    expect(await local.listOutbox()).toEqual([]);
    expect(cloud.live('challenge_runs', run.id)).toBeUndefined();
  });

  // ── (i) two-phase pull + persisted baselines ──────────────────────────

  it('pulls ids first and asks for `data` only when the baseline differs, across instances', async () => {
    const { local, store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();
    expect(await local.getMeta(`sync.baselines:${OWNER}`)).toContain(`rosters:${roster.id}`);

    // A brand new store instance over the same local data: the persisted baselines must
    // survive, so phase 2 has nothing to fetch.
    cloud.resetCalls();
    const second = new SupabaseGameStore(local, cloud);
    await second.setOwnerId(OWNER);
    await second.settle();

    expect(cloud.selects.filter((s) => s.table === 'rosters').map((s) => s.columns))
      .toEqual(['id, updated_at, deleted_at']);
    expect(cloud.selects.every((s) => s.ids === undefined)).toBe(true);

    // Now the row really does change on another device: phase 2 asks for exactly that id.
    cloud.writeDirect('rosters', roster.id, { ...roster, name: 'changed elsewhere' });
    cloud.resetCalls();
    const third = new SupabaseGameStore(local, cloud);
    await third.setOwnerId(OWNER);
    await third.settle();

    const phaseTwo = cloud.selects.filter((s) => s.ids !== undefined);
    expect(phaseTwo).toHaveLength(1);
    expect(phaseTwo[0]).toMatchObject({ table: 'rosters', columns: 'id, data, updated_at', ids: [roster.id] });
  });

  // ── (j) account switch ────────────────────────────────────────────────

  it('never pushes one owner\'s queued rows under the next owner', async () => {
    cloud.onRpc = () => { throw new TypeError('Failed to fetch'); };
    const { local, store } = makeStore(cloud);
    await store.setOwnerId('owner-a');
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();
    expect((await local.listOutbox())[0]).toMatchObject({ ownerId: 'owner-a' });

    cloud.onRpc = null;
    cloud.resetCalls();
    await store.setOwnerId('owner-b');
    await store.settle();

    expect(cloud.upserts).toEqual([]);
    expect(cloud.deletes).toEqual([]);
    // owner-a's write is still queued for when owner-a signs back in.
    expect((await local.listOutbox()).map((r: OutboxRecord) => r.ownerId)).toEqual(['owner-a']);
    expect(store.getSyncStatus()).toMatchObject({ pending: 0, blocked: 0 });
  });

  // ── (k) readiness is never hostage to the network ─────────────────────

  it('setOwnerId resolves on its own timeout when the pull hangs', async () => {
    vi.useFakeTimers();
    cloud.selectGate = new Promise<void>(() => {}); // never resolves

    const { store } = makeStore(cloud);
    let resolved = false;
    const pending = store.setOwnerId(OWNER).then(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await pending;
    expect(resolved).toBe(true);
  });

  // ── (l) pushLocalToCloud ──────────────────────────────────────────────

  it('pushLocalToCloud enqueues only the rows the cloud has never seen', async () => {
    const local = new MemoryGameStore();
    await local.setOwnerId(OWNER);
    const neverSynced = makeSavedRoster({ name: 'Local only' });
    await local.saveRoster(neverSynced); // written before this device had cloud sync

    const store = new SupabaseGameStore(local, cloud);
    await store.setOwnerId(OWNER);
    const synced = makeSavedRoster({ name: 'Already synced' });
    await store.saveRoster(synced);
    await store.settle();

    cloud.resetCalls();
    await store.pushLocalToCloud();
    await store.settle();

    expect(cloud.upserts.map((c) => c.p_id)).toEqual([neverSynced.id]);
    expect(cloud.live('rosters', neverSynced.id)).toBeDefined();
  });
  // ── review fixes (2026-09-21) ─────────────────────────────────────────

  it('merges a first push that finds an existing cloud row instead of overwriting it', async () => {
    // Site data cleared (no baseline) and the pull failed, so this device does not know the
    // cloud already holds a NEWER copy of the roster it is about to push.
    const id = 'roster-shared';
    cloud.writeDirect('rosters', id, makeSavedRoster({ id, name: 'edited on the other device', timestamp: '2026-09-21T12:00:00.000Z' }), OWNER);
    cloud.selectError = { message: 'upstream unavailable' };

    const { store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    await store.saveRoster(makeSavedRoster({ id, name: 'stale local copy', timestamp: '2026-09-20T12:00:00.000Z' }));
    await store.settle();

    expect((cloud.live('rosters', id)!.data as { name: string }).name).toBe('edited on the other device');
    expect((await store.getRoster(id))!.name).toBe('edited on the other device');
    expect(store.getSyncStatus()).toMatchObject({ pending: 0, blocked: 0 });
  });

  it('gives a blocked record one fresh attempt on the next sign-in', async () => {
    // An expired session goes out as `anon` and looks exactly like a permission error.
    cloud.onRpc = () => ({ message: 'new row violates row-level security policy for table "rosters"', code: '42501' });
    const { store, local } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await store.settle();
    expect(store.getSyncStatus()).toMatchObject({ pending: 0, blocked: 1 });

    cloud.onRpc = null;
    const relaunched = new SupabaseGameStore(local, cloud);
    await relaunched.setOwnerId(OWNER);
    await relaunched.settle();

    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(relaunched.getSyncStatus()).toMatchObject({ pending: 0, blocked: 0 });
  });

  it('times out a stalled request instead of freezing every later sync', async () => {
    vi.useFakeTimers();
    const { store, local } = makeStore(cloud);
    await store.setOwnerId(OWNER);

    let calls = 0;
    cloud.onRpc = () => (++calls === 1 ? new Promise<void>(() => {}) : undefined); // first call never answers
    const roster = makeSavedRoster();
    await store.saveRoster(roster);

    await vi.advanceTimersByTimeAsync(45_000); // WRITE_TIMEOUT_MS
    const [record] = await local.listOutbox();
    expect(record.attempts).toBe(1);
    expect(record.blocked).toBeFalsy(); // a timeout is transient, never parked
    expect(record.lastError).toMatch(/timed out/);

    await vi.advanceTimersByTimeAsync(4_000); // backoff for attempt 1
    await store.settle();
    expect(cloud.live('rosters', roster.id)).toBeDefined();
    expect(store.getSyncStatus().pending).toBe(0);
  });

  it('pulls again when the app is resumed, but not more than once per five minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00.000Z'));
    const { store } = makeStore(cloud);
    await store.setOwnerId(OWNER);
    const resume = () => (store as unknown as { pullIfStale(): Promise<void> }).pullIfStale();

    const fromOtherDevice = makeSavedRoster({ name: 'saved on the tablet' });
    cloud.writeDirect('rosters', fromOtherDevice.id, fromOtherDevice, OWNER);

    cloud.resetCalls();
    await resume(); // seconds after the launch pull
    expect(cloud.selects).toEqual([]);
    expect(await store.getRoster(fromOtherDevice.id)).toBeNull();

    vi.setSystemTime(new Date('2026-09-23T08:00:00.000Z')); // backgrounded for two days
    await resume();
    expect((await store.getRoster(fromOtherDevice.id))?.name).toBe('saved on the tablet');
  });
});
