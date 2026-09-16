/**
 * Game Simulation Engine
 *
 * Pre-computes a full game into a GameTheater object that the UI plays back.
 *
 * Layers:
 *   1. Rotation Engine — NBA-style substitution patterns
 *   2. Possession Battle — defense + rebounding determines total possessions
 *   3. Scoring Engine — offense vs defense matchup per possession
 *   4. Synergy/Play bonuses applied as modifiers
 *
 * Every random draw in this file goes through the injected `Rng` (mulberry32,
 * see rng.ts) instead of `Math.random()` directly, so a game is fully
 * reproducible from `{ seed }` — see `simulateGame`'s `opts.rng`.
 */

import { PlayerCardData, Play } from './types';
import { DraftSessionSeat, normalizeBuiltRoster } from './deckbuilder';
import { calcTeamBonuses, TeamBonuses, GameModifiers } from './synergies';
import {
  PlayAssignment, PlayStatus, PlayCallModifiers, PlaybookStatus, ScaledPlay,
  evaluatePlaybook, scaledPlayAllocations, playbookPossessionSwing,
} from './playbook';
import type { ArchetypeSelection } from './archetypes';
import { Rng, createRng, randomSeed } from './rng';
import {
  BASE_PACE, HOME_NOISE_LO_PCT, HOME_NOISE_HI_PCT, AWAY_NOISE_LO_PCT, AWAY_NOISE_HI_PCT, STRENGTH_SWING_PCT,
  POSSESSION_CLAMP_MIN_PCT, POSSESSION_CLAMP_MAX_PCT,
  OT_POSS_PER_TEAM, OT_PERIOD_MINUTES,
  NBA_BASELINE, CHANNEL_CENTRE, AND1_BASE, AND1_CHANCE_CAP, EFFICIENCY_SCALE, MAX_EFF_SHIFT, PROFILE_WEIGHT, TURNOVER_RATE,
  PLAY_SCORER_BOOST, IDENTITY_CAPS, MAX_OT_PERIODS, SEGMENTS_PER_GAME, RIM_FT_PCT,
} from './balance';
import { lineupValue, lineupMidDefence } from './lineup';

/** Edge-size knobs resolvePossession reads (balance script sweeps them; defaults in balance.ts). */
export interface EdgeTuning { efficiencyScale?: number; maxEffShift?: number }

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlayerBoxScore {
  playerId: string;
  playerName: string;
  minutes: number;        // Approximate minutes played
  possessions: number;    // Possessions on court
  points: number;
  twoPointers: number;
  threePointers: number;
  andOnes: number;
  turnovers: number;
  assists: number;
}

export interface PossessionEvent {
  index: number;
  quarter: number;
  /** T6 code review follow-up (2026-09-14): a coach-mode hook, not yet read anywhere —
   *  see SEGMENTS_PER_GAME in balance.ts. */
  segment: number;
  team: 'home' | 'away';
  lineupOnCourt: string[];    // 5 player IDs on offense
  defenseOnCourt: string[];   // 5 player IDs on defense
  outcome: 'miss' | '2pt' | '3pt' | 'and1';
  scoringPlayerId?: string;
  assistPlayerId?: string;
  isPossessionWinEvent?: boolean;  // Steal, OREB, etc. that earned extra possession
  narrativeText: string;
  runningScore: [number, number]; // [home, away]
  /** Assigned-player plays that applied to this possession (§7): an offense entry when
   *  the offense team called one of its plays, a defense entry when the defending team's
   *  coverage play also hit this possession. Both may be present on the same possession. */
  calledPlays?: Array<{ playId: string; name: string; side: 'offense' | 'defense'; teamSide: 'home' | 'away' }>;
}

export interface QuarterSummary {
  quarter: number;
  homeScore: number;
  awayScore: number;
  homePossessions: number;
  awayPossessions: number;
}

export interface GameTheater {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  possessions: PossessionEvent[];
  quarterSummaries: QuarterSummary[];
  finalScore: [number, number];
  boxScore: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
  homeBonuses: TeamBonuses;
  awayBonuses: TeamBonuses;
  isOvertime: boolean;
  overtimePeriods: number;
  /** RNG seed this game was simulated with — replay it via simulateGame(..., { rng: createRng(seed) }). */
  seed: number;
  /** Playbook evaluation for each team, as computed at game start (see evaluatePlaybook). */
  playbook: { home: PlaybookStatus; away: PlaybookStatus };
}

export interface TeamInfo {
  seatId: string;
  name: string;              // Bot name or "You"
  players: PlayerCardData[];  // 12-man roster
  starters: string[];        // 5 starter IDs (one per position)
  plays: Play[];             // 3 active plays
  depthChart: Record<string, string[]>; // Position → ordered player IDs
  /** Assigned-player play roles (v2 roster shape) — see playbook.ts. */
  playAssignments?: PlayAssignment[];
  /** Chosen roster identity (v2 roster shape) — see archetypes.ts. */
  archetypes?: ArchetypeSelection;
}

// ── Rotation Engine ────────────────────────────────────────────────────────

/**
 * Calculate possession shares for each player (0-1, how much of the game they play),
 * from talent gap (bigger OVR gap → starter plays more), real historical MPG (blended
 * 60/40 with the formula), and an age penalty for 35+.
 *
 * T6 code review follow-up (2026-09-14): this is now the ONLY input driving who's on
 * court each possession (see drawLineup) — a fresh weighted draw per position, per
 * possession, rather than the old precomputed quarter-phase rotation timeline, which
 * only read this map's starter fraction and only in half the quarters (see HANDOVER.md
 * issue #9). No per-quarter choreography (starter-opens/backup-closes, etc.) survives:
 * that was NBA-broadcast flavor with no game_theater consumer (`SubstitutionEvent` was
 * never read by any UI) and no strategic weight — the roster-construction signal this
 * function encodes is what should matter, not a scripted pattern layered on top of it.
 */
export function calcPossessionShares(
  depthChart: Record<string, string[]>,
  players: PlayerCardData[]
): Map<string, number> {
  const shares = new Map<string, number>();
  const playerMap = new Map(players.map(p => [p.id, p]));

  for (const [, ids] of Object.entries(depthChart)) {
    if (ids.length === 0) continue;

    const starter = playerMap.get(ids[0]);
    const backup = ids[1] ? playerMap.get(ids[1]) : null;
    const deep = ids[2] ? playerMap.get(ids[2]) : null;

    // Base shares
    let starterShare = 0.70;
    let backupShare = 0.25;
    let deepShare = 0.05;

    if (starter && backup) {
      const ovrGap = (starter.ratings?.overall ?? 70) - (backup.ratings?.overall ?? 50);

      // OVR gap modifier: smaller gap → more even distribution
      if (ovrGap < 5) {
        starterShare = 0.58; backupShare = 0.35; deepShare = 0.07;
      } else if (ovrGap < 10) {
        starterShare = 0.65; backupShare = 0.28; deepShare = 0.07;
      } else if (ovrGap > 15) {
        starterShare = 0.78; backupShare = 0.18; deepShare = 0.04;
      }

      // MPG anchor: blend with real MPG ratio
      if (starter.stats?.mpg && backup.stats?.mpg) {
        const totalMpg = starter.stats.mpg + backup.stats.mpg + (deep?.stats?.mpg || 0);
        if (totalMpg > 0) {
          const mpgStarter = starter.stats.mpg / totalMpg;
          const mpgBackup = backup.stats.mpg / totalMpg;
          // 60% formula, 40% MPG anchor
          starterShare = starterShare * 0.6 + mpgStarter * 0.4;
          backupShare = backupShare * 0.6 + mpgBackup * 0.4;
        }
      }

      // Age penalty for players 35+
      if (starter.player?.age >= 35) starterShare *= 0.92;
      if (backup?.player?.age >= 35) backupShare *= 0.92;
    }

    if (!backup) {
      starterShare = 1.0; backupShare = 0; deepShare = 0;
    } else if (!deep) {
      deepShare = 0;
      // Redistribute deep bench share
      starterShare += 0.03;
      backupShare += 0.02;
    }

    // Normalize
    const total = starterShare + backupShare + deepShare;
    shares.set(ids[0], (starterShare / total));
    if (ids[1]) shares.set(ids[1], (backupShare / total));
    if (ids[2]) shares.set(ids[2], (deepShare / total));
  }

  return shares;
}

