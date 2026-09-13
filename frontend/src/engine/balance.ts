/**
 * Centralised tuning constants for the engine.
 *
 * Everything that shapes game/ratings/draft balance lives here so tuning is a
 * one-file edit; game.ts, ratings.ts, draft.ts, and deckbuilder.ts import
 * from here instead of hardcoding magic numbers.
 */

import type { Rarity } from './types';

// ── game.ts (from gameEngine.ts) ────────────────────────────────────────────

/** NBA pace baseline — all noise and swings are relative to this. */
export const BASE_PACE = 100;

/** Independent per-team possession noise: ±5% of BASE_PACE. */
export const NOISE_PCT = 0.05;

/** Possession battle swing from team strength delta: ±8% of BASE_PACE. */
export const STRENGTH_SWING_PCT = 0.08;

/** Regulation possessions per team are clamped to [85%, 115%] of BASE_PACE. */
export const POSSESSION_CLAMP_MIN_PCT = 0.85;
export const POSSESSION_CLAMP_MAX_PCT = 1.15;

/** Overtime: 5 possessions per team baseline (±1 noise), 5-minute period. */
export const OT_POSS_PER_TEAM = 5;
export const OT_PERIOD_MINUTES = 5;

type ShotChannel = 'rim' | 'mid' | 'three';

/** NBA baseline shot distribution and efficiency. */
export const NBA_BASELINE: Record<ShotChannel, { share: number; efficiency: number }> = {
  rim:   { share: 0.35, efficiency: 0.65 },  // 65% FG at rim
  mid:   { share: 0.25, efficiency: 0.42 },  // 42% FG mid-range
  three: { share: 0.40, efficiency: 0.36 },  // 36% FG from 3
};

/**
 * League-average ratings per channel (P1-1), used to centre the offense/defense edge
 * so an average lineup facing an average defense gets an edge of ~0, not a
 * structural free bonus. Without this, the edge in resolvePossession was computed as
 * `(offRating - defRating) / 100`, but offense and defense ratings are on different
 * scales in the card pool (offense-side ratings run noticeably higher than
 * defense-side ratings), so nearly every matchup produced a positive edge for the
 * offense regardless of relative team quality.
 *
 * Derivation: mean rating over all 448 players in data/computed_cards.json (pulled
 * 2026-09-12) — finishing 55.5, midRange 49.0, perimeter 57.5, perimeterDefense 53.5,
 * postDefense 46.4. `mid.def` blends perimeterDefense/postDefense the same 0.4/0.6 way
 * resolvePossession does for the mid-range defense rating: 0.4*53.5 + 0.6*46.4 = 49.2.
 * Regenerate these by re-running the same means over an updated card pool (e.g. after
 * a new season import) — this is a plain average, no other transform.
 */
export const LEAGUE_AVG: Record<ShotChannel, { off: number; def: number }> = {
  rim:   { off: 55.5, def: 46.4 },  // finishing vs postDefense
  mid:   { off: 49.0, def: 49.2 },  // midRange vs 0.4*perimeterDefense + 0.6*postDefense
  three: { off: 57.5, def: 53.5 },  // perimeter vs perimeterDefense
};

/** And-1 probability per channel (descending by distance). */
export const AND1_BASE: Record<ShotChannel, number> = {
  rim:   0.08,   // 8% of rim makes → and-1
  mid:   0.03,   // 3% of mid makes → and-1 (foul on jumper)
  three: 0.01,   // 1% of 3pt makes → and-1 (4-point play, very rare)
};

/** Efficiency scaling: how much the edge shifts base efficiency. Max shift ±10pp. */
export const EFFICIENCY_SCALE = 0.30;
export const MAX_EFF_SHIFT = 0.10;  // ±10 percentage points max

/** Profile blending: 50% NBA baseline, 50% team tendency. */
export const PROFILE_WEIGHT = 0.50;

/**
 * P2-2: fraction of missed possessions attributed to the shooter as a turnover rather
 * than a missed field goal, so PlayerBoxScore.turnovers is populated (previously
 * always 0). Rough placeholder in line with NBA team turnover rates (~13-14 per ~100
 * possessions); not derived from the card pool like LEAGUE_AVG, so it's fair game to
 * retune alongside EFFICIENCY_SCALE once real balance numbers are measured.
 */
