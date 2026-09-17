/**
 * Centralised tuning constants for the engine.
 *
 * Everything that shapes game/ratings/draft balance lives here so tuning is a
 * one-file edit; game.ts, ratings.ts, draft.ts, and deckbuilder.ts import
 * from here instead of hardcoding magic numbers.
 */

import type { Rarity } from './types';

/**
 * Bumped whenever a change to this file or game.ts/playbook.ts/archetypes.ts would
 * change a previously-simulated game's outcome. Stored on saved games (see
 * `storage/types.ts` `StoredGameResult.balanceVersion`) so the season view can tell a
 * stale theater from a fresh one instead of silently re-narrating a different game.
 */
export const BALANCE_VERSION = 7; // 2026-09-16 game_theater: narrative + box attribution + clutch closers change the Q4 lineup draws

// ── game.ts (from gameEngine.ts) ────────────────────────────────────────────

/** NBA pace baseline — all noise and swings are relative to this. */
export const BASE_PACE = 100;

/**
 * T2 (game_engine D4, 2026-09-14): home court is an asymmetric coin flip on the same
 * per-team possession-noise roll that already existed here (was a flat ±5% of BASE_PACE
 * for both sides — no home-court mechanic at all). Home draws from a skewed-positive
 * range, away stays roughly centered. Tune the skew, not the mechanism, to hit D4's
 * 52-56% home win rate — see calcPossessionSplit in game.ts.
 */
export const HOME_NOISE_LO_PCT = -0.055;
export const HOME_NOISE_HI_PCT = 0.09;
export const AWAY_NOISE_LO_PCT = -0.075;
export const AWAY_NOISE_HI_PCT = 0.075;

/** Regulation possessions per team are clamped to [85%, 115%] of BASE_PACE. */
export const POSSESSION_CLAMP_MIN_PCT = 0.85;
export const POSSESSION_CLAMP_MAX_PCT = 1.15;

/** Overtime: 5 possessions per team baseline (±1 noise), 5-minute period. */
export const OT_POSS_PER_TEAM = 5;
export const OT_PERIOD_MINUTES = 5;

/**
 * T6 code review (2026-09-14): simulateGame's overtime loop runs `while (homeScore ===
 * awayScore)` with no upper bound. A repeated-tie streak is vanishingly unlikely under
 * real efficiencies, but games are precomputed synchronously in the browser — an
 * unbounded loop is a hang risk, not just a statistics one. Capped at 3 real periods to
 * mirror how few games actually go to multiple OTs; beyond this the engine breaks the
 * tie by average starter OVR (top players make it), not a coin flip — see simulateGame.
 */
export const MAX_OT_PERIODS = 3;

/**
 * T6 code review follow-up (2026-09-14): a coach-mode hook, not yet wired to any
 * behavior. Possessions are tagged with a `segment` index (see segmentForQuarter in
 * game.ts) purely as a future seam — a mid-game adjustment feature could apply "from
 * segment N onward" without needing to know about the per-possession lineup mechanism at
 * all. Default 2 = halves; bump to 4 for quarter-level breaks without touching
 * segmentForQuarter's shape.
 */
export const SEGMENTS_PER_GAME = 2;

type ShotChannel = 'rim' | 'mid' | 'three';

/** NBA baseline shot distribution and efficiency. */
export const NBA_BASELINE: Record<ShotChannel, { share: number; efficiency: number }> = {
  rim:   { share: 0.35, efficiency: 0.65 },  // 65% FG at rim
  mid:   { share: 0.25, efficiency: 0.42 },  // 42% FG mid-range
  three: { share: 0.40, efficiency: 0.36 },  // 36% FG from 3
};

// ── Lineup model (engine_possession_model D1-D3, 2026-09-16) ─────────────────
//
// Everything the per-possession lineup edge needs, in one tunable place. The engine
// never reads raw ratings for an edge: each rating is standardised (D1), the five on the
// floor are aggregated per dimension with a designed k / hole tax (D2), and the edge is
// centred on the measured expectation of that aggregate (D3). Tune the numbers here, then
// re-run `npm run balance -- 500 --seed 42` and quote before/after in the commit.

export type RatingDim =
  | 'finishing' | 'midRange' | 'perimeter' | 'playmaking'
  | 'rebounding' | 'perimeterDefense' | 'postDefense';

export const RATING_DIMS: readonly RatingDim[] = [
  'finishing', 'midRange', 'perimeter', 'playmaking', 'rebounding', 'perimeterDefense', 'postDefense',
];

