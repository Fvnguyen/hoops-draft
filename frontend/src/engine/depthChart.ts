/**
 * Fixed-slot depth chart helpers (plan ui_draft_deckbuild_pack, D12).
 *
 * The persisted shape stays the dense `Record<Position, string[]>` (index order =
 * slot order, no nulls) — these helpers operate on that shape directly, so no
 * migration is needed. "Slots" are a UI concept (4 per column, D12) layered on
 * top of the variable-length array: a column can hold fewer than 4 without any
 * null placeholders, it's just not full yet.
 */
import { DEPTH_COLUMNS, DepthColumn, canPlaceAt } from './positions';

export const SLOTS_PER_COLUMN = 4;
export const MAX_ROSTER = 12;

export type DenseDepthChart = Record<string, string[]>;

export interface PlaceResult {
  ok: boolean;
  chart: DenseDepthChart;
  reason?: string;
}

/** Total players currently placed on the chart, across all columns. */
export function countPlayers(chart: DenseDepthChart): number {
  return DEPTH_COLUMNS.reduce((sum, col) => sum + (chart[col]?.length ?? 0), 0);
}

function findColumnOf(chart: DenseDepthChart, playerId: string): DepthColumn | undefined {
  return DEPTH_COLUMNS.find(col => (chart[col] ?? []).includes(playerId));
}

/**
 * Place a bench player into a column, appended after the column's current
 * occupants. Refuses a full column, a full roster, a player already on the
 * chart, or a position that isn't eligible for the column.
 */
export function placeFromBench(
  chart: DenseDepthChart,
  playerId: string,
  rawPosition: string,
  column: DepthColumn,
): PlaceResult {
  if (findColumnOf(chart, playerId)) return { ok: false, chart, reason: 'Already on the roster' };
  const existing = chart[column] ?? [];
  if (existing.length >= SLOTS_PER_COLUMN) return { ok: false, chart, reason: 'Column full' };
  if (countPlayers(chart) >= MAX_ROSTER) return { ok: false, chart, reason: 'Roster is full (12)' };
  if (!canPlaceAt(rawPosition, column)) return { ok: false, chart, reason: 'Not eligible for this position' };
  return { ok: true, chart: { ...chart, [column]: [...existing, playerId] } };
}

/**
 * Move a player already on the chart to a different column (or reorder within
 * the same column). `toIndex` defaults to the end of the destination list.
 * Refuses a full destination column or a position that isn't eligible there.
 */
export function moveWithinChart(
  chart: DenseDepthChart,
  playerId: string,
  rawPosition: string,
  toColumn: DepthColumn,
  toIndex?: number,
): PlaceResult {
  const fromColumn = findColumnOf(chart, playerId);
  if (!fromColumn) return { ok: false, chart, reason: 'Player is not on the roster' };

  const fromList = chart[fromColumn] ?? [];
  const withoutPlayer = fromList.filter(id => id !== playerId);

  if (fromColumn === toColumn) {
    const clamped = Math.max(0, Math.min(toIndex ?? withoutPlayer.length, withoutPlayer.length));
    const reordered = [...withoutPlayer.slice(0, clamped), playerId, ...withoutPlayer.slice(clamped)];
    return { ok: true, chart: { ...chart, [fromColumn]: reordered } };
  }

  const toList = chart[toColumn] ?? [];
  if (toList.length >= SLOTS_PER_COLUMN) return { ok: false, chart, reason: 'Column full' };
  if (!canPlaceAt(rawPosition, toColumn)) return { ok: false, chart, reason: 'Not eligible for this position' };

  const clamped = Math.max(0, Math.min(toIndex ?? toList.length, toList.length));
  return {
    ok: true,
    chart: {
      ...chart,
      [fromColumn]: withoutPlayer,
      [toColumn]: [...toList.slice(0, clamped), playerId, ...toList.slice(clamped)],
    },
  };
}

/** Remove a player from the chart entirely (sends them back to the bench). */
export function removeFromChart(chart: DenseDepthChart, playerId: string): DenseDepthChart {
  const fromColumn = findColumnOf(chart, playerId);
  if (!fromColumn) return chart;
  return { ...chart, [fromColumn]: (chart[fromColumn] ?? []).filter(id => id !== playerId) };
}
