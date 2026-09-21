'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseCachedProfile, resolveAuthState, type AuthFetchOutcome } from '@/lib/authState';

export type CurrentProfile = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: 'USER' | 'ADMIN';
};

/** plan_ui_foundation D6: lets TopNav tell "we don't know yet" (loading, reserve space
 *  for placeholders) apart from "checked, nobody's signed in" (signed-out, render
 *  nothing) instead of collapsing both into the same `null` profile. */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

const AuthContext = createContext<CurrentProfile | null>(null);
const AuthStatusContext = createContext<AuthStatus>('loading');
export type RefreshAuth = (options?: { identityChanged?: boolean }) => Promise<void>;
const RefreshAuthContext = createContext<RefreshAuth>(async () => {});

export function useCurrentProfile() { return useContext(AuthContext); }
export function useAuthStatus() { return useContext(AuthStatusContext); }
/** sync_outbox D1: re-runs the `/api/auth/me` check on demand. Login and logout are soft
 *  navigations (`router.push` + `router.refresh`), which never remount this provider, so
 *  without this the profile context stays stale until a hard reload. Its own context so
 *  components that only read `useCurrentProfile`/`useAuthStatus` don't re-render just
 *  because this function's identity is looked up somewhere in the tree.
 *
 *  Login and logout pass `identityChanged: true`: the session cookie was just replaced, so
 *  if this check cannot reach the server the last known profile is NOT a safe fallback —
 *  it would keep user A signed in (and A's owner id on every store read and cloud push)
 *  while the cookie already belongs to B, or to nobody. */
export function useRefreshAuth() { return useContext(RefreshAuthContext); }

/** Per-device convenience cache, same try/catch-everything pattern as DeckBuilder's dock
 *  keys — never the source of truth, just what a slow/offline refresh falls back to. */
const CACHE_KEY = 'auth.lastProfile';
const VISIBILITY_REFRESH_MIN_AGE_MS = 60_000;
const FETCH_TIMEOUT_MS = 4_000;

function readCachedProfile(): CurrentProfile | null {
  try {
    return parseCachedProfile(window.localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: CurrentProfile | null): void {
  try {
    if (profile) window.localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // best-effort persistence only
  }
}

function sameProfile(a: CurrentProfile | null, b: CurrentProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.status === b.status && a.role === b.role
    && a.username === b.username && a.display_name === b.display_name && a.email === b.email;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  // Mirrors `profile` synchronously (state updates are async) so a refresh in flight can
  // compare against "what we currently show" without depending on a stale closure.
  const profileRef = useRef<CurrentProfile | null>(null);
  // sync_outbox D3: "always start a new fetch, ignore the result of any fetch that isn't
  // the latest" — simpler than chaining, and login/logout call sites need their refresh to
  // observe the fresh cookie rather than piggyback on one already in flight.
  const requestIdRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const mountedRef = useRef(true);

  const refreshAuth = useCallback<RefreshAuth>(async (options) => {
    const requestId = ++requestIdRef.current;
    let outcome: AuthFetchOutcome;
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) {
        outcome = { kind: 'profile', profile: await response.json() as CurrentProfile };
      } else if (response.status === 401 || response.status === 403) {
        outcome = { kind: 'unauthorized' };
      } else {
        outcome = { kind: 'unreachable' };
      }
    } catch {
      // Network error, timeout (AbortSignal.timeout) or a malformed response body.
      outcome = { kind: 'unreachable' };
    }

    // A newer refreshAuth() call already landed while this one was in flight — its result
    // is stale, discard it rather than clobber whatever the newer one resolved.
    if (requestId !== requestIdRef.current) return;
    lastRefreshAtRef.current = Date.now();

    const fallback = options?.identityChanged ? null : profileRef.current ?? readCachedProfile();
    const resolved = resolveAuthState(outcome, fallback);
    writeCachedProfile(resolved.cache);
    if (!mountedRef.current) return;
    if (!sameProfile(profileRef.current, resolved.profile)) {
      profileRef.current = resolved.profile;
      setProfile(resolved.profile);
    }
    setStatus(resolved.status);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // PWA resume: an installed app can sit backgrounded for days. Re-check on the tab
  // becoming visible again, but only if the last refresh is stale enough that it's worth
  // another round-trip (every tab switch would be wasteful).
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshAtRef.current < VISIBILITY_REFRESH_MIN_AGE_MS) return;
      void refreshAuth();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshAuth]);

  // Dynamic import keeps the Supabase browser client out of the root chunk — every page
  // pays for AuthProvider, but only this one listener needs the client. And only while
  // someone is signed in (plan mobile_load D7): a token refresh or a remote sign-out can
  // only happen to an existing session, so /login never downloads supabase-js at all.
  useEffect(() => {
    if (status !== 'signed-in') return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    import('@/lib/supabase/browser')
      .then(({ createSupabaseBrowserClient }) => {
        if (cancelled) return;
        const supabase = createSupabaseBrowserClient();
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            void refreshAuth();
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((err) => {
        console.error('Failed to load Supabase browser client for auth state changes:', err);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refreshAuth, status]);

  return (
    <AuthContext.Provider value={profile}>
      <AuthStatusContext.Provider value={status}>
        <RefreshAuthContext.Provider value={refreshAuth}>{children}</RefreshAuthContext.Provider>
      </AuthStatusContext.Provider>
    </AuthContext.Provider>
  );
}