/**
 * D1: pool mean / sd per dimension over all 448 player cards in `src/data/cards.json`.
 * Regenerate by `npm run build:cards` (it prints this block); `tests/unit/lineup.test.ts`
 * fails if it drifts from cards.json by more than 0.5. Raw ratings are NOT on one scale
 * (playmaking mean 35 / sd 23.5 vs perimeter defence 53.5 / 16.5), which is why k and the
 * edge are computed in standardised space.
 */
export const RATING_NORM: Record<RatingDim, { mean: number; sd: number }> = {
  finishing:        { mean: 55.49, sd: 24.13 },
  midRange:         { mean: 49.03, sd: 29.51 },
  perimeter:        { mean: 57.46, sd: 27.31 },
  playmaking:       { mean: 35.27, sd: 23.51 },
  rebounding:       { mean: 41.11, sd: 22.09 },
  perimeterDefense: { mean: 53.47, sd: 16.53 },
  postDefense:      { mean: 46.41, sd: 17.33 },
};

/** D1: standardised rating = center + spread * z, clamped to [min, max]. */
export const STANDARDISE = { center: 50, spread: 15, min: 0, max: 99 };

/**
 * D2: per-dimension lineup aggregation. Lineup value =
 *   Σ r^(k+1) / Σ r^k  −  holeCost · max(0, holeFloor − mean(lowest HOLE_BOTTOM_N))
 * over the five standardised ratings on the floor.
 *   k = 0   plain mean (everyone counts equally — defence)
 *   k = 0.5 by committee (shooting, rebounding): players count roughly by how much of
 *           the activity they do; functional zeros lose their say
 *   k = 1.5 star channel (playmaking): one elite creator carries, two are elite
 * The hole tax is the OVR core-gap penalty applied to a lineup: two players below the
 * floor (one sd under league average) cost the lineup, one never does.
 * Owner-locked 2026-09-16 on the six 2025-26 starting fives; see the plan for the
 * numbers and the depth view. Change values here, never inline in game.ts.
 */
export const LINEUP_AGG: Record<RatingDim, { k: number; holeFloor: number; holeCost: number }> = {
  playmaking:       { k: 1.5,  holeFloor: 35, holeCost: 0.30 },
  perimeter:        { k: 0.5,  holeFloor: 35, holeCost: 0.40 },
  finishing:        { k: 0.75, holeFloor: 0,  holeCost: 0 },
  midRange:         { k: 1.0,  holeFloor: 0,  holeCost: 0 },
  rebounding:       { k: 0.5,  holeFloor: 0,  holeCost: 0 },
  perimeterDefense: { k: 0,    holeFloor: 35, holeCost: 0.30 },
  postDefense:      { k: 0,    holeFloor: 35, holeCost: 0.20 },
};

/** D2: a "hole" is the average of this many lowest players on the floor. */
export const HOLE_BOTTOM_N = 2;

/**
 * D3: expected lineup value per dimension over the lineups the engine actually puts on the
 * floor — bot-drafted 12-man rosters, five drawn per depth-chart slot with the real
 * `calcPossessionShares` minutes (40 seeded headless drafts x 8 teams x 150 draws). This is
 * the centre an edge is measured from, and it is NOT the random-pool value: drafting keeps
 * the best 264 of 448 cards and deckbuilders start the best of those, so in-game lineups
 * sit 6-13 points above random rotation lineups in every dimension except perimeter,
 * where the spacing tax on drafted bigs cancels it. Centring on the random pool made every
 * channel edge negative on average (three: -10.7) and dragged PPP down as the edge scale
 * rose. Regenerate from the balance script header ("Lineup centres");
 * `tests/unit/lineup.test.ts` asserts these within ±1.5 of a fresh seeded measurement.
 */
export const LINEUP_CENTRE: Record<RatingDim, number> = {
  finishing: 60.7, midRange: 60.1, perimeter: 53.0, playmaking: 64.4,
  rebounding: 61.8, perimeterDefense: 57.1, postDefense: 57.0,
};

/** Mid-range defence blends perimeter and post defence (game.ts resolvePossession). */
export const MID_DEFENCE_BLEND = { perimeterDefense: 0.4, postDefense: 0.6 };

/**
 * Per-channel offence/defence centres derived from LINEUP_CENTRE (replaces the old
 * LEAGUE_AVG pool means). resolvePossession's edge is
 * (offValue − centre.off) − (defValue − centre.def), so an average lineup against an
 * average defence nets ~0 in every channel.
 */
