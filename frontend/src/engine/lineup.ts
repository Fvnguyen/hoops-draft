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

/** D2: the lineup's value on one dimension, using LINEUP_AGG's parameters for it. */
export function lineupValue(lineup: readonly PlayerCardData[], dim: RatingDim): number {
  return aggregateLineup(standardisedRatings(lineup, dim), LINEUP_AGG[dim]);
}

/** Mid-range defence: perimeter and post defence lineup values blended (balance.ts). */
export function lineupMidDefence(lineup: readonly PlayerCardData[]): number {
  return MID_DEFENCE_BLEND.perimeterDefense * lineupValue(lineup, 'perimeterDefense')
       + MID_DEFENCE_BLEND.postDefense * lineupValue(lineup, 'postDefense');
}

/** D4: plain mean of standardised ratings — who shoots is a committee question. */
export function lineupMean(lineup: readonly PlayerCardData[], dim: RatingDim): number {
  const v = standardisedRatings(lineup, dim);
  return v.length > 0 ? v.reduce((s, x) => s + x, 0) / v.length : STANDARDISE.center;
}
