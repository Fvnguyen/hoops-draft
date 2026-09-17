import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { IndexedDbGameStore, MagicBallDB } from '@/storage/indexedDb';
import type { GameStore, SavedRoster } from '@/storage/types';
import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';

let dbCounter = 0;

const implementations: Array<{ name: string; make: () => GameStore }> = [
  { name: 'MemoryGameStore', make: () => new MemoryGameStore() },
  {
    name: 'IndexedDbGameStore',
    make: () => new IndexedDbGameStore(new MagicBallDB(`safeload-test-${dbCounter++}`)),
  },
];

describe.each(implementations)('$name safe loads', ({ make }) => {
  let store: GameStore;

  beforeEach(() => {
    store = make();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('drops a draft session missing required fields instead of throwing', async () => {
    const corrupt = { id: 'bad-session', timestamp: '2026-01-01' } as unknown as DraftSession;
    await store.saveDraftSession(corrupt);

    await expect(store.getDraftSession('bad-session')).resolves.toBeNull();
    await expect(store.listDraftSessions()).resolves.toEqual([]);
  });

  it('drops a roster missing required fields instead of throwing', async () => {
    const corrupt = { id: 'bad-roster' } as unknown as SavedRoster;
    await store.saveRoster(corrupt);

    await expect(store.getRoster('bad-roster')).resolves.toBeNull();
    await expect(store.listRosters()).resolves.toEqual([]);
  });

  it('drops a season missing required fields instead of throwing', async () => {
    const corrupt = { id: 'bad-season' } as unknown as Season;
    await store.saveSeason(corrupt);

    await expect(store.getSeason('bad-season')).resolves.toBeNull();
    await expect(store.getSeasonByRoster('whatever')).resolves.toBeNull();
    await expect(store.listSeasons()).resolves.toEqual([]);
  });

  it('drops a challenge run missing required fields instead of throwing', async () => {
    const corrupt = { id: 'bad-run', phase: 'first' } as unknown as import('@/storage/types').ChallengeRun;
    await store.saveChallengeRun(corrupt);

    await expect(store.getChallengeRun('bad-run')).resolves.toBeNull();
    await expect(store.getChallengeRunByRoster('whatever')).resolves.toBeNull();
    await expect(store.listChallengeRuns()).resolves.toEqual([]);
  });

  it('does not auto-upgrade a legacy per-game season schedule on load (upgrade now runs once, at DB open — see storage-migration.test.ts)', async () => {
    // Per D3, `normalizeSeason` moved from a load-time call in safeLoad.ts to
    // a one-time Dexie `.upgrade()` step run when the store is opened. A
    // legacy-shaped season written directly via `saveSeason` (bypassing that
    // upgrade step, which only runs once at DB open) is no longer rewritten
    // on read — it round-trips as-is, since the shape check here only
    // validates the top-level Season fields, not the schedule entries.
    const legacySeason = {
      id: 'legacy-season',
      sessionId: 'sess-1',
      rosterId: 'roster-1',
      timestamp: new Date().toISOString(),
      schedule: [{ gameIndex: 0, opponentSeatIndex: 1, played: true, seed: 7 }],
      standings: [],
      currentGame: 1,
      humanTeam: {},
      seed: 7,
    } as unknown as Season;
    await store.saveSeason(legacySeason);

    const loaded = await store.getSeason('legacy-season');
    expect(loaded).not.toBeNull();
    expect(loaded!.schedule[0]).toMatchObject({ gameIndex: 0, opponentSeatIndex: 1, played: true });
    expect((loaded!.schedule[0] as unknown as { matchups?: unknown }).matchups).toBeUndefined();
  });
});
