/**
 * Storage layer types.
 *
 * `SavedRoster` is derived verbatim from the `RosterData` shape that
 * `DeckBuilder.tsx` (handleSaveRoster, ~lines 341-399) writes into the
 * `myRosters` localStorage key, and that `src/app/rosters/page.tsx` and
 * `src/app/deckbuilder-test/page.tsx` read back. Do not add fields that
 * those call sites don't actually write — a wave-2 agent rewires those
 * call sites onto `GameStore` and any mismatch will show up as a type error
 * there.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { DraftCard } from '@/engine/types';
import type { PlayAssignment } from '@/engine/playbook';
import type { ArchetypeSelection } from '@/engine/archetypes';

export interface SavedRoster {
  id: string;
  name: string;
  timestamp: string;
  draftedCards: DraftCard[];
  /** Card id -> which zone it lives in ('Roster' = active 12/plays, 'GLeague' = bench). */
  zones: Record<string, 'Roster' | 'GLeague'>;
  /** Position -> ordered card ids, index 0 is the starter. */
  depthChartOrder: Record<string, string[]>;
  /** Up to 3 selected Play card ids. */
  activePlays: string[];
  /** Role assignments for the active plays (v2). One entry per active play card. */
  playAssignments?: PlayAssignment[];
  /** Chosen roster identity (v2). */
  archetypes?: ArchetypeSelection;
  /** Roster shape version. 2 = playAssignments + archetypes. */
  version?: number;
  /** The draft session this roster was built from, if any. */
  sessionId: string | null;
}

export interface GameStore {
  listDraftSessions(): Promise<DraftSession[]>;
  getDraftSession(id: string): Promise<DraftSession | null>;
  saveDraftSession(s: DraftSession): Promise<void>; // upsert
  deleteDraftSession(id: string): Promise<void>;

  listRosters(): Promise<SavedRoster[]>;
  getRoster(id: string): Promise<SavedRoster | null>;
  saveRoster(r: SavedRoster): Promise<void>; // upsert
  deleteRoster(id: string): Promise<void>;

  listSeasons(): Promise<Season[]>;
  getSeason(id: string): Promise<Season | null>;
  getSeasonByRoster(rosterId: string): Promise<Season | null>;
  saveSeason(s: Season): Promise<void>; // upsert
  deleteSeason(id: string): Promise<void>;

  exportAll(): Promise<{ sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] }>;
  clearAll(): Promise<void>;
  usage(): Promise<{ sessions: number; seasons: number; rosters: number; bytesEstimate: number }>;
}

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}