/**
 * Draw one possession's lineup: one player per position, weighted by that position's
 * players' `calcPossessionShares` values (T6 code review follow-up, 2026-09-14 — replaces
 * the old precomputed quarter-phase rotation timeline). Independent per possession, per
 * team, regardless of which side of the ball that team is on this possession — the
 * engine doesn't model continuous on-court stints; if a presentation ever wants
 * real-looking substitution patterns, that's a game_theater transform over this log, not
 * something the engine needs to fake for itself.
 */
function drawLineup(depthChart: Record<string, string[]>, shares: Map<string, number>, rng: Rng): Map<string, string> {
  const lineup = new Map<string, string>();
  for (const [pos, ids] of Object.entries(depthChart)) {
    if (ids.length === 0) continue;
    if (ids.length === 1) { lineup.set(pos, ids[0]); continue; }
    const weights = ids.map(id => shares.get(id) ?? 0);
    lineup.set(pos, weightedRandom(ids, weights, rng));
  }
  return lineup;
}

/**
 * Coach-mode hook (not yet read anywhere — see SEGMENTS_PER_GAME in balance.ts): which
 * segment of the game a quarter falls in. Overtime is always the trailing segment,
 * whatever SEGMENTS_PER_GAME is set to.
 */
function segmentForQuarter(quarter: number): number {
  if (quarter > 4) return SEGMENTS_PER_GAME;
  const quartersPerSegment = 4 / SEGMENTS_PER_GAME;
  return Math.floor((quarter - 1) / quartersPerSegment);
}

// ── Possession Battle ──────────────────────────────────────────────────────

// (calcTeamStrength removed — replaced by calcTeamPossRating in scoring engine v2)

interface PossessionSplit {
  homePoss: number;
  awayPoss: number;
  totalPoss: number;
  homeAdvantageEvents: number; // Extra possessions home must "earn" through events
  awayAdvantageEvents: number;
}

function calcPossessionSplit(
  homePlayers: PlayerCardData[],
  awayPlayers: PlayerCardData[],
  homeDepthChart: Record<string, string[]>,
  awayDepthChart: Record<string, string[]>,
  homeBonuses: TeamBonuses,
  awayBonuses: TeamBonuses,
  rng: Rng
): PossessionSplit {
  // T2 (D4): independent per-team possession-count noise, drawn from asymmetric ranges —
  // home skewed positive, away roughly centered — instead of a flat efficiency bonus.
  // This is the same roll that existed before (was symmetric ±5% of BASE_PACE for both
  // sides, i.e. no home-court mechanic at all); only the bounds changed.
  const homeNoise = (HOME_NOISE_LO_PCT + rng.next() * (HOME_NOISE_HI_PCT - HOME_NOISE_LO_PCT)) * BASE_PACE;
  const awayNoise = (AWAY_NOISE_LO_PCT + rng.next() * (AWAY_NOISE_HI_PCT - AWAY_NOISE_LO_PCT)) * BASE_PACE;

  let homePoss = BASE_PACE + homeNoise;
  let awayPoss = BASE_PACE + awayNoise;

  // Team possession battle: playmaking + rebounding + defense (starters ×2, bench ×1)
  const homePossRating = calcTeamPossRating(homePlayers, homeDepthChart);
  const awayPossRating = calcTeamPossRating(awayPlayers, awayDepthChart);
  const strengthDelta = ((homePossRating - awayPossRating) / 100) * BASE_PACE * STRENGTH_SWING_PCT;

  homePoss += strengthDelta;
  awayPoss -= strengthDelta;

  // Apply synergy/play possession swing (small fixed bonuses). P0-3: this is the ONLY
  // place possession swings are applied — every synergy/play source (offensive or
  // defensive) accumulates into TeamBonuses.possessionSwing exactly once (see
  // calcTeamBonuses in synergies.ts). There is deliberately no second adjustment from
  // defenseMods.possessionSwing here — that field is always 0 and reading it too used
  // to double-count defensive plays/synergies (e.g. Grit and Grind's +1 poss counted
  // for the owning team AND subtracted from the opponent).
  homePoss += homeBonuses.possessionSwing;
  awayPoss += awayBonuses.possessionSwing;

  // Round and clamp to [POSSESSION_CLAMP_MIN_PCT, POSSESSION_CLAMP_MAX_PCT] of baseline
  // so noise + strength + synergies cannot push a team outside a realistic pace band.
  const MIN_POSS = Math.round(BASE_PACE * POSSESSION_CLAMP_MIN_PCT);
  const MAX_POSS = Math.round(BASE_PACE * POSSESSION_CLAMP_MAX_PCT);
  homePoss = Math.min(MAX_POSS, Math.max(MIN_POSS, Math.round(homePoss)));
  awayPoss = Math.min(MAX_POSS, Math.max(MIN_POSS, Math.round(awayPoss)));

  const totalPoss = homePoss + awayPoss;

  // Possession-winning events: the team with more possessions needs to "earn" the extras
  const basePoss = Math.min(homePoss, awayPoss);
  const homeAdvantageEvents = Math.max(0, homePoss - basePoss);
  const awayAdvantageEvents = Math.max(0, awayPoss - basePoss);

  return { homePoss, awayPoss, totalPoss, homeAdvantageEvents, awayAdvantageEvents };
}

/// ── Scoring Engine (v2 — Multi-Channel) ───────────────────────────────────
//
// Architecture:
//   PRE-GAME (team-wide):
//     1. calcTeamPossRating → possession battle delta
//     2. calcTeamShotProfile → team shot distribution [rim%, mid%, per%]
//
//   PER-POSSESSION (lineup-specific):
//     3. Roll shot type from team distribution
//     4. Compute channel edge (lineup offense vs opponent lineup defense)
//     5. Roll efficiency (base + edge × SCALE, clamped ±10pp)
//     6. Points + and-1 check

type ShotChannel = 'rim' | 'mid' | 'three';

/**
 * Pre-game: Calculate team possession rating for the possession battle.
 * Uses weighted averages (starters ×2, bench ×1).
 */
export function calcTeamPossRating(
  players: PlayerCardData[],
  depthChart: Record<string, string[]>
): number {
  const starterIds = new Set<string>();
  for (const ids of Object.values(depthChart)) {
    if (ids.length > 0) starterIds.add(ids[0]);
  }

  let totalWeight = 0;
  let totalRating = 0;

  for (const p of players) {
    const weight = starterIds.has(p.id) ? 2.0 : 1.0;
    const avgDef = ((p.ratings?.perimeterDefense ?? 50) + (p.ratings?.postDefense ?? 50)) / 2;
    const possRating =
      (p.ratings?.playmaking ?? 50) * 0.40 +
      (p.ratings?.rebounding ?? 50) * 0.35 +
      avgDef * 0.25;
    totalWeight += weight;
    totalRating += weight * possRating;
  }

  return totalWeight > 0 ? totalRating / totalWeight : 50;
}

/** Shot profile: [rim%, mid%, per%] pre-computed per team */
export interface TeamShotProfile {
  rim: number;
  mid: number;
  per: number;
}

