/**
 * Fixed-slot depth chart helpers (plan ui_draft_deckbuild_pack, D12).
 *
 * The persisted shape is the dense `Record<Position, string[]>`; "slots" (4 per
 * column, 12 max) are enforced by these helpers, not by the component.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_ROSTER,
  SLOTS_PER_COLUMN,
  countPlayers,
  moveWithinChart,
  placeFromBench,
  removeFromChart,
  type DenseDepthChart,
} from '@/engine/depthChart';

const empty = (): DenseDepthChart => ({ PG: [], SG: [], SF: [], PF: [], C: [] });

/** Chart with `n` guards in PG, named g0…g(n-1). */
const guards = (n: number): DenseDepthChart => ({
  ...empty(),
  PG: Array.from({ length: n }, (_, i) => `g${i}`),
});

describe('countPlayers', () => {
  it('sums every column', () => {
    expect(countPlayers(empty())).toBe(0);
    expect(countPlayers({ ...empty(), PG: ['a', 'b'], C: ['c'] })).toBe(3);
  });

  it('tolerates a missing column', () => {
    expect(countPlayers({ PG: ['a'] })).toBe(1);
  });
});

describe('placeFromBench', () => {
  it('appends to the end of the column and leaves the input untouched', () => {
    const chart = empty();
    const result = placeFromBench(chart, 'p1', 'PG', 'PG');
    expect(result.ok).toBe(true);
    expect(result.chart.PG).toEqual(['p1']);
    expect(chart.PG).toEqual([]);
  });

  it('allows an adjacent position for a human placement', () => {
    expect(placeFromBench(empty(), 'p1', 'G', 'SF').ok).toBe(true);
  });

  it('refuses a position that is not eligible at all', () => {
    const result = placeFromBench(empty(), 'p1', 'PG', 'C');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Not eligible for this position');
    expect(result.chart).toEqual(empty());
  });

  it('refuses a full column', () => {
    const result = placeFromBench(guards(SLOTS_PER_COLUMN), 'p1', 'PG', 'PG');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Column full');
  });

  it('refuses a 13th player', () => {
    const full: DenseDepthChart = {
      PG: ['a1', 'a2', 'a3'], SG: ['b1', 'b2', 'b3'],
      SF: ['c1', 'c2', 'c3'], PF: ['d1', 'd2', 'd3'], C: [],
    };
    expect(countPlayers(full)).toBe(MAX_ROSTER);
    const result = placeFromBench(full, 'p1', 'C', 'C');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Roster is full (12)');
  });

  it('refuses a player already on the chart', () => {
    const result = placeFromBench({ ...empty(), SG: ['p1'] }, 'p1', 'G', 'PG');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Already on the roster');
  });
});

describe('moveWithinChart', () => {
  it('reorders inside one column at the given index', () => {
    const result = moveWithinChart(guards(3), 'g2', 'PG', 'PG', 0);
    expect(result.ok).toBe(true);
    expect(result.chart.PG).toEqual(['g2', 'g0', 'g1']);
  });

  it('clamps an out-of-range index instead of leaving a hole', () => {
    const result = moveWithinChart(guards(3), 'g0', 'PG', 'PG', 99);
    expect(result.ok).toBe(true);
    expect(result.chart.PG).toEqual(['g1', 'g2', 'g0']);
  });

  it('moves between columns, removing from the source', () => {
    const result = moveWithinChart({ ...empty(), PG: ['g0', 'g1'] }, 'g0', 'G', 'SG', 0);
    expect(result.ok).toBe(true);
    expect(result.chart.PG).toEqual(['g1']);
    expect(result.chart.SG).toEqual(['g0']);
  });

  it('refuses a full destination column', () => {
    const chart: DenseDepthChart = { ...empty(), PG: ['g0'], SG: ['s0', 's1', 's2', 's3'] };
    const result = moveWithinChart(chart, 'g0', 'G', 'SG');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Column full');
  });

  it('refuses an ineligible destination column', () => {
    const result = moveWithinChart({ ...empty(), PG: ['g0'] }, 'g0', 'PG', 'C');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Not eligible for this position');
  });

  it('refuses a player who is not on the chart', () => {
    const result = moveWithinChart(empty(), 'ghost', 'PG', 'PG');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Player is not on the roster');
  });

  it('does not change the roster size', () => {
    const before = { ...empty(), PG: ['g0', 'g1'], SF: ['f0'] };
    const after = moveWithinChart(before, 'g1', 'G', 'SG');
    expect(countPlayers(after.chart)).toBe(countPlayers(before));
  });
});

describe('removeFromChart', () => {
  it('removes a player from whichever column holds them', () => {
    const chart = removeFromChart({ ...empty(), SF: ['f0', 'f1'] }, 'f0');
    expect(chart.SF).toEqual(['f1']);
  });

  it('returns the chart unchanged when the player is not placed', () => {
    const chart = { ...empty(), SF: ['f0'] };
    expect(removeFromChart(chart, 'nobody')).toBe(chart);
  });
});
