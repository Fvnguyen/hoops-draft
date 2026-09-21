/**
 * plan render_and_engine_perf D1: memoized lineup aggregates and the prepared lineup draw.
 * Both are pure speed-ups, so every test here says the same thing in a different way:
 * the fast path returns EXACTLY what the slow path returns (toBe, not toBeCloseTo).
 */
import { describe, it, expect } from 'vitest';
import { loadPlayers } from './helpers';
import { lineupValue, lineupMidDefence, lineupMean, memoLineup } from '@/engine/lineup';
import { drawLineup, prepareLineupDraw, drawPreparedLineup } from '@/engine/rotation';
import { weightedRandom } from '@/engine/shot';
import { createRng, type Rng } from '@/engine/rng';
import type { RatingDim } from '@/engine/balance';
import type { PlayerCardData } from '@/engine/types';

const DIMS: RatingDim[] = ['finishing', 'midRange', 'perimeter', 'playmaking', 'rebounding', 'perimeterDefense', 'postDefense'];
const players = loadPlayers();

function randomFive(rng: Rng): PlayerCardData[] {
  const five: PlayerCardData[] = [];
  while (five.length < 5) {
    const p = players[Math.floor(rng.next() * players.length)];
    if (!five.includes(p)) five.push(p);
  }
  return five;
}

describe('memoLineup', () => {
  it('returns bit-identical aggregates for a registered array, on the first call and on a hit', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const plain = randomFive(rng);
      const registered = memoLineup([...plain]);
      for (const dim of DIMS) {
        const expected = lineupValue(plain, dim);
        expect(lineupValue(registered, dim)).toBe(expected); // miss: computed and stored
        expect(lineupValue(registered, dim)).toBe(expected); // hit
        expect(lineupMean(registered, dim)).toBe(lineupMean(plain, dim));
        expect(lineupMean(registered, dim)).toBe(lineupMean(plain, dim));
      }
      expect(lineupMidDefence(registered)).toBe(lineupMidDefence(plain));
      expect(lineupMidDefence(registered)).toBe(lineupMidDefence(plain));
    }
  });

  it('keeps a lineup value and a lineup mean of the same dimension apart', () => {
    const five = memoLineup(randomFive(createRng(3)));
    const value = lineupValue(five, 'playmaking');
    const mean = lineupMean(five, 'playmaking');
    expect(lineupValue(five, 'playmaking')).toBe(value);
    expect(lineupMean(five, 'playmaking')).toBe(mean);
    expect(value).not.toBe(mean); // k = 1.5 and a hole tax vs a plain mean
  });

  it('never caches an array that was not registered (tests and sweeps edit ratings in place)', () => {
    const five = randomFive(createRng(11)).map((p) => ({ ...p, ratings: { ...p.ratings } })) as PlayerCardData[];
    const before = lineupValue(five, 'finishing');
    five[0].ratings.finishing = 99;
    five[1].ratings.finishing = 99;
    expect(lineupValue(five, 'finishing')).not.toBe(before);
  });

  it('is keyed by the array, so the same players in another order are computed on their own', () => {
    const a = memoLineup(randomFive(createRng(5)));
    const b = memoLineup([...a].reverse());
    for (const dim of DIMS) expect(lineupValue(b, dim)).toBe(lineupValue([...a].reverse(), dim));
  });
});

describe('prepareLineupDraw / drawPreparedLineup', () => {
  /** drawLineup as it was before D1, kept here as the reference implementation. */
  function referenceDraw(depthChart: Record<string, string[]>, shares: Map<string, number>, rng: Rng): Map<string, string> {
    const lineup = new Map<string, string>();
    for (const [pos, ids] of Object.entries(depthChart)) {
      if (ids.length === 0) continue;
      if (ids.length === 1) { lineup.set(pos, ids[0]); continue; }
      lineup.set(pos, weightedRandom(ids, ids.map((id) => shares.get(id) ?? 0), rng));
    }
    return lineup;
  }

  const depthChart = { PG: ['a', 'b', 'c'], SG: ['d'], SF: [], PF: ['e', 'f'], C: ['g', 'h', 'i'] };
  const shares = new Map([['a', 0.6], ['b', 0.3], ['c', 0.1], ['d', 1], ['e', 0.7], ['f', 0.3], ['g', 0.5], ['h', 0.5]]); // 'i' has no share

  it('draws the same lineups AND leaves the rng in the same state as the old per-call version', () => {
    const prepared = prepareLineupDraw(depthChart, shares);
    const fast = createRng(99);
    const slow = createRng(99);
    for (let i = 0; i < 500; i++) {
      expect([...drawPreparedLineup(prepared, fast)]).toEqual([...referenceDraw(depthChart, shares, slow)]);
    }
    expect(fast.next()).toBe(slow.next());
  });

  it('skips empty positions, takes the only option without a draw, and keeps depth-chart order', () => {
    const prepared = prepareLineupDraw(depthChart, shares);
    expect(prepared.map((slot) => slot.pos)).toEqual(['PG', 'SG', 'PF', 'C']);
    expect(prepared.find((slot) => slot.pos === 'SG')!.weights).toBeNull();
  });

  it('a position whose players all have zero share takes the first one and consumes no rng', () => {
    const chart = { PG: ['x', 'y'] };
    const fast = createRng(1);
    const untouched = createRng(1);
    expect(drawPreparedLineup(prepareLineupDraw(chart, new Map()), fast).get('PG')).toBe('x');
    expect(fast.next()).toBe(untouched.next());
  });

  it('drawLineup still works for callers that do not prepare', () => {
    const a = createRng(4);
    const b = createRng(4);
    expect([...drawLineup(depthChart, shares, a)]).toEqual([...referenceDraw(depthChart, shares, b)]);
  });
});
