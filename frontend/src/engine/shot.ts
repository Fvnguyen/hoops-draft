/**
 * Scoring Engine (plan render_and_engine_perf D6 — split out of game.ts): the possession
 * count, the multi-channel shot profile/steer/edge maths, and per-possession shot
 * resolution.
 */

import type { PlayerCardData } from './types';
import type { Rng } from './rng';
import type { TeamBonuses, GameModifiers } from './synergies';
import type { PlayCallModifiers } from './playbook';
import type { ShotChannel, TeamShotProfile, EdgeTuning } from './gameTypes';
import {
  BASE_PACE, HOME_NOISE_LO_PCT, HOME_NOISE_HI_PCT, AWAY_NOISE_LO_PCT, AWAY_NOISE_HI_PCT,
  POSSESSION_CLAMP_MIN_PCT, POSSESSION_CLAMP_MAX_PCT,
  NBA_BASELINE, AND1_BASE, AND1_CHANCE_CAP, EFFICIENCY_SCALE, MAX_EFF_SHIFT, PROFILE_WEIGHT,
  LINEUP_CENTRE, EDGE_WEIGHT, TURNOVER_BASE, TURNOVER_SCALE, TURNOVER_DEF_WEIGHT, TURNOVER_MIN, TURNOVER_MAX, OREB_BASE, OREB_SCALE, OREB_MIN, OREB_MAX, STEER_SCALE, STEER_CAP,
  PLAY_SCORER_BOOST, IDENTITY_CAPS, RIM_FT_PCT,
} from './balance';
import { lineupValue, lineupMidDefence, lineupMean } from './lineup';

// ── Possession Count ───────────────────────────────────────────────────────


interface PossessionSplit {
  homePoss: number;
  awayPoss: number;
  totalPoss: number;
  homeAdvantageEvents: number; // Extra possessions home must "earn" through events
  awayAdvantageEvents: number;
}