/**
 * Pre-game: Calculate team shot distribution blending NBA baseline with team's
 * offensive rating profile. Starters weighted ×2, bench ×1.
 */
export function calcTeamShotProfile(
  players: PlayerCardData[],
  depthChart: Record<string, string[]>,
  offenseMods: GameModifiers,
  defenseFromOpponent: GameModifiers
): TeamShotProfile {
  const starterIds = new Set<string>();
  for (const ids of Object.values(depthChart)) {
    if (ids.length > 0) starterIds.add(ids[0]);
  }

  let totalWeight = 0;
  let teamFinishing = 0, teamMidRange = 0, teamPerimeter = 0;

  for (const p of players) {
    const weight = starterIds.has(p.id) ? 2.0 : 1.0;
    totalWeight += weight;
    teamFinishing += weight * (p.ratings?.finishing ?? 50);
    teamMidRange += weight * (p.ratings?.midRange ?? 50);
    teamPerimeter += weight * (p.ratings?.perimeter ?? 50);
  }

  if (totalWeight > 0) {
    teamFinishing /= totalWeight;
    teamMidRange /= totalWeight;
    teamPerimeter /= totalWeight;
  }

  // Team tendency from offensive ratings
  const total = teamFinishing + teamMidRange + teamPerimeter;
  const rimTendency = total > 0 ? teamFinishing / total : 0.333;
  const midTendency = total > 0 ? teamMidRange / total : 0.333;
  const perTendency = total > 0 ? teamPerimeter / total : 0.334;

  // Blend PROFILE_WEIGHT/(1-PROFILE_WEIGHT) with NBA baseline
  let rim = (1 - PROFILE_WEIGHT) * NBA_BASELINE.rim.share + PROFILE_WEIGHT * rimTendency;
  let mid = (1 - PROFILE_WEIGHT) * NBA_BASELINE.mid.share + PROFILE_WEIGHT * midTendency;
  let per = (1 - PROFILE_WEIGHT) * NBA_BASELINE.three.share + PROFILE_WEIGHT * perTendency;

  // Apply synergy/play shot distribution bonuses. P0-1: defenseFromOpponent deltas are
  // ADDED, matching the sign convention documented on GameModifiers/TeamBonuses in
  // synergies.ts — defensive share bonuses are stored negative so adding them here
  // actually shrinks the offense's share of that channel.
  rim += offenseMods.rimShareBonus + (defenseFromOpponent.rimShareBonus || 0);
  mid += offenseMods.midShareBonus + (defenseFromOpponent.midShareBonus || 0);
  per += offenseMods.perShareBonus + (defenseFromOpponent.perShareBonus || 0);

  // Ensure no negative shares before normalizing
  rim = Math.max(0, rim);
  mid = Math.max(0, mid);
  per = Math.max(0, per);

  // Normalize to sum to 1.0
  const sum = rim + mid + per;
  if (sum > 0) { rim /= sum; mid /= sum; per /= sum; }

  return { rim, mid, per };
}

/**
 * Per-possession: Resolve a single possession using multi-channel shot engine.
 *
 * Flow:
 *   1. Roll shot type from team distribution
 *   2. Compute channel-specific edge (offense rating vs defense rating)
 *   3. Roll efficiency = base + edge × SCALE (clamped ±10pp)
 *   4. If make → points + and-1 check
 *   5. If miss → narrated as turnover/block/miss for variety
 */
export function resolvePossession(
  offenseLineup: PlayerCardData[],
  defenseLineup: PlayerCardData[],
  shotProfile: TeamShotProfile,
  offenseMods: GameModifiers,
  defenseFromOpponent: GameModifiers,
  centre: Record<ShotChannel, { off: number; def: number }>,
  rng: Rng,
  /** Playbook (§7): on a called offensive play, these assigned players' scorer weights
   *  are multiplied by PLAY_SCORER_BOOST so they're favoured to take the shot. */
  boostedIds?: Set<string>,
  /** Edge-size override for the balance script's lever sweep (plan D5); defaults to balance.ts. */
  tuning?: EdgeTuning
): { outcome: 'miss' | 'rim' | 'mid' | 'three'; points: number; isAnd1: boolean; isTurnover: boolean; isCleanFieldGoal: boolean; channel: ShotChannel; scorerId?: string; assistId?: string; narrativeHint: string } {

  // Step 1: Roll shot type from team distribution
  const roll = rng.next();
  let channel: ShotChannel;
  if (roll < shotProfile.rim)                          channel = 'rim';
  else if (roll < shotProfile.rim + shotProfile.mid)   channel = 'mid';
  else                                                 channel = 'three';

  // Step 2: Compute channel-specific edge from the five on the floor (engine_possession_model
  // D1-D3): standardised ratings, aggregated per dimension with LINEUP_AGG's k / hole tax
  // (engine/lineup.ts), centred on the measured expectation for that dimension
  // (CHANNEL_CENTRE) so an average lineup against an average defence nets ~0 edge.
  let offRating: number, defRating: number;
  switch (channel) {
    case 'rim':
      offRating = lineupValue(offenseLineup, 'finishing');
      defRating = lineupValue(defenseLineup, 'postDefense');
      break;
    case 'mid':
      offRating = lineupValue(offenseLineup, 'midRange');
      defRating = lineupMidDefence(defenseLineup);
      break;
    case 'three':
      offRating = lineupValue(offenseLineup, 'perimeter');
      defRating = lineupValue(defenseLineup, 'perimeterDefense');
      break;
  }

  const edge = ((offRating - centre[channel].off) - (defRating - centre[channel].def)) / 100;
  const clampedEdge = Math.max(-0.25, Math.min(0.25, edge));

  // Step 3: Roll efficiency
  const baseEff = NBA_BASELINE[channel].efficiency;
  const effScale = tuning?.efficiencyScale ?? EFFICIENCY_SCALE;
  const maxShift = tuning?.maxEffShift ?? MAX_EFF_SHIFT;
  const effShift = Math.max(-maxShift, Math.min(maxShift, clampedEdge * effScale));

  // Apply synergy/play efficiency bonuses. P0-1: defenseFromOpponent deltas are ADDED
  // (see the sign-convention comment on GameModifiers/TeamBonuses in synergies.ts) —
  // defensive efficiency bonuses are stored negative, so adding them here correctly
  // reduces the offense's efficiency; subtracting them (the old bug) inflated it.
  let channelEffBonus = 0;
  if (channel === 'rim')   channelEffBonus = offenseMods.rimEffBonus + (defenseFromOpponent.rimEffBonus || 0);
  if (channel === 'mid')   channelEffBonus = offenseMods.midEffBonus + (defenseFromOpponent.midEffBonus || 0);
  if (channel === 'three') channelEffBonus = offenseMods.perEffBonus + (defenseFromOpponent.perEffBonus || 0);

  const efficiency = Math.max(0.15, Math.min(0.85, baseEff + effShift + channelEffBonus));

  // Pick scorer/actor (weighted by channel-relevant rating). Playbook (§7): a called
  // offensive play's assigned players get their weight boosted so they're favoured to
  // take the shot on that possession, without ever fully excluding the rest of the lineup.
  const scorerWeights = offenseLineup.map(p => {
    const base = channel === 'three' ? (p.ratings?.perimeter ?? 50)
      : channel === 'mid' ? (p.ratings?.midRange ?? 50)
      : (p.ratings?.finishing ?? 50); // rim
    return boostedIds?.has(p.id) ? base * PLAY_SCORER_BOOST : base;
  });
  const scorer = weightedRandom(offenseLineup, scorerWeights, rng);
  const scorerId = scorer?.id;

  const made = rng.next() < efficiency;

  if (!made) {
    // P2-2: attribute a fraction of misses to the would-be shooter as a turnover
    // instead of a missed field goal, so PlayerBoxScore.turnovers (previously always
    // 0) reflects something. Narrative text and box-score attribution are kept in
    // sync by deciding the turnover here rather than leaving it to the randomly
    // chosen narrative flavor text.
    const isTurnover = rng.next() < TURNOVER_RATE;
    return { outcome: 'miss', points: 0, isAnd1: false, isTurnover, isCleanFieldGoal: false, channel, scorerId, narrativeHint: isTurnover ? 'turnover' : 'miss' };
  }

  // Step 4: Points + and-1 check
  let points: number;
  let narrativeHint: string;
  let isCleanFieldGoal: boolean;

  if (channel === 'rim') {
    // Rim makes: 50% clean 2, 50% a shooting foul — two FTs at RIM_FT_PCT (T3 code
    // review, 2026-09-14: this used to be a flat 1 point, understating a real FT trip's
    // ~1.5 expected value at league-average shooting and dragging PPP well below NBA
    // norms; see balance.ts's RIM_FT_PCT comment).
    isCleanFieldGoal = rng.next() < 0.5;
    if (isCleanFieldGoal) {
      points = 2;
      narrativeHint = 'rim_make';
    } else {
      points = (rng.next() < RIM_FT_PCT ? 1 : 0) + (rng.next() < RIM_FT_PCT ? 1 : 0);
      narrativeHint = 'rim_ft';
    }
  } else if (channel === 'mid') {
    points = 2;
    isCleanFieldGoal = true;
    narrativeHint = 'mid_make';
  } else {
    points = 3;
    isCleanFieldGoal = true;
    narrativeHint = 'three_make';
  }

  // And-1 check: only a clean field goal can draw an and-1 — a made free-throw trip
  // (isCleanFieldGoal false) isn't a field goal at all, so it can't be "and one" no
  // matter how many of the two free throws went in.
  let isAnd1 = false;
  if (isCleanFieldGoal) {
    const and1Chance = clampAnd1Chance(AND1_BASE[channel], offenseMods.and1Bonus);
    if (rng.next() < and1Chance) {
      isAnd1 = true;
      points += 1;
      narrativeHint = 'and1';
    }
  }

  // Assist: playmaking-weighted, excluding scorer, only on clean field goals — a free
  // throw is never assisted.
  let assistId: string | undefined;
  if (isCleanFieldGoal) {
    const assistCandidates = offenseLineup.filter(p => p.id !== scorerId);
    if (assistCandidates.length > 0 && rng.next() < 0.65) {
      const assistWeights = assistCandidates.map(p => p.ratings?.playmaking ?? 50);
      const assister = weightedRandom(assistCandidates, assistWeights, rng);
      assistId = assister?.id;
    }
  }

  return { outcome: channel, points, isAnd1, isTurnover: false, isCleanFieldGoal, channel, scorerId, assistId, narrativeHint };
}

