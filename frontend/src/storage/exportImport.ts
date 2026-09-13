/**
 * User-facing backup: "Export my data" / "Import" on the rosters page (plan
 * data_storage D5). This is the user backup path — distinct from the dev-only
 * `/debug` analytics export, which POSTs a different shape to `/api/game-logs`
 * for `scripts/analyze_game_data.js` and is untouched by this module.
 *
 * Merge rule (D5, verbatim): "merges by id, newer timestamp wins, never
 * deletes." Applied independently to drafts, rosters and seasons.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { GameStore, SavedRoster } from './types';

/**
 * Fallback schema version tag for exported bundles, used only when the store has no
 * `storageMeta` row yet (a fresh `MemoryGameStore`, or an IndexedDB store that predates
 * `GameStore.getStorageMeta()` — see plan_data_storage T3).
 */
export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportBundle {
  /** Schema version of the data at export time (see EXPORT_SCHEMA_VERSION doc above). */
  schemaVersion: number;
  /** ISO timestamp of when this bundle was produced, for user-facing display only. */
  exportedAt: string;
  sessions: DraftSession[];
  seasons: Season[];
  rosters: SavedRoster[];
}

export interface MergeSummary {
  sessions: { added: number; updated: number; skipped: number };
  seasons: { added: number; updated: number; skipped: number };
  rosters: { added: number; updated: number; skipped: number };
}

export interface MergeResult {
  sessions: DraftSession[];
  seasons: Season[];
  rosters: SavedRoster[];
  summary: MergeSummary;
}

interface HasIdAndTimestamp {
  id: string;
  timestamp: string;
}

/**
 * Merge one imported record collection into the current one, by id, newer
 * `timestamp` wins, never deletes a local record absent from the import.
 */
function mergeCollection<T extends HasIdAndTimestamp>(
  current: T[],
  imported: T[]
): { merged: T[]; counts: { added: number; updated: number; skipped: number } } {
  const byId = new Map<string, T>(current.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const incoming of imported) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      added++;
      continue;
    }
    const incomingTime = Date.parse(incoming.timestamp);
    const existingTime = Date.parse(existing.timestamp);
    if (!Number.isNaN(incomingTime) && incomingTime > existingTime) {
      byId.set(incoming.id, incoming);
      updated++;
    } else {
      skipped++;
    }
  }

  return { merged: Array.from(byId.values()), counts: { added, updated, skipped } };
}

/**
 * Builds the export bundle (D5: "one JSON file with drafts, rosters, seasons,
 * schemaVersion") from the current `GameStore` contents.
 */
export async function buildExportBundle(store: GameStore): Promise<ExportBundle> {
  const [{ sessions, seasons, rosters }, meta] = await Promise.all([store.exportAll(), store.getStorageMeta()]);
  return {
    schemaVersion: meta?.schemaVersion ?? EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    seasons,
    rosters,
  };
}

/**
 * Merges an imported bundle into the current in-memory collections per D5's
 * merge rule. Pure — does not touch the store; callers persist the returned
 * `sessions`/`seasons`/`rosters` back via `GameStore.save*`.
 */
export function mergeImportedData(
  current: { sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] },
  imported: ExportBundle
): MergeResult {
  const sessionsMerge = mergeCollection(current.sessions, imported.sessions);
  const seasonsMerge = mergeCollection(current.seasons, imported.seasons);
  const rostersMerge = mergeCollection(current.rosters, imported.rosters);

  return {
    sessions: sessionsMerge.merged,
    seasons: seasonsMerge.merged,
    rosters: rostersMerge.merged,
    summary: {
      sessions: sessionsMerge.counts,
      seasons: seasonsMerge.counts,
      rosters: rostersMerge.counts,
    },
  };
}

/**
 * Rough shape guard for a parsed JSON file before we trust it as an
 * `ExportBundle`. Not a full schema validator — just enough to reject
 * garbage/unrelated JSON with a clear error instead of throwing deep inside
 * the merge or crashing the page.
 */
export function isLikelyExportBundle(value: unknown): value is ExportBundle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === 'number' &&
    Array.isArray(v.sessions) &&
    Array.isArray(v.seasons) &&
    Array.isArray(v.rosters)
  );
}
