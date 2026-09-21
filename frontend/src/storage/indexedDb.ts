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
import type { ChallengeRun, GameStore, OutboxRecord, OutboxStore, SavedRoster, StorageMeta, SyncConflict, SyncStatus, SyncTable } from './types';
import { StorageQuotaError, CURRENT_CARD_SET_VERSION, IDLE_SYNC_STATUS, seasonIdForRoster, challengeRunIdForRoster } from './types';
import { safeParseChallengeRun, safeParseDraftSession, safeParseSavedRoster, safeParseSeason } from './safeLoad';

interface MetaRow {
  key: string;
  value: string;
}

/**
 * Current Dexie schema version. Bump this (and add a new `.version(n)` step
 * with an `.upgrade()`) whenever the on-disk shape changes — see D3 in
 * `docs/plans/plan_data_storage_2026-09-13.md`.
 */
export const SCHEMA_VERSION = 5;

export class MagicBallDB extends Dexie {
  draftSessions!: Table<DraftSession, string>;
  rosters!: Table<SavedRoster, string>;
  seasons!: Table<Season, string>;
  /** challenge_mode D11: one row per 82:0 run. */
  challengeRuns!: Table<ChallengeRun, string>;
  /** sync_outbox D4: pending cloud writes, one row per `${ownerId}:${table}:${id}`. */
  outbox!: Table<OutboxRecord, string>;
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
                seat.builtRoster ?? { depthChart: {}, activePlays: [], rosterPlayers: [], rosterPlays: [] },
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

    this.version(3)
      .stores({
        draftSessions: 'id, timestamp, ownerId',
        rosters: 'id, sessionId, ownerId',
        seasons: 'id, rosterId, sessionId, ownerId',
        meta: 'key',
        storageMeta: 'id',
      })
      .upgrade(async (tx) => {
        const existing = await tx.table<StorageMeta, string>('storageMeta').get('meta');
        await tx.table<StorageMeta, string>('storageMeta').put({
          id: 'meta',
          schemaVersion: SCHEMA_VERSION,
          cardSetVersion: existing?.cardSetVersion ?? CURRENT_CARD_SET_VERSION,
        });
      });

    // challenge_mode T4/D11: a brand-new table, so nothing to migrate for existing rows —
    // the `.upgrade()` step only needs to bump the stamped `schemaVersion` on the meta row
    // (mirrors version(3) above; existing users just gain an empty `challengeRuns` table).
    this.version(4)
      .stores({
        draftSessions: 'id, timestamp, ownerId',
        rosters: 'id, sessionId, ownerId',
        seasons: 'id, rosterId, sessionId, ownerId',
        challengeRuns: 'id, sessionId, rosterId, ownerId',
        meta: 'key',
        storageMeta: 'id',
      })
      .upgrade(async (tx) => {
        const existing = await tx.table<StorageMeta, string>('storageMeta').get('meta');
        await tx.table<StorageMeta, string>('storageMeta').put({
          id: 'meta',
          schemaVersion: SCHEMA_VERSION,
          cardSetVersion: existing?.cardSetVersion ?? CURRENT_CARD_SET_VERSION,
        });
      });

