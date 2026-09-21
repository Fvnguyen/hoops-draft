/**
 * Lineup model (engine_possession_model D1-D3): how five players on the floor become one
 * number per dimension for the possession edge. Pure — no react/next/fs, no Math.random.
 *
 *   1. standardiseRating: raw rating -> 50 ± 15 per sd on that dimension (RATING_NORM)
 *   2. lineupValue: self-weighted mean (k) minus hole tax (LINEUP_AGG, HOLE_BOTTOM_N)
 *
 * Every number lives in balance.ts; this file is only the formula.
 */

import {
  RATING_NORM, STANDARDISE, LINEUP_AGG, HOLE_BOTTOM_N, MID_DEFENCE_BLEND, type RatingDim,
} from './balance';
import type { PlayerCardData } from './types';

export interface LineupAggParams { k: number; holeFloor: number; holeCost: number }

/** D1: map a raw rating onto the common 50 ± 15 scale for its dimension. */
export function standardiseRating(dim: RatingDim, raw: number): number {
  const { mean, sd } = RATING_NORM[dim];
  const z = sd > 0 ? (raw - mean) / sd : 0;
  const v = STANDARDISE.center + STANDARDISE.spread * z;
  return Math.max(STANDARDISE.min, Math.min(STANDARDISE.max, v));
}

/**
 * D2 core: Σ r^(k+1) / Σ r^k. k = 0 is the plain mean; larger k gives higher ratings a
 * larger share of the say ("the ball finds the skill"). Always stays within [min, max] of
 * the inputs, so a flat lineup is worth exactly its rating at any k.
 */
export function selfWeightedMean(values: number[], k: number): number {
  if (values.length === 0) return STANDARDISE.center;
  let num = 0, den = 0;
  for (const v of values) {
    const w = Math.pow(Math.max(0, v), k);
    num += w * v;
    den += w;
  }
  // All-zero lineup with k > 0: every weight is 0 — fall back to the plain mean (0).
  return den > 0 ? num / den : values.reduce((s, v) => s + v, 0) / values.length;
}

/** D2 hole: the average of the lowest `bottomN` values, in the same 0..99 space. */
export function holeLevel(values: number[], bottomN: number = HOLE_BOTTOM_N): number {
  if (values.length === 0) return STANDARDISE.center;
  const sorted = [...values].sort((a, b) => a - b).slice(0, Math.max(1, Math.min(bottomN, values.length)));
  return sorted.reduce((s, v) => s + v, 0) / sorted.length;
}

/** D2: aggregate already-standardised values with explicit parameters (tests, sweeps). */
export function aggregateLineup(values: number[], p: LineupAggParams, bottomN: number = HOLE_BOTTOM_N): number {
  const core = selfWeightedMean(values, p.k);
  const tax = p.holeCost > 0 ? p.holeCost * Math.max(0, p.holeFloor - holeLevel(values, bottomN)) : 0;
  return core - tax;
}

/** Standardised ratings of a lineup on one dimension (missing rating -> league average). */
export function standardisedRatings(lineup: readonly PlayerCardData[], dim: RatingDim): number[] {
  return lineup.map(p => {
    const raw = p.ratings?.[dim];
    return raw === undefined || raw === null ? STANDARDISE.center : standardiseRating(dim, raw);
  });
}

// ── Memoization (plan render_and_engine_perf D1) ────────────────────────────
// A possession asks for ~15 lineup aggregates (steer, turnover, the channel edge, every
// offensive-rebound retry), each one five `Math.pow` calls plus an array copy and a sort,
// for about nine distinct answers — and the same five players are on the floor again a
// few possessions later. Profiling 1,500 games put ~35% of all engine time here.
//
// The cache is keyed by the ARRAY OBJECT, and only arrays registered through `memoLineup`
// take part: the simulation interns one array per distinct lineup per game and promises
// never to mutate it or its players' ratings. Any other array (tests, balance sweeps that
// build lineups ad hoc) is computed fresh every time, exactly as before. A hit returns the
// number the same code produced from the same players in the same order, so results are
// bit-identical by construction — the bench checksum and the balance baseline pin that.

const memo = new WeakMap<readonly PlayerCardData[], Map<string, number>>();

/** Registers `lineup` for memoization and returns it. The caller must treat the array and
 *  the ratings of the players in it as frozen for as long as it keeps using the array. */
export function memoLineup<T extends readonly PlayerCardData[]>(lineup: T): T {
  if (!memo.has(lineup)) memo.set(lineup, new Map());
  return lineup;
}

// No closures and no string building on the hit path: these three are called ~15 times per
// possession, and a first version that passed a `compute` callback spent 8% of all engine
// time allocating it.
const MID_DEFENCE_KEY = 'midDefence';
const MEAN_KEY = {
  finishing: 'mean:finishing', midRange: 'mean:midRange', perimeter: 'mean:perimeter',
  playmaking: 'mean:playmaking', rebounding: 'mean:rebounding',
  perimeterDefense: 'mean:perimeterDefense', postDefense: 'mean:postDefense',
} as const satisfies Record<RatingDim, string>;

/** D2: the lineup's value on one dimension, using LINEUP_AGG's parameters for it. */
export function lineupValue(lineup: readonly PlayerCardData[], dim: RatingDim): number {
  const cache = memo.get(lineup);
  if (cache) {
    const hit = cache.get(dim);
    if (hit !== undefined) return hit;
  }
  const value = aggregateLineup(standardisedRatings(lineup, dim), LINEUP_AGG[dim]);
  if (cache) cache.set(dim, value);
  return value;
}

/** Mid-range defence: perimeter and post defence lineup values blended (balance.ts). */
export function lineupMidDefence(lineup: readonly PlayerCardData[]): number {
  const cache = memo.get(lineup);
  if (cache) {
    const hit = cache.get(MID_DEFENCE_KEY);
    if (hit !== undefined) return hit;
  }
  const value = MID_DEFENCE_BLEND.perimeterDefense * lineupValue(lineup, 'perimeterDefense')
              + MID_DEFENCE_BLEND.postDefense * lineupValue(lineup, 'postDefense');
  if (cache) cache.set(MID_DEFENCE_KEY, value);
  return value;
}

/** D4: plain mean of standardised ratings — who shoots is a committee question. */
export function lineupMean(lineup: readonly PlayerCardData[], dim: RatingDim): number {
  const cache = memo.get(lineup);
  if (cache) {
    const hit = cache.get(MEAN_KEY[dim]);
    if (hit !== undefined) return hit;
  }
  const v = standardisedRatings(lineup, dim);
  const value = v.length > 0 ? v.reduce((s, x) => s + x, 0) / v.length : STANDARDISE.center;
  if (cache) cache.set(MEAN_KEY[dim], value);
  return value;
}