export const CHANNEL_CENTRE: Record<ShotChannel, { off: number; def: number }> = {
  rim:   { off: LINEUP_CENTRE.finishing, def: LINEUP_CENTRE.postDefense },
  mid:   { off: LINEUP_CENTRE.midRange,
           def: MID_DEFENCE_BLEND.perimeterDefense * LINEUP_CENTRE.perimeterDefense
              + MID_DEFENCE_BLEND.postDefense * LINEUP_CENTRE.postDefense },
  three: { off: LINEUP_CENTRE.perimeter, def: LINEUP_CENTRE.perimeterDefense },
};

/** And-1 probability per channel (descending by distance). */
export const AND1_BASE: Record<ShotChannel, number> = {
  rim:   0.08,   // 8% of rim makes → and-1
  mid:   0.03,   // 3% of mid makes → and-1 (foul on jumper)
  three: 0.01,   // 1% of 3pt makes → and-1 (4-point play, very rare)
};

/**
 * T3 (game_engine D5, 2026-09-14): a rim "make" that draws a shooting foul (50% of made
 * rim shots) sends the shooter to the line for two free throws — modeled as two
 * independent rolls at this league-average FT rate, not a flat 1 point as before. The
 * old flat value understated a real FT trip's ~1.5 expected points at any realistic FT%,
 * and was the single largest driver of PPP sitting well below NBA norms: two rolls at
 * 77% average 1.54 points per trip vs the old flat 1, closing most of the gap to D5's PPP
 * band without touching NBA_BASELINE's actual shot efficiencies (which were fine).
 */
export const RIM_FT_PCT = 0.77;

/**
 * T6 code review (2026-09-14): every other combined modifier in resolvePossession has a
 * final sane-range clamp (efficiency to [0.15, 0.85], edge to [-0.25, 0.25]) — and1Chance
 * (AND1_BASE + archetype and1Bonus + play and1 delta) did not, even though each of those
 * three sources is independently capped. With today's content the reachable max is
 * ~0.08 + 0.04 + 0.04 = 0.16, well under this cap, so this is a defensive floor for
 * future content (e.g. card_balance adding more and-1-boosting plays/identities), not a
 * fix to any currently-reachable behavior.
 */
export const AND1_CHANCE_CAP = 0.30;

/**
 * Edge size (engine_possession_model T2, owner call 2026-09-16 from the D5 sweep): how much
 * a channel edge (in rating points / 100, clamped ±0.25) shifts base efficiency, and the
 * cap on that shift. 0.20 / 0.08 doubles what talent explains in a game (OVR-gap R²
 * 5.3% -> 10.2%, season 17.5% -> 29.1%) while keeping score sd 13.3, [90,130] 87%,
 * PPP 1.06; 0.30 pushed a season past 40% talent and both spread gates out of band.
 * Sweep table in the plan (D5); re-run with `--eff-scale`/`--max-shift` before changing.
 */
export const EFFICIENCY_SCALE = 0.20;
export const MAX_EFF_SHIFT = 0.08;

/**
 * Per-channel edge weights (engine_possession_model, "unequal by design"): the channel
 * edge is `off · (offence − centre) − def · (defence − centre)`, so each side of each
 * channel has its own deliberate size. Rationale (measured with `npm run balance --
 * --levers`, margin per game for +10 standardised points on a whole roster): at equal
 * weights the rim is the smallest offensive lever (1.1) because a rim make is worth 1.77
 * points on 35% of shots, while perimeter defence stacks the three-point channel, 40% of
 * mid-range and forced turnovers (4.4). The owner's intended order is finishing, shooting
 * and creation on top, defence and rebounding medium, mid-range lowest.
 */
export const EDGE_WEIGHT: Record<ShotChannel, { off: number; def: number }> = {
  rim:   { off: 2.2, def: 1.2 },
  mid:   { off: 1.0, def: 0.6 },
  three: { off: 1.0, def: 0.6 },
};

/** Profile blending: 50% NBA baseline, 50% team tendency. */
export const PROFILE_WEIGHT = 0.50;

// ── Possession events (engine_possession_model D6, 2026-09-16) ──────────────
//
// The pre-game "possession battle" (a 12-man playmaking/rebounding/defence average moving
// the possession count by a capped 3.5% of pace — a 10-point gap was ~0.3 possessions) is
// gone. Teams get equal possessions apart from pace noise (home court, D4) and play/
// identity possessionSwing; what differs is resolved per possession from the five on the
// floor, using the same standardised lineup values (engine/lineup.ts) and centres
// (LINEUP_CENTRE) as the shot edge. Edges below are in rating points / 100, as there.

