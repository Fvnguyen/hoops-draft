/**
 * Minimal, structurally-valid fixtures for the storage layer tests.
 *
 * Uses `import type` for everything under `@/engine/*` so these tests can run
 * (and this file can be imported) even before the engine-isolation work lands
 * those modules — `import type` is erased at build time and never evaluated.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { ChallengeRun, SavedRoster } from '@/storage/types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

export function makeDraftSession(overrides: Partial<DraftSession> = {}): DraftSession {
  return {
    id: nextId('session'),
    timestamp: new Date().toISOString(),
    seats: [],
    pickLog: [],
    seed: 42,
    ...overrides,
  } as DraftSession;
}

export function makeSavedRoster(overrides: Partial<SavedRoster> = {}): SavedRoster {
  return {
    id: nextId('roster'),
    name: 'Test Roster',
    timestamp: new Date().toISOString(),
    draftedCards: [],
    depthChartOrder: { PG: [], SG: [], SF: [], PF: [], C: [] },
    activePlays: [],
    sessionId: null,
    ...overrides,
  };
}

export function makeChallengeRun(overrides: Partial<ChallengeRun> = {}): ChallengeRun {
  return {
    id: nextId('challenge'),
    sessionId: nextId('session'),
    rosterId: nextId('roster'),
    timestamp: new Date().toISOString(),
    seed: 42,
    balanceVersion: 7,
    phase: 'first',
    rosterPre: makeSavedRoster(),
    halves: [],
    ...overrides,
  };
}

export function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: nextId('season'),
    sessionId: nextId('session'),
    rosterId: nextId('roster'),
    timestamp: new Date().toISOString(),
    schedule: [],
    standings: [],
    currentGame: 0,
    humanTeam: {},
    ...overrides,
  } as Season;
}
