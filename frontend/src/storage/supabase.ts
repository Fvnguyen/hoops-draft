/**
 * Cloud-synced GameStore (accounts_cloud_saves D3/D4): IndexedDB stays the store every
 * read goes through — this wraps a local `GameStore` and, on every write, pushes to
 * Supabase via the `cas_upsert` RPC (compare-and-swap, migration `202609140001_cloud_saves.sql`).
 * A rejected push either means "already synced" (first-ever push, insert raced an
 * existing row) or a genuine conflict, resolved with `storage/merge.ts`; a merge that
 * can't auto-resolve (currently only rosters) is parked in `conflicts` for
 * `SyncConflictPrompt` to show. A network failure queues the write for retry on the next
 * successful push or a browser `online` event.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { mergeDraftSession, mergeSeason } from './merge';
import type { GameStore, SavedRoster, StorageMeta, SyncConflict, SyncStatus, SyncTable } from './types';

interface CasUpsertRow {
  ok: boolean;
  current_row: { id: string; owner_id: string; data: unknown; updated_at: string } | null;
}

/**
 * The narrow slice of the Supabase JS client this store actually calls — kept minimal
 * and structural (not `SupabaseClient` itself) so tests can pass a plain mock instead of
 * standing up a real client.
 */
export interface CloudSyncClient {
  rpc(
    fn: 'cas_upsert',
    args: {
      table_name: SyncTable;
      p_id: string;
      p_owner_id: string;
      expected_updated_at: string | null;
      p_data: unknown;
      p_client_timestamp: string;
    }
  ): Promise<{ data: CasUpsertRow[] | null; error: { message: string } | null }>;
  from(table: SyncTable): {
    select(columns: string): { eq(col: string, val: string): Promise<{ data: Array<{ id: string; data: unknown; updated_at: string }> | null; error: { message: string } | null }> };
    delete(): { eq(col: string, val: string): Promise<{ error: { message: string } | null }> };
  };
}

type RecordOf<T extends SyncTable> = T extends 'draft_sessions' ? DraftSession : T extends 'rosters' ? SavedRoster : Season;

function timestampOf(data: { timestamp?: string }): string {
  return data.timestamp ?? new Date().toISOString();
}

export class SupabaseGameStore implements GameStore {
  private local: GameStore;
  private client: CloudSyncClient;
  private ownerId: string | null = null;
  /** `${table}:${id}` -> the `updated_at` we last confirmed the server holds for it. */
  private baselines = new Map<string, string>();
  private conflicts: SyncConflict[] = [];
  private retryQueue = new Set<string>();
  private listeners = new Set<(status: SyncStatus) => void>();
  private online = typeof navigator === 'undefined' || navigator.onLine !== false;