/**
 * T6 code review (2026-09-14): every other combined modifier in resolvePossession gets a
 * final sane-range clamp (efficiency to [0.15, 0.85], edge to [-0.25, 0.25]) — and1Chance
 * (base + offense and1Bonus) didn't, even though each input is already independently
 * capped (AND1_BASE, IDENTITY_CAPS.and1). With today's content the reachable max is
 * ~0.16, well under AND1_CHANCE_CAP, so this is a defensive floor for future content,
 * not a fix to any currently-reachable behavior.
 */
export function clampAnd1Chance(and1Base: number, and1Bonus: number): number {
  return Math.min(AND1_CHANCE_CAP, Math.max(0, and1Base + and1Bonus));
}

function weightedRandom<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Playbook call resolution (§7) ───────────────────────────────────────────
//
// A team's evaluated playbook (evaluatePlaybook) is fixed for the whole game. On each
// possession we roll independently for (a) the offense team's called play and (b) the
// defending team's coverage play, using the SAME rng stream as everything else so a
// seed reproduces an identical game. Both rolls are skipped entirely (no rng.next()
// call) when the side has zero active plays, so a roster with no assigned plays draws
// exactly as many random numbers as before this feature existed.

function clampTo(v: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, v));
}

/** The depth-chart column (position) that lists this player, if any. */
function findPlayerColumn(depthChart: Record<string, string[]>, playerId: string): string | undefined {
  for (const [col, ids] of Object.entries(depthChart)) {
    if (ids.includes(playerId)) return col;
  }
  return undefined;
}

/**
 * Force every `playerIds` entry into its OWN depth-chart column of `lineupMap`
 * (position → playerId), returning a NEW map (the rotation timeline is never mutated).
 * Returns null — the play cannot be applied on this possession, caller should fall back
 * to the unmodified lineup — when any player has no column, two players share a column,
 * or the result would have fewer than 5 or duplicate players.
 */
function overrideLineupForPlay(
  lineupMap: Map<string, string>,
  depthChart: Record<string, string[]>,
  playerIds: string[]
): Map<string, string> | null {
  const cols: string[] = [];
  for (const pid of playerIds) {
    const col = findPlayerColumn(depthChart, pid);
    if (!col || cols.includes(col)) return null;
    cols.push(col);
  }
  const next = new Map(lineupMap);
  cols.forEach((col, i) => next.set(col, playerIds[i]));
  const values = Array.from(next.values());
  if (values.length < 5 || new Set(values).size !== values.length) return null;
  return next;
}

/** Roll rng.next() and walk `scaled`'s cumulative allocations; returns the play whose
 *  interval the roll landed in, or undefined (no call this possession). Skips the roll
 *  entirely when there are no active plays on this side, to avoid perturbing the rng
 *  stream for teams with an empty playbook. */
function rollCalledPlay(rng: Rng, scaled: { status: PlayStatus; allocation: number }[]): PlayStatus | undefined {
  if (scaled.length === 0) return undefined;
  const roll = rng.next();
  let cum = 0;
  for (const sp of scaled) {
    cum += sp.allocation;
    if (roll < cum) return sp.status;
  }
  return undefined;
}

/** Called-offensive-play share deltas, applied to the team's baseline profile for this
 *  possession only, then renormalized. Each channel's delta is clamped to
 *  ±IDENTITY_CAPS.share before being applied. */
function applyCalledShareShift(base: TeamShotProfile, mods: PlayCallModifiers): TeamShotProfile {
  let rim = base.rim + clampTo(mods.rimShare ?? 0, IDENTITY_CAPS.share);
  let mid = base.mid + clampTo(mods.midShare ?? 0, IDENTITY_CAPS.share);
  let per = base.per + clampTo(mods.threeShare ?? 0, IDENTITY_CAPS.share);
  rim = Math.max(0, rim); mid = Math.max(0, mid); per = Math.max(0, per);
  const sum = rim + mid + per;
  if (sum > 0) { rim /= sum; mid /= sum; per /= sum; }
  return { rim, mid, per };
}

/** A lineup map built from each position's starter (depth-chart index 0) only — OT's
 *  "your best 5 close the game" default before any play call is applied. */
function starterLineupMap(depthChart: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [pos, ids] of Object.entries(depthChart)) {
    if (ids.length > 0) map.set(pos, ids[0]);
  }
  return map;
}

/**
 * T1 (game_engine D3, 2026-09-14): resolve one possession — roll for a called offensive
 * play and a coverage play, apply their on-call modifiers, resolve the shot, update the
 * box score, and build the PossessionEvent. Shared by regulation and OT so OT possessions
 * roll for plays/coverage "exactly like regulation possessions" (same budgets, same rng
 * stream) instead of duplicating this logic with OT quietly left out, as it was before.
 * The caller still owns score accumulation (needs `points` before it can fill in
 * `runningScore`) and pushing the returned event onto `allPossessions`.
 */
