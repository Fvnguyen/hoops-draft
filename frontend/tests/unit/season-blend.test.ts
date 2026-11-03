/**
 * season_2026_27 D3-D5: eligibility, the games-weighted blend and the new-player Rare cap
 * in `computeCards`, on synthetic rows (the real pool changes every weekly refresh).
 */
import { describe, it, expect } from 'vitest';
import { computeCards } from '@/engine/ratings';
import { RATING_CONFIG } from '@/engine/balance';
import type { PlayerBio, SeasonStat, AwardRow, SeasonConfig } from '@/engine/types';

const SEASONS: SeasonConfig = { current: '2026-27', priors: ['2025-26', '2024-25'] };

function row(playerId: string, season: string, over: Partial<SeasonStat> = {}): SeasonStat & { playerId: string; season: string } {
  return {
    playerId, season,
    gp: 60, gs: 30, mpg: 25, pts: 12, trb: 5, ast: 3, stl: 1, blk: 0.5,
    fga: 10, fg3a: 4, fta: 2,
    pct_fga_0_3: 0.3, pct_fga_3_10: 0.15, pct_fga_10_16: 0.1, pct_fga_16_3p: 0.05, pct_fga_3p: 0.4,
    fg_pct_0_3: 0.65, fg_pct_3_10: 0.42, fg_pct_10_16: 0.42, fg_pct_16_3p: 0.4, fg_pct_3p: 0.36,
    fg_pct: 0.47, fg3_pct: 0.36, fg2_pct: 0.53, ft_pct: 0.78,
    per: 15, ts: 0.57, vorp: 1, dbpm: 0, tov: 1.5,
    ast_pct: 0.15, tov_pct: 0.12, stl_pct: 0.015, blk_pct: 0.015, drb_pct: 0.15, trb_pct: 0.1,
    dws: 1.5, ws_per_48: 0.1, pct_ast_fg2: 0.5, pct_ast_fg3: 0.8,
    ...over,
  };
}

function bio(id: string): PlayerBio {
  return { id, name: `Player ${id}`, position: 'SF', height: '6-7', weight: 220, age: 26, team: 'ATL' };
}

/** 30 ordinary 2025-26 rotation players so the idx() bounds and the D5 average exist. */
function league() {
  const stats = [];
  const players = [];
  for (let i = 0; i < 30; i++) {
    const id = `bg${i}`;
    players.push(bio(id));
    stats.push(row(id, '2025-26', { pts: 8 + i, mpg: 18 + i / 2 }));
    stats.push(row(id, '2026-27', { gp: 6, pts: 8 + i, mpg: 18 + i / 2 }));
  }
  return { players, stats };
}

function build(extra: { players: PlayerBio[]; stats: ReturnType<typeof row>[]; awards?: AwardRow[] }) {
  const base = league();
  const cards = computeCards({
    players: [...base.players, ...extra.players],
    stats: [...base.stats, ...extra.stats],
    awards: extra.awards ?? [],
    seasons: SEASONS,
  });
  return new Map(cards.map(c => [c.id, c]));
}

