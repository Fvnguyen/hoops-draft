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
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initStorage } from '@/storage';

const StorageReadyContext = createContext(false);

export function useStorageReady(): boolean {
  return useContext(StorageReadyContext);
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const initiated = useRef(false);

  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;

    initStorage()
      .catch((err) => {
        // Migration failing shouldn't block the app — the store falls back
        // to an in-memory/empty state and callers still get a usable
        // (if unmigrated) GameStore.
        console.error('initStorage() failed; continuing with an unmigrated store:', err);
      })
      .finally(() => setReady(true));
  }, []);

  return (
    <StorageReadyContext.Provider value={ready}>
      {children}
    </StorageReadyContext.Provider>
  );
}
