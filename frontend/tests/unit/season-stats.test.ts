import { describe, it, expect } from 'vitest';
import { resolveSeasonStats, formatAsOf, seasonLabel, type SeasonStatsFile } from '@/lib/seasonStats';

const row = (pts: number, gp = 6) => ({
  gp, mpg: 30, pts, trb: 5, ast: 4, stl: 1, blk: 0.5, fga: 12, fg3a: 4,
  fg_pct: 0.45, fg3_pct: 0.35, fg2_pct: 0.5, ft_pct: 0.8,
});
const file: SeasonStatsFile = { asOf: '2026-11-03', season: '2026-27', players: { a: row(20) } };

describe('resolveSeasonStats', () => {
  it('prefers the daily row', () => {
    const r = resolveSeasonStats({ id: 'a', seasonStats: row(10) }, file);
    expect(r.stats?.pts).toBe(20);
    expect(r.asOf).toBe('2026-11-03');
  });
  it('falls back to baked seasonStats without asOf', () => {
    const r = resolveSeasonStats({ id: 'b', seasonStats: row(10) }, file);
    expect(r.stats?.pts).toBe(10);
    expect(r.asOf).toBeNull();
  });
  it('falls back to baked seasonStats when the fetch failed', () => {
    expect(resolveSeasonStats({ id: 'a', seasonStats: row(10) }, null).stats?.pts).toBe(10);
  });
  it('returns null for legacy cards with no row', () => {
    expect(resolveSeasonStats({ id: 'z' }, file).stats).toBeNull();
    expect(resolveSeasonStats({ id: 'z', seasonStats: null }, null).stats).toBeNull();
  });
});

describe('labels', () => {
  it('formats asOf', () => {
    expect(formatAsOf('2026-11-03')).toBe('Nov 3');
    expect(formatAsOf('bad')).toBeNull();
    expect(formatAsOf(null)).toBeNull();
  });
  it('builds the label', () => {
    expect(seasonLabel('2026-27', '2026-11-03')).toBe('2026-27 · as of Nov 3');
    expect(seasonLabel('2026-27', null)).toBe('2026-27');
  });
});