export const TURNOVER_RATE = 0.15;

// ── ratings.ts (from engine.ts) ─────────────────────────────────────────────

export const RATING_CONFIG = {
  benchmarkCutoff: 0.075,
  offense: {
    finVol: 0.35, finEff: 0.45, finFT: 0.20,
    midVol: 0.35, midEff: 0.65,
    perVol: 0.35, perEff: 0.65,
  },
  defense: {
    vol: 0.40,
    skill: 0.60,
  },
  ovr: {
    TOP1: 10,
    TOP2: 5,
    FORGIVE: 0.5,
    OFFROLE_MAX_W: 7,
    REF: 60,
    CORE_PEN: 1.0,
    CORE_REF: 70,
    PROFILES: {
      'PG':   [15, 10, 20, 30,  6, 14,  5],
      'SG':   [15, 18, 28, 14,  5, 15,  5],
      'SF':   [20, 14, 18, 10, 14, 17,  7],
      'PF':   [24, 13,  9,  5, 20, 11, 18],
      'C':    [24,  8,  4,  5, 29,  7, 23],
      'G':    [15, 14, 24, 22,  5, 15,  5],
      'F':    [22, 13, 13,  7, 17, 14, 14],
      'G/F':  [18, 14, 21, 14, 10, 16,  7],
      'F/C':  [24, 11,  6,  5, 24,  9, 21],
      'Gold': [14, 14, 14, 14, 14, 15, 15],
    } as Record<string, number[]>,
  },
};

export const LEGENDARY_PLAYERS = new Set([
  'LeBron James', 'Stephen Curry', 'Kevin Durant', 'Kawhi Leonard',
  'Chris Paul', 'Russell Westbrook', 'James Harden', 'Damian Lillard',
  'Kyrie Irving', 'Paul George', 'Jimmy Butler', 'Anthony Davis',
  'Giannis Antetokounmpo', 'Nikola Jokic', 'Joel Embiid', 'Rudy Gobert',
  'Bradley Beal', 'CJ McCollum',
]);

/** Badge (Trait) level thresholds: rating >= threshold[i] -> level i+1 (3 is highest). */
export const BADGE_THRESHOLDS = [
  { min: 96, level: 3 },
  { min: 90, level: 2 },
  { min: 80, level: 1 },
];

/** Card rarity cutoffs on `overall` before award/legendary/league-leader bumps. */
export const RARITY_CUTOFFS: { min: number; rarity: Rarity }[] = [
  { min: 90, rarity: 'Mythic' },
  { min: 80, rarity: 'Rare' },
  { min: 65, rarity: 'Uncommon' },
];

// ── draft.ts (from draftEngine.ts) ──────────────────────────────────────────

export const CUBE_SEATS = 8;
export const CUBE_PACKS = 3;
export const CUBE_PLAYER_CARDS_PER_PACK = 7; // 7 players + 1 play per pack (8 cards total)

/** Bot pick noise: score *= 0.85 .. 1.15 (±15%). */
export const BOT_NOISE_PCT = 0.15;

/** Hate-drafting floor: a high-PER player scored below this gets bumped up to it. */
export const HATE_DRAFT_FLOOR = 250;

// ── deckbuilder.ts (from botDeckBuilder.ts) ─────────────────────────────────

export const TARGET_ROSTER = 12;

// ── Playbook & archetypes (docs/plan_plays_and_synergies_2026-09-13.md) ──────
/** Max share of OWN possessions that active offensive plays may claim in total. */
export const PLAY_BUDGET_OFFENSE = 0.30;
/** Max share of OPPONENT possessions that active defensive plays may cover in total. */
export const PLAY_BUDGET_DEFENSE = 0.25;
/** Scorer-weight multiplier for the assigned players on a called possession. */
export const PLAY_SCORER_BOOST = 2.0;
/** Online archetypes deliver this fraction of the Dedicated effect. */
export const ARCHETYPE_ONLINE_SCALE = 0.7;
/** Caps applied AFTER archetype + play effects are combined (per team, per game). */
export const IDENTITY_CAPS = {
  share: 0.15,        // net shot-share shift per channel, ±
  eff: 0.05,          // net channel-efficiency shift, ±
  possessions: 5,     // net possession swing, ±
  and1: 0.04,         // net and-1 shift, ±
};
