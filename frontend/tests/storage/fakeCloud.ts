/**
 * In-memory stand-in for the four cloud tables plus the `cas_upsert`/`cas_delete` RPCs
 * (migration `202609210001_sync_outbox.sql`), enough to exercise `SupabaseGameStore`'s
 * outbox/drain/pull/merge paths without a real Supabase project.
 *
 * It mirrors the server contract deliberately closely — slim `current_row` on success,
 * full row (with `deleted_at`) on rejection, insert-only reviving a tombstone, `cas_delete`
 * idempotent and returning null for a row the cloud never had — because that contract is
 * exactly what the client's correctness depends on.
 */

import type {
  CasDeleteArgs,
  CasUpsertArgs,
  CasUpsertRow,
  CloudError,
  CloudFilter,
  CloudRow,
  CloudSelectResult,
  CloudSyncClient,
} from '@/storage/supabase';
import type { SyncTable } from '@/storage/types';

export interface FakeCloudRow {
  id: string;
  owner_id: string;
  data: unknown;
  updated_at: string;
  deleted_at: string | null;
}

export interface SelectCall {
  table: SyncTable;
  columns: string;
  /** Present only for the batched phase-2 `.in('id', ...)` call. */
  ids?: string[];
}

const TABLES: SyncTable[] = ['draft_sessions', 'rosters', 'seasons', 'challenge_runs'];

export class FakeCloud implements CloudSyncClient {
  rows = new Map<SyncTable, Map<string, FakeCloudRow>>(TABLES.map((t) => [t, new Map()]));
  selects: SelectCall[] = [];
  upserts: CasUpsertArgs[] = [];
  deletes: CasDeleteArgs[] = [];
  /** Returned by every select while set (data comes back null, like PostgREST). */
  selectError: CloudError | null = null;
  /** Awaited before every select resolves — a never-resolving promise simulates a hang. */
  selectGate: Promise<void> | null = null;
  /**
   * Hook run at the start of every rpc. Return a `CloudError` to answer like Postgres,
   * throw to simulate a transport failure, or await something to hold the call open.
   */
  onRpc: ((fn: 'cas_upsert' | 'cas_delete', args: CasUpsertArgs | CasDeleteArgs) => Promise<CloudError | void> | CloudError | void) | null = null;

  private clock = 0;

  nextUpdatedAt(): string {
    this.clock += 1;
    return `2026-01-01T00:00:${String(this.clock).padStart(2, '0')}.000Z`;
  }

  rpc(fn: 'cas_upsert', args: CasUpsertArgs): Promise<{ data: CasUpsertRow[] | null; error: CloudError | null }>;
  rpc(fn: 'cas_delete', args: CasDeleteArgs): Promise<{ data: string | null; error: CloudError | null }>;
  async rpc(
    fn: 'cas_upsert' | 'cas_delete',
    args: CasUpsertArgs | CasDeleteArgs
  ): Promise<{ data: CasUpsertRow[] | string | null; error: CloudError | null }> {
    if (fn === 'cas_upsert') this.upserts.push(args as CasUpsertArgs);
    else this.deletes.push(args as CasDeleteArgs);

    if (this.onRpc) {
      const outcome = await this.onRpc(fn, args);
      if (outcome) return { data: null, error: outcome };
    }
    if (fn === 'cas_upsert') return { data: [this.casUpsert(args as CasUpsertArgs)], error: null };
    return { data: this.casDelete(args as CasDeleteArgs), error: null };
  }

  private casUpsert(args: CasUpsertArgs): CasUpsertRow {
    const table = this.rows.get(args.table_name)!;
    const existing = table.get(args.p_id);
    const ok = (updated_at: string): CasUpsertRow => ({
      ok: true,
      updated_at,
      current_row: { id: args.p_id, updated_at },
    });
    const reject = (): CasUpsertRow => ({
      ok: false,
      updated_at: existing?.updated_at ?? null,
      current_row: existing ? { ...existing } : null,
    });

    if (args.expected_updated_at === null) {
      // Insert-only, except that it revives a tombstone in place.
      if (existing && !existing.deleted_at) return reject();
      const updated_at = this.nextUpdatedAt();
      table.set(args.p_id, { id: args.p_id, owner_id: args.p_owner_id, data: args.p_data, updated_at, deleted_at: null });
      return ok(updated_at);
    }

    if (!existing || existing.deleted_at || existing.updated_at !== args.expected_updated_at) return reject();
    const updated_at = this.nextUpdatedAt();
    table.set(args.p_id, { ...existing, data: args.p_data, updated_at });
    return ok(updated_at);
  }

  private casDelete(args: CasDeleteArgs): string | null {
    const table = this.rows.get(args.table_name)!;
    const existing = table.get(args.p_id);
    if (!existing) return null;
    const updated_at = this.nextUpdatedAt();
    table.set(args.p_id, { ...existing, deleted_at: existing.deleted_at ?? updated_at, updated_at });
    return updated_at;
  }

  from(table: SyncTable) {
    return {
      select: (columns: string) => ({
        eq: (column: string, value: string): CloudFilter => {
          this.selects.push({ table, columns });
          const matching = () =>
            [...this.rows.get(table)!.values()].filter((row) => (row as unknown as Record<string, unknown>)[column] === value);
          const project = (list: FakeCloudRow[]): CloudSelectResult => {
            if (this.selectError) return { data: null, error: this.selectError };
            const wanted = columns.split(',').map((c) => c.trim());
            return {
              data: list.map((row) => {
                const out: Record<string, unknown> = {};
                for (const col of wanted) out[col] = (row as unknown as Record<string, unknown>)[col];
                return out as unknown as CloudRow;
              }),
              error: null,
            };
          };
          const settle = (list: () => FakeCloudRow[]) =>
            Promise.resolve(this.selectGate).then(() => project(list()));
          return {
            then: (onfulfilled, onrejected) => settle(matching).then(onfulfilled, onrejected),
            in: (col: string, values: string[]) => {
              this.selects.push({ table, columns, ids: [...values] });
              return settle(() => matching().filter((row) => values.includes((row as unknown as Record<string, unknown>)[col] as string)));
            },
          };
        },
      }),
    };
  }

  /** Simulates another device writing directly (bypassing this SupabaseGameStore). */
  writeDirect(table: SyncTable, id: string, data: unknown, ownerId = 'owner-1'): void {
    this.rows.get(table)!.set(id, { id, owner_id: ownerId, data, updated_at: this.nextUpdatedAt(), deleted_at: null });
  }

  /** Simulates another device deleting a row. */
  tombstone(table: SyncTable, id: string): void {
    const existing = this.rows.get(table)!.get(id);
    if (!existing) return;
    const updated_at = this.nextUpdatedAt();
    this.rows.get(table)!.set(id, { ...existing, deleted_at: updated_at, updated_at });
  }

  live(table: SyncTable, id: string): FakeCloudRow | undefined {
    const row = this.rows.get(table)!.get(id);
    return row && !row.deleted_at ? row : undefined;
  }

  resetCalls(): void {
    this.selects = [];
    this.upserts = [];
    this.deletes = [];
  }
}
