/**
 * challenge_mode: a `SavedRoster` -> `DraftSessionSeat` adapter.
 *
 * The season path never needed this — it builds the human team straight off
 * `session.seats[0]`. A challenge run cannot, because D11 stores `rosterPre`/`rosterPost`
 * SNAPSHOTS: the second half must be simulated against exactly the roster the front
 * office produced, not against whatever the live draft session now holds.
 *
 * Bench membership is derived rather than stored, because `SavedRoster` only records the
 * depth chart and the active plays: anything drafted and not in the depth chart is a
 * bench player, anything drafted and not active is a bench play. That is the same split
 * `DeckBuilder` writes back into the session seat when it saves.
 */

import type { DraftSessionSeat } from '@/engine/deckbuilder';
import type { SavedRoster } from '@/storage/types';

export const CHALLENGE_SEAT_ID = 'human-0';

export function seatFromRoster(roster: SavedRoster): DraftSessionSeat {
  const depthChart = roster.depthChartOrder ?? {};
  const activePlays = roster.activePlays ?? [];
  const activeIds = new Set(Object.values(depthChart).flat());
  const drafted = roster.draftedCards ?? [];

  return {
    id: CHALLENGE_SEAT_ID,
    isBot: false,
    drafted,
    builtRoster: {
      version: roster.version ?? 2,
      depthChart,
      activePlays,
      playAssignments: roster.playAssignments,
      archetypes: roster.archetypes,
      rosterPlayers: drafted.filter((c) => c.type === 'Player' && !activeIds.has(c.id)).map((c) => c.id),
      rosterPlays: drafted.filter((c) => c.type === 'Play' && !activePlays.includes(c.id)).map((c) => c.id),
    },
  };
}
