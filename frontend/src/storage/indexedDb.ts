/**
 * IndexedDB-backed GameStore implementation (Dexie).
 *
 * Replaces the old `localStorage` blobs (`hoops-draft-sessions`,
 * `hoops-draft-seasons`, `myRosters`) that were capped at ~5MB per origin
 * and thrown away silently on quota errors. IndexedDB has a much larger
 * (browser-dependent, often GB-scale) quota, and Dexie gives us indexes on
 * the foreign-key-ish fields (sessionId, rosterId) instead of linear scans.
 */

import Dexie, { type Table } from 'dexie';
import type { DraftSession } from '@/engine/deckbuilder';
import { normalizeBuiltRoster } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { normalizeSeason } from '@/engine/season';
import type { GameStore, SavedRoster, StorageMeta } from './types';
import { StorageQuotaError, CURRENT_CARD_SET_VERSION } from './types';
import { safeParseDraftSession, safeParseSavedRoster, safeParseSeason } from './safeLoad';

interface MetaRow {
  key: string;
  value: string;
}

/**
 * Current Dexie schema version. Bump this (and add a new `.version(n)` step
 * with an `.upgrade()`) whenever the on-disk shape changes — see D3 in
 * `docs/plans/plan_data_storage_2026-09-13.md`.
 */
export const SCHEMA_VERSION = 2;

export class MagicBallDB extends Dexie {
  draftSessions!: Table<DraftSession, string>;
  rosters!: Table<SavedRoster, string>;
  seasons!: Table<Season, string>;
  /** Free-form key/value flags (e.g. the one-time localStorage migration marker). */
  meta!: Table<MetaRow, string>;
  /** Singleton row (id 'meta') holding the typed schema/card-set version — see StorageMeta. */
  storageMeta!: Table<StorageMeta, string>;

  constructor(name = 'MagicBallDB') {
    super(name);

    this.version(1).stores({
      draftSessions: 'id, timestamp',
      rosters: 'id, sessionId',
      seasons: 'id, rosterId, sessionId',
      meta: 'key',
    });

    // D3: `normalizeSeason`/`normalizeBuiltRoster` move from load-time calls
    // (frontend/src/storage/safeLoad.ts, removed in this version) to a
    // one-time upgrade step here. `normalizeSeason` (engine/season.ts) already
    // does both the schedule-shape upgrade (legacy per-game entries ->
    // game-day matchups) AND the D8 matchup-result conversion in one pass: a
    // played game whose old `result` is still a full `GameTheater` (detected
    // by its `possessions` array) is reduced to the slim D1 shape when it has
    // a numeric `seed` (re-simulated on view), or kept read-only under
    // `legacyTheater` when it doesn't (pre-Phase-1 data with no seed at all —
    // there's nothing to fabricate). See `normalizeMatchupResult` there for
    // the exact discriminant so this upgrade step and that engine function
    // never disagree.
    this.version(2)
      .stores({
        draftSessions: 'id, timestamp',
        rosters: 'id, sessionId',
        seasons: 'id, rosterId, sessionId',
        meta: 'key',
        storageMeta: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('draftSessions')
          .toCollection()
          .modify((session: DraftSession) => {
            if (!Array.isArray(session.seats)) return;
            session.seats = session.seats.map((seat) => ({
              ...seat,
              builtRoster: normalizeBuiltRoster(
                seat.builtRoster ?? { depthChart: {}, activePlays: [], gLeaguePlayers: [], gLeaguePlays: [] },
                seat.drafted ?? []
              ),
            }));
          });

        await tx
          .table('seasons')
          .toCollection()
          .modify((season: Season) => {
            const { season: normalized } = normalizeSeason(season);
            Object.assign(season, normalized);
          });

        const existing = await tx.table<StorageMeta, string>('storageMeta').get('meta');
        await tx.table<StorageMeta, string>('storageMeta').put({
          id: 'meta',
          schemaVersion: SCHEMA_VERSION,
          cardSetVersion: existing?.cardSetVersion ?? CURRENT_CARD_SET_VERSION,
        });
      });

    // Brand-new databases never run the `.upgrade()` step above (there is no
    // earlier version to upgrade from), so stamp the meta row here too.
    this.on('populate', (tx) => {
      void tx.table<StorageMeta, string>('storageMeta').put({
        id: 'meta',
        schemaVersion: SCHEMA_VERSION,
        cardSetVersion: CURRENT_CARD_SET_VERSION,
      });
    });
  }
}

function isQuotaExceeded(error: unknown): boolean {
  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }
  // Dexie wraps the underlying DOMException in a DexieError whose `.name`
  // is normally still 'QuotaExceededError', but be defensive about message
  // text too in case Dexie's error hierarchy changes.
  if (error instanceof Error) {
    return error.name === 'QuotaExceededError' || /quota/i.test(error.message);
  }
  return false;
}