function playOnePossession(params: {
  index: number;
  quarter: number;
  segment: number;
  team: 'home' | 'away';
  offenseTeam: TeamInfo;
  defenseTeam: TeamInfo;
  /** Lineup BEFORE any play-call override — drawn per-possession (drawLineup) in
   *  regulation, starters-only (starterLineupMap) in OT. */
  offenseLineupMap: Map<string, string>;
  defenseLineupMap: Map<string, string>;
  offenseMods: GameModifiers;
  defFromOpp: GameModifiers;
  baseShotProfile: TeamShotProfile;
  offenseScaled: ScaledPlay[];
  coverageScaled: ScaledPlay[];
  minutesPerPoss: number;
  isPossWin: boolean;
  rng: Rng;
  centre: Record<ShotChannel, { off: number; def: number }>;
  tuning?: EdgeTuning;
  boxStats: Map<string, PlayerBoxScore>;
  playerNameMap: Map<string, string>;
}): { event: PossessionEvent; points: number } {
  const {
    index, quarter, segment, team, offenseTeam, defenseTeam,
    offenseLineupMap, defenseLineupMap, offenseMods, defFromOpp, baseShotProfile,
    offenseScaled, coverageScaled, minutesPerPoss, isPossWin, rng, centre, tuning, boxStats, playerNameMap,
  } = params;
  const isHome = team === 'home';

  let offenseIds = Array.from(offenseLineupMap.values());
  let defenseIds = Array.from(defenseLineupMap.values());

  // Playbook (§7): roll independently for (a) the offense team's called play over its
  // own possessions and (b) the defending team's coverage play over the opponent's
  // possessions. Both rolls skip entirely (no rng draw) when that side has no active
  // plays. A roll that lands on a play whose assigned players can't form a legal lineup
  // (overrideLineupForPlay returns null) falls back to the normal lineup and does not
  // count as called.
  let calledOffense: PlayStatus | undefined;
  const rolledOffense = rollCalledPlay(rng, offenseScaled);
  if (rolledOffense) {
    const overridden = overrideLineupForPlay(offenseLineupMap, offenseTeam.depthChart, rolledOffense.playerIds);
    if (overridden) { offenseIds = Array.from(overridden.values()); calledOffense = rolledOffense; }
  }

  let calledCoverage: PlayStatus | undefined;
  const rolledCoverage = rollCalledPlay(rng, coverageScaled);
  if (rolledCoverage) {
    const overriddenDef = overrideLineupForPlay(defenseLineupMap, defenseTeam.depthChart, rolledCoverage.playerIds);
    if (overriddenDef) { defenseIds = Array.from(overriddenDef.values()); calledCoverage = rolledCoverage; }
  }

  const offenseLineup = offenseIds.map(id => offenseTeam.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];
  const defenseLineup = defenseIds.map(id => defenseTeam.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];

  // Playbook on-call modifiers (§7): a called offensive play shifts this possession's
  // shot profile (renormalized) and adds to channel efficiency/and-1; a coverage play's
  // (negative) eff deltas add to the opponent's channel efficiency for this possession
  // only, same sign convention as defenseMods. The combined per-possession eff shift per
  // channel is clamped to ±IDENTITY_CAPS.eff and share shifts to ±IDENTITY_CAPS.share
  // (applyCalledShareShift does the share clamp).
  const shotProfile = calledOffense ? applyCalledShareShift(baseShotProfile, calledOffense.def.mods) : baseShotProfile;

  const rimEffDelta = clampTo((calledOffense?.def.mods.rimEff ?? 0) + (calledCoverage?.def.mods.rimEff ?? 0), IDENTITY_CAPS.eff);
  const midEffDelta = clampTo((calledOffense?.def.mods.midEff ?? 0) + (calledCoverage?.def.mods.midEff ?? 0), IDENTITY_CAPS.eff);
  const threeEffDelta = clampTo((calledOffense?.def.mods.threeEff ?? 0) + (calledCoverage?.def.mods.threeEff ?? 0), IDENTITY_CAPS.eff);
  const and1Delta = clampTo(calledOffense?.def.mods.and1 ?? 0, IDENTITY_CAPS.and1);

  const possessionOffenseMods: GameModifiers = (rimEffDelta || midEffDelta || threeEffDelta || and1Delta)
    ? { ...offenseMods, rimEffBonus: offenseMods.rimEffBonus + rimEffDelta, midEffBonus: offenseMods.midEffBonus + midEffDelta, perEffBonus: offenseMods.perEffBonus + threeEffDelta, and1Bonus: offenseMods.and1Bonus + and1Delta }
    : offenseMods;

  const boostedIds = calledOffense ? new Set(calledOffense.playerIds) : undefined;

  // Resolve the possession (multi-channel: shot type → edge → efficiency)
  const result = resolvePossession(offenseLineup, defenseLineup, shotProfile, possessionOffenseMods, defFromOpp, centre, rng, boostedIds, tuning);

  // Playbook recording (§7): tag this possession with whichever calls applied.
  const calledPlays: PossessionEvent['calledPlays'] = [];
  if (calledOffense) calledPlays.push({ playId: calledOffense.def.playId, name: calledOffense.def.name, side: 'offense', teamSide: team });
  if (calledCoverage) calledPlays.push({ playId: calledCoverage.def.playId, name: calledCoverage.def.name, side: 'defense', teamSide: isHome ? 'away' : 'home' });

  // Update box score. P2-2: minutes accrue per possession a player is on court for,
  // whether on offense OR defense.
  for (const id of offenseIds) {
    const bs = boxStats.get(id);
    if (bs) { bs.possessions++; bs.minutes += minutesPerPoss; }
  }
  for (const id of defenseIds) {
    const bs = boxStats.get(id);
    if (bs) { bs.minutes += minutesPerPoss; }
  }
  if (result.scorerId && result.points > 0) {
    const bs = boxStats.get(result.scorerId);
    if (bs) {
      bs.points += result.points;
      // isCleanFieldGoal guard: a made rim free-throw trip (2-for-2) is 2 points but
      // not a made field goal — counting it as a two-pointer would misattribute it.
      if (result.isCleanFieldGoal && (result.channel === 'rim' || result.channel === 'mid') && result.points >= 2) bs.twoPointers++;
      if (result.channel === 'three') bs.threePointers++;
      if (result.isAnd1) bs.andOnes++;
    }
  }
  if (result.isTurnover && result.scorerId) {
    const bs = boxStats.get(result.scorerId);
    if (bs) bs.turnovers++;
  }
  if (result.assistId && result.points > 0) {
    const bs = boxStats.get(result.assistId);
    if (bs) bs.assists++;
  }

  const scorerName = result.scorerId ? (playerNameMap.get(result.scorerId) || '???') : offenseLineup[0]?.player?.name || '???';
  const assistName = result.assistId ? playerNameMap.get(result.assistId) : undefined;

  const outcomeForEvent = result.outcome === 'miss' ? 'miss' as const
    : result.channel === 'three' ? '3pt' as const
    : result.isAnd1 ? 'and1' as const
    : '2pt' as const;

  const event: PossessionEvent = {
    index, quarter, segment, team,
    lineupOnCourt: offenseIds,
    defenseOnCourt: defenseIds,
    outcome: outcomeForEvent,
    scoringPlayerId: result.scorerId,
    assistPlayerId: result.assistId,
    isPossessionWinEvent: isPossWin || undefined,
    narrativeText: generateNarrative(result.narrativeHint, scorerName, rng, assistName, isPossWin),
    runningScore: [0, 0], // filled in by the caller once it's updated home/awayScore
    calledPlays,
  };

  return { event, points: result.points };
}

