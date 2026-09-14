import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { SupabaseGameStore, type CloudSyncClient } from '@/storage/supabase';
import { createSeason, playNextGame } from '@/engine/season';
import type { DraftSession } from '@/engine/deckbuilder';
import { loadPlayers, PLAYS, runHeadlessDraft } from '../unit/helpers';
import { makeDraftSession, makeSavedRoster } from './fixtures';

const OWNER = 'owner-1';

/** In-memory stand-in for the three cloud tables + the cas_upsert RPC (migration
 *  202609140001_cloud_saves.sql), enough to exercise SupabaseGameStore's push/pull and
 *  merge paths without a real Supabase project. */
class FakeCloud implements CloudSyncClient {
  rows = new Map<string, Map<string, { id: string; owner_id: string; data: unknown; updated_at: string }>>([
    ['draft_sessions', new Map()],
    ['rosters', new Map()],
    ['seasons', new Map()],
  ]);
  private clock = 0;

  private nextUpdatedAt(): string {
    this.clock += 1;
    return `2026-01-01T00:00:${String(this.clock).padStart(2, '0')}Z`;
  }

  async rpc(_fn: 'cas_upsert', args: Parameters<CloudSyncClient['rpc']>[1]) {
    const table = this.rows.get(args.table_name)!;
    const existing = table.get(args.p_id);

    if (args.expected_updated_at === null) {
      if (existing) return { data: [{ ok: false, current_row: existing }], error: null };
      const row = { id: args.p_id, owner_id: args.p_owner_id, data: args.p_data, updated_at: this.nextUpdatedAt() };
      table.set(args.p_id, row);
      return { data: [{ ok: true, current_row: row }], error: null };
    }

    if (!existing || existing.updated_at !== args.expected_updated_at) {
      return { data: [{ ok: false, current_row: existing ?? null }], error: null };
    }
    const row = { ...existing, data: args.p_data, updated_at: this.nextUpdatedAt() };
    table.set(args.p_id, row);
    return { data: [{ ok: true, current_row: row }], error: null };
  }

  from(table: 'draft_sessions' | 'rosters' | 'seasons') {
    const rows = this.rows.get(table)!;
    return {
      select: (_cols: string) => ({
        eq: async (_col: string, val: string) => ({
          data: [...rows.values()].filter((r) => r.owner_id === val),
          error: null,
        }),
      }),
      // Deliberately a bare PromiseLike, no `.catch`/`.finally` — matches the real
      // supabase-js PostgrestBuilder (implements only `then`), so calling `.catch()` on
      // this instead of `await`-ing inside a try/catch throws here exactly like it would
      // against the real client.
      delete: () => ({
        eq: (_col: string, val: string): PromiseLike<{ error: null }> => ({
          then(onfulfilled, onrejected) {
            rows.delete(val);
            return Promise.resolve({ error: null as null }).then(onfulfilled, onrejected);
          },
        }),
      }),
    };
  }

  /** Simulates another device writing directly (bypassing this SupabaseGameStore). */
  writeDirect(table: 'draft_sessions' | 'rosters' | 'seasons', id: string, data: unknown): void {
    const rows = this.rows.get(table)!;
    rows.set(id, { id, owner_id: OWNER, data, updated_at: this.nextUpdatedAt() });
  }
}

