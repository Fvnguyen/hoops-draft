/**
 * Cloud sync for an app that is expected to be offline, backgrounded for days, or killed
 * mid-write at any moment (sync_outbox D3-D7).
 *
 * The model:
 * - **Local-first.** IndexedDB is the store. Every read goes through the wrapped local
 *   `GameStore`, and every `save*`/`delete*` resolves as soon as that local write lands.
 *   Nothing the user can see ever waits on the network.
 * - **Outbox.** A write leaves one `OutboxRecord` behind per `${owner}:${table}:${id}`, so
 *   ten saves of one roster while offline are one record, and a delete replaces a pending
 *   upsert for the same key. The record carries NO payload on purpose.
 * - **Drain.** A single-flight background loop walks the current owner's records one key
 *   at a time, re-reading the CURRENT local row at send time — a late push can therefore
 *   never upload (or merge against) a stale copy. It is kicked by a write, by `online`, by
 *   the tab becoming visible, at the end of `setOwnerId`, and by the backoff timer.
 * - **CAS + merge.** A push is `cas_upsert`, a compare-and-swap against the `updated_at`
 *   the server held when local and remote last agreed (the *baseline*). A rejection is
 *   either "already exists" / "gone remote" (retried once with the right expectation) or a
 *   genuine cross-device conflict, handed to the pure `storage/merge.ts`; only a draft
 *   session whose pick logs truly diverge is parked in `conflicts` for the UI.
 * - **Tombstones.** A delete is a hard local delete plus `cas_delete` (sets `deleted_at`).
 *   That is how a second device learns a row is gone instead of re-uploading it forever,
 *   and how a push that lost the race against a delete knows to drop its local copy.
 * - **Persisted baselines.** The baseline map is stored per owner in the local store's
 *   meta table, so a relaunch re-downloads only what actually changed instead of pulling
 *   and re-merging every row.
 * - **Failure classes.** Transient (fetch failure, timeout, 5xx) backs off
 *   `min(60s, 2s * 2 ** attempts)` and retries. Permanent (RLS, payload cap, unknown
 *   table, constraint violation) parks the record as `blocked`, reported in `SyncStatus`
 *   and logged once — never retried in a loop, but given one fresh attempt per sign-in.
 * - **Pulls** run at sign-in/launch and when the app is resumed after 5+ minutes.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { mergeChallengeRun, mergeDraftSession, mergeRoster, mergeSeason } from './merge';
import { outboxKey } from './types';
import type {
  ChallengeRun,
  GameStore,
  OutboxRecord,
  OutboxStore,
  SavedRoster,
  StorageMeta,
  SyncConflict,
  SyncStatus,
  SyncTable,
} from './types';

/** Every cloud-synced table, in pull order. */
export const SYNC_TABLES: readonly SyncTable[] = ['draft_sessions', 'rosters', 'seasons', 'challenge_runs'];

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;
/** `setOwnerId` never blocks app readiness on the network for longer than this; the pull
 *  it started keeps running in the background afterwards. */
const PULL_TIMEOUT_MS = 6_000;
/** Phase 2 of the pull asks for at most this many rows' `data` per request. */
const PULL_CHUNK = 50;
/** Baselines change in bursts (a pull touches every row); coalesce the meta write. */
const BASELINE_FLUSH_MS = 250;
/** supabase-js puts no timeout on its fetches, and pull and drain share one promise chain:
 *  a single request stalled on a flaky mobile connection would freeze ALL sync until the
 *  app restarts. A timeout is a transient failure like any other. Uploads get longer — a
 *  legacy season is 4 MB. */
const READ_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 45_000;
/** A PWA is resumed far more often than it is launched; re-pull on becoming visible, but
 *  not on every tab switch. */
const RESUME_PULL_MIN_AGE_MS = 5 * 60_000;

// ── The client surface we actually use ──────────────────────────────────────

export interface CloudError {
  message: string;
  /** Postgres/PostgREST error code when there is one — the cheapest permanent-vs-transient
   *  signal available (`23xxx` constraint, `42501` insufficient privilege, ...). */
  code?: string;
}

export interface CasUpsertArgs {
  table_name: SyncTable;
  p_id: string;
  p_owner_id: string;
  expected_updated_at: string | null;
  p_data: unknown;
  p_client_timestamp: string;
}

export interface CasDeleteArgs {
  table_name: SyncTable;
  p_id: string;
  p_owner_id: string;
}

/**
 * One `cas_upsert` result row (migration `202609210001_sync_outbox.sql`).
 * `ok = true`: `updated_at` is the new server stamp and `current_row` is ONLY
 * `{id, updated_at}` (the RPC deliberately stopped echoing the payload back).
 * `ok = false`: `current_row` is the full conflicting row — including `deleted_at`, which
 * means another device deleted it — or `null` when the server has no such row at all.
 */
export interface CasUpsertRow {
  ok: boolean;
  updated_at: string | null;
  current_row: { id: string; updated_at: string; owner_id?: string; data?: unknown; deleted_at?: string | null } | null;
}

export interface CloudRow {
  id: string;
  updated_at: string;
  /** Only present when the select asked for it (phase 2 of the pull). */
  data?: unknown;
  deleted_at?: string | null;
}

