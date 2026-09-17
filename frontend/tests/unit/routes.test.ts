/**
 * Route classification (`src/lib/routes.ts`).
 *
 * `canShowWhatsNew` exists because the splash lives in the root layout and opens when two
 * async reads land — so without a route check it appeared over whatever screen the user
 * had already moved on to, which in practice was the draft room.
 */

import { describe, it, expect } from 'vitest';
import { canShowWhatsNew, isGameRoute, isBareRoute } from '@/lib/routes';

describe('canShowWhatsNew', () => {
  it('allows the calm routes, starting with the home page it was designed for', () => {
    for (const p of ['/', '/rosters', '/data', '/debug', '/deckbuilder-test']) {
      expect(canShowWhatsNew(p), p).toBe(true);
    }
  });

  it('never interrupts a game in progress', () => {
    for (const p of ['/draft', '/draft?mode=premier&game=challenge', '/roster/abc123', '/season',
                     '/challenge/roster_1', '/challenge/preview']) {
      expect(canShowWhatsNew(p), p).toBe(false);
    }
  });

  it('stays off the auth pages', () => {
    for (const p of ['/login', '/signup', '/pending']) {
      expect(canShowWhatsNew(p), p).toBe(false);
    }
  });
});

describe('route classification', () => {
  it('treats the 82:0 run as a game route, so it keeps the gear menu and loses the bar', () => {
    expect(isGameRoute('/challenge/roster_1')).toBe(true);
    expect(isBareRoute('/challenge/roster_1')).toBe(false);
  });

  it('keeps the home hero and auth pages bare', () => {
    for (const p of ['/', '/login', '/signup', '/pending']) expect(isBareRoute(p), p).toBe(true);
  });
});
