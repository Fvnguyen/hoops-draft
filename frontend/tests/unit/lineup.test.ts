/**
 * Lineup model (engine_possession_model D1-D3): the formula's properties, the owner-locked
 * six-lineup numbers from the 2026-09-16 design session, and the two "regenerated"
 * constant blocks in balance.ts (RATING_NORM, LINEUP_CENTRE) against fresh measurement.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateLineup, selfWeightedMean, holeLevel, standardiseRating, lineupValue, lineupMean,
} from '@/engine/lineup';
import {
  RATING_NORM, RATING_DIMS, LINEUP_AGG, LINEUP_CENTRE, CHANNEL_CENTRE, HOLE_BOTTOM_N, STANDARDISE,
} from '@/engine/balance';
import { loadPlayers, measureLineupCentres } from './helpers';
import type { PlayerCardData } from '@/engine/types';

const players = loadPlayers();
const byName = (name: string, team?: string): PlayerCardData => {
  const p = players.find(x => x.player.name === name && (!team || x.player.team === team)) ?? players.find(x => x.player.name === name);
  if (!p) throw new Error(`missing ${name}`);
  return p;
};
const five = (names: string[], team: string) => names.map(n => byName(n, team));

describe('selfWeightedMean / aggregateLineup formula', () => {
  it('k = 0 is the plain mean; a flat lineup is worth its rating at any k', () => {
    expect(selfWeightedMean([60, 70, 80], 0)).toBeCloseTo(70, 9);
    for (const k of [0, 0.5, 1, 1.5, 2]) expect(selfWeightedMean([60, 60, 60, 60, 60], k)).toBeCloseTo(60, 9);
  });
  it('higher k gives higher ratings a larger share of the say, bounded by the max', () => {
    const rs = [99, 30, 30, 30, 30];
    const v = [0, 0.5, 1, 1.5, 2].map(k => selfWeightedMean(rs, k));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    expect(v[v.length - 1]).toBeLessThan(99);
    expect(selfWeightedMean([99, 99, 30, 30, 30], 1.5)).toBeGreaterThan(selfWeightedMean(rs, 1.5));
  });
  it('a hole is the average of the lowest two; one bad player never costs anything', () => {
    expect(HOLE_BOTTOM_N).toBe(2);
    expect(holeLevel([71, 71, 71, 71, 16])).toBeCloseTo(43.5, 9);
    const p = { k: 0, holeFloor: 35, holeCost: 0.3 };
    expect(aggregateLineup([71, 71, 71, 71, 16], p)).toBeCloseTo(60, 9);           // hole 43.5 > 35: no tax
    expect(aggregateLineup([84, 84, 84, 24, 24], p)).toBeCloseTo(60 - 0.3 * 11, 9); // hole 24 < 35: taxed
  });
  it('all-zero lineups do not divide by zero', () => {
    expect(selfWeightedMean([0, 0, 0, 0, 0], 1.5)).toBe(0);
    expect(aggregateLineup([0, 0, 0, 0, 0], { k: 1.5, holeFloor: 35, holeCost: 0.3 })).toBeCloseTo(-0.3 * 35, 9);
  });
});

describe('standardiseRating (D1)', () => {
  it('maps the pool mean to the centre and clamps to the rating range', () => {
    for (const d of RATING_DIMS) expect(standardiseRating(d, RATING_NORM[d].mean)).toBeCloseTo(STANDARDISE.center, 9);
    expect(standardiseRating('perimeterDefense', 0)).toBeGreaterThanOrEqual(STANDARDISE.min);
    expect(standardiseRating('postDefense', 99)).toBeLessThanOrEqual(STANDARDISE.max);
  });
  it('RATING_NORM matches cards.json (regenerate with npm run build:cards)', () => {
    for (const d of RATING_DIMS) {
      const v = players.map(p => p.ratings[d]);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
      expect(Math.abs(mean - RATING_NORM[d].mean), `${d} mean`).toBeLessThan(0.5);
      expect(Math.abs(sd - RATING_NORM[d].sd), `${d} sd`).toBeLessThan(0.5);
    }
  });
});

describe('owner-locked lineup numbers (2025-26 starting fives, 2026-09-16)', () => {
  const DET = five(['Cade Cunningham', 'Duncan Robinson', 'Ausar Thompson', 'Tobias Harris', 'Jalen Duren'], 'DET');
  const LAL = five(['Luka Dončić', 'Austin Reaves', 'LeBron James', 'Rui Hachimura', 'Deandre Ayton'], 'LAL');
  const DEN = five(['Jamal Murray', 'Christian Braun', 'Cameron Johnson', 'Aaron Gordon', 'Nikola Jokić'], 'DEN');
  const WAS = five(['Bub Carrington', 'Tre Johnson', 'Bilal Coulibaly', 'Kyshawn George', 'Alex Sarr'], 'WAS');

  it('playmaking is a star channel: LAL > DEN > DET > WAS, Cade alone reaches the mid 60s', () => {
    const v = { LAL: lineupValue(LAL, 'playmaking'), DEN: lineupValue(DEN, 'playmaking'), DET: lineupValue(DET, 'playmaking'), WAS: lineupValue(WAS, 'playmaking') };
    expect(v.LAL).toBeGreaterThan(v.DEN); expect(v.DEN).toBeGreaterThan(v.DET); expect(v.DET).toBeGreaterThan(v.WAS);
    expect(v.LAL).toBeCloseTo(79.2, 0); expect(v.DET).toBeCloseTo(65.9, 0);
  });
  it('perimeter is by committee with a spacing tax: two non-shooters make the Pistons a bad shooting team', () => {
    const det = lineupValue(DET, 'perimeter');
    const fiveSeventies = aggregateLineup(Array(5).fill(standardiseRating('perimeter', 70)), LINEUP_AGG.perimeter);
    expect(det).toBeCloseTo(43.9, 0);
    expect(det).toBeLessThan(STANDARDISE.center);
    expect(fiveSeventies).toBeGreaterThan(det + 10);
    // who shoots is the plain mean (D4): below the centre, so they take fewer threes
    expect(lineupMean(DET, 'perimeter')).toBeLessThan(STANDARDISE.center);
  });
  it('defence depends on everyone: Jokić lifts Denver by one fifth only, the Wizards get hunted', () => {
    expect(lineupValue(DEN, 'perimeterDefense')).toBeCloseTo(50.3, 0);
    expect(lineupValue(WAS, 'perimeterDefense')).toBeCloseTo(39.5, 0);
  });
  it('a real zero has no say in a k > 0 dimension: Ayton (0 perimeter) does not drag the Lakers', () => {
    const withoutAyton = LAL.filter(p => p.player.name !== 'Deandre Ayton');
    const kCoreWith = selfWeightedMean(withoutAyton.concat(LAL[4]).map(p => standardiseRating('perimeter', p.ratings.perimeter)), LINEUP_AGG.perimeter.k);
    const kCoreWithout = selfWeightedMean(withoutAyton.map(p => standardiseRating('perimeter', p.ratings.perimeter)), LINEUP_AGG.perimeter.k);
    expect(kCoreWith).toBeGreaterThan(kCoreWithout - 8); // vs -11 for the plain mean today
  });
});

describe('LINEUP_CENTRE / CHANNEL_CENTRE (D3)', () => {
  it('matches a fresh seeded measurement over in-game (drafted, minutes-weighted) lineups within ±1.5', () => {
    const measured = measureLineupCentres(players, 6, 100, 42);
    for (const d of RATING_DIMS) expect(Math.abs(measured[d] - LINEUP_CENTRE[d]), `${d}: measured ${measured[d].toFixed(1)} vs ${LINEUP_CENTRE[d]}`).toBeLessThan(1.5);
  });
  it('is derived from LINEUP_CENTRE per channel', () => {
    expect(CHANNEL_CENTRE.rim.off).toBe(LINEUP_CENTRE.finishing);
    expect(CHANNEL_CENTRE.three.def).toBe(LINEUP_CENTRE.perimeterDefense);
    expect(CHANNEL_CENTRE.mid.def).toBeCloseTo(0.4 * LINEUP_CENTRE.perimeterDefense + 0.6 * LINEUP_CENTRE.postDefense, 9);
  });
});