export interface CloudSelectResult {
  data: CloudRow[] | null;
  error: CloudError | null;
}

/**
 * What `from(t).select(cols).eq('owner_id', id)` returns: awaitable on its own (pull phase
 * 1) and narrowable with `.in('id', ids)` (phase 2), matching real supabase-js chaining.
 * PromiseLike, not Promise — `PostgrestBuilder` implements only `then`, so typing this as
 * a `Promise` once let a `.catch()` chain compile clean and throw at runtime.
 */
export interface CloudFilter extends PromiseLike<CloudSelectResult> {
  in(column: string, values: string[]): PromiseLike<CloudSelectResult>;
}

/**
 * The narrow slice of the Supabase JS client this store calls — kept minimal and
 * structural (not `SupabaseClient` itself) so tests can pass a plain mock instead of
 * standing up a real client.
 */
export interface CloudSyncClient {
  rpc(fn: 'cas_upsert', args: CasUpsertArgs): Promise<{ data: CasUpsertRow[] | null; error: CloudError | null }>;
  rpc(fn: 'cas_delete', args: CasDeleteArgs): Promise<{ data: string | null; error: CloudError | null }>;
  from(table: SyncTable): { select(columns: string): { eq(column: string, value: string): CloudFilter } };
}

// ── Helpers ────────────────────────────────────────────────────────────────

type LocalStore = GameStore & OutboxStore;

/**
 * Per-table local CRUD in one place, so the push, pull, delete and migration paths don't
 * each grow their own four-way if-chain. (The full `SYNC_TABLES` descriptor refactor —
 * merge and parse included — is a separate task.)
 *
 * `list` is the owner-filtered listing, NOT `exportAll`: `MemoryGameStore.exportAll`
 * returns every row regardless of owner, which would hand another account's rows to
 * `pushLocalToCloud`.
 */
const LOCAL_IO: Record<SyncTable, {
  read(local: LocalStore, id: string): Promise<unknown>;
  write(local: LocalStore, data: unknown): Promise<void>;
  remove(local: LocalStore, id: string): Promise<void>;
  list(local: LocalStore): Promise<Array<{ id: string }>>;
}> = {
  draft_sessions: {
    read: (l, id) => l.getDraftSession(id),
    write: (l, d) => l.saveDraftSession(d as DraftSession),
    remove: (l, id) => l.deleteDraftSession(id),
    list: (l) => l.listDraftSessions(),
  },
  rosters: {
    read: (l, id) => l.getRoster(id),
    write: (l, d) => l.saveRoster(d as SavedRoster),
    remove: (l, id) => l.deleteRoster(id),
    list: (l) => l.listRosters(),
  },
  seasons: {
    read: (l, id) => l.getSeason(id),
    write: (l, d) => l.saveSeason(d as Season),
    remove: (l, id) => l.deleteSeason(id),
    list: (l) => l.listSeasons(),
  },
  challenge_runs: {
    read: (l, id) => l.getChallengeRun(id),
    write: (l, d) => l.saveChallengeRun(d as ChallengeRun),
    remove: (l, id) => l.deleteChallengeRun(id),
    list: (l) => l.listChallengeRuns(),
  },
};

function timestampOf(data: { timestamp?: string }): string {
  return data.timestamp ?? new Date().toISOString();
}

function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempts);
}

/** How much of this record's backoff window is left, in ms (0 = send it now). */
function backoffRemaining(record: OutboxRecord, now: number): number {
  if (record.attempts <= 0 || !record.lastAttemptAt) return 0;
  const since = now - Date.parse(record.lastAttemptAt);
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, backoffMs(record.attempts) - since);
}

/** Permanent = retrying cannot help, because the server will never accept this row as it
 *  stands. Everything else — fetch failure, timeout, 5xx, a thrown TypeError — is
 *  transient and belongs in the backoff loop. */
function isPermanent(error: unknown): boolean {
  const bag = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown; message?: unknown };
  const code = bag.code === undefined || bag.code === null ? '' : String(bag.code);
  // 23xxx: integrity constraint violation. 42501: insufficient privilege (RLS, grants).
  // 42883/42P01: the function or table does not exist (client older than the schema).
  if (code.startsWith('23') || code === '42501' || code === '42883' || code === '42P01') return true;
  const raw = error instanceof Error ? error.message : bag.message;
  const message = (raw === undefined || raw === null ? '' : String(raw)).toLowerCase();
  return (
    message.includes('row-level security') ||
    message.includes('payload too large') ||
    message.includes('invalid table_name') ||
    message.includes('permission denied') ||
    message.includes('violates') ||
    message.includes('duplicate key value')
  );
}

/** Carries the permanent/transient verdict from where the error was raised (which knows
 *  the Postgres code) to the drain loop (which only sees a thrown value). */
class SyncError extends Error {
  readonly permanent: boolean;
  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = 'SyncError';
    this.permanent = permanent;
  }
}

function errorIsPermanent(error: unknown): boolean {
  return error instanceof SyncError ? error.permanent : isPermanent(error);
}

