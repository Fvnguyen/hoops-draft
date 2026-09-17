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
import { CARD_SET_VERSION } from '@/engine/cards';
/**
 * The D1 "completed game" shape (plan_data_storage) is declared in `engine/season.ts`
 * as `StoredGameResult`, not here: `src/engine` must stay free of any dependency on
 * `src/storage` (enforced by `tests/unit/engine-purity.test.ts`), and `Season` already
 * flows the other direction (this file imports it below). Import it from
 * `@/engine/season` at call sites instead of duplicating it here.
 */

/**
 * D3: one row in the Dexie `meta` table (singleton, id `'meta'`). `schemaVersion` gates
 * the upgrade steps below; `cardSetVersion` is the default stamped onto drafts/rosters
 * that predate D4 (card_balance's per-card-set tagging).
 */
export interface StorageMeta {
  id: 'meta';
  schemaVersion: number;
  cardSetVersion: string;
}

/** card_balance D8: single source of truth is engine/cards.ts's CARD_SET_VERSION,
 *  stamped onto every card in cards.json; this re-export is what storage/UI compare a
 *  saved draft/roster's stamp against. */
export const CURRENT_CARD_SET_VERSION = CARD_SET_VERSION;

export interface SavedRoster {
  id: string;
  ownerId?: string;
  name: string;
  timestamp: string;
  draftedCards: DraftCard[];
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
  /** plan_data_storage D4: which `src/data/cards.json` generation this roster's cards
   *  came from. Stamped by the storage layer at save time if absent, never overwritten. */
  cardSetVersion?: string;
}

export interface GameStore {
  setOwnerId(ownerId: string | null): Promise<void>;
  claimLegacyData(): Promise<void>;
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

  /** D3: the typed schema/card-set version row. Null on a store with no meta row yet
   *  (e.g. a brand-new MemoryGameStore, which does not do Dexie-style migrations). */
  getStorageMeta(): Promise<StorageMeta | null>;

  /** season_lifecycle_notifications D6: an arbitrary device-local string key/value store
   *  (notification "last seen"/"dismissed" state, migration markers). Deliberately never
   *  cloud-synced — `SupabaseGameStore` delegates straight to its wrapped local store. */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  /** accounts_cloud_saves D4/D7: pushes `storage/merge.ts` couldn't auto-resolve — always
   *  empty on a backend with no cloud sync (IndexedDb/Memory). */
  listConflicts(): Promise<SyncConflict[]>;
  /** Resolves one conflict by picking a side; a store with no cloud sync should never
   *  have one to resolve, so this is a no-op there. */
  resolveConflict(table: SyncTable, id: string, choice: 'local' | 'remote'): Promise<void>;
  /** Current sync state, for `useSyncStatus`. Stores with no cloud sync report `idle`. */
  getSyncStatus(): SyncStatus;
  /** Subscribe to sync status changes; returns an unsubscribe function. A store with no
   *  cloud sync should call `listener` once with the idle status and never again. */
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void;
}

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

// ── accounts_cloud_saves (D4/D7): cloud sync status + conflicts ────────────

export type SyncTable = 'draft_sessions' | 'rosters' | 'seasons';

/** A push that `storage/merge.ts` couldn't auto-resolve (currently: only rosters ever
 *  land here — draft/season conflicts always auto-merge). Surfaced via
 *  `SyncConflictPrompt`; resolved with `GameStore.resolveConflict`. */
export interface SyncConflict {
  table: SyncTable;
  id: string;
  local: unknown;
  remote: unknown;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline';
  pending: number;
  conflicts: SyncConflict[];
}

export const IDLE_SYNC_STATUS: SyncStatus = { state: 'idle', pending: 0, conflicts: [] };