async function flush(): Promise<void> {
  // Sync methods here are async but resolve on microtasks only — a couple of ticks is
  // enough to drain any push-then-retry chains (resolveViaMerge recurses through push).
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('SupabaseGameStore', () => {
  let cloud: FakeCloud;
  let store: SupabaseGameStore;

  beforeEach(async () => {
    cloud = new FakeCloud();
    store = new SupabaseGameStore(new MemoryGameStore(), cloud);
    await store.setOwnerId(OWNER);
  });

  it('pushes a new roster to the cloud on save', async () => {
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await flush();

    const row = cloud.rows.get('rosters')!.get(roster.id);
    expect(row).toBeDefined();
    expect((row!.data as typeof roster).name).toBe(roster.name);
  });

  it('deleteRoster/deleteSeason/deleteDraftSession actually remove the cloud row', async () => {
    const roster = makeSavedRoster();
    const session = makeDraftSession();
    await store.saveRoster(roster);
    await store.saveDraftSession(session);
    await flush();
    expect(cloud.rows.get('rosters')!.has(roster.id)).toBe(true);
    expect(cloud.rows.get('draft_sessions')!.has(session.id)).toBe(true);

    await store.deleteRoster(roster.id);
    await store.deleteDraftSession(session.id);

    expect(cloud.rows.get('rosters')!.has(roster.id)).toBe(false);
    expect(cloud.rows.get('draft_sessions')!.has(session.id)).toBe(false);
    expect(await store.getRoster(roster.id)).toBeNull();
    expect(await store.getDraftSession(session.id)).toBeNull();
  });

  it('re-saving after the known baseline row was deleted server-side re-inserts instead of silently queuing', async () => {
    // Regression: a stale baseline pointing at a since-deleted row used to make push()
    // treat the CAS rejection (current_row: null) as "needs a merge", find nothing to
    // merge against, and queue forever without ever writing the new save.
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await flush();
    expect(cloud.rows.get('rosters')!.has(roster.id)).toBe(true);

    // Simulate another device deleting it without this store knowing (its baseline for
    // the id is still the old updated_at).
    cloud.rows.get('rosters')!.delete(roster.id);

    const renamed = { ...roster, name: 'Renamed after delete' };
    await store.saveRoster(renamed);
    await flush();

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
    await flush();

    expect(await second.getRoster(roster.id)).toMatchObject({ id: roster.id, name: roster.name });
  });

  it('a fresh login does not report a conflict for a roster nothing actually changed on', async () => {
    // Reproduces the "changed on another device" toast appearing on every login: a brand
    // new SupabaseGameStore has an empty in-memory `baselines` map, so without a content
    // check every already-synced row looks "unbacked" on the first pull — and rosters
    // always report a conflict from mergeRoster, which never auto-resolves.
    const roster = makeSavedRoster();
    await store.saveRoster(roster);
    await flush();

    const local = new (await import('@/storage/memory')).MemoryGameStore();
    await local.saveRoster(roster);
    const freshLogin = new SupabaseGameStore(local, cloud);
    await freshLogin.setOwnerId(OWNER);
    await flush();

    expect(await freshLogin.listConflicts()).toEqual([]);
  });

  it('auto-merges a draft session pushed further on another device (no conflict)', async () => {
    const session = makeDraftSession({ pickLog: [] });
    await store.saveDraftSession(session);
    await flush();

    // Another device resumed the same draft and picked further.
    const ahead = { ...session, pickLog: [{ packNumber: 1, pickNumber: 1, overallPick: 1, seatId: 'human-0', packContents: ['a'], pickedCardId: 'a' }] };
    cloud.writeDirect('draft_sessions', session.id, ahead);

    // This device still only has the shorter log locally when it saves again.
    await store.saveDraftSession(session);
    await flush();

    const merged = await store.getDraftSession(session.id);
    expect(merged?.pickLog).toHaveLength(1);
    expect(await store.listConflicts()).toEqual([]);
  });

  it('auto-merges a season played further on another device and recomputes standings', async () => {
    const players = loadPlayers();
    const seats = runHeadlessDraft(players, PLAYS);
    const session: DraftSession = { id: 'session-1', timestamp: new Date().toISOString(), seats, pickLog: [] };
    await store.saveDraftSession(session);
    await flush();

    const season = createSeason(session, 'roster-1');
    await store.saveSeason(season);
    await flush();

    const ahead = playNextGame(season, session)!.season;
    cloud.writeDirect('seasons', season.id, ahead);

    await store.saveSeason(season); // still at currentGame 0 locally
    await flush();

    const merged = await store.getSeason(season.id);
    expect(merged?.currentGame).toBe(1);
    expect(await store.listConflicts()).toEqual([]);
  });

  it('pushLocalToCloud (D5) migrates local-only rows once and never overwrites an existing cloud row', async () => {
    // A record this device already has locally but the cloud has never seen.
    const localOnly = makeSavedRoster();
    await store.saveRoster(localOnly);
    await flush();
    expect(cloud.rows.get('rosters')!.get(localOnly.id)).toBeDefined();

    // Simulate a second, never-synced device: fresh local store, same owner, plus a row
    // the cloud already has under a *different* name (must NOT be overwritten by D5).
    const alreadyCloud = makeSavedRoster({ name: 'Cloud Name' });
    cloud.writeDirect('rosters', alreadyCloud.id, alreadyCloud);
    const local = new (await import('@/storage/memory')).MemoryGameStore();
    await local.saveRoster({ ...alreadyCloud, name: 'Stale Local Name' });
    const fresh = new SupabaseGameStore(local, cloud);
    await fresh.setOwnerId(OWNER);
    await flush();

    await fresh.pushLocalToCloud();
    await flush();

    expect((cloud.rows.get('rosters')!.get(alreadyCloud.id)!.data as { name: string }).name).toBe('Cloud Name');
  });

  it('parks a roster conflict for SyncConflictPrompt instead of auto-merging', async () => {
    const roster = makeSavedRoster({ activePlays: ['play-a'] });
    await store.saveRoster(roster);
    await flush();

    cloud.writeDirect('rosters', roster.id, { ...roster, activePlays: ['play-b'] });
    await store.saveRoster({ ...roster, activePlays: ['play-c'] });
    await flush();

    const conflicts = await store.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].table).toBe('rosters');

    await store.resolveConflict('rosters', roster.id, 'remote');
    await flush();

    expect((await store.getRoster(roster.id))?.activePlays).toEqual(['play-b']);
    expect(await store.listConflicts()).toEqual([]);
  });

  it('queues a write when the RPC throws and flushes it back on retry', async () => {
    const failing: CloudSyncClient = {
      rpc: async () => { throw new Error('network down'); },
      from: cloud.from.bind(cloud),
    };
    const flaky = new SupabaseGameStore(new MemoryGameStore(), failing);
    await flaky.setOwnerId(OWNER);

    const roster = makeSavedRoster();
    await flaky.saveRoster(roster);
    expect(flaky.getSyncStatus().pending).toBe(1);
  });
});
