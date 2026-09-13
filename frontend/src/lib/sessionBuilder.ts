/**
 * Pure helper: draft-engine seats -> a persistable `DraftSession` object.
 *
 * Split out of the old localStorage-era `saveDraftSession` so
 * `DraftRoom` can build the session object and hand it to the async
 * `GameStore.saveDraftSession` without any localStorage I/O living in a
 * component file.
 */

import { DraftSeat } from '../engine/draft';
import { buildBotRoster, normalizeBuiltRoster, DraftSession, DraftSessionSeat, DraftPickRecord } from '../engine/deckbuilder';

export function buildDraftSession(
  seats: DraftSeat[],
  pickLog: DraftPickRecord[] = [],
  seed?: number
): DraftSession {
  const sessionSeats: DraftSessionSeat[] = seats.map((seat) => ({
    id: seat.id,
    isBot: seat.isBot,
    botProfile: seat.botProfile,
    drafted: seat.drafted,
    // Auto-build roster for bots; human gets normalized empty roster
    builtRoster: seat.isBot
      ? buildBotRoster(seat.drafted, seat.botProfile)
      : normalizeBuiltRoster({ depthChart: { PG: [], SG: [], SF: [], PF: [], C: [] }, activePlays: [], gLeaguePlayers: [], gLeaguePlays: [] }, seat.drafted),
  }));

  return {
    id: `session_${Date.now()}`,
    timestamp: new Date().toISOString(),
    seats: sessionSeats,
    pickLog,
    seed,
  };
}
