import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { IndexedDbGameStore, MagicBallDB } from '@/storage/indexedDb';
import type { GameStore } from '@/storage/types';
import { CURRENT_CARD_SET_VERSION } from '@/storage/types';
import { makeChallengeRun, makeDraftSession, makeSavedRoster, makeSeason } from './fixtures';

let dbCounter = 0;

const implementations: Array<{ name: string; make: () => GameStore }> = [
  { name: 'MemoryGameStore', make: () => new MemoryGameStore() },
  {
    name: 'IndexedDbGameStore',
    make: () => new IndexedDbGameStore(new MagicBallDB(`test-db-${dbCounter++}`)),
  },
];

describe.each(implementations)('$name', ({ make }) => {
  let store: GameStore;

  beforeEach(() => {
    store = make();
  });

  it('round-trips draft sessions (create, update, delete)', async () => {
    const session = makeDraftSession();
    await store.saveDraftSession(session);

    // D4: the store stamps cardSetVersion once, on the way in.
    const stamped = { ...session, cardSetVersion: CURRENT_CARD_SET_VERSION };
    expect(await store.getDraftSession(session.id)).toEqual(stamped);
    expect(await store.listDraftSessions()).toEqual([stamped]);
    expect(await store.getDraftSession('missing')).toBeNull();

    const updated = { ...stamped, seed: 99 };
    await store.saveDraftSession(updated); // upsert, not a duplicate
    expect(await store.getDraftSession(session.id)).toEqual(updated);
    expect(await store.listDraftSessions()).toHaveLength(1);

    await store.deleteDraftSession(session.id);
    expect(await store.getDraftSession(session.id)).toBeNull();
    expect(await store.listDraftSessions()).toEqual([]);
  });

  it('round-trips rosters (create, update, delete)', async () => {
    const roster = makeSavedRoster();
    await store.saveRoster(roster);

    // D4: the store stamps cardSetVersion once, on the way in.
    const stamped = { ...roster, cardSetVersion: CURRENT_CARD_SET_VERSION };
    expect(await store.getRoster(roster.id)).toEqual(stamped);
    expect(await store.listRosters()).toEqual([stamped]);
    expect(await store.getRoster('missing')).toBeNull();

    const renamed = { ...stamped, name: 'Renamed Roster' };
    await store.saveRoster(renamed);
    expect(await store.getRoster(roster.id)).toEqual(renamed);
    expect(await store.listRosters()).toHaveLength(1);

    await store.deleteRoster(roster.id);
    expect(await store.getRoster(roster.id)).toBeNull();
    expect(await store.listRosters()).toEqual([]);
  });

  it('round-trips seasons (create, update, delete) and resolves getSeasonByRoster', async () => {
    const season = makeSeason();
    await store.saveSeason(season);

    expect(await store.getSeason(season.id)).toEqual(season);
    expect(await store.listSeasons()).toEqual([season]);
    expect(await store.getSeasonByRoster(season.rosterId)).toEqual(season);
    expect(await store.getSeasonByRoster('missing-roster')).toBeNull();

    const advanced = { ...season, currentGame: 3 };
    await store.saveSeason(advanced);
    expect(await store.getSeason(season.id)).toEqual(advanced);
    expect(await store.listSeasons()).toHaveLength(1);

    await store.deleteSeason(season.id);
    expect(await store.getSeason(season.id)).toBeNull();
  });

  it('round-trips challenge runs (create, update, delete) and resolves getChallengeRunByRoster', async () => {
    const run = makeChallengeRun();
    await store.saveChallengeRun(run);

    expect(await store.getChallengeRun(run.id)).toEqual(run);
    expect(await store.listChallengeRuns()).toEqual([run]);
    expect(await store.getChallengeRunByRoster(run.rosterId)).toEqual(run);
    expect(await store.getChallengeRunByRoster('missing-roster')).toBeNull();
    expect(await store.getChallengeRun('missing')).toBeNull();

    const advanced = { ...run, phase: 'break' as const };
    await store.saveChallengeRun(advanced); // upsert, not a duplicate
    expect(await store.getChallengeRun(run.id)).toEqual(advanced);
    expect(await store.listChallengeRuns()).toHaveLength(1);

    await store.deleteChallengeRun(run.id);
    expect(await store.getChallengeRun(run.id)).toBeNull();
    expect(await store.listChallengeRuns()).toEqual([]);
  });

  it('exportAll returns every collection', async () => {
    const session = makeDraftSession();
    const roster = makeSavedRoster();
    const season = makeSeason();

    await store.saveDraftSession(session);
    await store.saveRoster(roster);
    await store.saveSeason(season);

    const all = await store.exportAll();
    expect(all.sessions).toEqual([{ ...session, cardSetVersion: CURRENT_CARD_SET_VERSION }]);
    expect(all.rosters).toEqual([{ ...roster, cardSetVersion: CURRENT_CARD_SET_VERSION }]);
    expect(all.seasons).toEqual([season]);
  });

  it('clearAll empties every collection', async () => {
    await store.saveDraftSession(makeDraftSession());
    await store.saveRoster(makeSavedRoster());
    await store.saveSeason(makeSeason());

    await store.clearAll();

    expect(await store.listDraftSessions()).toEqual([]);
    expect(await store.listRosters()).toEqual([]);
    expect(await store.listSeasons()).toEqual([]);
  });

  it('usage reports collection counts and a positive byte estimate', async () => {
    const empty = await store.usage();
    expect(empty.sessions).toBe(0);
    expect(empty.seasons).toBe(0);
    expect(empty.rosters).toBe(0);

    await store.saveDraftSession(makeDraftSession());
    await store.saveRoster(makeSavedRoster());
    await store.saveSeason(makeSeason());

    const usage = await store.usage();
    expect(usage.sessions).toBe(1);
    expect(usage.rosters).toBe(1);
    expect(usage.seasons).toBe(1);
    expect(usage.bytesEstimate).toBeGreaterThan(0);
  });
});