/**
 * Turnover before a shot: playmaking (lineup value, k=1.5 star channel) against the
 * opponent's perimeter defence. NBA team turnover rate is ~13-14 per 100 possessions.
 * chance = BASE − SCALE · edge, clamped to [MIN, MAX]; a +20-point creator edge is −5pp.
 */
export const TURNOVER_BASE = 0.135;
export const TURNOVER_SCALE = 0.25;
/** How much of the turnover edge the DEFENCE's perimeter defence supplies (steals) relative
 *  to the offence's playmaking (ball security). Below 1 so perimeter defence, which already
 *  guards the most valuable channel, does not become the biggest lever in the game. */
export const TURNOVER_DEF_WEIGHT = 0.3;
export const TURNOVER_MIN = 0.06;
export const TURNOVER_MAX = 0.24;

/**
 * Offensive rebound after a missed field goal (not after a free-throw trip): the
 * offence's rebounding value against the defence's. NBA OREB% is ~25-28% of misses.
 * chance = BASE + SCALE · edge, clamped (rebounding acts on both ends, so SCALE is half the
 * turnover scale to keep it a medium lever); the possession then continues with another shot
 * (same lineup and profile) up to MAX_CHAIN extra shots.
 */
export const OREB_BASE = 0.26;
export const OREB_SCALE = 0.15;
export const OREB_MIN = 0.12;
export const OREB_MAX = 0.42;
export const OREB_MAX_CHAIN = 2;

/**
 * Creator steer (D6): a playmaking edge moves shot share from the channel with the worst
 * expected-points edge in this matchup to the one with the best, `SCALE · edge` of share,
 * capped at ±CAP. Above-average creators get their team more of its good shots against
 * THIS defence; below-average ones drift toward the bad ones. Never touches make
 * probability directly — no flat efficiency boost from playmaking.
 */
export const STEER_SCALE = 0.30;
export const STEER_CAP = 0.08;
/** game_theater D1: the steer is narrated (`narrative.steeredTo`) only when it moved at
 *  least this much share toward a channel. Presentation threshold — no sim effect. */
export const STEER_NARRATE_MIN = 0.04;

/**
 * game_theater D9 — box-score ATTRIBUTION only. These shares label outcomes the sim has
 * already decided; they are drawn from a per-possession derived rng, never the sim stream,
 * so changing them cannot move a score. NBA reference: blocks are ~5-6% of FGA (≈10% of
 * misses); steals are ~55% of turnovers.
 */
export const BLOCK_SHARE_OF_MISSES = 0.10;
export const STEAL_SHARE_OF_TURNOVERS = 0.55;

/**
 * game_theater D10 — crunch time. In Q4 and every OT period the window opens at the first
 * possession where the offense has CLUTCH_WINDOW_POSS or fewer of its own possessions left
 * in the period (the current one included); it is entered only if the absolute margin at
 * that moment is CLUTCH_MARGIN or less (checked exactly once per period), and then lasts to
 * the end of the period. Inside it both teams play their closing five (depth-chart starters,
 * no weighted lineup draw). Changes Q4 outcomes — BALANCE_VERSION 7.
 */
export const CLUTCH_WINDOW_POSS = 4;
export const CLUTCH_MARGIN = 5;

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
    // card_balance T2 (2026-09-17, owner-approved): a light, bounded retune — trims
    // mid-range weight by 2-3 points per position (its lever is now 0.28, the lowest by
    // far, vs playmaking/finishing at 3.10) and redistributes to finishing/playmaking/
    // perimeter defense, the top of the lever table. Deliberately modest, not a rewrite
    // toward the lever table: OVR staying a little out of sync with in-game impact is
    // intentional, it keeps bot drafters from optimizing perfectly onto the exact
    // strongest build. Every profile still sums to 100; positional shape unchanged (a PG
    // is still playmaking-heavy, a C still finishing/rebounding/defense-heavy).
    PROFILES: {
      'PG':   [15,  7, 20, 32,  6, 15,  5],
      'SG':   [16, 15, 29, 14,  5, 16,  5],
      'SF':   [21, 11, 18, 12, 14, 17,  7],
      'PF':   [25, 10,  9,  5, 21, 12, 18],
      'C':    [25,  6,  4,  5, 29,  7, 24],
      'G/F':  [19, 11, 21, 16, 10, 16,  7],
      'F/C':  [25,  8,  6,  5, 25,  9, 22],
      // 'Gold': catch-all for any position string that isn't a specific PG-C or one of the
      // two adjacent crossovers above (card_balance T1 follow-up, 2026-09-16). Neither of
      // our position sources (bref Pos, NBA Stats bio) can produce a 3-way combo — bref
      // gives one specific position or a 2-way split, bio's field is a fixed X or X-Y
      // format — so nothing routes here today; it exists so a future data change (or a
      // genuinely versatile player some season) degrades to a neutral profile instead of
      // crashing on an unmapped pool. The bare 'G'/'F' profiles this replaced (PG/SG and
      // SF/PF blends) are gone: bref-primary positions (T1) never produce a bare letter.
      'Gold': [14, 14, 14, 14, 14, 15, 15],
    } as Record<string, number[]>,
  },
};