// ── Narrative Generator ────────────────────────────────────────────────────

// Missed-shot narratives (blocks included — still a missed field goal, not a turnover)
const MISS_TEXTS = [
  '{player} misses the jumper.',
  'Contested shot by {player} — no good.',
  'Blocked! Shot rejected.',
  '{player} rattles it out.',
  '{player} can\'t connect.',
];

// Turnover-flavored narratives — used when resolvePossession rolls isTurnover: true
// (P2-2), so the box score's turnover count and the narrative text stay in sync.
const TURNOVER_TEXTS = [
  'Stolen by the defense!',
  'Bad pass — turnover!',
  '{player} loses the handle.',
];

const RIM_MAKE_TEXTS = [
  '{player} scores on a layup!',
  '{player} drives and finishes!',
  '{player} with the floater — bucket!',
  'Dunk by {player}!',
  '{player} powers through to the rim!',
];

const RIM_FT_TEXTS = [
  '{player} is fouled going to the basket — to the line.',
  '{player} draws the foul driving in.',
  'Shooting foul on {player} — free throws.',
];

const MID_MAKE_TEXTS = [
  '{player} with the mid-range jumper — cash!',
  '{player} pulls up from the elbow — money!',
  '{player} with the fadeaway — bucket!',
  '{player} hits the turnaround jumper!',
  '{player} from mid-range — got it!',
];

const THREE_MAKE_TEXTS = [
  '{player} drains the three!',
  '{player} from downtown — BANG!',
  '{player} for three... got it!',
  '{player} pulls up from deep — splash!',
  'Corner three by {player} — nothing but net!',
  '{player} catches and shoots — three ball!',
];

const AND1_TEXTS = [
  '{player} scores AND the foul!',
  '{player} finishes through contact — and one!',
  '{player} powers through for the and-one!',
  'Tough finish by {player} — plus the free throw!',
];

const ASSIST_TEXTS = [
  ' (assist: {assist})',
  ' ({assist} with the dime)',
  ' (feed from {assist})',
];

const POSSESSION_WIN_TEXTS = [
  'Offensive rebound!',
  'Steal by the defense!',
  'Block leads to a fast break!',
  'Loose ball recovered!',
];

function generateNarrative(
  narrativeHint: string,
  scorerName: string,
  rng: Rng,
  assistName?: string,
  isPossWin?: boolean
): string {
  let prefix = '';
  if (isPossWin) {
    prefix = POSSESSION_WIN_TEXTS[Math.floor(rng.next() * POSSESSION_WIN_TEXTS.length)] + ' ';
  }

  let texts: string[];
  switch (narrativeHint) {
    case 'miss': texts = MISS_TEXTS; break;
    case 'turnover': texts = TURNOVER_TEXTS; break;
    case 'rim_make': texts = RIM_MAKE_TEXTS; break;
    case 'rim_ft': texts = RIM_FT_TEXTS; break;
    case 'mid_make': texts = MID_MAKE_TEXTS; break;
    case 'three_make': texts = THREE_MAKE_TEXTS; break;
    case 'and1': texts = AND1_TEXTS; break;
    default: texts = MISS_TEXTS;
  }

  let text = texts[Math.floor(rng.next() * texts.length)].replace('{player}', scorerName);

  if (assistName && narrativeHint !== 'miss' && narrativeHint !== 'turnover') {
    const assistText = ASSIST_TEXTS[Math.floor(rng.next() * ASSIST_TEXTS.length)].replace('{assist}', assistName);
    text += assistText;
  }

  return prefix + text;
}

// ── Team Builder Helper ────────────────────────────────────────────────────

export function buildTeamInfo(
  seat: DraftSessionSeat,
  isHuman: boolean,
  /** Human team label (account display name); defaults to 'You' for callers/tests
   *  that don't have an identity to pass — the engine stays pure either way. */
  humanName: string = 'You'
): TeamInfo {
  const roster = seat.builtRoster;
  const allCards = seat.drafted;
  const playerMap = new Map<string, PlayerCardData>();
  const playMap = new Map<string, Play>();

  for (const card of allCards) {
    if (card.type === 'Player') playerMap.set(card.id, card as PlayerCardData);
    else if (card.type === 'Play') playMap.set(card.id, card as Play);
  }

  // Position natural eligibility check. Data uses '/' (e.g. 'G/F'); the '-' checks
  // below are stale from an older format but harmless — normalise to '/' first so
  // both spellings hit the same branches.
  const isNaturalPosition = (rawPosIn: string, col: string): boolean => {
    const rawPos = rawPosIn.replace('-', '/');
    if (rawPos === 'ALL') return true;
    if (rawPos === 'G' && (col === 'PG' || col === 'SG')) return true;
    if (rawPos === 'F' && (col === 'SF' || col === 'PF')) return true;
    if ((rawPos === 'G/F' || rawPos === 'F/G') && ['PG','SG','SF','PF'].includes(col)) return true;
    if (rawPos.includes(col)) return true;
    const parts = rawPos.split(/[-/]/);
    if (parts.includes(col)) return true;
    if (parts.includes('G') && (col === 'PG' || col === 'SG')) return true;
    if (parts.includes('F') && (col === 'SF' || col === 'PF')) return true;
    return false;
  };

  // Apply -10% penalty for out-of-position players
  const applyOOPPenalty = (player: PlayerCardData): PlayerCardData => {
    const penalty = 0.9; // -10%
    return {
      ...player,
      ratings: {
        overall: Math.round(player.ratings.overall * penalty),
        finishing: Math.round(player.ratings.finishing * penalty),
        midRange: Math.round(player.ratings.midRange * penalty),
        perimeter: Math.round(player.ratings.perimeter * penalty),
        playmaking: Math.round(player.ratings.playmaking * penalty),
        rebounding: Math.round(player.ratings.rebounding * penalty),
        perimeterDefense: Math.round(player.ratings.perimeterDefense * penalty),
        postDefense: Math.round(player.ratings.postDefense * penalty),
      },
    };
  };

  // Collect active roster players, applying OOP penalty where needed
  const activePlayers: PlayerCardData[] = [];
  const starters: string[] = [];

  for (const [pos, ids] of Object.entries(roster.depthChart)) {
    for (const id of ids) {
      const player = playerMap.get(id);
      if (player && !activePlayers.find(p => p.id === id)) {
        if (!isNaturalPosition(player.player.position, pos)) {
          activePlayers.push(applyOOPPenalty(player));
        } else {
          activePlayers.push(player);
        }
      }
    }
    if (ids.length > 0) starters.push(ids[0]);
  }

  // Collect active plays
  const activePlays: Play[] = [];
  for (const id of roster.activePlays) {
    const play = playMap.get(id);
    if (play) activePlays.push(play);
  }

  // v2 roster shape: assigned-player play roles + chosen archetypes. Normalise here so
  // pre-v2 saved rosters (no playAssignments/archetypes yet) still produce a valid,
  // all-inactive playbook instead of throwing.
  const normalized = normalizeBuiltRoster(roster, allCards);

  return {
    seatId: seat.id,
    name: isHuman ? humanName : (seat.botProfile?.name || seat.id),
    players: activePlayers,
    starters,
    plays: activePlays,
    depthChart: roster.depthChart,
    playAssignments: normalized.playAssignments,
    archetypes: normalized.archetypes,
  };
}

// ── Main Simulation ────────────────────────────────────────────────────────