  constructor(local: GameStore, client: CloudSyncClient) {
    this.local = local;
    this.client = client;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.online = true; void this.flushQueue(); });
      window.addEventListener('offline', () => { this.online = false; this.emit(); });
    }
  }

  // ── Status / conflicts ────────────────────────────────────────────────

  getSyncStatus(): SyncStatus {
    if (!this.online) return { state: 'offline', pending: this.retryQueue.size, conflicts: this.conflicts };
    return {
      state: this.retryQueue.size > 0 ? 'syncing' : 'idle',
      pending: this.retryQueue.size,
      conflicts: this.conflicts,
    };
  }

  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSyncStatus());
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    const status = this.getSyncStatus();
    for (const l of this.listeners) l(status);
  }

  async listConflicts(): Promise<SyncConflict[]> {
    return this.conflicts;
  }

  async resolveConflict(table: SyncTable, id: string, choice: 'local' | 'remote'): Promise<void> {
    const idx = this.conflicts.findIndex((c) => c.table === table && c.id === id);
    if (idx === -1) return;
    const conflict = this.conflicts[idx];
    this.conflicts.splice(idx, 1);

    if (choice === 'remote') {
      await this.writeLocalOnly(table, conflict.remote as RecordOf<typeof table>);
    }
    const key = `${table}:${id}`;
    // We don't know the server's current updated_at without a re-fetch, so drop the
    // baseline: the next push re-derives it (a rejection -> retry-as-update path below).
    this.baselines.delete(key);
    const record = choice === 'remote' ? conflict.remote : conflict.local;
    await this.push(table, id, record as { timestamp?: string });
    this.emit();
  }

  private async writeLocalOnly(table: SyncTable, data: unknown): Promise<void> {
    if (table === 'draft_sessions') await this.local.saveDraftSession(data as DraftSession);
    else if (table === 'rosters') await this.local.saveRoster(data as SavedRoster);
    else await this.local.saveSeason(data as Season);
  }

  // ── Push / pull ────────────────────────────────────────────────────────

  private async rpcOnce(table: SyncTable, id: string, data: unknown, expected: string | null): Promise<CasUpsertRow | null> {
    const { data: rows, error } = await this.client.rpc('cas_upsert', {
      table_name: table,
      p_id: id,
      p_owner_id: this.ownerId!,
      expected_updated_at: expected,
      p_data: data,
      p_client_timestamp: timestampOf(data as { timestamp?: string }),
    });
    if (error) throw new Error(error.message);
    return rows?.[0] ?? null;
  }

  /** Normal write path: retries an unknown-baseline rejection once as a fetched-baseline
   *  update, then falls back to `merge.ts` on a genuine conflict. */
  private async push(table: SyncTable, id: string, data: { timestamp?: string }): Promise<void> {
    if (!this.ownerId) return;
    const key = `${table}:${id}`;
    try {
      let expected = this.baselines.get(key) ?? null;
      let result = await this.rpcOnce(table, id, data, expected);
      if (result?.ok) {
        this.baselines.set(key, result.current_row!.updated_at);
        this.retryQueue.delete(key);
        this.emit();
        return;
      }
      if (expected === null && result?.current_row) {
        expected = result.current_row.updated_at;
        result = await this.rpcOnce(table, id, data, expected);
        if (result?.ok) {
          this.baselines.set(key, result.current_row!.updated_at);
          this.retryQueue.delete(key);
          this.emit();
          return;
        }
      }
      if (result?.current_row) {
        await this.resolveViaMerge(table, id, data, result.current_row.data, result.current_row.updated_at);
      } else {
        this.retryQueue.add(key);
      }
      this.emit();
    } catch {
      this.online = false;
      this.retryQueue.add(key);
      this.emit();
    }
  }

  /** One-time migration push (D5): insert-only, skip silently if the row already exists
   *  remotely — never overwrites, never merges. */
  private async pushIfMissing(table: SyncTable, id: string, data: { timestamp?: string }): Promise<void> {
    if (!this.ownerId) return;
    try {
      const result = await this.rpcOnce(table, id, data, null);
      if (result?.ok) this.baselines.set(`${table}:${id}`, result.current_row!.updated_at);
    } catch {
      this.retryQueue.add(`${table}:${id}`);
    }
  }

  private async resolveViaMerge(table: SyncTable, id: string, local: unknown, remote: unknown, remoteUpdatedAt: string): Promise<void> {
    const key = `${table}:${id}`;
    if (table === 'draft_sessions') {
      const { merged, conflict } = mergeDraftSession(local as DraftSession, remote as DraftSession);
      if (conflict) return this.recordConflict(table, id, local, remote);
      this.baselines.set(key, remoteUpdatedAt);
      await this.local.saveDraftSession(merged);
      return this.push(table, id, merged);
    }
    if (table === 'seasons') {
      const season = local as Season;
      const session = await this.local.getDraftSession(season.sessionId);
      if (!session) return this.recordConflict(table, id, local, remote);
      const { merged, conflict } = mergeSeason(season, remote as Season, session);
      if (conflict) return this.recordConflict(table, id, local, remote);
      this.baselines.set(key, remoteUpdatedAt);
      await this.local.saveSeason(merged);
      return this.push(table, id, merged);
    }
    // rosters: always a conflict (mergeRoster never auto-resolves).
    return this.recordConflict(table, id, local, remote);
  }

  private recordConflict(table: SyncTable, id: string, local: unknown, remote: unknown): void {
    const idx = this.conflicts.findIndex((c) => c.table === table && c.id === id);
    const entry: SyncConflict = { table, id, local, remote };
    if (idx === -1) this.conflicts.push(entry);
    else this.conflicts[idx] = entry;
  }

  private async flushQueue(): Promise<void> {
    if (!this.ownerId || this.retryQueue.size === 0) return;
    const keys = [...this.retryQueue];
    for (const key of keys) {
      const [table, id] = key.split(':') as [SyncTable, string];
      const record = await this.readLocal(table, id);
      if (record) await this.push(table, id, record as { timestamp?: string });
      else this.retryQueue.delete(key);
    }
    this.emit();
  }

  private async readLocal(table: SyncTable, id: string): Promise<unknown> {
    if (table === 'draft_sessions') return this.local.getDraftSession(id);
    if (table === 'rosters') return this.local.getRoster(id);
    return this.local.getSeason(id);
  }

  /** D3: pull every cloud row for this owner and merge into the local cache — new rows
   *  are adopted as-is; rows already present are reconciled through the same merge path
   *  a rejected push would use, so a second device's saves surface on this one too. */
  private async pullAll(): Promise<void> {
    if (!this.ownerId) return;
    const tables: SyncTable[] = ['draft_sessions', 'rosters', 'seasons'];
    for (const table of tables) {
      const { data, error } = await this.client.from(table).select('id, data, updated_at').eq('owner_id', this.ownerId);
      if (error || !data) continue;
      for (const row of data) {
        const key = `${table}:${row.id}`;
        const existing = await this.readLocal(table, row.id);
        if (!existing) {
          await this.writeLocalOnly(table, row.data);
          this.baselines.set(key, row.updated_at);
        } else if (this.baselines.get(key) !== row.updated_at) {
          await this.resolveViaMerge(table, row.id, existing, row.data, row.updated_at);
        }
      }
    }
    this.emit();
  }

  // ── GameStore: identity / migration ──────────────────────────────────

  async setOwnerId(ownerId: string | null): Promise<void> {
    this.ownerId = ownerId;
    await this.local.setOwnerId(ownerId);
    if (ownerId) await this.pullAll();
  }

  async claimLegacyData(): Promise<void> {
    await this.local.claimLegacyData();
  }

  /** D5: push every locally-owned record missing on the server, once. Safe to call on
   *  every mount — `pushIfMissing` is a no-op for rows the server already has. */
  async pushLocalToCloud(): Promise<void> {
    if (!this.ownerId) return;
    const { sessions, rosters, seasons } = await this.local.exportAll();
    for (const s of sessions) await this.pushIfMissing('draft_sessions', s.id, s);
    for (const r of rosters) await this.pushIfMissing('rosters', r.id, r);
    for (const s of seasons) await this.pushIfMissing('seasons', s.id, s);
    this.emit();
  }

  // ── GameStore: draft sessions ─────────────────────────────────────────

  listDraftSessions(): Promise<DraftSession[]> { return this.local.listDraftSessions(); }
  getDraftSession(id: string): Promise<DraftSession | null> { return this.local.getDraftSession(id); }
  async saveDraftSession(s: DraftSession): Promise<void> {
    await this.local.saveDraftSession(s);
    await this.push('draft_sessions', s.id, s);
  }
  async deleteDraftSession(id: string): Promise<void> {
    await this.local.deleteDraftSession(id);
    if (this.ownerId) await this.client.from('draft_sessions').delete().eq('id', id).catch(() => {});
  }

  // ── GameStore: rosters ────────────────────────────────────────────────

  listRosters(): Promise<SavedRoster[]> { return this.local.listRosters(); }
  getRoster(id: string): Promise<SavedRoster | null> { return this.local.getRoster(id); }
  async saveRoster(r: SavedRoster): Promise<void> {
    await this.local.saveRoster(r);
    await this.push('rosters', r.id, r);
  }
  async deleteRoster(id: string): Promise<void> {
    await this.local.deleteRoster(id);
    if (this.ownerId) await this.client.from('rosters').delete().eq('id', id).catch(() => {});
  }

  // ── GameStore: seasons ────────────────────────────────────────────────

  listSeasons(): Promise<Season[]> { return this.local.listSeasons(); }
  getSeason(id: string): Promise<Season | null> { return this.local.getSeason(id); }
  getSeasonByRoster(rosterId: string): Promise<Season | null> { return this.local.getSeasonByRoster(rosterId); }
  async saveSeason(s: Season): Promise<void> {
    await this.local.saveSeason(s);
    await this.push('seasons', s.id, s);
  }
  async deleteSeason(id: string): Promise<void> {
    await this.local.deleteSeason(id);
    if (this.ownerId) await this.client.from('seasons').delete().eq('id', id).catch(() => {});
  }

  // ── GameStore: bulk / meta ─────────────────────────────────────────────

  exportAll(): Promise<{ sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] }> { return this.local.exportAll(); }
  clearAll(): Promise<void> { return this.local.clearAll(); }
  usage(): ReturnType<GameStore['usage']> { return this.local.usage(); }
  getStorageMeta(): Promise<StorageMeta | null> { return this.local.getStorageMeta(); }
}