// card_balance T2 pedigree paradigm (2026-09-16, owner): a manual narrative bump so a
// recognizable name's rarity matches what a user already expects - not a performance
// claim, allowed to diverge from measured win-shares by design (see
// docs/plans/proposal_pedigree_tuning_2026-09-16.md). Chris Paul dropped (retired
// February 2026); Lillard/Irving/Beal kept despite being out this season (injured, not
// retired) as fallback bumps for when they return.
export const LEGENDARY_PLAYERS = new Set([
  'LeBron James', 'Stephen Curry', 'Kevin Durant', 'Kawhi Leonard',
  'Russell Westbrook', 'James Harden', 'Damian Lillard',
  'Kyrie Irving', 'Paul George', 'Jimmy Butler', 'Anthony Davis',
  'Giannis Antetokounmpo', 'Nikola Jokic', 'Joel Embiid', 'Rudy Gobert',
  'Bradley Beal', 'CJ McCollum',
]);

// card_balance T2 (2026-09-16, owner-approved): genuinely positionless by real-world
// reputation, not stats - initiates offense and defends across traditional position
// lines. Drives both the 'Positionless' trait (ratings.ts) and no-penalty depth-chart
// slotting (engine/positions.ts). A short, high-bar list by design; distinct from
// LEGENDARY_PLAYERS (fame) and from a stats-driven position crossover (T1).
export const POSITIONLESS_PLAYERS = new Set([
  'LeBron James', 'Giannis Antetokounmpo', 'Scottie Barnes',
]);

/**
 * Badge (Trait) level thresholds, per dimension (card_balance T3, 2026-09-16,
 * owner-approved, hand-rolled final pass). D3's original flat 80/90/96 cutoff applied
 * the same absolute number to all seven skill ratings despite very different underlying
 * distributions (playmaking mean 35 vs perimeter mean 57) — some badges (Finisher L3)
 * were nearly unreachable while others (Sharpshooter L1) were common. An equal-percentile
 * pass fixed that but was rejected as "absolute balance" — it erased real, deliberate
 * scarcity (playmaking is a genuinely concentrated, high-lever skill; perimeter/finishing
 * are broadly practiced). This is the locked design: every level is binned to one
 * consistent range (L1 70-79, L2 80-89, L3 90-99) so the numbers read the same way across
 * every colour, rounded to multiples of 3 within that range for a "synergized" feel, and
 * for each dimension the bin chosen is whichever lands its real holder-count closest to
 * the cross-dimension average for that level (~62 at L1, ~29 at L2, ~11 at L3) — real
 * scarcity still varies by dimension (playmaking/rebounding/defense sit at the low end of
 * their bin range, perimeter/finishing at the high end), it's just expressed in aligned,
 * legible numbers instead of raw percentile artifacts. Hand-set, not auto-regenerated —
 * do not overwrite with `build:cards`'s printed percentile block.
 */
export const BADGE_THRESHOLDS: Record<RatingDim, { l1: number; l2: number; l3: number }> = {
  finishing:         { l1: 79, l2: 86, l3: 90 },
  midRange:          { l1: 76, l2: 86, l3: 93 },
  perimeter:         { l1: 79, l2: 89, l3: 93 },
  playmaking:        { l1: 70, l2: 83, l3: 99 },
  rebounding:        { l1: 70, l2: 83, l3: 96 },
  perimeterDefense:  { l1: 70, l2: 80, l3: 90 },
  postDefense:       { l1: 70, l2: 80, l3: 90 },
};

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
export const PLAY_BUDGET_OFFENSE = 0.40;
/** Max share of OPPONENT possessions that active defensive plays may cover in total. */
export const PLAY_BUDGET_DEFENSE = 0.35;
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