export function simulateGame(
  homeTeam: TeamInfo,
  awayTeam: TeamInfo,
  opts?: { rng?: Rng; centre?: typeof CHANNEL_CENTRE; tuning?: EdgeTuning }
): GameTheater {
  const rng = opts?.rng ?? createRng(randomSeed());
  const centre = opts?.centre ?? CHANNEL_CENTRE;
  const tuning = opts?.tuning;
  const playerNameMap = new Map<string, string>();
  for (const p of [...homeTeam.players, ...awayTeam.players]) {
    playerNameMap.set(p.id, p.player?.name || p.id);
  }

  // 1. Calculate possession shares
  const homeShares = calcPossessionShares(homeTeam.depthChart, homeTeam.players);
  const awayShares = calcPossessionShares(awayTeam.depthChart, awayTeam.players);

  // 1b. Evaluate each team's playbook once for the whole game (§4/§7): which assigned
  // plays are active, and each active play's (possibly budget-scaled) call allocation.
  const homePlaybook = evaluatePlaybook(homeTeam.playAssignments ?? [], homeTeam.players);
  const awayPlaybook = evaluatePlaybook(awayTeam.playAssignments ?? [], awayTeam.players);
  const homeOffenseScaled = scaledPlayAllocations(homePlaybook, 'offense');
  const awayOffenseScaled = scaledPlayAllocations(awayPlaybook, 'offense');
  const homeDefenseScaled = scaledPlayAllocations(homePlaybook, 'defense');
  const awayDefenseScaled = scaledPlayAllocations(awayPlaybook, 'defense');

  // 2. Calculate bonuses (archetypes; plays are resolved possession-by-possession below)
  const homeStarterIds = new Set(homeTeam.starters);
  const awayStarterIds = new Set(awayTeam.starters);
  const homeBonuses = calcTeamBonuses(homeTeam.players, homeTeam.plays, homeShares, { starterIds: homeStarterIds, archetypes: homeTeam.archetypes });
  const awayBonuses = calcTeamBonuses(awayTeam.players, awayTeam.plays, awayShares, { starterIds: awayStarterIds, archetypes: awayTeam.archetypes });

  // Playbook possession swing (§4: "Team-level possession swing per game while the play
  // is active") folds into the SAME accumulator archetype possession effects use, then
  // the combined total is clamped to ±IDENTITY_CAPS.possessions (P-caps are applied
  // AFTER archetype + play effects are combined — see IDENTITY_CAPS in balance.ts).
  homeBonuses.possessionSwing = clampTo(homeBonuses.possessionSwing + playbookPossessionSwing(homePlaybook), IDENTITY_CAPS.possessions);
  awayBonuses.possessionSwing = clampTo(awayBonuses.possessionSwing + playbookPossessionSwing(awayPlaybook), IDENTITY_CAPS.possessions);

  // Plays are no longer evaluated inside calcTeamBonuses (synergies.ts only returns
  // archetype modifiers now) — fill TeamBonuses.activePlays here so existing UI
  // (GameView etc.) that reads it keeps working unchanged.
  homeBonuses.activePlays = homePlaybook.plays.map(p => ({ name: p.def.name, description: p.def.summary, activated: p.active ? 'full' as const : 'none' as const }));
  awayBonuses.activePlays = awayPlaybook.plays.map(p => ({ name: p.def.name, description: p.def.summary, activated: p.active ? 'full' as const : 'none' as const }));

  // 3. Possession battle (uses new calcTeamPossRating: playmaking + rebounding + defense)
  // Minutes are credited per on-court possession (offense and defense), scaled to
  // the actual game length: a player on court for every possession gets exactly 48.
  const split = calcPossessionSplit(
    homeTeam.players, awayTeam.players,
    homeTeam.depthChart, awayTeam.depthChart,
    homeBonuses, awayBonuses,
    rng
  );
  // T6 code review: this used to be declared with a throwaway 0.24 initializer above the
  // split, always overwritten below before any read — dead value, removed.
  const REG_MIN_PER_POSS = 48 / split.totalPoss;

  // 4. Pre-game shot profiles (team-wide, blended with NBA baseline)
  const homeShotProfile = calcTeamShotProfile(
    homeTeam.players, homeTeam.depthChart,
    homeBonuses.offenseMods, awayBonuses.defenseMods
  );
  const awayShotProfile = calcTeamShotProfile(
    awayTeam.players, awayTeam.depthChart,
    awayBonuses.offenseMods, homeBonuses.defenseMods
  );

  // 4. Distribute possessions across 4 quarters with noise
  const quarterPoss = distributeQuarters(split.homePoss, split.awayPoss, rng);

  // 5. Simulate possessions, drawing each possession's lineup fresh (see drawLineup)
  const allPossessions: PossessionEvent[] = [];
  const quarterSummaries: QuarterSummary[] = [];

  let homeScore = 0, awayScore = 0;
  let possIndex = 0;

  // Box score tracking
  const boxStats = new Map<string, PlayerBoxScore>();
  for (const p of [...homeTeam.players, ...awayTeam.players]) {
    boxStats.set(p.id, {
      playerId: p.id, playerName: p.player?.name || p.id,
      minutes: 0, possessions: 0, points: 0,
      twoPointers: 0, threePointers: 0, andOnes: 0,
      turnovers: 0, assists: 0,
    });
  }

  // Possession-winning events to distribute
  let homeExtraPoss = split.homeAdvantageEvents;
  let awayExtraPoss = split.awayAdvantageEvents;

  for (let q = 0; q < 4; q++) {
    const quarter = q + 1;
    const segment = segmentForQuarter(quarter);
    const homeQ = quarterPoss[q].home;
    const awayQ = quarterPoss[q].away;

    const qStartScore: [number, number] = [homeScore, awayScore];
    let homePossCount = 0, awayPossCount = 0;

    // Interleave possessions: alternate home/away
    let homeIdx = 0, awayIdx = 0;
    let isHomeTurn = rng.next() < 0.5; // Random first possession per quarter

    while (homeIdx < homeQ || awayIdx < awayQ) {
      let team: 'home' | 'away';

      if (homeIdx >= homeQ) { team = 'away'; }
      else if (awayIdx >= awayQ) { team = 'home'; }
      else { team = isHomeTurn ? 'home' : 'away'; isHomeTurn = !isHomeTurn; }

      const isHome = team === 'home';
      const offenseTeam = isHome ? homeTeam : awayTeam;
      const defenseTeam = isHome ? awayTeam : homeTeam;
      const offenseShares = isHome ? homeShares : awayShares;
      const defenseShares = isHome ? awayShares : homeShares;
      const offenseMods = isHome ? homeBonuses.offenseMods : awayBonuses.offenseMods;
      const defFromOpp = isHome ? awayBonuses.defenseMods : homeBonuses.defenseMods;
      const offenseScaled = isHome ? homeOffenseScaled : awayOffenseScaled;
      const coverageScaled = isHome ? awayDefenseScaled : homeDefenseScaled;
      const baseShotProfile = isHome ? homeShotProfile : awayShotProfile;

      // Check if this is a possession-winning event
      let isPossWin = false;
      if (isHome && homeExtraPoss > 0 && rng.next() < homeExtraPoss / (homeQ - homeIdx)) {
        isPossWin = true; homeExtraPoss--;
      } else if (!isHome && awayExtraPoss > 0 && rng.next() < awayExtraPoss / (awayQ - awayIdx)) {
        isPossWin = true; awayExtraPoss--;
      }

      // Fresh per-possession lineup draw, weighted by each roster's possession shares
      // (see drawLineup) — replaces the old precomputed quarter-phase rotation timeline.
      const { event, points } = playOnePossession({
        index: possIndex, quarter, segment, team,
        offenseTeam, defenseTeam,
        offenseLineupMap: drawLineup(offenseTeam.depthChart, offenseShares, rng),
        defenseLineupMap: drawLineup(defenseTeam.depthChart, defenseShares, rng),
        offenseMods, defFromOpp, baseShotProfile, offenseScaled, coverageScaled,
        minutesPerPoss: REG_MIN_PER_POSS, isPossWin, rng, centre, tuning, boxStats, playerNameMap,
      });

      if (isHome) homeScore += points; else awayScore += points;
      event.runningScore = [homeScore, awayScore];
      allPossessions.push(event);

      possIndex++;
      if (isHome) { homeIdx++; homePossCount++; } else { awayIdx++; awayPossCount++; }
    }

    quarterSummaries.push({
      quarter,
      homeScore: homeScore - qStartScore[0],
      awayScore: awayScore - qStartScore[1],
      homePossessions: homePossCount,
      awayPossessions: awayPossCount,
    });
  }

  // Overtime if tied
  let isOvertime = false;
  let overtimePeriods = 0;

  while (homeScore === awayScore && overtimePeriods < MAX_OT_PERIODS) {
    isOvertime = true;
    overtimePeriods++;
    const otPoss = OT_POSS_PER_TEAM * 2; // 5 per team + noise
    const OT_MIN_PER_POSS = OT_PERIOD_MINUTES / otPoss;
    const homeOTPoss = OT_POSS_PER_TEAM + Math.round((rng.next() - 0.5) * 2);
    const awayOTPoss = otPoss - homeOTPoss;
    const otQuarter = 4 + overtimePeriods;

    // OT: starters only
    const otStartScore: [number, number] = [homeScore, awayScore];
    let homeOTIdx = 0, awayOTIdx = 0;
    let otHomeTurn = rng.next() < 0.5;

    while (homeOTIdx < homeOTPoss || awayOTIdx < awayOTPoss) {
      let team: 'home' | 'away';
      if (homeOTIdx >= homeOTPoss) team = 'away';
      else if (awayOTIdx >= awayOTPoss) team = 'home';
      else { team = otHomeTurn ? 'home' : 'away'; otHomeTurn = !otHomeTurn; }

      const isHome = team === 'home';
      const offenseTeam = isHome ? homeTeam : awayTeam;
      const defenseTeam = isHome ? awayTeam : homeTeam;
      const offenseMods = isHome ? homeBonuses.offenseMods : awayBonuses.offenseMods;
      const defFromOpp = isHome ? awayBonuses.defenseMods : homeBonuses.defenseMods;
      const otShotProfile = isHome ? homeShotProfile : awayShotProfile;
      const offenseScaled = isHome ? homeOffenseScaled : awayOffenseScaled;
      const coverageScaled = isHome ? awayDefenseScaled : homeDefenseScaled;
      const otSegment = segmentForQuarter(otQuarter);

      // T1 (D3): OT possessions roll for called plays and coverages exactly like
      // regulation (same budgets, same rng stream, via the shared playOnePossession) —
      // this used to skip play-calling entirely. The default lineup before any play
      // override is still starters-only (closing lineup stays a deliberate design
      // choice, not something D3 asked to change); a play whose assigned players
      // include a bench player can still force them on, same as regulation.
      const { event, points } = playOnePossession({
        index: possIndex, quarter: otQuarter, segment: otSegment, team,
        offenseTeam, defenseTeam,
        offenseLineupMap: starterLineupMap(offenseTeam.depthChart),
        defenseLineupMap: starterLineupMap(defenseTeam.depthChart),
        offenseMods, defFromOpp, baseShotProfile: otShotProfile, offenseScaled, coverageScaled,
        minutesPerPoss: OT_MIN_PER_POSS, isPossWin: false, rng, centre, tuning, boxStats, playerNameMap,
      });

      if (isHome) homeScore += points; else awayScore += points;
      event.runningScore = [homeScore, awayScore];
      allPossessions.push(event);
      possIndex++;

      if (isHome) homeOTIdx++; else awayOTIdx++;
    }

    quarterSummaries.push({
      quarter: otQuarter,
      homeScore: homeScore - otStartScore[0],
      awayScore: awayScore - otStartScore[1],
      homePossessions: homeOTPoss,
      awayPossessions: awayOTPoss,
    });
  }

  // T6 code review, refined per game_engine feedback: MAX_OT_PERIODS periods of a real
  // tie is not reachable under today's efficiencies, but the loop above stops there
  // regardless. Rather than a coin flip, the team with the higher average starter OVR
  // wins — OT already plays starters-only (starterLineupMap), so this keeps the
  // tiebreak consistent with "the better top-heavy team should win it" rather than
  // reintroducing pure luck at the last possible moment. A coin flip remains only as
  // the fallback for an exact OVR tie. Credited to the winning team's first starter and
  // folded into the last quarter summary so finalScore stays consistent with
  // boxScore/quarterSummaries (see game.test.ts).
  if (homeScore === awayScore) {
    const avgStarterOvr = (team: TeamInfo): number => {
      const overalls = team.starters.map(id => team.players.find(p => p.id === id)?.ratings.overall ?? 0);
      return overalls.reduce((sum, o) => sum + o, 0) / (overalls.length || 1);
    };
    const homeAvg = avgStarterOvr(homeTeam);
    const awayAvg = avgStarterOvr(awayTeam);
    const homeWins = homeAvg !== awayAvg ? homeAvg > awayAvg : rng.next() < 0.5;
    if (homeWins) homeScore += 1; else awayScore += 1;
    const lastQuarter = quarterSummaries[quarterSummaries.length - 1];
    if (lastQuarter) { if (homeWins) lastQuarter.homeScore += 1; else lastQuarter.awayScore += 1; }
    const recipientId = (homeWins ? homeTeam : awayTeam).starters[0];
    const recipientBox = recipientId ? boxStats.get(recipientId) : undefined;
    if (recipientBox) recipientBox.points += 1;
  }

  // Round minutes
  for (const bs of boxStats.values()) {
    bs.minutes = Math.round(bs.minutes * 10) / 10;
  }

  // Split box scores
  const homeIds = new Set(homeTeam.players.map(p => p.id));
  const homeBox = Array.from(boxStats.values())
    .filter(bs => homeIds.has(bs.playerId))
    .sort((a, b) => b.points - a.points);
  const awayBox = Array.from(boxStats.values())
    .filter(bs => !homeIds.has(bs.playerId))
    .sort((a, b) => b.points - a.points);

  return {
    homeTeam,
    awayTeam,
    possessions: allPossessions,
    quarterSummaries,
    finalScore: [homeScore, awayScore],
    boxScore: { home: homeBox, away: awayBox },
    homeBonuses,
    awayBonuses,
    isOvertime,
    overtimePeriods,
    seed: rng.seed,
    playbook: { home: homePlaybook, away: awayPlaybook },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function distributeQuarters(
  homePoss: number,
  awayPoss: number,
  rng: Rng
): { home: number; away: number }[] {
  const quarters: { home: number; away: number }[] = [];
  let homeRemaining = homePoss;
  let awayRemaining = awayPoss;

  for (let q = 0; q < 4; q++) {
    const remaining = 4 - q;
    const homeBase = Math.round(homeRemaining / remaining);
    const awayBase = Math.round(awayRemaining / remaining);

    // Add noise ±1
    const homeNoise = q < 3 ? Math.round((rng.next() - 0.5) * 2) : 0;
    const awayNoise = q < 3 ? Math.round((rng.next() - 0.5) * 2) : 0;

    const homeQ = q < 3 ? Math.max(20, homeBase + homeNoise) : homeRemaining;
    const awayQ = q < 3 ? Math.max(20, awayBase + awayNoise) : awayRemaining;

    quarters.push({ home: homeQ, away: awayQ });
    homeRemaining -= homeQ;
    awayRemaining -= awayQ;
  }

  return quarters;
}
