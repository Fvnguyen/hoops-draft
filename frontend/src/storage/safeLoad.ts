/**
 * Shape checks applied to every record coming out of a GameStore backend.
 *
 * Saved records predate schema changes (BuiltRoster v2, round-robin season
 * schedules) or can simply be corrupted (a botched IndexedDB write, manual
 * edits in DevTools). Rather than let a bad record throw deep inside a page
 * component, each getter/list method below runs the record through here:
 * a record that fails its shape check is dropped (logged once, returns
 * null) instead of propagating an exception.
 */

import type { DraftSession, DraftSessionSeat } from '@/engine/deckbuilder';
import { normalizeBuiltRoster } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { normalizeSeason } from '@/engine/season';
import type { SavedRoster } from './types';

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
  try {
    const seats: DraftSessionSeat[] = session.seats.map((seat) => ({
      ...seat,
      builtRoster: normalizeBuiltRoster(seat.builtRoster, seat.drafted),
    }));
    return { ...session, seats };
  } catch (error) {
    console.error('[storage] Failed to normalize draft session, skipped:', session.id, error);
    return null;
  }
}

export function safeParseSavedRoster(raw: unknown): SavedRoster | null {
  if (!isPlainObject(raw)) return null;
  const roster = raw as unknown as SavedRoster;
  if (
    typeof roster.id !== 'string' ||
    typeof roster.name !== 'string' ||
    !Array.isArray(roster.draftedCards) ||
    !isPlainObject(roster.zones) ||
    !isPlainObject(roster.depthChartOrder) ||
    !Array.isArray(roster.activePlays)
  ) {
    console.error('[storage] Corrupt roster record skipped:', raw);
    return null;
  }
  return roster;
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
  try {
    return normalizeSeason(season).season;
  } catch (error) {
    console.error('[storage] Failed to normalize season, skipped:', season.id, error);
    return null;
  }
}
