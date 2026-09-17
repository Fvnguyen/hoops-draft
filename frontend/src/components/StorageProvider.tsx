'use client';

/**
 * Client-side bridge into `@/storage`. Mounts once near the app root
 * (see `src/app/layout.tsx`) and kicks off the one-time
 * localStorage -> GameStore migration (`initStorage()`) without blocking
 * rendering of the rest of the app.
 *
 * Pages/components that need data from the store should wait on
 * `useStorageReady()` before calling `getGameStore()` so any pre-existing
 * localStorage data has had a chance to migrate in.
 *
 * "Ready" means the LOCAL store is migrated, owned and usable — deliberately not "the
 * cloud is in sync". The initial push to Supabase runs in the background; blocking on it
 * made every gated screen wait seconds on an established account.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initStorage } from '@/storage';
import { getGameStore } from '@/storage';

const StorageReadyContext = createContext(false);
const LocalStoreReadyContext = createContext(false);

/** The store is migrated, owned, and reconciled with the cloud. Wait on this before any
 *  read whose absence would make you CREATE something (a challenge run, a season) — acting
 *  on a not-yet-pulled empty result is how you end up with duplicates. */
export function useStorageReady(): boolean {
  return useContext(StorageReadyContext);
}

/**
 * The LOCAL store is migrated and usable — true seconds before `useStorageReady`, which
 * additionally waits on a full cloud pull. Use it for device-local, read-only, non-critical
 * data: reading stale-by-a-moment data is fine, creating something from it is not.
 *
 * Added 2026-09-18: the What's New splash gated on full readiness, so on an established
 * account it fired ~16s in — by which time the user had left the home page it is meant for
 * and was in the draft room.
 */
export function useLocalStoreReady(): boolean {
  return useContext(LocalStoreReadyContext);
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const initiated = useRef(false);

  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;

    initStorage()
      .then(async () => {
        // Local store is usable from here — everything below is cloud reconciliation.
        setLocalReady(true);
        const response = await fetch('/api/auth/me');
        if (!response.ok) return;
        const profile = await response.json() as { id?: string };
        if (profile.id) {
          const store = getGameStore();
          await store.setOwnerId(profile.id);
          await store.claimLegacyData();
          // accounts_cloud_saves D5: push whatever this device has that the cloud
          // doesn't, once per mount — cas_upsert-based, so this is a no-op for rows the
          // server already has (only IndexedDB-backed SupabaseGameStore has this method;
          // MemoryGameStore/IndexedDbGameStore alone never do).
          // NOT awaited (2026-09-18): this walks every local row and CAS-pushes it, which
          // on an established account is hundreds of round-trips and took 15-25s. Because
          // `ready` gates every consumer of `useStorageReady`, the whole app waited on a
          // background sync — the 82:0 page sat on "LOADING", and the What's New splash
          // fired so late it landed on whatever screen the user had moved on to (usually
          // the draft room). Readiness now means "the local store is migrated, owned and
          // usable", which is what callers actually need; the push carries on behind it.
          if ('pushLocalToCloud' in store) {
            void (store as { pushLocalToCloud(): Promise<void> }).pushLocalToCloud()
              .catch((err) => console.error('Background pushLocalToCloud() failed:', err));
          }
        }
      })
      .catch((err) => {
        // Migration failing shouldn't block the app — the store falls back
        // to an in-memory/empty state and callers still get a usable
        // (if unmigrated) GameStore.
        console.error('initStorage() failed; continuing with an unmigrated store:', err);
      })
      .finally(() => { setLocalReady(true); setReady(true); });
  }, []);

  return (
    <StorageReadyContext.Provider value={ready}>
      <LocalStoreReadyContext.Provider value={localReady}>
        {children}
      </LocalStoreReadyContext.Provider>
    </StorageReadyContext.Provider>
  );
}