    // sync_outbox T1/D4: a brand-new table again, nothing to migrate — existing users gain
    // an empty `outbox`. Indexed on `queuedAt` so the drain reads oldest-first.
    this.version(5)
      .stores({
        draftSessions: 'id, timestamp, ownerId',
        rosters: 'id, sessionId, ownerId',
        seasons: 'id, rosterId, sessionId, ownerId',
        challengeRuns: 'id, sessionId, rosterId, ownerId',
        outbox: 'key, queuedAt',
        meta: 'key',
        storageMeta: 'id',
      })
      .upgrade(async (tx) => {
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

/** sync_outbox D9: what `table.add()` throws when the primary key is already taken — the
 *  race signal `getOrCreateSeason`/`getOrCreateChallengeRun` catch to discover that another
 *  caller (another tab, sharing this same IndexedDB) already won the insert. */
function isConstraintError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : (error as { name?: unknown } | null | undefined)?.name;
  return name === 'ConstraintError';
}

export class IndexedDbGameStore implements GameStore, OutboxStore {
  private db: MagicBallDB;
  private ownerId: string | null = null;

  constructor(db: MagicBallDB = new MagicBallDB()) {
    this.db = db;
  }

  async setOwnerId(ownerId: string | null): Promise<void> {
    this.ownerId = ownerId;
  }

  async claimLegacyData(): Promise<void> {
    if (!this.ownerId) return;
    await Promise.all([
      this.db.draftSessions.toCollection().modify((row: DraftSession) => { if (!row.ownerId) row.ownerId = this.ownerId!; }),
      this.db.rosters.toCollection().modify((row: SavedRoster) => { if (!row.ownerId) row.ownerId = this.ownerId!; }),
      this.db.seasons.toCollection().modify((row: Season) => { if (!row.ownerId) row.ownerId = this.ownerId!; }),
      this.db.challengeRuns.toCollection().modify((row: ChallengeRun) => { if (!row.ownerId) row.ownerId = this.ownerId!; }),
    ]);
  }

  /** sync_outbox D2: ALWAYS filter. With no owner (signed out, or before `setOwnerId`
   *  has run) only never-claimed rows are visible — the old "no owner means everything"
   *  showed the previous account's rows to whoever used the device next. */
  private isOwned(row: { ownerId?: string } | null | undefined): boolean {
    return !!row && (row.ownerId ?? null) === this.ownerId;
  }

  private owned<T extends { ownerId?: string }>(rows: T[]): T[] {
    return rows.filter((row) => this.isOwned(row));
  }

  async listDraftSessions(): Promise<DraftSession[]> {
    const rows = this.owned(await this.db.draftSessions.toArray());
    return rows.map(safeParseDraftSession).filter((s): s is DraftSession => s !== null);
  }

  async getDraftSession(id: string): Promise<DraftSession | null> {
    const row = (await this.db.draftSessions.get(id)) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseDraftSession(row) : null;
  }

  async saveDraftSession(s: DraftSession): Promise<void> {
    await guardQuota(async () => {
      // D4: stamp the card set a draft's cards came from, once, never overwritten.
      await this.db.draftSessions.put({ ...s, ownerId: this.ownerId ?? s.ownerId, cardSetVersion: s.cardSetVersion ?? CURRENT_CARD_SET_VERSION });
    });
  }

  async deleteDraftSession(id: string): Promise<void> {
    await this.db.draftSessions.delete(id);
  }

  async listRosters(): Promise<SavedRoster[]> {
    const rows = this.owned(await this.db.rosters.toArray());
    return rows.map(safeParseSavedRoster).filter((r): r is SavedRoster => r !== null);
  }

  async getRoster(id: string): Promise<SavedRoster | null> {
    const row = (await this.db.rosters.get(id)) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseSavedRoster(row) : null;
  }

  async saveRoster(r: SavedRoster): Promise<void> {
    await guardQuota(async () => {
      // D4: stamp the card set a roster's cards came from, once, never overwritten.
      await this.db.rosters.put({ ...r, ownerId: this.ownerId ?? r.ownerId, cardSetVersion: r.cardSetVersion ?? CURRENT_CARD_SET_VERSION });
    });
  }

  async deleteRoster(id: string): Promise<void> {
    await this.db.rosters.delete(id);
  }

  async listSeasons(): Promise<Season[]> {
    const rows = this.owned(await this.db.seasons.toArray());
    return rows.map(safeParseSeason).filter((s): s is Season => s !== null);
  }

  async getSeason(id: string): Promise<Season | null> {
    const row = (await this.db.seasons.get(id)) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseSeason(row) : null;
  }

  async getSeasonByRoster(rosterId: string): Promise<Season | null> {
    const row = (await this.db.seasons.where('rosterId').equals(rosterId).filter((r) => this.isOwned(r)).first()) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseSeason(row) : null;
  }

  async saveSeason(s: Season): Promise<void> {
    await guardQuota(async () => {
      await this.db.seasons.put({ ...s, ownerId: this.ownerId ?? s.ownerId });
    });
  }

  async deleteSeason(id: string): Promise<void> {
    await this.db.seasons.delete(id);
  }

  /**
   * sync_outbox D9. The whole check-then-insert runs in ONE `rw` transaction on `seasons`,
   * and IndexedDB serializes readwrite transactions against the same object store — even
   * across tabs sharing one database connection — so a second caller's transaction cannot
   * start until the first one (which inserted the row) has committed; it then simply finds
   * that row. `table.add()` (never `put`) is the second line of defense: it rejects outright
   * if the deterministic id is somehow already taken, instead of silently overwriting.
   */
  async getOrCreateSeason(rosterId: string, factory: () => Season): Promise<Season> {
    const owner = this.ownerId;
    return guardQuota(() =>
      this.db.transaction('rw', this.db.seasons, async (): Promise<Season> => {
        const existing = (await this.db.seasons.where('rosterId').equals(rosterId).filter((r) => this.isOwned(r)).first()) ?? null;
        if (this.isOwned(existing)) {
          const parsed = safeParseSeason(existing);
          if (!parsed) throw new Error(`getOrCreateSeason: existing season for roster ${rosterId} is corrupt`);
          return parsed;
        }

        const created = factory();
        const stamped: Season = { ...created, id: seasonIdForRoster(rosterId), ownerId: owner ?? created.ownerId };
        try {
          await this.db.seasons.add(stamped);
          return stamped;
        } catch (err) {
          if (!isConstraintError(err)) throw err;
          // Lost the race (or the id is occupied by a row this owner can't see at all):
          // read what is actually there now rather than clobber it.
          const row = (await this.db.seasons.get(stamped.id)) ?? null;
          if (!this.isOwned(row)) {
            throw new Error(`getOrCreateSeason: season ${stamped.id} already exists under a different owner`);
          }
          const parsed = safeParseSeason(row);
          if (!parsed) throw new Error(`getOrCreateSeason: existing season for roster ${rosterId} is corrupt`);
          return parsed;
        }
      })
    );
  }

  async listChallengeRuns(): Promise<ChallengeRun[]> {
    const rows = this.owned(await this.db.challengeRuns.toArray());
    return rows.map(safeParseChallengeRun).filter((r): r is ChallengeRun => r !== null);
  }

  async getChallengeRun(id: string): Promise<ChallengeRun | null> {
    const row = (await this.db.challengeRuns.get(id)) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseChallengeRun(row) : null;
  }

  async getChallengeRunByRoster(rosterId: string): Promise<ChallengeRun | null> {
    const row = (await this.db.challengeRuns.where('rosterId').equals(rosterId).filter((r) => this.isOwned(r)).first()) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseChallengeRun(row) : null;
  }

  async saveChallengeRun(r: ChallengeRun): Promise<void> {
    await guardQuota(async () => {
      await this.db.challengeRuns.put({ ...r, ownerId: this.ownerId ?? r.ownerId });
    });
  }

  async deleteChallengeRun(id: string): Promise<void> {
    await this.db.challengeRuns.delete(id);
  }

  /** sync_outbox D9: same contract and same transaction/`add()` race handling as
   *  `getOrCreateSeason`, on `challengeRuns` with `challengeRunIdForRoster`. */
  async getOrCreateChallengeRun(rosterId: string, factory: () => ChallengeRun): Promise<ChallengeRun> {
    const owner = this.ownerId;
    return guardQuota(() =>
      this.db.transaction('rw', this.db.challengeRuns, async (): Promise<ChallengeRun> => {
        const existing = (await this.db.challengeRuns.where('rosterId').equals(rosterId).filter((r) => this.isOwned(r)).first()) ?? null;
        if (this.isOwned(existing)) {
          const parsed = safeParseChallengeRun(existing);
          if (!parsed) throw new Error(`getOrCreateChallengeRun: existing run for roster ${rosterId} is corrupt`);
          return parsed;
        }

        const created = factory();
        const stamped: ChallengeRun = { ...created, id: challengeRunIdForRoster(rosterId), ownerId: owner ?? created.ownerId };
        try {
          await this.db.challengeRuns.add(stamped);
          return stamped;
        } catch (err) {
          if (!isConstraintError(err)) throw err;
          const row = (await this.db.challengeRuns.get(stamped.id)) ?? null;
          if (!this.isOwned(row)) {
            throw new Error(`getOrCreateChallengeRun: run ${stamped.id} already exists under a different owner`);
          }
          const parsed = safeParseChallengeRun(row);
          if (!parsed) throw new Error(`getOrCreateChallengeRun: existing run for roster ${rosterId} is corrupt`);
          return parsed;
        }
      })
    );
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
    await Promise.all([
      this.db.draftSessions.clear(),
      this.db.rosters.clear(),
      this.db.seasons.clear(),
      this.db.challengeRuns.clear(),
    ]);
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

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  // ── OutboxStore (sync_outbox D4) ──────────────────────────────────────

  async listOutbox(): Promise<OutboxRecord[]> {
    return this.db.outbox.orderBy('queuedAt').toArray();
  }

  async putOutbox(record: OutboxRecord): Promise<void> {
    await guardQuota(async () => { await this.db.outbox.put(record); });
  }

  async deleteOutbox(key: string): Promise<void> {
    await this.db.outbox.delete(key);
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

  // accounts_cloud_saves: no cloud sync on the plain IndexedDB backend — always idle.
  async listConflicts(): Promise<SyncConflict[]> { return []; }
  async resolveConflict(_table: SyncTable, _id: string, _choice: 'local' | 'remote'): Promise<void> {}
  getSyncStatus(): SyncStatus { return IDLE_SYNC_STATUS; }
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    listener(IDLE_SYNC_STATUS);
    return () => {};
  }
}
