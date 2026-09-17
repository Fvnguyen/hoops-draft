/**
 * Shape checks applied to every record coming out of a GameStore backend.
 *
 * Saved records can simply be corrupted (a botched IndexedDB write, manual
 * edits in DevTools). Rather than let a bad record throw deep inside a page
 * component, each getter/list method below runs the record through here:
 * a record that fails its shape check is dropped (logged once, returns
 * null) instead of propagating an exception.
 *
 * Shape *upgrades* (BuiltRoster v2, round-robin season schedules, D1 game
 * results) are NOT done here anymore (D3): they run once as a Dexie
 * `.upgrade()` step at DB open (see `indexedDb.ts`, `MagicBallDB` version 2),
 * so every record read through a GameStore is already current shape. This
 * file only validates.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { ChallengeRun, SavedRoster } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function safeParseDraftSession(raw: unknown): DraftSession | null {
  if (!isPlainObject(raw)) return null;
  const session = raw as unknown as DraftSession;
  if (typeof session.id !== 'string' || !Array.isArray(session.seats) || !Array.isArray(session.pickLog)) {
    console.error('[storage] Corrupt draft session record skipped:', raw);
    return null;
  }
  return session;
}

export function safeParseSavedRoster(raw: unknown): SavedRoster | null {
  if (!isPlainObject(raw)) return null;
  const roster = raw as unknown as SavedRoster;
  if (
    typeof roster.id !== 'string' ||
    typeof roster.name !== 'string' ||
    !Array.isArray(roster.draftedCards) ||
    !isPlainObject(roster.depthChartOrder) ||
    !Array.isArray(roster.activePlays)
  ) {
    console.error('[storage] Corrupt roster record skipped:', raw);
    return null;
  }
  return roster;
}

export function safeParseChallengeRun(raw: unknown): ChallengeRun | null {
  if (!isPlainObject(raw)) return null;
  const run = raw as unknown as ChallengeRun;
  if (
    typeof run.id !== 'string' ||
    typeof run.sessionId !== 'string' ||
    typeof run.rosterId !== 'string' ||
    typeof run.seed !== 'number' ||
    typeof run.phase !== 'string' ||
    !isPlainObject(run.rosterPre) ||
    !Array.isArray(run.halves)
  ) {
    console.error('[storage] Corrupt challenge run record skipped:', raw);
    return null;
  }
  return run;
}

export function safeParseSeason(raw: unknown): Season | null {
  if (!isPlainObject(raw)) return null;
  const season = raw as unknown as Season;
  if (
    typeof season.id !== 'string' ||
    typeof season.sessionId !== 'string' ||
    typeof season.rosterId !== 'string' ||
    !Array.isArray(season.schedule) ||
    !Array.isArray(season.standings) ||
    typeof season.currentGame !== 'number' ||
    !isPlainObject(season.humanTeam)
  ) {
    console.error('[storage] Corrupt season record skipped:', raw);
    return null;
  }
  return season;
}