/** Rejects (transient) if `work` has not settled in `ms`. The request itself may still
 *  land server-side; the CAS makes that safe — the retry is then rejected against our own
 *  write and merges with identical content. */
function withTimeout<T>(work: PromiseLike<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SyncError(`${what} timed out after ${ms} ms`, false)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Key-order-independent deep equality (object keys sorted recursively, array order kept
 *  as-is — order is meaningful there). Postgres jsonb doesn't preserve the original key
 *  insertion order, so a plain `JSON.stringify` comparison would report a false diff for
 *  two objects that are otherwise identical. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function baselineMetaKey(ownerId: string): string {
  return `sync.baselines:${ownerId}`;
}

/** What a push ended up doing, so the drain knows whether the record is done with. */
type PushOutcome = 'ok' | 'merged' | 'tombstoned';

export class SupabaseGameStore implements GameStore {
  private local: LocalStore;
  private client: CloudSyncClient;
  private ownerId: string | null = null;
  /** `${table}:${id}` -> the `updated_at` the server held when local and server last
   *  agreed. Persisted per owner; see `loadBaselines`/`flushBaselines`. */
  private baselines = new Map<string, string>();
  private conflicts: SyncConflict[] = [];
  private listeners = new Set<(status: SyncStatus) => void>();
  /** Mirror of the outbox for the CURRENT owner, refreshed after every mutation so
   *  `getSyncStatus()` can stay synchronous. */
  private counts = { pending: 0, blocked: 0 };
  /** Pull and drain run behind one promise chain: the same key can never be merged from
   *  two directions at once, which is the one way this design could corrupt a row. */
  private chain: Promise<void> = Promise.resolve();
  private drainQueued = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAt = 0;
  private baselineTimer: ReturnType<typeof setTimeout> | null = null;
  private baselinesDirty = false;
  /** Tables whose pull completed for the CURRENT owner. `pushLocalToCloud` only trusts
   *  "no baseline means the cloud has never seen this row" for these. */
  private pulled = new Set<SyncTable>();
  /** Strictly increasing `queuedAt` source — `Date.now()` alone repeats within a
   *  millisecond, and the drain's "did a save land while I was pushing?" guard compares
   *  `queuedAt` exactly. */
  private lastQueuedAt = '';
  private lastPullAt = 0;

  constructor(local: LocalStore, client: CloudSyncClient) {
    this.local = local;
    this.client = client;
    // Guarded for SSR and for the node test environment.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => { this.emit(); void this.drain(); });
      window.addEventListener('offline', () => { this.emit(); });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      // A PWA backgrounded for days comes back here, not through `online`.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        void this.pullIfStale();
        void this.drain();
      });
    }
  }

  // ── Status / conflicts ────────────────────────────────────────────────

  getSyncStatus(): SyncStatus {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      state: offline ? 'offline' : this.counts.pending > 0 ? 'syncing' : 'idle',
      pending: this.counts.pending,
      blocked: this.counts.blocked,
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
    const owner = this.ownerId;
    const idx = this.conflicts.findIndex((c) => c.table === table && c.id === id);
    if (idx === -1 || !owner) return;
    const conflict = this.conflicts[idx];
    this.conflicts.splice(idx, 1);

    if (choice === 'remote') await LOCAL_IO[table].write(this.local, conflict.remote);
    // We don't know the server's current updated_at without a re-fetch, so drop the
    // baseline: the next push re-derives it (the retry-as-update path in `pushNow`).
    this.clearBaseline(owner, `${table}:${id}`);
    await this.enqueue(table, id, 'upsert');
    this.emit();
  }

  // ── Outbox ────────────────────────────────────────────────────────────

  private nextQueuedAt(): string {
    const now = new Date().toISOString();
    this.lastQueuedAt = now > this.lastQueuedAt
      ? now
      : new Date(Date.parse(this.lastQueuedAt) + 1).toISOString();
    return this.lastQueuedAt;
  }

  /**
   * Queue one cloud write. Awaits the LOCAL outbox write only — never the network — and
   * kicks the drain in the background. Re-queuing a key resets `attempts`/`lastError`/
   * `blocked`: the user just touched this row, so it deserves a fresh try even if the last
   * one was parked. With no owner signed in nothing is queued; those rows are picked up by
   * `pushLocalToCloud` after the next login.
   */
  private async enqueue(table: SyncTable, id: string, op: 'upsert' | 'delete'): Promise<void> {
    const owner = this.ownerId;
    if (!owner) return;
    await this.local.putOutbox({
      key: outboxKey(owner, table, id),
      ownerId: owner,
      table,
      id,
      op,
      queuedAt: this.nextQueuedAt(),
      attempts: 0,
    });
    await this.refreshCounts();
    this.emit();
    void this.drain();
  }

  private async refreshCounts(): Promise<void> {
    const owner = this.ownerId;
    if (!owner) {
      this.counts = { pending: 0, blocked: 0 };
      return;
    }
    const mine = (await this.local.listOutbox()).filter((r) => r.ownerId === owner);
    this.counts = {
      pending: mine.filter((r) => !r.blocked).length,
      blocked: mine.filter((r) => r.blocked).length,
    };
  }

  private async readOutbox(key: string): Promise<OutboxRecord | undefined> {
    return (await this.local.listOutbox()).find((r) => r.key === key);
  }

  /** A save that landed while this record was in flight bumped its `queuedAt`; that newer
   *  write has NOT been pushed, so the record must survive and go out on the next pass. */
  private async dropIfUnchanged(record: OutboxRecord): Promise<void> {
    const current = await this.readOutbox(record.key);
    if (!current || current.queuedAt === record.queuedAt) await this.local.deleteOutbox(record.key);
  }

  // ── Baselines ─────────────────────────────────────────────────────────

  /**
   * Baselines belong to one owner. Every mutation names the owner it was computed for and
   * is dropped if the account changed while the push/pull that produced it was in flight —
   * otherwise a sign-out landing mid-push would file account A's stamp under account B.
   */
  private setBaseline(owner: string, key: string, updatedAt: string | null | undefined): void {
    if (!updatedAt || this.ownerId !== owner) return;
    this.baselines.set(key, updatedAt);
    this.touchBaselines();
  }

  private clearBaseline(owner: string, key: string): void {
    if (this.ownerId !== owner) return;
    if (this.baselines.delete(key)) this.touchBaselines();
  }

  private touchBaselines(): void {
    this.baselinesDirty = true;
    if (this.baselineTimer) return;
    this.baselineTimer = setTimeout(() => {
      this.baselineTimer = null;
      void this.flushBaselines();
    }, BASELINE_FLUSH_MS);
  }

  private async flushBaselines(): Promise<void> {
    const owner = this.ownerId;
    if (!owner || !this.baselinesDirty) return;
    this.baselinesDirty = false;
    try {
      await this.local.setMeta(baselineMetaKey(owner), JSON.stringify(Object.fromEntries(this.baselines)));
    } catch {
      // Losing the persisted copy only costs a full re-pull next launch, never data.
      this.baselinesDirty = true;
    }
  }

  private async loadBaselines(ownerId: string): Promise<void> {
    this.baselines = new Map();
    try {
      const raw = await this.local.getMeta(baselineMetaKey(ownerId));
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') this.baselines.set(key, value);
      }
    } catch {
      // A corrupt map is not worth failing a login over: an empty one just re-pulls.
      this.baselines = new Map();
    }
  }

  // ── Scheduling ────────────────────────────────────────────────────────

  /** One timer for the earliest pending retry, not one per record. */
  private scheduleRetry(ms: number): void {
    const at = Date.now() + ms;
    if (this.retryTimer && this.retryAt <= at) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryAt = at;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.drain();
    }, ms);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryAt = 0;
    if (this.baselineTimer) clearTimeout(this.baselineTimer);
    this.baselineTimer = null;
  }

  /** Everything that touches a row's local copy or its baseline runs through here. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.then(() => {}, () => {});
    return next;
  }

  /**
   * Single-flight: while a pass is queued but not started it will already see whatever was
   * enqueued since, so a second one would be pure duplicate work. A pass kicked WHILE one
   * is running does queue, because the running pass may have listed the outbox already.
   */
  private drain(): Promise<void> {
    if (!this.ownerId || this.drainQueued) return Promise.resolve();
    this.drainQueued = true;
    return this.serialize(async () => {
      this.drainQueued = false;
      await this.drainPass();
    }).catch((err) => {
      console.warn('Cloud sync drain failed:', err);
    });
  }

  private async drainPass(): Promise<void> {
    const owner = this.ownerId;
    if (!owner) return;
    let nextRetry = Infinity;
    const records = (await this.local.listOutbox()).filter((r) => r.ownerId === owner && !r.blocked);

    for (const record of records) {
      // An account switch mid-pass must never push the old owner's rows under the new one.
      if (this.ownerId !== owner) break;
      const wait = backoffRemaining(record, Date.now());
      if (wait > 0) {
        nextRetry = Math.min(nextRetry, wait);
        continue;
      }
      try {
        if (record.op === 'delete') await this.sendDelete(record, owner);
        else await this.sendUpsert(record, owner);
      } catch (error) {
        // One key's failure stops that key only; the rest of the pass carries on.
        const retryIn = await this.markFailure(record, error);
        if (retryIn !== null) nextRetry = Math.min(nextRetry, retryIn);
      }
    }

    await this.refreshCounts();
    await this.flushBaselines();
    if (nextRetry !== Infinity) this.scheduleRetry(nextRetry);
    this.emit();
  }

  private async sendUpsert(record: OutboxRecord, owner: string): Promise<void> {
    // Re-read at send time: the record carries no payload, so this is always the newest
    // local content, and a write that happened after the enqueue is included for free.
    const data = await LOCAL_IO[record.table].read(this.local, record.id);
    if (!data) {
      // Deleted locally without an owner, or claimed by another account — nothing to send.
      // Still guarded: a delete enqueued since replaced this record and must survive.
      await this.dropIfUnchanged(record);
      return;
    }
    await this.pushNow(record.table, record.id, data as { timestamp?: string }, owner);
    // Covers 'tombstoned' (the local row is gone, so even if a save re-queued this key
    // mid-push the next pass finds nothing to read and drops the record) and 'merged' —
    // including a merge parked as a conflict, which `resolveConflict` re-queues.
    await this.dropIfUnchanged(record);
  }

  private async sendDelete(record: OutboxRecord, owner: string): Promise<void> {
    const { error } = await withTimeout(this.client.rpc('cas_delete', {
      table_name: record.table,
      p_id: record.id,
      p_owner_id: record.ownerId,
    }), READ_TIMEOUT_MS, 'cas_delete');
    if (error) throw new SyncError(error.message, isPermanent(error));
    // A null stamp means the row never reached the cloud — same outcome for us as a
    // tombstone: there is nothing left to push for this key.
    this.clearBaseline(owner, `${record.table}:${record.id}`);
    await this.dropIfUnchanged(record);
  }

  /** Returns the ms to wait before the next attempt, or null when nothing is scheduled
   *  (parked permanently, or superseded by a newer enqueue that starts fresh). */
  private async markFailure(record: OutboxRecord, error: unknown): Promise<number | null> {
    const message = error instanceof Error ? error.message : String(error);
    const current = await this.readOutbox(record.key);
    if (!current || current.queuedAt !== record.queuedAt) return null;

    if (errorIsPermanent(error)) {
      console.warn(`Cloud sync blocked for ${record.table}/${record.id}: ${message}`);
      await this.local.putOutbox({ ...current, blocked: true, lastError: message, lastAttemptAt: new Date().toISOString() });
      return null;
    }
    const attempts = current.attempts + 1;
    await this.local.putOutbox({ ...current, attempts, lastError: message, lastAttemptAt: new Date().toISOString() });
    return backoffMs(attempts);
  }

  // ── Push ──────────────────────────────────────────────────────────────

  private async rpcOnce(table: SyncTable, id: string, data: unknown, expected: string | null, owner: string): Promise<CasUpsertRow | null> {
    const { data: rows, error } = await withTimeout(this.client.rpc('cas_upsert', {
      table_name: table,
      p_id: id,
      // The OWNER THIS WORK WAS QUEUED FOR, never `this.ownerId`: an account switch that
      // lands between two awaits here must not file one user's row under another's id.
      p_owner_id: owner,
      expected_updated_at: expected,
      p_data: data,
      p_client_timestamp: timestampOf(data as { timestamp?: string }),
    }), WRITE_TIMEOUT_MS, 'cas_upsert');
    if (error) throw new SyncError(error.message, isPermanent(error));
    return rows?.[0] ?? null;
  }

  private static stampOf(result: CasUpsertRow): string | null {
    return result.updated_at ?? result.current_row?.updated_at ?? null;
  }

  /**
   * Normal write path. A rejection's `current_row` tells us what actually happened:
   *  - `deleted_at` set: another device deleted this row. A delete is the user's last word
   *    and there is nothing to merge, so the delete wins — drop the local copy too.
   *  - `null`: the server has no such row, so our baseline pointed at something that is
   *    gone. Retry once as a fresh insert.
   *  - present: the server holds content we have not reconciled with — hand it to
   *    `merge.ts`. That includes `expected === null` ("already exists": site data was
   *    cleared, or a first push raced another device). It used to be retried as an update
   *    against the row's real `updated_at`, which overwrote the cloud copy unmerged.
   */
  private async pushNow(table: SyncTable, id: string, data: { timestamp?: string }, owner: string): Promise<PushOutcome> {
    const key = `${table}:${id}`;
    const expected = this.baselines.get(key) ?? null;
    let result = await this.rpcOnce(table, id, data, expected, owner);
    if (result?.ok) {
      this.setBaseline(owner, key, SupabaseGameStore.stampOf(result));
      return 'ok';
    }

    if (result?.current_row?.deleted_at) return this.adoptRemoteDelete(table, id, owner);
    if (!result?.current_row) result = await this.rpcOnce(table, id, data, null, owner);

    if (result?.ok) {
      this.setBaseline(owner, key, SupabaseGameStore.stampOf(result));
      return 'ok';
    }
    if (result?.current_row?.deleted_at) return this.adoptRemoteDelete(table, id, owner);
    if (result?.current_row) {
      await this.resolveViaMerge(table, id, data, result.current_row.data, result.current_row.updated_at, owner);
      return 'merged';
    }
    // An insert-only push can only be rejected WITH a conflicting row; landing here means
    // the server disagrees with its own contract. Treat it as transient rather than
    // dropping the write on the floor.
    throw new SyncError(`cas_upsert rejected ${table}/${id} without a conflicting row`, false);
  }

  /** The remote tombstone wins: hard-delete locally (no re-enqueue — the row is already
   *  gone server-side) and forget the baseline. */
  private async adoptRemoteDelete(table: SyncTable, id: string, owner: string): Promise<PushOutcome> {
    // Ids are only unique per owner (the tables' primary key is `(owner_id, id)`), so
    // deleting after an account switch could delete the NEW account's row of that id.
    if (this.ownerId !== owner) return 'tombstoned';
    await LOCAL_IO[table].remove(this.local, id);
    this.clearBaseline(owner, `${table}:${id}`);
    return 'tombstoned';
  }

  /**
   * Which side wins, per table (`storage/merge.ts` holds the actual rules):
   * draft sessions keep the longer pick log, seasons union their played games (that needs
   * the draft session to recompute standings; without it the row is parked), challenge
   * runs keep the further phase, rosters keep the newest edit — nothing irreplaceable is
   * at stake there, both sides hold identical `draftedCards` and only the arrangement
   * differs. `conflict: true` means a human has to pick a side.
   */
  private async mergeRows(table: SyncTable, local: unknown, remote: unknown): Promise<{ merged: unknown; conflict: boolean }> {
    if (table === 'draft_sessions') return mergeDraftSession(local as DraftSession, remote as DraftSession);
    if (table === 'rosters') return mergeRoster(local as SavedRoster, remote as SavedRoster);
    if (table === 'challenge_runs') return mergeChallengeRun(local as ChallengeRun, remote as ChallengeRun);
    const session = await this.local.getDraftSession((local as Season).sessionId);
    if (!session) return { merged: local, conflict: true };
    return mergeSeason(local as Season, remote as Season, session);
  }

  private async resolveViaMerge(table: SyncTable, id: string, local: unknown, remote: unknown, remoteUpdatedAt: string, owner: string): Promise<void> {
    if (this.ownerId !== owner) return; // see `adoptRemoteDelete`
    const { merged, conflict } = await this.mergeRows(table, local, remote);
    if (conflict) return this.recordConflict(table, id, local, remote);
    // Adopt the remote's updated_at as the new baseline BEFORE re-pushing: without it the
    // re-push compares against a stale baseline, the CAS rejects, and we land back in here
    // — an endless merge/push loop.
    this.setBaseline(owner, `${table}:${id}`, remoteUpdatedAt);
    await LOCAL_IO[table].write(this.local, merged);
    await this.pushNow(table, id, merged as { timestamp?: string }, owner);
  }

  private recordConflict(table: SyncTable, id: string, local: unknown, remote: unknown): void {
    const idx = this.conflicts.findIndex((c) => c.table === table && c.id === id);
    const entry: SyncConflict = { table, id, local, remote };
    if (idx === -1) this.conflicts.push(entry);
    else this.conflicts[idx] = entry;
  }

  // ── Pull ──────────────────────────────────────────────────────────────

  /**
   * Two-phase (D7). Phase 1 asks only for `id, updated_at, deleted_at` — cheap, and enough
   * to decide what actually changed. Phase 2 downloads `data` in batches, only for the rows
   * whose stamp differs from our persisted baseline. Before baselines were persisted this
   * re-downloaded and re-merged every row on every launch.
   */
  private async pullAll(owner: string): Promise<void> {
    for (const table of SYNC_TABLES) {
      if (this.ownerId !== owner) return;
      try {
        await this.pullTable(table, owner);
        this.pulled.add(table);
      } catch (err) {
        // One table failing (RLS, a bad response) must not cost us the other three.
        console.warn(`Cloud pull failed for ${table}:`, err);
      }
    }
    this.lastPullAt = Date.now();
    await this.flushBaselines();
    this.emit();
  }

  /** Another device's saves and deletes only reach this one through a pull, and an
   *  installed PWA can go days between launches — so also pull when it is resumed. */
  private pullIfStale(): Promise<void> {
    const owner = this.ownerId;
    if (!owner || Date.now() - this.lastPullAt < RESUME_PULL_MIN_AGE_MS) return Promise.resolve();
    this.lastPullAt = Date.now(); // claim the slot now: visibility can flap while one is queued
    return this.serialize(() => this.pullAll(owner)).catch((err) => {
      console.warn('Cloud pull on resume failed:', err);
    });
  }

  private async pullTable(table: SyncTable, owner: string): Promise<void> {
    // `.eq('owner_id', ...)` on every select is not decoration: an ADMIN account can read
    // every owner's rows through RLS, so dropping it would merge strangers' data in.
    const { data, error } = await withTimeout(
      this.client.from(table).select('id, updated_at, deleted_at').eq('owner_id', owner), READ_TIMEOUT_MS, `pull ${table}`);
    if (error) throw new SyncError(error.message, isPermanent(error));
    if (!data) return;

    const pending = new Map((await this.local.listOutbox())
      .filter((r) => r.ownerId === owner && r.table === table)
      .map((r) => [r.id, r] as const));
    const needed: string[] = [];

    for (const row of data) {
      const key = `${table}:${row.id}`;
      if (row.deleted_at) {
        // This is how device B learns about device A's delete.
        const queued = pending.get(row.id);
        const resavedSince = queued?.op === 'upsert' && isAfter(queued.queuedAt, row.deleted_at);
        if (!resavedSince && this.ownerId === owner) {
          const existing = await LOCAL_IO[table].read(this.local, row.id);
          if (existing) await LOCAL_IO[table].remove(this.local, row.id);
          this.clearBaseline(owner, key);
        }
        continue;
      }
      // A local delete that hasn't been pushed yet would otherwise be resurrected by the
      // very next pull, before the drain got to `cas_delete`.
      if (pending.get(row.id)?.op === 'delete') continue;
      if (this.baselines.get(key) === row.updated_at) continue;
      needed.push(row.id);
    }

    for (let i = 0; i < needed.length; i += PULL_CHUNK) {
      if (this.ownerId !== owner) return;
      const chunk = needed.slice(i, i + PULL_CHUNK);
      const page = await withTimeout(
        this.client.from(table).select('id, data, updated_at').eq('owner_id', owner).in('id', chunk), WRITE_TIMEOUT_MS, `pull ${table} data`);
      if (page.error) throw new SyncError(page.error.message, isPermanent(page.error));
      for (const row of page.data ?? []) await this.applyRemoteRow(table, row, owner);
    }
  }

  private async applyRemoteRow(table: SyncTable, row: CloudRow, owner: string): Promise<void> {
    if (this.ownerId !== owner) return; // the account switched mid-pull; these rows are not theirs
    const key = `${table}:${row.id}`;
    const existing = await LOCAL_IO[table].read(this.local, row.id);
    if (!existing) {
      await LOCAL_IO[table].write(this.local, row.data);
      this.setBaseline(owner, key, row.updated_at);
      return;
    }
    // A missing baseline (a fresh device, a cleared map) doesn't by itself mean the row
    // changed — only a real content difference does. Without this check every login would
    // run a merge on every already-synced row.
    if (sameContent(existing, row.data)) {
      this.setBaseline(owner, key, row.updated_at);
      return;
    }
    await this.resolveViaMerge(table, row.id, existing, row.data, row.updated_at, owner);
  }

  // ── GameStore: identity / migration ──────────────────────────────────

  /**
   * Called on every auth change by `StorageProvider`. Repeating the current owner is cheap
   * and never starts a second pull. A real change resets everything owner-scoped, loads
   * that owner's persisted baselines and outbox counts, and pulls — but only waits
   * `PULL_TIMEOUT_MS` for it, because app readiness hangs off this promise and a slow
   * network must not hold the whole app hostage. The pull carries on in the background.
   */
  async setOwnerId(ownerId: string | null): Promise<void> {
    if (ownerId === this.ownerId) {
      await this.local.setOwnerId(ownerId);
      return;
    }

    await this.flushBaselines(); // still the OLD owner's map at this point
    this.clearTimers();
    this.baselinesDirty = false;
    this.baselines = new Map();
    this.conflicts = [];
    this.counts = { pending: 0, blocked: 0 };
    this.pulled = new Set();
    this.ownerId = ownerId;
    await this.local.setOwnerId(ownerId);
    if (!ownerId) {
      this.emit();
      return;
    }

    await this.loadBaselines(ownerId);
    await this.unblockOutbox(ownerId);
    await this.refreshCounts();
    this.emit();

    const pull = this.serialize(() => this.pullAll(ownerId)).catch((err) => {
      console.warn('Cloud pull failed:', err);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([pull, new Promise<void>((resolve) => { timer = setTimeout(resolve, PULL_TIMEOUT_MS); })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    void this.drain();
  }

  /**
   * A parked record gets ONE fresh attempt per sign-in/launch. "Permanent" is judged from
   * an error message, and an expired session is indistinguishable from a real permission
   * error (the request goes out as `anon`), so never retrying would strand a write the
   * next login could have synced. Once per launch is nowhere near a retry loop.
   */
  private async unblockOutbox(owner: string): Promise<void> {
    for (const record of await this.local.listOutbox()) {
      if (record.ownerId !== owner || !record.blocked) continue;
      await this.local.putOutbox({ ...record, blocked: false, attempts: 0, lastAttemptAt: undefined });
    }
  }

  async claimLegacyData(): Promise<void> {
    await this.local.claimLegacyData();
  }

  /**
   * One-time migration of rows this device made before it had an account (or before cloud
   * sync existed): anything with no baseline and no outbox record has never reached the
   * cloud, so queue an upsert for it. Rows with a baseline are skipped, which is what keeps
   * this from re-walking (and re-pushing) the whole account on every launch.
   *
   * Runs behind the same chain as the pull, and only for tables that pull actually
   * reconciled: "no baseline" only means "local-only" once we have seen what the cloud
   * holds. After a failed pull the same rows would be pushed as first-ever inserts, and the
   * already-exists retry would overwrite the cloud copy with this device's older one.
   */
  async pushLocalToCloud(): Promise<void> {
    const owner = this.ownerId;
    if (!owner) return;
    await this.serialize(async () => {
      if (this.ownerId !== owner) return;
      const queued = new Set((await this.local.listOutbox()).filter((r) => r.ownerId === owner).map((r) => r.key));
      for (const table of SYNC_TABLES) {
        if (!this.pulled.has(table)) continue;
        for (const row of await LOCAL_IO[table].list(this.local)) {
          if (this.ownerId !== owner) return;
          if (this.baselines.has(`${table}:${row.id}`)) continue;
          if (queued.has(outboxKey(owner, table, row.id))) continue;
          await this.enqueue(table, row.id, 'upsert');
        }
      }
    });
    this.emit();
  }

  /** Resolves once the queued pull/drain work has settled. For tests and diagnostics —
   *  production code never waits on sync by design. */
  async settle(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const before = this.chain;
      await before.catch(() => {});
      await Promise.resolve();
      if (this.chain === before && !this.drainQueued) return;
    }
  }

  // ── GameStore: draft sessions ─────────────────────────────────────────

  listDraftSessions(): Promise<DraftSession[]> { return this.local.listDraftSessions(); }
  getDraftSession(id: string): Promise<DraftSession | null> { return this.local.getDraftSession(id); }
  async saveDraftSession(s: DraftSession): Promise<void> {
    await this.local.saveDraftSession(s);
    await this.enqueue('draft_sessions', s.id, 'upsert');
  }
  async deleteDraftSession(id: string): Promise<void> {
    await this.local.deleteDraftSession(id);
    await this.enqueue('draft_sessions', id, 'delete');
  }

  // ── GameStore: rosters ────────────────────────────────────────────────

  listRosters(): Promise<SavedRoster[]> { return this.local.listRosters(); }
  getRoster(id: string): Promise<SavedRoster | null> { return this.local.getRoster(id); }
  async saveRoster(r: SavedRoster): Promise<void> {
    await this.local.saveRoster(r);
    await this.enqueue('rosters', r.id, 'upsert');
  }
  async deleteRoster(id: string): Promise<void> {
    await this.local.deleteRoster(id);
    await this.enqueue('rosters', id, 'delete');
  }

  // ── GameStore: seasons ────────────────────────────────────────────────

  listSeasons(): Promise<Season[]> { return this.local.listSeasons(); }
  getSeason(id: string): Promise<Season | null> { return this.local.getSeason(id); }
  getSeasonByRoster(rosterId: string): Promise<Season | null> { return this.local.getSeasonByRoster(rosterId); }
  async saveSeason(s: Season): Promise<void> {
    await this.local.saveSeason(s);
    await this.enqueue('seasons', s.id, 'upsert');
  }
  async deleteSeason(id: string): Promise<void> {
    await this.local.deleteSeason(id);
    await this.enqueue('seasons', id, 'delete');
  }
  /**
   * sync_outbox D9: delegates the atomic get-or-create to the wrapped local store — that is
   * where the race actually gets closed (one Dexie transaction / one synchronous Map check).
   * This only needs to know whether `factory` fired, which means the local store had never
   * seen this roster and just made a new row that the cloud needs too; an existing row
   * (including a pre-outbox legacy id) is already synced or already queued, so pushing it
   * again would be redundant. Never awaits the network — `enqueue` only awaits the local
   * outbox write, exactly like `saveSeason`.
   */
  async getOrCreateSeason(rosterId: string, factory: () => Season): Promise<Season> {
    let created = false;
    const season = await this.local.getOrCreateSeason(rosterId, () => {
      created = true;
      return factory();
    });
    if (created) await this.enqueue('seasons', season.id, 'upsert');
    return season;
  }

  // ── GameStore: challenge runs ─────────────────────────────────────────

  listChallengeRuns(): Promise<ChallengeRun[]> { return this.local.listChallengeRuns(); }
  getChallengeRun(id: string): Promise<ChallengeRun | null> { return this.local.getChallengeRun(id); }
  getChallengeRunByRoster(rosterId: string): Promise<ChallengeRun | null> { return this.local.getChallengeRunByRoster(rosterId); }
  async saveChallengeRun(r: ChallengeRun): Promise<void> {
    await this.local.saveChallengeRun(r);
    await this.enqueue('challenge_runs', r.id, 'upsert');
  }
  async deleteChallengeRun(id: string): Promise<void> {
    await this.local.deleteChallengeRun(id);
    await this.enqueue('challenge_runs', id, 'delete');
  }
  /** sync_outbox D9: same reasoning as `getOrCreateSeason` — enqueue only when the local
   *  store actually minted a new row. */
  async getOrCreateChallengeRun(rosterId: string, factory: () => ChallengeRun): Promise<ChallengeRun> {
    let created = false;
    const run = await this.local.getOrCreateChallengeRun(rosterId, () => {
      created = true;
      return factory();
    });
    if (created) await this.enqueue('challenge_runs', run.id, 'upsert');
    return run;
  }

  // ── GameStore: bulk / meta ─────────────────────────────────────────────

  exportAll(): Promise<{ sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] }> { return this.local.exportAll(); }
  clearAll(): Promise<void> { return this.local.clearAll(); }
  usage(): ReturnType<GameStore['usage']> { return this.local.usage(); }
  getStorageMeta(): Promise<StorageMeta | null> { return this.local.getStorageMeta(); }
  getMeta(key: string): Promise<string | null> { return this.local.getMeta(key); }
  setMeta(key: string, value: string): Promise<void> { return this.local.setMeta(key, value); }
}

/** True when `a` is strictly later than `b`. Both are ISO-ish, but `deleted_at` comes from
 *  Postgres (`+00:00`, microseconds) and `queuedAt` from the browser (`Z`, milliseconds),
 *  so they are compared as instants, not as strings. Unparseable input errs towards
 *  keeping the local row. */
function isAfter(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  return left > right;
}
