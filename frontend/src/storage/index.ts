/**
 * Storage layer entry point. See ./README.md for usage.
 */

import { IndexedDbGameStore } from './indexedDb';
import { MemoryGameStore } from './memory';
import { migrateFromLocalStorage } from './migrate';
import type { GameStore } from './types';

export type { GameStore, SavedRoster } from './types';
export { StorageQuotaError } from './types';
export { MemoryGameStore } from './memory';
export { IndexedDbGameStore, MagicBallDB } from './indexedDb';
export { migrateFromLocalStorage } from './migrate';

let singleton: GameStore | null = null;

/**
 * Returns the process-wide GameStore singleton: an IndexedDB-backed store in
 * any environment where `indexedDB` exists (real browsers, and tests that
 * import `fake-indexeddb/auto`), or an in-memory store during SSR (Next.js
 * server rendering/route handlers have no IndexedDB).
 */
export function getGameStore(): GameStore {
  if (singleton) return singleton;
  singleton = typeof indexedDB === 'undefined' ? new MemoryGameStore() : new IndexedDbGameStore();
  return singleton;
}

let migrated = false;

/**
 * Runs the one-time localStorage -> GameStore migration. Idempotent and
 * cheap to call on every app mount; wave-2 UI code should call this once
 * near the app root (e.g. a top-level layout/client effect) before reading
 * from `getGameStore()`.
 */
export async function initStorage(): Promise<void> {
  if (migrated) return;
  migrated = true;
  await migrateFromLocalStorage(getGameStore());
}
