'use client';

/**
 * Client-side bridge into `@/storage`. Mounts once near the app root
 * (see `src/app/layout.tsx`, inside `AuthProvider`) and does two things:
 *
 * 1. Kicks off the one-time localStorage -> GameStore migration (`initStorage()`).
 * 2. Keeps the store's OWNER in step with who is signed in (sync_outbox D1). The owner id
 *    comes from `AuthProvider`'s context, so a login, a logout or an account switch that
 *    never reloads the page (they are soft navigations) still re-scopes the store — it
 *    used to be set once per page load from this component's own `/api/auth/me` fetch,
 *    which left cloud sync off after a login until the next hard reload.
 *
 * "Ready" means the LOCAL store is migrated, owned by the current user and reconciled
 * with the cloud as far as `setOwnerId`'s (time-boxed) pull got. The first push to
 * Supabase runs in the background; blocking on it made every gated screen wait seconds
 * on an established account.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initStorage } from '@/storage';
import { getGameStore } from '@/storage';
import { useAuthStatus, useCurrentProfile } from './AuthProvider';

const StorageReadyContext = createContext(false);
const LocalStoreReadyContext = createContext(false);

/** Device-local marker: ownerless ("legacy", pre-accounts) rows were already handed to a
 *  signed-in user on this device. Claiming on EVERY login would give whatever was saved
 *  while signed out to whoever logs in next. */
const LEGACY_CLAIMED_KEY = 'legacy_claimed';

/** The store is migrated, owned, and reconciled with the cloud. Wait on this before any
 *  read whose absence would make you CREATE something (a challenge run, a season) — acting
 *  on a not-yet-pulled empty result is how you end up with duplicates. Goes back to false
 *  while an owner change (login, logout, account switch) is being applied. */
export function useStorageReady(): boolean {
  return useContext(StorageReadyContext);
}

/**
 * The LOCAL store is migrated and usable — true seconds before `useStorageReady`, which
 * additionally waits on the owner being applied and a cloud pull. Use it for device-local,
 * read-only, non-critical data: reading stale-by-a-moment data is fine, creating something
 * from it is not. Owned rows (rosters, seasons, ...) are NOT visible yet at this point —
 * the stores filter every read by owner — so re-read those once `useStorageReady` is true.
 *
 * Added 2026-09-18: the What's New splash gated on full readiness, so on an established
 * account it fired ~16s in — by which time the user had left the home page it is meant for
 * and was in the draft room.
 */
export function useLocalStoreReady(): boolean {
  return useContext(LocalStoreReadyContext);
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const authStatus = useAuthStatus();
  const ownerId = useCurrentProfile()?.id ?? null;
  const [localReady, setLocalReady] = useState(false);
  // The owner the store is currently scoped to; `undefined` = none applied yet. `ready` is
  // DERIVED from it, so the very render in which the signed-in user changes already
  // reports not-ready — no gated page can read under the previous owner in between.
  const [appliedOwner, setAppliedOwner] = useState<string | null | undefined>(undefined);
  const initiated = useRef(false);
  // Owner changes are applied strictly one after another (a logout landing while a login's
  // pull is still running must not interleave with it).
  const ownerChain = useRef<Promise<void>>(Promise.resolve());

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
      .finally(() => setLocalReady(true));
  }, []);

  useEffect(() => {
    if (!localReady || authStatus === 'loading') return;
    let cancelled = false;

    ownerChain.current = ownerChain.current.then(async () => {
      if (cancelled) return;
      const store = getGameStore();
      try {
        await store.setOwnerId(ownerId);
        if (ownerId) {
          if ((await store.getMeta(LEGACY_CLAIMED_KEY)) === null) {
            await store.claimLegacyData();
            await store.setMeta(LEGACY_CLAIMED_KEY, new Date().toISOString());
          }
          // accounts_cloud_saves D5: queue whatever this device has that the cloud doesn't
          // (only SupabaseGameStore has this method). NOT awaited (2026-09-18): on an
          // established account it took 15-25s, and because `ready` gates every consumer
          // of `useStorageReady` the whole app waited on a background sync.
          if ('pushLocalToCloud' in store) {
            void (store as { pushLocalToCloud(): Promise<void> }).pushLocalToCloud()
              .catch((err) => console.error('Background pushLocalToCloud() failed:', err));
          }
        }
      } catch (err) {
        // A failed pull/claim must not leave every gated screen on "Loading" forever: the
        // local store is still scoped to `ownerId` (that part cannot fail) and usable.
        console.error('Applying the storage owner failed; continuing with local data:', err);
      }
      if (!cancelled) setAppliedOwner(ownerId);
    });

    return () => { cancelled = true; };
  }, [localReady, authStatus, ownerId]);

  const ready = localReady && authStatus !== 'loading' && appliedOwner === ownerId;

  return (
    <StorageReadyContext.Provider value={ready}>
      <LocalStoreReadyContext.Provider value={localReady}>
        {children}
      </LocalStoreReadyContext.Provider>
    </StorageReadyContext.Provider>
  );
}
