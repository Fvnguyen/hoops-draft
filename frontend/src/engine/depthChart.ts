/**
 * Fixed-slot depth chart helpers (plan ui_draft_deckbuild_pack, D12).
 *
 * The persisted shape stays the dense `Record<Position, string[]>` (index order =
 * slot order, no nulls) — these helpers operate on that shape directly, so no
 * migration is needed. "Slots" are a UI concept (4 per column, D12) layered on
 * top of the variable-length array: a column can hold fewer than 4 without any
 * null placeholders, it's just not full yet.
 */
import { DEPTH_COLUMNS, DepthColumn, canPlaceAt, positionFit } from './positions';
import type { PlayerCardData } from './types';

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

export interface AutoDistributeResult {
  chart: DenseDepthChart;
  /** Roster-zoned players that didn't make the 12-man cut — belongs in the G-League zone. */
  overflow: PlayerCardData[];
}

/**
 * Seed a fresh depth chart from a pool of Roster-zoned players (plan
 * ui_draft_deckbuild_pack, D20): fills each column's starter slot first, then bench
 * slots one round at a time, always taking the highest-OVR unplaced player with a
 * natural fit for that column before falling back to an adjacent fit. Stops placing at
 * `MAX_ROSTER`; anyone left over is returned as `overflow` rather than discarded.
 *
 * Replaces the old per-card `defaultColumn(position)` push, which always took a raw
 * position's *first* natural column (every 'G' into PG, every 'F' into SF) with no
 * regard for how full that column already was — the root cause of guards piling into
 * PG/Centers being left off the chart entirely.
 */
export function autoDistributeRoster(players: PlayerCardData[]): AutoDistributeResult {
  const pool = [...players].sort((a, b) => {
    const diff = (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  const chart: DenseDepthChart = { PG: [], SG: [], SF: [], PF: [], C: [] };
  const placed = new Set<string>();

  function fillRound(): void {
    // Sub-pass 1: natural fits only, across every column, before any adjacent fallback
    // is considered. Otherwise an earlier column's adjacent fallback (e.g. PF taking a
    // Center via the PF<->C adjacency) can steal a player away from a later column
    // (C) that would have fit them naturally.
    const filledThisRound = new Set<DepthColumn>();
    for (const column of DEPTH_COLUMNS) {
      if (chart[column].length >= SLOTS_PER_COLUMN) continue;
      if (countPlayers(chart) >= MAX_ROSTER) return;
      const pick = pool.find(p => !placed.has(p.id) && positionFit(p.player.position, column) === 'natural');
      if (pick) {
        chart[column].push(pick.id);
        placed.add(pick.id);
        filledThisRound.add(column);
      }
    }
    // Sub-pass 2: adjacent fallback, only for columns that stayed empty this round.
    for (const column of DEPTH_COLUMNS) {
      if (filledThisRound.has(column) || chart[column].length >= SLOTS_PER_COLUMN) continue;
      if (countPlayers(chart) >= MAX_ROSTER) return;
      const pick = pool.find(p => !placed.has(p.id) && positionFit(p.player.position, column) === 'adjacent');
      if (pick) {
        chart[column].push(pick.id);
        placed.add(pick.id);
      }
    }
  }

  for (let slot = 0; slot < SLOTS_PER_COLUMN; slot++) fillRound();

  return { chart, overflow: pool.filter(p => !placed.has(p.id)) };
}

/** Remove a player from the chart entirely (sends them back to the bench). */
export function removeFromChart(chart: DenseDepthChart, playerId: string): DenseDepthChart {
  const fromColumn = findColumnOf(chart, playerId);
  if (!fromColumn) return chart;
  return { ...chart, [fromColumn]: (chart[fromColumn] ?? []).filter(id => id !== playerId) };
}
