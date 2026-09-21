/**
 * In-memory GameStore implementation.
 *
 * Used for SSR (there is no IndexedDB on the server) and for unit tests that
 * don't want to exercise the real Dexie/IndexedDB backend. Data does not
 * survive a page reload or process restart.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import {
  CURRENT_CARD_SET_VERSION,
  IDLE_SYNC_STATUS,
  challengeRunIdForRoster,
  seasonIdForRoster,
  type ChallengeRun,
  type GameStore,
  type OutboxRecord,
  type OutboxStore,
  type SavedRoster,
  type StorageMeta,
  type SyncConflict,
  type SyncStatus,
  type SyncTable,
} from './types';
import { safeParseChallengeRun, safeParseDraftSession, safeParseSavedRoster, safeParseSeason } from './safeLoad';

export class MemoryGameStore implements GameStore, OutboxStore {
  private ownerId: string | null = null;
  private sessions = new Map<string, DraftSession>();
  private rosters = new Map<string, SavedRoster>();
  private seasons = new Map<string, Season>();
  private challengeRuns = new Map<string, ChallengeRun>();
  private meta = new Map<string, string>();

  async setOwnerId(ownerId: string | null): Promise<void> { this.ownerId = ownerId; }

  async claimLegacyData(): Promise<void> {
    if (!this.ownerId) return;
    for (const row of this.sessions.values()) if (!row.ownerId) row.ownerId = this.ownerId;
    for (const row of this.rosters.values()) if (!row.ownerId) row.ownerId = this.ownerId;
    for (const row of this.seasons.values()) if (!row.ownerId) row.ownerId = this.ownerId;
    for (const row of this.challengeRuns.values()) if (!row.ownerId) row.ownerId = this.ownerId;
  }

  /** sync_outbox D2: always filter, same rule as `IndexedDbGameStore`. */
  private isOwned(row: { ownerId?: string } | null | undefined): boolean { return !!row && (row.ownerId ?? null) === this.ownerId; }
  private owned<T extends { ownerId?: string }>(rows: T[]): T[] { return rows.filter((row) => this.isOwned(row)); }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  // ── OutboxStore (sync_outbox D4) ──────────────────────────────────────

  private outbox = new Map<string, OutboxRecord>();

  async listOutbox(): Promise<OutboxRecord[]> {
    return Array.from(this.outbox.values()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  async putOutbox(record: OutboxRecord): Promise<void> {
    this.outbox.set(record.key, { ...record });
  }

  async deleteOutbox(key: string): Promise<void> {
    this.outbox.delete(key);
  }

  /** No Dexie-style migrations in memory storage (SSR/tests) — nothing has ever
   *  written this row, so it's always absent. */
  async getStorageMeta(): Promise<StorageMeta | null> {
    return null;
  }

  async listDraftSessions(): Promise<DraftSession[]> {
    return this.owned([...this.sessions.values()]).map(safeParseDraftSession).filter((s): s is DraftSession => s !== null);
  }

  async getDraftSession(id: string): Promise<DraftSession | null> {
    const row = this.sessions.get(id) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseDraftSession(row) : null;
  }

  async saveDraftSession(s: DraftSession): Promise<void> {
    // D4: stamp the card set a draft's cards came from, once, never overwritten.
    this.sessions.set(s.id, { ...s, ownerId: this.ownerId ?? s.ownerId, cardSetVersion: s.cardSetVersion ?? CURRENT_CARD_SET_VERSION });
  }

  async deleteDraftSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listRosters(): Promise<SavedRoster[]> {
    return this.owned([...this.rosters.values()]).map(safeParseSavedRoster).filter((r): r is SavedRoster => r !== null);
  }

  async getRoster(id: string): Promise<SavedRoster | null> {
    const row = this.rosters.get(id) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseSavedRoster(row) : null;
  }

  async saveRoster(r: SavedRoster): Promise<void> {
    // D4: stamp the card set a roster's cards came from, once, never overwritten.
    this.rosters.set(r.id, { ...r, ownerId: this.ownerId ?? r.ownerId, cardSetVersion: r.cardSetVersion ?? CURRENT_CARD_SET_VERSION });
  }

  async deleteRoster(id: string): Promise<void> {
    this.rosters.delete(id);
  }

  async listSeasons(): Promise<Season[]> {
    return this.owned([...this.seasons.values()]).map(safeParseSeason).filter((s): s is Season => s !== null);
  }

  async getSeason(id: string): Promise<Season | null> {
    const row = this.seasons.get(id) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseSeason(row) : null;
  }

  async getSeasonByRoster(rosterId: string): Promise<Season | null> {
    const row = [...this.seasons.values()].find((s) => s.rosterId === rosterId) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseSeason(row) : null;
  }

  async saveSeason(s: Season): Promise<void> {
    this.seasons.set(s.id, { ...s, ownerId: this.ownerId ?? s.ownerId });
  }

  async deleteSeason(id: string): Promise<void> {
    this.seasons.delete(id);
  }

  /**
   * sync_outbox D9, shared by seasons and challenge runs. Deliberately has NO `await`
   * between the check and the `set`, so two callers racing through `Promise.all` converge
   * on one row and one `factory()` call — the in-memory equivalent of IndexedDb's single
   * `rw` transaction.
   */
  private getOrCreateIn<T extends { id: string; rosterId: string; ownerId?: string }>(
    rows: Map<string, T>, parse: (row: unknown) => T | null, name: string, rosterId: string, id: string, factory: () => T,
  ): T {
    const parseExisting = (row: T): T => {
      const parsed = parse(row);
      if (!parsed) throw new Error(`getOrCreate ${name}: the existing row for roster ${rosterId} is corrupt`);
      return parsed;
    };
    const existing = this.owned([...rows.values()]).find((row) => row.rosterId === rosterId);
    if (existing) return parseExisting(existing);

    const byId = rows.get(id);
    if (byId) {
      if (!this.isOwned(byId)) throw new Error(`getOrCreate ${name}: ${id} already exists under a different owner`);
      return parseExisting(byId);
    }
    const created = factory();
    const stamped: T = { ...created, id, ownerId: this.ownerId ?? created.ownerId };
    rows.set(id, stamped);
    return stamped;
  }

  async getOrCreateSeason(rosterId: string, factory: () => Season): Promise<Season> {
    return this.getOrCreateIn(this.seasons, safeParseSeason, 'season', rosterId, seasonIdForRoster(rosterId), factory);
  }

  async listChallengeRuns(): Promise<ChallengeRun[]> {
    return this.owned([...this.challengeRuns.values()]).map(safeParseChallengeRun).filter((r): r is ChallengeRun => r !== null);
  }

  async getChallengeRun(id: string): Promise<ChallengeRun | null> {
    const row = this.challengeRuns.get(id) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseChallengeRun(row) : null;
  }

  async getChallengeRunByRoster(rosterId: string): Promise<ChallengeRun | null> {
    const row = [...this.challengeRuns.values()].find((r) => r.rosterId === rosterId) ?? null;
    if (!this.isOwned(row)) return null;
    return row ? safeParseChallengeRun(row) : null;
  }

  async saveChallengeRun(r: ChallengeRun): Promise<void> {
    this.challengeRuns.set(r.id, { ...r, ownerId: this.ownerId ?? r.ownerId });
  }

  async deleteChallengeRun(id: string): Promise<void> {
    this.challengeRuns.delete(id);
  }

  async getOrCreateChallengeRun(rosterId: string, factory: () => ChallengeRun): Promise<ChallengeRun> {
    return this.getOrCreateIn(this.challengeRuns, safeParseChallengeRun, 'challenge run', rosterId, challengeRunIdForRoster(rosterId), factory);
  }

  async exportAll(): Promise<{ sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] }> {
    return {
      sessions: [...this.sessions.values()],
      seasons: [...this.seasons.values()],
      rosters: [...this.rosters.values()],
    };
  }

  async clearAll(): Promise<void> {
    this.sessions.clear();
    this.rosters.clear();
    this.seasons.clear();
    this.challengeRuns.clear();
  }

  async usage(): Promise<{ sessions: number; seasons: number; rosters: number; bytesEstimate: number }> {
    const all = await this.exportAll();
    const bytesEstimate =
      JSON.stringify(all.sessions).length + JSON.stringify(all.seasons).length + JSON.stringify(all.rosters).length;
    return {
      sessions: all.sessions.length,
      seasons: all.seasons.length,
      rosters: all.rosters.length,
      bytesEstimate,
    };
  }

  // accounts_cloud_saves: no cloud sync on the in-memory backend — always idle.
  async listConflicts(): Promise<SyncConflict[]> { return []; }
  async resolveConflict(_table: SyncTable, _id: string, _choice: 'local' | 'remote'): Promise<void> {}
  getSyncStatus(): SyncStatus { return IDLE_SYNC_STATUS; }
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    listener(IDLE_SYNC_STATUS);
    return () => {};
  }
}
