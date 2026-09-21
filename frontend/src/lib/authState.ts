/**
 * sync_outbox D1/D3: pure decision logic for what a `/api/auth/me` fetch means and what to
 * do with the localStorage profile cache. Kept free of react/next/fetch/window so it's
 * unit-testable without a DOM and so AuthProvider.tsx's network/browser glue stays separate
 * from "what does this outcome mean".
 */

import type { CurrentProfile } from '@/components/AuthProvider';

/** The three ways a refresh of `/api/auth/me` can end: a profile (200), an explicit
 *  sign-out (401/403), or anything else (network error, timeout, 5xx) that says nothing
 *  about whether the user is actually signed in. */
export type AuthFetchOutcome =
  | { kind: 'profile'; profile: CurrentProfile }
  | { kind: 'unauthorized' }
  | { kind: 'unreachable' };

export type ResolvedAuthState = {
  profile: CurrentProfile | null;
  status: 'signed-in' | 'signed-out';
  cache: CurrentProfile | null;
};

/**
 * `'unreachable'` deliberately keeps the LAST KNOWN profile (if any) instead of dropping to
 * signed-out: with sync_outbox D2, local stores filter every read by owner id, so treating a
 * slow or offline network as "signed out" would make a signed-in user's rosters vanish on a
 * bad connection. Only an explicit `'unauthorized'` (the server itself said 401/403) clears
 * the cache and the profile.
 */
export function resolveAuthState(outcome: AuthFetchOutcome, cached: CurrentProfile | null): ResolvedAuthState {
  if (outcome.kind === 'profile') {
    return { profile: outcome.profile, status: 'signed-in', cache: outcome.profile };
  }
  if (outcome.kind === 'unauthorized') {
    return { profile: null, status: 'signed-out', cache: null };
  }
  if (cached) {
    return { profile: cached, status: 'signed-in', cache: cached };
  }
  return { profile: null, status: 'signed-out', cache: null };
}

const PROFILE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const PROFILE_ROLES = ['USER', 'ADMIN'];

/** Defensive JSON-parse plus shape check for the `auth.lastProfile` localStorage cache: the
 *  value could be absent, corrupted, or left over from an earlier/incompatible shape of
 *  `CurrentProfile`. Returns null on anything that doesn't look like a real profile rather
 *  than throwing or handing back a half-formed object. */
export function parseCachedProfile(raw: string | null): CurrentProfile | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null;
  if (typeof candidate.email !== 'string') return null;
  if (typeof candidate.username !== 'string') return null;
  if (typeof candidate.display_name !== 'string') return null;
  if (typeof candidate.status !== 'string' || !PROFILE_STATUSES.includes(candidate.status)) return null;
  if (typeof candidate.role !== 'string' || !PROFILE_ROLES.includes(candidate.role)) return null;
  return candidate as CurrentProfile;
}
