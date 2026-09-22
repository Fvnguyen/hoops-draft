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
import type { HumanPicks } from '../engine/draftReplay';

/** draft_resume D3: the completed session, saved once the draft ends. `id` should be the
 *  SAME id the in-progress rows (`buildInProgressDraftSession`) were saved under for this
 *  draft, so the final upsert replaces them rather than leaving an orphaned 'drafting' row. */
export function buildDraftSession(
  seats: DraftSeat[],
  pickLog: DraftPickRecord[] = [],
  seed?: number,
  mode?: 'quick' | 'premier',
  gameMode?: 'tournament' | 'challenge',
  id?: string,
): DraftSession {
  const sessionSeats: DraftSessionSeat[] = seats.map((seat) => ({
    id: seat.id,
    isBot: seat.isBot,
    botProfile: seat.botProfile,
    drafted: seat.drafted,
    // Auto-build roster for bots; human gets normalized empty roster
    builtRoster: seat.isBot
      ? buildBotRoster(seat.drafted, seat.botProfile)
      : normalizeBuiltRoster({ depthChart: { PG: [], SG: [], SF: [], PF: [], C: [] }, activePlays: [], rosterPlayers: [], rosterPlays: [] }, seat.drafted),
  }));

  return {
    id: id ?? `session_${Date.now()}`,
    timestamp: new Date().toISOString(),
    seats: sessionSeats,
    pickLog,
    seed,
    status: 'complete',
    ...(mode ? { mode } : {}),
    ...(gameMode ? { gameMode } : {}),
  };
}

/** draft_resume D3/D4: the in-progress row saved after every human pick — `seats: []` and
 *  `pickLog: []` on purpose (the room is rebuilt by `replayDraft` from `seed` +
 *  `humanPicks`/`humanAutoPicks` on resume, never read back from here). Same `id` across
 *  every autosave of one draft so they all upsert the same row. */
export function buildInProgressDraftSession(
  id: string,
  seed: number | undefined,
  humanPicks: HumanPicks,
  humanAutoPicks: Record<string, number[]>,
  mode?: 'quick' | 'premier',
  gameMode?: 'tournament' | 'challenge',
): DraftSession {
  return {
    id,
    timestamp: new Date().toISOString(),
    seats: [],
    pickLog: [],
    seed,
    status: 'drafting',
    humanPicks,
    humanAutoPicks,
    ...(mode ? { mode } : {}),
    ...(gameMode ? { gameMode } : {}),
  };
}
