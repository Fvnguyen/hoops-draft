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
import type { Season } from '@/engine/season';
import type { GameStore, SavedRoster } from './types';
import { StorageQuotaError } from './types';
import { safeParseDraftSession, safeParseSavedRoster, safeParseSeason } from './safeLoad';

interface MetaRow {
  key: string;
  value: string;
}

export class MagicBallDB extends Dexie {
  draftSessions!: Table<DraftSession, string>;
  rosters!: Table<SavedRoster, string>;
  seasons!: Table<Season, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'MagicBallDB') {
    super(name);
    this.version(1).stores({
      draftSessions: 'id, timestamp',
      rosters: 'id, sessionId',
      seasons: 'id, rosterId, sessionId',
      meta: 'key',
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
      await this.db.draftSessions.put(s);
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
      await this.db.rosters.put(r);
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
}
