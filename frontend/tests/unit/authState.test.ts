/**
 * `resolveAuthState`/`parseCachedProfile` (`src/lib/authState.ts`) — pure decision logic
 * behind AuthProvider's refreshAuth (sync_outbox D1/D3). `resolveAuthState` in particular
 * must treat a network failure/timeout ('unreachable') as "stay signed in as the cached
 * profile" rather than 'signed-out', since sync_outbox D2 makes local stores filter every
 * read by owner id — a false "signed out" would hide a signed-in user's own rosters.
 */

import { describe, it, expect } from 'vitest';
import { parseCachedProfile, resolveAuthState } from '@/lib/authState';
import type { CurrentProfile } from '@/components/AuthProvider';

const PROFILE: CurrentProfile = {
  id: 'user-1',
  email: 'a@example.com',
  username: 'alice',
  display_name: 'Alice',
  status: 'APPROVED',
  role: 'USER',
};

const OTHER_PROFILE: CurrentProfile = {
  id: 'user-2',
  email: 'b@example.com',
  username: 'bob',
  display_name: 'Bob',
  status: 'APPROVED',
  role: 'USER',
};

describe('resolveAuthState', () => {
  it('a profile outcome resolves signed-in with that profile, caching it', () => {
    expect(resolveAuthState({ kind: 'profile', profile: PROFILE }, null)).toEqual({
      profile: PROFILE,
      status: 'signed-in',
      cache: PROFILE,
    });
  });

  it('a profile outcome replaces a different cached profile (account switch)', () => {
    expect(resolveAuthState({ kind: 'profile', profile: PROFILE }, OTHER_PROFILE)).toEqual({
      profile: PROFILE,
      status: 'signed-in',
      cache: PROFILE,
    });
  });

  it('unauthorized resolves signed-out and clears the cache, even with a cached profile', () => {
    expect(resolveAuthState({ kind: 'unauthorized' }, PROFILE)).toEqual({
      profile: null,
      status: 'signed-out',
      cache: null,
    });
  });

  it('unauthorized with no cache also resolves signed-out', () => {
    expect(resolveAuthState({ kind: 'unauthorized' }, null)).toEqual({
      profile: null,
      status: 'signed-out',
      cache: null,
    });
  });

  it('unreachable with a cached profile stays signed-in as that cached profile', () => {
    expect(resolveAuthState({ kind: 'unreachable' }, PROFILE)).toEqual({
      profile: PROFILE,
      status: 'signed-in',
      cache: PROFILE,
    });
  });

  it('unreachable with no cache falls back to signed-out', () => {
    expect(resolveAuthState({ kind: 'unreachable' }, null)).toEqual({
      profile: null,
      status: 'signed-out',
      cache: null,
    });
  });
});

describe('parseCachedProfile', () => {
  it('parses a valid cached profile', () => {
    expect(parseCachedProfile(JSON.stringify(PROFILE))).toEqual(PROFILE);
  });

  it('returns null for a null input', () => {
    expect(parseCachedProfile(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseCachedProfile('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseCachedProfile('{not json')).toBeNull();
  });

  it('returns null for valid JSON that is not an object', () => {
    expect(parseCachedProfile('"just a string"')).toBeNull();
    expect(parseCachedProfile('42')).toBeNull();
    expect(parseCachedProfile('null')).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    const withoutId: Partial<CurrentProfile> = { ...PROFILE };
    delete withoutId.id;
    expect(parseCachedProfile(JSON.stringify(withoutId))).toBeNull();
  });

  it('returns null for an invalid status value', () => {
    expect(parseCachedProfile(JSON.stringify({ ...PROFILE, status: 'BANNED' }))).toBeNull();
  });

  it('returns null for an invalid role value', () => {
    expect(parseCachedProfile(JSON.stringify({ ...PROFILE, role: 'SUPERADMIN' }))).toBeNull();
  });

  it('returns null when id is an empty string', () => {
    expect(parseCachedProfile(JSON.stringify({ ...PROFILE, id: '' }))).toBeNull();
  });
});