export function calcPossessionSplit(
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

  // engine_possession_model D6: no pre-game possession battle. Teams get equal
  // possessions apart from the pace noise above and the play/identity swing below; what a
  // roster's playmaking/rebounding/defence is worth is resolved per possession
  // (turnovers, offensive rebounds, the creator steer in playOnePossession).

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
//   PER-POSSESSION, all from the five on the floor (engine_possession_model D4/D6):
//     1. Turnover roll (playmaking vs perimeter defence) — possession may end here
//     2. Shot profile from the lineup's plain means, called-play share shift, creator steer
//     3. Roll shot type; channel edge (aggregated lineup offence vs defence, centred)
//     4. Roll efficiency (base + edge × EFFICIENCY_SCALE, clamped ±MAX_EFF_SHIFT)
//     5. Points + and-1 check; a missed FG may be rebounded (rebounding vs rebounding)
//        and the possession continues, up to OREB_MAX_CHAIN times


/**
 * Per-possession shot distribution for the five on the floor (engine_possession_model
 * D4): who shoots is a committee question, so the tendency is the plain mean of the
 * lineup's standardised finishing / mid-range / perimeter ratings (a lineup with two
 * non-shooters takes fewer threes), blended PROFILE_WEIGHT with the NBA baseline and
 * shifted by identity/coverage share mods. Replaces the pre-game 12-man team profile.
 */
export function calcLineupShotProfile(
  lineup: PlayerCardData[],
  offenseMods: GameModifiers,
  defenseFromOpponent: GameModifiers
): TeamShotProfile {
  const f = lineupMean(lineup, 'finishing');
  const m = lineupMean(lineup, 'midRange');
  const p = lineupMean(lineup, 'perimeter');
  const total = f + m + p;
  const rimTendency = total > 0 ? f / total : 0.333;
  const midTendency = total > 0 ? m / total : 0.333;
  const perTendency = total > 0 ? p / total : 0.334;

  let rim = (1 - PROFILE_WEIGHT) * NBA_BASELINE.rim.share + PROFILE_WEIGHT * rimTendency;
  let mid = (1 - PROFILE_WEIGHT) * NBA_BASELINE.mid.share + PROFILE_WEIGHT * midTendency;
  let per = (1 - PROFILE_WEIGHT) * NBA_BASELINE.three.share + PROFILE_WEIGHT * perTendency;

  // Identity/coverage share mods (P0-1 sign convention: defensive deltas are stored
  // negative and ADDED, so they shrink the offence's share of that channel).
  rim += offenseMods.rimShareBonus + (defenseFromOpponent.rimShareBonus || 0);
  mid += offenseMods.midShareBonus + (defenseFromOpponent.midShareBonus || 0);
  per += offenseMods.perShareBonus + (defenseFromOpponent.perShareBonus || 0);

  rim = Math.max(0, rim); mid = Math.max(0, mid); per = Math.max(0, per);
  const sum = rim + mid + per;
  if (sum > 0) { rim /= sum; mid /= sum; per /= sum; }
  return { rim, mid, per };
}

const POINTS_PER_MAKE: Record<ShotChannel, number> = {
  rim: 0.5 * 2 + 0.5 * 2 * RIM_FT_PCT,  // half clean 2s, half two-FT trips
  mid: 2,
  three: 3,
};

/**
 * D6 creator steer: the offence's playmaking edge (its lineup value vs the centre) moves
 * `STEER_SCALE · edge` of shot share, capped ±STEER_CAP, from the channel worth the fewest
 * expected points against THIS defence to the one worth the most. Expected points are
 * absolute — (base efficiency + this matchup's efficiency shift) × points per make — so a
 * creator steers toward the genuinely best shot available, not the channel with the
 * largest relative edge (mid-range stays the least efficient channel by design unless a
 * defence is truly soft there). Matchup-based, so the "good shot" changes with the
 * opponent; bounded, so rim never swallows the profile. A below-average creator steers
 * the other way. Exported for tests.
 */
export function steerShotProfile(
  profile: TeamShotProfile,
  offenseLineup: PlayerCardData[],
  defenseLineup: PlayerCardData[],
  centre: Record<ShotChannel, { off: number; def: number }>,
  tuning?: EdgeTuning
): TeamShotProfile {
  return steerShotProfileDetailed(profile, offenseLineup, defenseLineup, centre, tuning).profile;
}

/** game_theater D1: `steerShotProfile` plus WHERE the share went — `steeredTo` is the channel
 *  that gained `shift` share (absent when nothing moved). Same maths, no rng. */
export function steerShotProfileDetailed(
  profile: TeamShotProfile,
  offenseLineup: PlayerCardData[],
  defenseLineup: PlayerCardData[],
  centre: Record<ShotChannel, { off: number; def: number }>,
  tuning?: EdgeTuning
): { profile: TeamShotProfile; steeredTo?: ShotChannel; shift: number } {
  const creator = (lineupValue(offenseLineup, 'playmaking') - LINEUP_CENTRE.playmaking) / 100;
  const steer = clampTo(creator * STEER_SCALE, STEER_CAP);
  if (steer === 0) return { profile, shift: 0 };

  const effScale = tuning?.efficiencyScale ?? EFFICIENCY_SCALE;
  const maxShift = tuning?.maxEffShift ?? MAX_EFF_SHIFT;
  const expectedPts = (ch: ShotChannel) => {
    const shift = clampTo(channelEdge(ch, offenseLineup, defenseLineup, centre) * effScale, maxShift);
    return (NBA_BASELINE[ch].efficiency + shift) * POINTS_PER_MAKE[ch];
  };
  const xp: Record<ShotChannel, number> = { rim: expectedPts('rim'), mid: expectedPts('mid'), three: expectedPts('three') };
  const channels: ShotChannel[] = ['rim', 'mid', 'three'];
  const best = channels.reduce((a, b) => (xp[b] > xp[a] ? b : a));
  const worst = channels.reduce((a, b) => (xp[b] < xp[a] ? b : a));
  if (best === worst) return { profile, shift: 0 };

  const shares: Record<ShotChannel, number> = { rim: profile.rim, mid: profile.mid, three: profile.per };
  // Positive steer: from worst to best. Negative: from best to worst. Never below 0.
  const from = steer > 0 ? worst : best;
  const to = steer > 0 ? best : worst;
  const moved = Math.min(Math.abs(steer), shares[from]);
  shares[from] -= moved;
  shares[to] += moved;
  const steered = { rim: shares.rim, mid: shares.mid, per: shares.three };
  return moved > 0 ? { profile: steered, steeredTo: to, shift: moved } : { profile: steered, shift: 0 };
}

/** Channel edge in rating points / 100 (EDGE_WEIGHT per side), clamped so the efficiency
 *  cap binds exactly at the clamp — the number resolvePossession scales into an efficiency shift. */
function channelEdge(
  channel: ShotChannel,
  offenseLineup: PlayerCardData[],
  defenseLineup: PlayerCardData[],
  centre: Record<ShotChannel, { off: number; def: number }>
): number {
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
  const w = EDGE_WEIGHT[channel];
  const edge = (w.off * (offRating - centre[channel].off) - w.def * (defRating - centre[channel].def)) / 100;
  // Clamp where the efficiency cap would bind anyway (MAX_EFF_SHIFT / EFFICIENCY_SCALE), so
  // the two caps coincide and a channel weight above 1 is not cut off early by a stale
  // ±0.25 (which was sized for unit weights).
  const cap = MAX_EFF_SHIFT / EFFICIENCY_SCALE;
  return Math.max(-cap, Math.min(cap, edge));
}

/** D6: chance the offence turns it over before getting a shot up. Exported for tests. */
export function turnoverChance(offenseLineup: PlayerCardData[], defenseLineup: PlayerCardData[]): number {
  const edge = ((lineupValue(offenseLineup, 'playmaking') - LINEUP_CENTRE.playmaking)
              - TURNOVER_DEF_WEIGHT * (lineupValue(defenseLineup, 'perimeterDefense') - LINEUP_CENTRE.perimeterDefense)) / 100;
  return Math.max(TURNOVER_MIN, Math.min(TURNOVER_MAX, TURNOVER_BASE - TURNOVER_SCALE * edge));
}

/** D6: chance a missed field goal is rebounded by the offence. Exported for tests. */
export function offensiveReboundChance(offenseLineup: PlayerCardData[], defenseLineup: PlayerCardData[]): number {
  const edge = (lineupValue(offenseLineup, 'rebounding') - lineupValue(defenseLineup, 'rebounding')) / 100;
  return Math.max(OREB_MIN, Math.min(OREB_MAX, OREB_BASE + OREB_SCALE * edge));
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

  // Step 2: channel edge from the five on the floor (engine_possession_model D1-D3):
  // standardised, aggregated per dimension (engine/lineup.ts), centred on CHANNEL_CENTRE.
  const clampedEdge = channelEdge(channel, offenseLineup, defenseLineup, centre);

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
    // D6: turnovers are rolled BEFORE the shot in playOnePossession (turnoverChance), so a
    // miss here is always a missed field goal — and a live ball for offensiveReboundChance.
    return { outcome: 'miss', points: 0, isAnd1: false, isTurnover: false, isCleanFieldGoal: false, channel, scorerId, narrativeHint: 'miss' };
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

export function weightedRandom<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function clampTo(v: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, v));
}

/** Called-offensive-play share deltas, applied to the team's baseline profile for this
 *  possession only, then renormalized. Each channel's delta is clamped to
 *  ±IDENTITY_CAPS.share before being applied. */
export function applyCalledShareShift(base: TeamShotProfile, mods: PlayCallModifiers): TeamShotProfile {
  let rim = base.rim + clampTo(mods.rimShare ?? 0, IDENTITY_CAPS.share);
  let mid = base.mid + clampTo(mods.midShare ?? 0, IDENTITY_CAPS.share);
  let per = base.per + clampTo(mods.threeShare ?? 0, IDENTITY_CAPS.share);
  rim = Math.max(0, rim); mid = Math.max(0, mid); per = Math.max(0, per);
  const sum = rim + mid + per;
  if (sum > 0) { rim /= sum; mid /= sum; per /= sum; }
  return { rim, mid, per };
}