async function guardQuota<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isQuotaExceeded(error)) {
      throw new StorageQuotaError(
        'Browser storage is full. Delete old drafts/seasons/rosters from the Rosters or Debug page, or export them first.'
      );
    }
    throw error;
  }
}

export class IndexedDbGameStore implements GameStore {
  private db: MagicBallDB;

  constructor(db: MagicBallDB = new MagicBallDB()) {
    this.db = db;
  }

  async listDraftSessions(): Promise<DraftSession[]> {
    const rows = await this.db.draftSessions.toArray();
    return rows.map(safeParseDraftSession).filter((s): s is DraftSession => s !== null);
  }

  async getDraftSession(id: string): Promise<DraftSession | null> {
    const row = (await this.db.draftSessions.get(id)) ?? null;
    return row ? safeParseDraftSession(row) : null;
  }

  async saveDraftSession(s: DraftSession): Promise<void> {
    await guardQuota(async () => {
      // D4: stamp the card set a draft's cards came from, once, never overwritten.
      await this.db.draftSessions.put({ ...s, cardSetVersion: s.cardSetVersion ?? CURRENT_CARD_SET_VERSION });
    });
  }

  async deleteDraftSession(id: string): Promise<void> {
    await this.db.draftSessions.delete(id);
  }

  async listRosters(): Promise<SavedRoster[]> {
    const rows = await this.db.rosters.toArray();
    return rows.map(safeParseSavedRoster).filter((r): r is SavedRoster => r !== null);
  }

  async getRoster(id: string): Promise<SavedRoster | null> {
    const row = (await this.db.rosters.get(id)) ?? null;
    return row ? safeParseSavedRoster(row) : null;
  }

  async saveRoster(r: SavedRoster): Promise<void> {
    await guardQuota(async () => {
      // D4: stamp the card set a roster's cards came from, once, never overwritten.
      await this.db.rosters.put({ ...r, cardSetVersion: r.cardSetVersion ?? CURRENT_CARD_SET_VERSION });
    });
  }

  async deleteRoster(id: string): Promise<void> {
    await this.db.rosters.delete(id);
  }

  async listSeasons(): Promise<Season[]> {
    const rows = await this.db.seasons.toArray();
    return rows.map(safeParseSeason).filter((s): s is Season => s !== null);
  }

  async getSeason(id: string): Promise<Season | null> {
    const row = (await this.db.seasons.get(id)) ?? null;
    return row ? safeParseSeason(row) : null;
  }

  async getSeasonByRoster(rosterId: string): Promise<Season | null> {
    const row = (await this.db.seasons.where('rosterId').equals(rosterId).first()) ?? null;
    return row ? safeParseSeason(row) : null;
  }

  async saveSeason(s: Season): Promise<void> {
    await guardQuota(async () => {
      await this.db.seasons.put(s);
    });
  }

  async deleteSeason(id: string): Promise<void> {
    await this.db.seasons.delete(id);
  }

  async exportAll(): Promise<{ sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] }> {
    const [sessions, seasons, rosters] = await Promise.all([
      this.listDraftSessions(),
      this.listSeasons(),
      this.listRosters(),
    ]);
    return { sessions, seasons, rosters };
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.db.draftSessions.clear(), this.db.rosters.clear(), this.db.seasons.clear()]);
  }

  async usage(): Promise<{ sessions: number; seasons: number; rosters: number; bytesEstimate: number }> {
    const [sessions, seasons, rosters] = await Promise.all([
      this.db.draftSessions.count(),
      this.db.seasons.count(),
      this.db.rosters.count(),
    ]);

    let bytesEstimate = 0;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        bytesEstimate = estimate.usage ?? 0;
      } catch {
        bytesEstimate = 0;
      }
    }
    if (!bytesEstimate) {
      const all = await this.exportAll();
      bytesEstimate =
        JSON.stringify(all.sessions).length + JSON.stringify(all.seasons).length + JSON.stringify(all.rosters).length;
    }

    return { sessions, seasons, rosters, bytesEstimate };
  }

  /** Internal helper used by migrate.ts to record the one-time migration flag. */
  async setMeta(key: string, value: string): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await this.db.meta.get(key);
    return row?.value ?? null;
  }

  /** D3: the typed schema/card-set version row (singleton, id 'meta'). */
  async getStorageMeta(): Promise<StorageMeta | null> {
    return (await this.db.storageMeta.get('meta')) ?? null;
  }

  /** Used by T4's card-set stamping; never lowers schemaVersion. */
  async setCardSetVersion(cardSetVersion: string): Promise<void> {
    const existing = await this.db.storageMeta.get('meta');
    await this.db.storageMeta.put({
      id: 'meta',
      schemaVersion: existing?.schemaVersion ?? SCHEMA_VERSION,
      cardSetVersion,
    });
  }
}
