import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryGameStore } from '@/storage/memory';
import { migrateFromLocalStorage } from '@/storage/migrate';
import { makeDraftSession, makeSavedRoster, makeSeason } from './fixtures';

/** Tiny in-memory shim so these tests don't depend on a DOM/jsdom environment. */
class LocalStorageShim {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
}

function installLocalStorageShim(): LocalStorageShim {
  const shim = new LocalStorageShim();
  (globalThis as unknown as { localStorage: Storage }).localStorage = shim as unknown as Storage;
  return shim;
}

describe('migrateFromLocalStorage', () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  it('copies sessions, seasons and rosters into the store and renames the old keys', async () => {
    const session = makeDraftSession();
    const season = makeSeason();
    const roster = makeSavedRoster();

    localStorage.setItem('hoops-draft-sessions', JSON.stringify([session]));
    localStorage.setItem('hoops-draft-seasons', JSON.stringify([season]));
    localStorage.setItem('myRosters', JSON.stringify([roster]));

    const store = new MemoryGameStore();
    await migrateFromLocalStorage(store);

    expect(await store.getDraftSession(session.id)).toEqual(session);
    expect(await store.getSeason(season.id)).toEqual(season);
    expect(await store.getRoster(roster.id)).toEqual(roster);

    // Old keys are gone...
    expect(localStorage.getItem('hoops-draft-sessions')).toBeNull();
    expect(localStorage.getItem('hoops-draft-seasons')).toBeNull();
    expect(localStorage.getItem('myRosters')).toBeNull();
    // ...but renamed, not deleted.
    expect(localStorage.getItem('hoops-draft-sessions.migrated')).toBe(JSON.stringify([session]));
    expect(localStorage.getItem('hoops-draft-seasons.migrated')).toBe(JSON.stringify([season]));
    expect(localStorage.getItem('myRosters.migrated')).toBe(JSON.stringify([roster]));

    expect(await store.getMeta('migratedFromLocalStorage')).toBeTruthy();
  });

  it('is a no-op with nothing in localStorage', async () => {
    const store = new MemoryGameStore();
    await expect(migrateFromLocalStorage(store)).resolves.not.toThrow();

    expect(await store.listDraftSessions()).toEqual([]);
    expect(await store.listSeasons()).toEqual([]);
    expect(await store.listRosters()).toEqual([]);
  });

  it('skips a key with corrupt JSON without blocking the other keys', async () => {
    localStorage.setItem('hoops-draft-sessions', '{ not valid json');
    const roster = makeSavedRoster();
    localStorage.setItem('myRosters', JSON.stringify([roster]));

    const store = new MemoryGameStore();
    await migrateFromLocalStorage(store);

    expect(await store.listDraftSessions()).toEqual([]);
    expect(await store.getRoster(roster.id)).toEqual(roster);
  });

  it('is idempotent: a second run does not re-import or duplicate data', async () => {
    const session = makeDraftSession();
    localStorage.setItem('hoops-draft-sessions', JSON.stringify([session]));

    const store = new MemoryGameStore();
    await migrateFromLocalStorage(store);
    const flagAfterFirstRun = await store.getMeta('migratedFromLocalStorage');

    // A naive second run would find nothing under the old (now-renamed) key anyway;
    // the real guarantee we want is the meta flag short-circuiting *before* that, so
    // simulate the key coming back (e.g. an old browser tab still writing to it) and
    // confirm the flag alone is enough to skip re-import.
    localStorage.setItem('hoops-draft-sessions', JSON.stringify([makeDraftSession({ id: 'late-arrival' })]));

    await migrateFromLocalStorage(store);

    expect(await store.getDraftSession('late-arrival')).toBeNull();
    expect(await store.listDraftSessions()).toEqual([session]);
    expect(await store.getMeta('migratedFromLocalStorage')).toBe(flagAfterFirstRun);
  });
});
