/**
 * plan mobile_load D7: the cloud client loads supabase-js on first use. The trap this
 * guards against: a Postgrest builder is a thenable, so passing one THROUGH a promise
 * executes it — the phase-2 pull's `.in()` must be applied before that happens.
 */
import { describe, it, expect } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { SupabaseGameStore } from '@/storage/supabase';
import { createLazyCloudClient } from '@/storage/lazyCloudClient';
import { makeSavedRoster } from './fixtures';
import { FakeCloud } from './fakeCloud';

const OWNER = 'owner-1';

describe('createLazyCloudClient', () => {
  it('does not load the real client until the first cloud call, and loads it once', async () => {
    const cloud = new FakeCloud();
    let loads = 0;
    const lazy = createLazyCloudClient(async () => { loads++; return cloud; });
    const store = new SupabaseGameStore(new MemoryGameStore(), lazy);
    expect(loads).toBe(0);

    await store.setOwnerId(null); // signed out: /login must never pull the library in
    await store.saveRoster(makeSavedRoster());
    expect(loads).toBe(0);

    await store.setOwnerId(OWNER);
    await store.saveRoster(makeSavedRoster());
    await store.settle();
    expect(loads).toBe(1);
  });

  it('runs a full sync round trip through the lazy client, including the filtered phase-2 pull', async () => {
    const cloud = new FakeCloud();
    const fromOtherDevice = makeSavedRoster({ name: 'saved elsewhere' });
    cloud.writeDirect('rosters', fromOtherDevice.id, fromOtherDevice, OWNER);
    cloud.writeDirect('rosters', 'someone-elses', makeSavedRoster({ id: 'someone-elses' }), 'owner-2');

    const store = new SupabaseGameStore(new MemoryGameStore(), createLazyCloudClient(async () => cloud));
    await store.setOwnerId(OWNER);
    await store.settle();

    expect((await store.getRoster(fromOtherDevice.id))?.name).toBe('saved elsewhere');
    expect(await store.getRoster('someone-elses')).toBeNull();
    // Phase 2 reached the real client WITH its id filter (the fake logs the `.in()` call).
    expect(cloud.selects.some((call) => call.columns.includes('data') && call.ids?.includes(fromOtherDevice.id))).toBe(true);

    const mine = makeSavedRoster();
    await store.saveRoster(mine);
    await store.deleteRoster(fromOtherDevice.id);
    await store.settle();
    expect(cloud.live('rosters', mine.id)).toBeDefined();
    expect(cloud.live('rosters', fromOtherDevice.id)).toBeUndefined();
  });

  it('retries the import after a failed load instead of caching the failure', async () => {
    const cloud = new FakeCloud();
    let attempts = 0;
    const lazy = createLazyCloudClient(async () => {
      if (++attempts === 1) throw new TypeError('Failed to fetch dynamically imported module');
      return cloud;
    });
    await expect(lazy.rpc('cas_delete', { table_name: 'rosters', p_id: 'x', p_owner_id: OWNER })).rejects.toThrow(/dynamically imported/);
    await expect(lazy.rpc('cas_delete', { table_name: 'rosters', p_id: 'x', p_owner_id: OWNER })).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });
});
