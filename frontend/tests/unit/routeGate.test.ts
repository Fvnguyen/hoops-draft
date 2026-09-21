import { describe, it, expect } from 'vitest';
import { PUBLIC_PATHS, isProtected } from '@/lib/routeGate';

describe('isProtected', () => {
  it('gates the home page and every app route', () => {
    for (const path of ['/', '/draft', '/rosters', '/roster/roster_123', '/season', '/season/abc',
      '/challenge/roster_123', '/admin/analytics', '/data', '/debug']) {
      expect(isProtected(path), path).toBe(true);
    }
  });

  it('gated /roster/<id> and /challenge/<id> used to slip through: only /rosters was listed', () => {
    expect(isProtected('/roster/x')).toBe(true);
    expect(isProtected('/challenge/x')).toBe(true);
  });

  it('keeps the no-auth design sign-off routes open (AGENTS.md)', () => {
    expect(isProtected('/challenge/preview')).toBe(false);
    expect(isProtected('/challenge/preview-results')).toBe(false);
    // ...but not anything that merely starts like them
    expect(isProtected('/challenge/preview-x')).toBe(true);
  });

  it('does not treat a look-alike prefix as the route', () => {
    expect(isProtected('/drafty')).toBe(false);
    expect(isProtected('/rosters-export')).toBe(false);
  });

  it('leaves the auth pages public', () => {
    for (const path of ['/login', '/signup', '/pending']) {
      expect(PUBLIC_PATHS.has(path)).toBe(true);
      expect(isProtected(path)).toBe(false);
    }
  });
});
