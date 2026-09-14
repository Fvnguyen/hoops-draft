'use client';

/**
 * accounts_cloud_saves D7: live sync/conflict status for the TopNav indicator and
 * SyncConflictPrompt. Backed by `GameStore.subscribeSyncStatus` — a store with no cloud
 * sync (IndexedDb/Memory alone) reports `idle` once and never updates.
 */
import { useEffect, useState } from 'react';
import { getGameStore, IDLE_SYNC_STATUS, type SyncStatus } from '@/storage';

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(IDLE_SYNC_STATUS);

  useEffect(() => {
    const store = getGameStore();
    return store.subscribeSyncStatus(setStatus);
  }, []);

  return status;
}
