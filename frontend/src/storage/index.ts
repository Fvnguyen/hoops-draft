/**
 * Storage layer entry point. See ./README.md for usage.
 */

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { IndexedDbGameStore } from './indexedDb';
import { MemoryGameStore } from './memory';
import { migrateFromLocalStorage } from './migrate';
import { SupabaseGameStore, type CloudSyncClient } from './supabase';
import type { GameStore } from './types';

export type { GameStore, SavedRoster, StorageMeta, SyncConflict, SyncStatus, SyncTable } from './types';
export { StorageQuotaError, CURRENT_CARD_SET_VERSION, IDLE_SYNC_STATUS } from './types';
export { MemoryGameStore } from './memory';
export { IndexedDbGameStore, MagicBallDB } from './indexedDb';
export { SupabaseGameStore, type CloudSyncClient } from './supabase';
export { migrateFromLocalStorage } from './migrate';

let singleton: GameStore | null = null;

/**
 * Returns the process-wide GameStore singleton: in any environment where `indexedDB`
 * exists (real browsers, and tests that import `fake-indexeddb/auto`) a `SupabaseGameStore`
 * wrapping an `IndexedDbGameStore` (accounts_cloud_saves D3 — IndexedDB stays the store
 * every read goes through; Supabase sync only kicks in once `setOwnerId` is called with a
 * real id), or an in-memory store during SSR (Next.js server rendering/route handlers
 * have no IndexedDB, and never need cloud sync — API routes talk to Supabase directly).
 */
export function getGameStore(): GameStore {
  if (singleton) return singleton;
  if (typeof indexedDB === 'undefined') {
    singleton = new MemoryGameStore();
  } else {
    singleton = new SupabaseGameStore(new IndexedDbGameStore(), createSupabaseBrowserClient() as unknown as CloudSyncClient);
  }
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