describe('season blend: eligibility (D3)', () => {
  it('a veteran who played last season is in with 0 games this season', () => {
    const cards = build({ players: [bio('vet')], stats: [row('vet', '2025-26')] });
    const vet = cards.get('vet')!;
    expect(vet).toBeDefined();
    expect(vet.blend).toEqual({ w: 0, currentGp: 0, priorSeason: '2025-26' });
    expect(vet.seasonStats).toBeNull();
    expect(vet.stats.pts).toBe(12);
  });

  it('a player with no game this season or last is out, even with a strong 2024-25', () => {
    const cards = build({ players: [bio('gone')], stats: [row('gone', '2024-25', { pts: 28 })] });
    expect(cards.has('gone')).toBe(false);
  });

  it('a 2024-25 prior is used when 2025-26 had too few games but at least one', () => {
    const cards = build({
      players: [bio('hurt')],
      stats: [row('hurt', '2024-25', { pts: 24 }), row('hurt', '2025-26', { gp: 10, pts: 20 }), row('hurt', '2026-27', { gp: 4, pts: 22 })],
    });
    const hurt = cards.get('hurt')!;
    expect(hurt.blend?.priorSeason).toBe('2024-25');
    const w = 4 / 24;
    expect(hurt.stats.pts).toBeCloseTo(w * 22 + (1 - w) * 24, 3);
  });

  it('a player out all of 2025-26 with a 2024-25 prior is in once he plays this season', () => {
    const cards = build({ players: [bio('back')], stats: [row('back', '2024-25'), row('back', '2026-27', { gp: 1 })] });
    expect(cards.get('back')?.blend?.priorSeason).toBe('2024-25');
  });

  it('a rookie needs 5 games at 15 MPG', () => {
    const cards = build({
      players: [bio('r4'), bio('r5'), bio('r5lowmin')],
      stats: [row('r4', '2026-27', { gp: 4 }), row('r5', '2026-27', { gp: 5 }), row('r5lowmin', '2026-27', { gp: 5, mpg: 12 })],
    });
    expect(cards.has('r4')).toBe(false);
    expect(cards.has('r5')).toBe(true);
    expect(cards.has('r5lowmin')).toBe(false);
  });
});

describe('season blend: weights (D4) and rookies (D5)', () => {
  it.each([[0, 0], [6, 6 / 26], [20, 0.5], [60, 0.75]])('w at %i games is %f', (gp, w) => {
    const cards = build({
      players: [bio('p')],
      stats: [row('p', '2025-26', { pts: 10 }), ...(gp > 0 ? [row('p', '2026-27', { gp, pts: 30 })] : [])],
    });
    const p = cards.get('p')!;
    expect(p.blend!.w).toBeCloseTo(w, 4);
    expect(p.stats.pts).toBeCloseTo(w * 30 + (1 - w) * 10, 3);
    expect(RATING_CONFIG.season.seasonBlendK).toBe(20);
  });

  it('a rookie is blended toward the rotation average and shows his real row', () => {
    const cards = build({ players: [bio('rook')], stats: [row('rook', '2026-27', { gp: 6, pts: 30 })] });
    const rook = cards.get('rook')!;
    expect(rook.blend?.priorSeason).toBeNull();
    expect(rook.seasonStats?.pts).toBe(30);
    expect(rook.stats.pts).toBeLessThan(30);
    expect(rook.stats.pts).toBeGreaterThan(8);
  });

  it('a rookie is never above Rare, however big his line', () => {
    // D5's Rare cap is a guard: today the older "no award -> at most Uncommon" ceiling
    // already holds every no-prior player lower, so a rookie tops out at Uncommon.
    const monster = { pts: 45, trb: 18, ast: 12, stl: 3, blk: 3, mpg: 40, gs: 6, dbpm: 6, ast_pct: 0.5, trb_pct: 0.25, stl_pct: 0.04, blk_pct: 0.06, drb_pct: 0.3 };
    const cards = build({ players: [bio('m19')], stats: [row('m19', '2026-27', { gp: 19, ...monster })] });
    expect(['Common', 'Uncommon']).toContain(cards.get('m19')!.rarity);
  });

  it('awards follow the prior season the blend uses', () => {
    const cards = build({
      players: [bio('star')],
      stats: [row('star', '2024-25'), row('star', '2025-26', { gp: 5 }), row('star', '2026-27', { gp: 3 })],
      awards: [
        { playerId: 'star', season: '2024-25', name: 'All-NBA', level: 1 },
        { playerId: 'star', season: '2025-26', name: 'All-Defensive', level: 1 },
      ],
    });
    expect(cards.get('star')!.awards).toEqual(['All-NBA 1st Team · 2024-25']);
  });
});

describe('season blend: no config keeps the single-season behaviour', () => {
  it('without seasons, each player plays on his latest row and has no blend', () => {
    const cards = computeCards({ players: [bio('a')], stats: [row('a', '2024-25', { pts: 5 }), row('a', '2025-26', { pts: 9 })], awards: [] });
    expect(cards[0].stats.pts).toBe(9);
    expect(cards[0].blend).toBeUndefined();
  });
});
