/**
 * One-time migration of the old localStorage-based persistence
 * (`hoops-draft-sessions`, `hoops-draft-seasons`, `myRosters`) into a
 * GameStore (IndexedDB in the browser, memory in tests/SSR).
 *
 * Safe to call on every app start: it no-ops when none of the legacy keys is
 * present (they are renamed to `<key>.migrated` after a successful import, so
 * a second run finds nothing to do). The `migratedFromLocalStorage` meta entry
 * only records when the last import happened; it is NOT used as a skip flag,
 * so legacy data that shows up later (e.g. restored from a backup) is still
 * picked up. It never deletes user data.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { GameStore, SavedRoster } from './types';

const OLD_SESSIONS_KEY = 'hoops-draft-sessions';
const OLD_SEASONS_KEY = 'hoops-draft-seasons';
const OLD_ROSTERS_KEY = 'myRosters';
const MIGRATED_META_KEY = 'migratedFromLocalStorage';

/** Optional extra methods a store may implement to persist the migration flag. */
interface MetaCapable {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

function isMetaCapable(store: GameStore): store is GameStore & MetaCapable {
  return (
    typeof (store as Partial<MetaCapable>).getMeta === 'function' &&
    typeof (store as Partial<MetaCapable>).setMeta === 'function'
  );
}

function readAndParse<T>(key: string): T[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function renameKey(key: string): void {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    localStorage.setItem(`${key}.migrated`, raw);
    localStorage.removeItem(key);
  } catch {
    // Best-effort — if localStorage is unavailable/full for the rename, the
    // migrated data is already in `store`, so nothing is lost either way.
  }
}

export async function migrateFromLocalStorage(store: GameStore): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  let anyLegacyKey = false;
  try {
    anyLegacyKey = [OLD_SESSIONS_KEY, OLD_SEASONS_KEY, OLD_ROSTERS_KEY].some(
      (k) => localStorage.getItem(k) !== null,
    );
  } catch {
    return;
  }
  if (!anyLegacyKey) return;

  const oldSessions = readAndParse<DraftSession>(OLD_SESSIONS_KEY);
  const oldSeasons = readAndParse<Season>(OLD_SEASONS_KEY);
  const oldRosters = readAndParse<SavedRoster>(OLD_ROSTERS_KEY);

  if (oldSessions) {
    for (const session of oldSessions) {
      await store.saveDraftSession(session);
    }
  }
  if (oldSeasons) {
    for (const season of oldSeasons) {
      await store.saveSeason(season);
    }
  }
  if (oldRosters) {
    for (const roster of oldRosters) {
      await store.saveRoster(roster);
    }
  }

  if (isMetaCapable(store)) {
    await store.setMeta(MIGRATED_META_KEY, new Date().toISOString());
  }

  // Rename regardless of parse success so a corrupt/legacy value doesn't get
  // re-parsed (and fail) on every subsequent app load.
  renameKey(OLD_SESSIONS_KEY);
  renameKey(OLD_SEASONS_KEY);
  renameKey(OLD_ROSTERS_KEY);
}
