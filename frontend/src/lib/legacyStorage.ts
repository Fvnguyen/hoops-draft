/**
 * Draft Session & Season Persistence (localStorage)
 *
 * The engine itself (`src/engine/`) does no I/O — these functions are the
 * localStorage-backed persistence layer for draft sessions and seasons, kept
 * separate from the pure engine modules they read/write.
 */

import { DraftSeat } from '../engine/draft';
import { buildBotRoster, DraftSession, DraftSessionSeat, BuiltRoster, DraftPickRecord } from '../engine/deckbuilder';
import { Season } from '../engine/season';
import { safeGetJSON, safeSetJSON } from './storage';

// ── Draft Session Persistence ──────────────────────────────────────────────

const SESSIONS_KEY = 'hoops-draft-sessions';

export function saveDraftSession(seats: DraftSeat[], pickLog: DraftPickRecord[] = [], seed?: number): string {
  const sessionId = `session_${Date.now()}`;

  const sessionSeats: DraftSessionSeat[] = seats.map((seat) => ({
    id: seat.id,
    isBot: seat.isBot,
    botProfile: seat.botProfile,
    drafted: seat.drafted,
    // Auto-build roster for bots; human gets empty roster (filled after deckbuilding)
    builtRoster: seat.isBot
      ? buildBotRoster(seat.drafted, seat.botProfile)
      : { depthChart: { PG: [], SG: [], SF: [], PF: [], C: [] }, activePlays: [], gLeaguePlayers: [], gLeaguePlays: [] },
  }));

  const session: DraftSession = {
    id: sessionId,
    timestamp: new Date().toISOString(),
    seats: sessionSeats,
    pickLog,
    seed,
  };

  const sessions = getAllDraftSessions();
  sessions.push(session);
  safeSetJSON(SESSIONS_KEY, sessions);

  return sessionId;
}

export function getAllDraftSessions(): DraftSession[] {
  return safeGetJSON<DraftSession[]>(SESSIONS_KEY, []);
}

export function getDraftSession(sessionId: string): DraftSession | null {
  const sessions = getAllDraftSessions();
  return sessions.find(s => s.id === sessionId) ?? null;
}

export function updateHumanRosterInSession(sessionId: string, builtRoster: BuiltRoster): void {
  const sessions = getAllDraftSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session && session.seats[0]) {
    session.seats[0].builtRoster = builtRoster;
    safeSetJSON(SESSIONS_KEY, sessions);
  }
}

// ── Season Persistence ──────────────────────────────────────────────────────

const SEASONS_KEY = 'hoops-draft-seasons';

export function saveSeason(season: Season): void {
  const seasons = getAllSeasons();
  const existing = seasons.findIndex(s => s.id === season.id);
  if (existing >= 0) seasons[existing] = season;
  else seasons.push(season);
  safeSetJSON(SEASONS_KEY, seasons);
}

export function getAllSeasons(): Season[] {
  return safeGetJSON<Season[]>(SEASONS_KEY, []);
}

export function getSeason(seasonId: string): Season | null {
  return getAllSeasons().find(s => s.id === seasonId) ?? null;
}

export function getSeasonByRoster(rosterId: string): Season | null {
  return getAllSeasons().find(s => s.rosterId === rosterId) ?? null;
}
