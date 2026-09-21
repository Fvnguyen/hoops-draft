/**
 * Possession resolution (plan render_and_engine_perf D6 — split out of game.ts):
 * playOnePossession and the play-call helpers it alone uses.
 */

import type { PlayerCardData } from './types';
import type { Rng } from './rng';
import { createRng } from './rng';
import type { GameModifiers } from './synergies';
import type { PlayStatus, ScaledPlay } from './playbook';
import type {
  ShotChannel, TeamInfo, PlayerBoxScore, PossessionEvent, PossessionNarrative,
  NarrativeKind, ShotAttempt, EdgeTuning,
} from './gameTypes';
import {
  IDENTITY_CAPS, OREB_MAX_CHAIN, STEER_NARRATE_MIN, BLOCK_SHARE_OF_MISSES, STEAL_SHARE_OF_TURNOVERS,
} from './balance';
import {
  weightedRandom, resolvePossession, calcLineupShotProfile, applyCalledShareShift,
  steerShotProfileDetailed, turnoverChance, offensiveReboundChance, clampTo,
} from './shot';
import { memoLineup } from './lineup';
import { closersOnly } from './rotation';

// ── Playbook call resolution (§7) ───────────────────────────────────────────
//
// A team's evaluated playbook (evaluatePlaybook) is fixed for the whole game. On each
// possession we roll independently for (a) the offense team's called play and (b) the
// defending team's coverage play, using the SAME rng stream as everything else so a
// seed reproduces an identical game. Both rolls are skipped entirely (no rng.next()
// call) when the side has zero active plays, so a roster with no assigned plays draws
// exactly as many random numbers as before this feature existed.

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

/**
 * T1 (game_engine D3, 2026-09-14): resolve one possession — roll for a called offensive
 * play and a coverage play, apply their on-call modifiers, resolve the shot, update the
 * box score, and build the PossessionEvent. Shared by regulation and OT so OT possessions
 * roll for plays/coverage "exactly like regulation possessions" (same budgets, same rng
 * stream) instead of duplicating this logic with OT quietly left out, as it was before.
 * The caller still owns score accumulation (needs `points` before it can fill in
 * `runningScore`) and pushing the returned event onto `allPossessions`.
 */
/** Interned on-court arrays, one map per side: both teams can field a player with the same
 *  id (a drafted star still plays for his real team in 82:0), and they are different cards. */
export interface LineupPool { home: Map<string, PlayerCardData[]>; away: Map<string, PlayerCardData[]> }

export function createLineupPool(): LineupPool {
  return { home: new Map(), away: new Map() };
}

/**
 * The five cards for `ids`, in that order. With a pool, the same ids return the SAME array
 * object every time, registered with `memoLineup`, so its lineup aggregates are computed
 * once per game instead of ~15 times per possession. Order is part of the key on purpose:
 * the aggregates are floating-point sums, and a different order could differ in the last bit.
 */
function playersOnFloor(pool: LineupPool | undefined, side: 'home' | 'away', team: TeamInfo, ids: string[]): PlayerCardData[] {
  const build = () => ids.map(id => team.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];
  if (!pool) return build();
  const key = ids.join('|');
  let lineup = pool[side].get(key);
  if (!lineup) {
    lineup = memoLineup(build());
    pool[side].set(key, lineup);
  }
  return lineup;
}

export function playOnePossession(params: {
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
  offenseScaled: ScaledPlay[];
  coverageScaled: ScaledPlay[];
  minutesPerPoss: number;
  isPossWin: boolean;
  /** D10: inside the crunch-time window (tag + flag only; the caller picks the closers). */
  isClutch?: boolean;
  rng: Rng;
  centre: Record<ShotChannel, { off: number; def: number }>;
  tuning?: EdgeTuning;
  boxStats: Map<string, PlayerBoxScore>;
  /** One interned player array per distinct lineup, for the whole game (D1). Optional so
   *  a direct caller without a pool gets fresh, unmemoized arrays, exactly as before. */
  lineupPool?: LineupPool;
  /** D2: `false` skips building the PossessionEvent (narrative, tags, called plays). Every
   *  rng draw and every box-score update happens BEFORE that point, so the score and the
   *  box score are the same either way; only `event` comes back null. Default true. */
  recordEvent?: boolean;
}): { event: PossessionEvent | null; points: number } {
  const {
    index, quarter, segment, team, offenseTeam, defenseTeam,
    offenseLineupMap, defenseLineupMap, offenseMods, defFromOpp,
    offenseScaled, coverageScaled, minutesPerPoss, isPossWin, isClutch, rng, centre, tuning, boxStats, lineupPool, recordEvent = true,
  } = params;
  const isHome = team === 'home';

  // D9: attribution draws (blocker / stealer / defensive rebounder) come from a rng
  // DERIVED from the game seed and the possession index, so the sim stream (`rng`) draws
  // exactly what it drew before the box score existed — outcomes and balance numbers are
  // untouched by anything in this function that reads `attrRng`.
  const attrRng = createRng((rng.seed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0);

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
    // D10: the bench never closes — inside the crunch-time window a play whose assigned
    // players would pull a non-starter onto the floor is not called (the roll still
    // happened, so the rng stream is unchanged).
    if (overridden && !(isClutch && !closersOnly(overridden, offenseTeam))) { offenseIds = Array.from(overridden.values()); calledOffense = rolledOffense; }
  }

  let calledCoverage: PlayStatus | undefined;
  const rolledCoverage = rollCalledPlay(rng, coverageScaled);
  if (rolledCoverage) {
    const overriddenDef = overrideLineupForPlay(defenseLineupMap, defenseTeam.depthChart, rolledCoverage.playerIds);
    if (overriddenDef && !(isClutch && !closersOnly(overriddenDef, defenseTeam))) { defenseIds = Array.from(overriddenDef.values()); calledCoverage = rolledCoverage; }
  }

  const offenseLineup = playersOnFloor(lineupPool, isHome ? 'home' : 'away', offenseTeam, offenseIds);
  const defenseLineup = playersOnFloor(lineupPool, isHome ? 'away' : 'home', defenseTeam, defenseIds);

  // Playbook on-call modifiers (§7): a called offensive play shifts this possession's
  // shot profile (renormalized) and adds to channel efficiency/and-1; a coverage play's
  // (negative) eff deltas add to the opponent's channel efficiency for this possession
  // only, same sign convention as defenseMods. The combined per-possession eff shift per
  // channel is clamped to ±IDENTITY_CAPS.eff and share shifts to ±IDENTITY_CAPS.share
  // (applyCalledShareShift does the share clamp).
  // D4/D6: profile from the five actually on the floor, then the called play's share
  // shift, then the creator steer toward this matchup's best shot.
  const baseShotProfile = calcLineupShotProfile(offenseLineup, offenseMods, defFromOpp);
  const calledProfile = calledOffense ? applyCalledShareShift(baseShotProfile, calledOffense.def.mods) : baseShotProfile;
  const steered = steerShotProfileDetailed(calledProfile, offenseLineup, defenseLineup, centre, tuning);
  const shotProfile = steered.profile;

  const rimEffDelta = clampTo((calledOffense?.def.mods.rimEff ?? 0) + (calledCoverage?.def.mods.rimEff ?? 0), IDENTITY_CAPS.eff);
  const midEffDelta = clampTo((calledOffense?.def.mods.midEff ?? 0) + (calledCoverage?.def.mods.midEff ?? 0), IDENTITY_CAPS.eff);
  const threeEffDelta = clampTo((calledOffense?.def.mods.threeEff ?? 0) + (calledCoverage?.def.mods.threeEff ?? 0), IDENTITY_CAPS.eff);
  const and1Delta = clampTo(calledOffense?.def.mods.and1 ?? 0, IDENTITY_CAPS.and1);

  const possessionOffenseMods: GameModifiers = (rimEffDelta || midEffDelta || threeEffDelta || and1Delta)
    ? { ...offenseMods, rimEffBonus: offenseMods.rimEffBonus + rimEffDelta, midEffBonus: offenseMods.midEffBonus + midEffDelta, perEffBonus: offenseMods.perEffBonus + threeEffDelta, and1Bonus: offenseMods.and1Bonus + and1Delta }
    : offenseMods;

  const boostedIds = calledOffense ? new Set(calledOffense.playerIds) : undefined;

  // D6 step 1: turnover before the shot. The ball-handler charged is drawn by playmaking
  // (attribution only, like the scorer pick).
  type Resolved = ReturnType<typeof resolvePossession>;
  let result: Resolved;
  let turnoverPlayerId: string | undefined;
  const offensiveRebounders: string[] = [];
  // D9: every field-goal attempt in order. A rim_ft trip is a shooting foul on the drive —
  // no FGA (2 FTA instead), so it is NOT a ShotAttempt.
  const shots: ShotAttempt[] = [];
  const recordShot = (r: Resolved) => {
    if (r.isTurnover || r.narrativeHint === 'rim_ft') return;
    shots.push({ shooterId: r.scorerId ?? offenseIds[0] ?? '', channel: r.channel, made: r.outcome !== 'miss' });
  };
  if (rng.next() < turnoverChance(offenseLineup, defenseLineup)) {
    const handler = weightedRandom(offenseLineup, offenseLineup.map(p => (p.ratings?.playmaking ?? 0) + 1), rng);
    turnoverPlayerId = handler?.id;
    result = { outcome: 'miss', points: 0, isAnd1: false, isTurnover: true, isCleanFieldGoal: false, channel: 'rim', scorerId: turnoverPlayerId, narrativeHint: 'turnover' };
  } else {
    // Steps 2-5: shoot; a missed field goal may be rebounded and shot again.
    result = resolvePossession(offenseLineup, defenseLineup, shotProfile, possessionOffenseMods, defFromOpp, centre, rng, boostedIds, tuning);
    recordShot(result);
    let chain = 0;
    while (result.outcome === 'miss' && chain < OREB_MAX_CHAIN && rng.next() < offensiveReboundChance(offenseLineup, defenseLineup)) {
      const rebounder = weightedRandom(offenseLineup, offenseLineup.map(p => (p.ratings?.rebounding ?? 0) + 1), rng);
      if (rebounder) offensiveRebounders.push(rebounder.id);
      chain++;
      result = resolvePossession(offenseLineup, defenseLineup, shotProfile, possessionOffenseMods, defFromOpp, centre, rng, boostedIds, tuning);
      recordShot(result);
    }
  }

  // ── D9 attribution (attrRng only — see the comment at the top of this function) ──
  // Blocks: a share of misses is labelled a block, credited by post defence at the rim and
  // perimeter defence elsewhere. Steals: a share of turnovers, credited by perimeter
  // defence. Defensive rebound: a possession that ends on a missed FGA (never a turnover
  // or a FT trip) credits a board, weighted by rebounding.
  const defWeights = (dim: 'postDefense' | 'perimeterDefense' | 'rebounding') =>
    defenseLineup.map(p => (p.ratings?.[dim] ?? 0) + 1);
  for (const shot of shots) {
    if (shot.made || defenseLineup.length === 0) continue;
    if (attrRng.next() < BLOCK_SHARE_OF_MISSES) {
      shot.blockerId = weightedRandom(defenseLineup, defWeights(shot.channel === 'rim' ? 'postDefense' : 'perimeterDefense'), attrRng)?.id;
    }
  }
  let stealPlayerId: string | undefined;
  if (result.isTurnover && defenseLineup.length > 0 && attrRng.next() < STEAL_SHARE_OF_TURNOVERS) {
    stealPlayerId = weightedRandom(defenseLineup, defWeights('perimeterDefense'), attrRng)?.id;
  }
  let defensiveRebounderId: string | undefined;
  // The miss that ended the possession, if it ended on one (a rim_ft trip after an
  // earlier miss ends at the line — no board, no block on the narrative).
  const endingMiss = result.outcome === 'miss' && shots.length ? shots[shots.length - 1] : undefined;
  if (endingMiss && !endingMiss.made && defenseLineup.length > 0) {
    defensiveRebounderId = weightedRandom(defenseLineup, defWeights('rebounding'), attrRng)?.id;
  }
  // Free throws: a rim_ft trip is two attempts with `points` made; an and-1 is 1-for-1.
  const ftAttempted = result.narrativeHint === 'rim_ft' ? 2 : result.isAnd1 ? 1 : 0;
  const ftMade = result.narrativeHint === 'rim_ft' ? result.points : result.isAnd1 ? 1 : 0;

  // Update box score. P2-2: minutes accrue per possession a player is on court for,
  // whether on offense OR defense.
  //
  // `boxStats` is keyed by SIDE + player id, not player id alone: the same card can be on
  // both rosters at once (challenge mode plays real NBA teams, so a drafted Luka faces
  // Lakers Luka). Keyed by id alone the two merged into one row that was then emitted on
  // the home side only — the away team silently lost the player entirely and the two box
  // scores stopped summing to the final score.
  const offKey = (id: string) => `${team}:${id}`;
  const defKey = (id: string) => `${isHome ? 'away' : 'home'}:${id}`;

  for (const id of offenseIds) {
    const bs = boxStats.get(offKey(id));
    if (bs) { bs.possessions++; bs.minutes += minutesPerPoss; }
  }
  for (const id of defenseIds) {
    const bs = boxStats.get(defKey(id));
    if (bs) { bs.minutes += minutesPerPoss; }
  }
  if (result.scorerId && result.points > 0) {
    const bs = boxStats.get(offKey(result.scorerId));
    if (bs) {
      bs.points += result.points;
      // isCleanFieldGoal guard: a made rim free-throw trip (2-for-2) is 2 points but
      // not a made field goal — counting it as a two-pointer would misattribute it.
      if (result.isCleanFieldGoal && (result.channel === 'rim' || result.channel === 'mid') && result.points >= 2) bs.twoPointers++;
      if (result.channel === 'three') bs.threePointers++;
      if (result.isAnd1) bs.andOnes++;
    }
  }
  if (turnoverPlayerId) {
    const bs = boxStats.get(offKey(turnoverPlayerId));
    if (bs) bs.turnovers++;
  }
  for (const id of offensiveRebounders) {
    const bs = boxStats.get(offKey(id));
    if (bs) bs.offensiveRebounds++;
  }
  if (result.assistId && result.points > 0) {
    const bs = boxStats.get(offKey(result.assistId));
    if (bs) bs.assists++;
  }
  // D9 shooting / defensive columns.
  for (const shot of shots) {
    const bs = boxStats.get(offKey(shot.shooterId));
    if (bs) {
      bs.fieldGoalsAttempted++;
      if (shot.made) bs.fieldGoalsMade++;
      if (shot.channel === 'three') { bs.threesAttempted++; if (shot.made) bs.threesMade++; }
    }
    if (shot.blockerId) { const b = boxStats.get(defKey(shot.blockerId)); if (b) b.blocks++; }
  }
  if (ftAttempted > 0 && result.scorerId) {
    const bs = boxStats.get(offKey(result.scorerId));
    if (bs) { bs.freeThrowsAttempted += ftAttempted; bs.freeThrowsMade += ftMade; }
  }
  if (stealPlayerId) { const bs = boxStats.get(defKey(stealPlayerId)); if (bs) bs.steals++; }
  if (defensiveRebounderId) { const bs = boxStats.get(defKey(defensiveRebounderId)); if (bs) bs.defensiveRebounds++; }
  if (result.points > 0) {
    for (const id of offenseIds) { const bs = boxStats.get(offKey(id)); if (bs) bs.plusMinus += result.points; }
    for (const id of defenseIds) { const bs = boxStats.get(defKey(id)); if (bs) bs.plusMinus -= result.points; }
  }

  // D2: everything below only DESCRIBES the possession. The 82:0 challenge simulates 82
  // games (and 41 more for the ghost) for their scores and box scores alone, and used to
  // build and throw away ~110 KB of events per game.
  if (!recordEvent) return { event: null, points: result.points };

  // Playbook recording (§7): tag this possession with whichever calls applied.
  const calledPlays: PossessionEvent['calledPlays'] = [];
  if (calledOffense) calledPlays.push({ playId: calledOffense.def.playId, name: calledOffense.def.name, side: 'offense', teamSide: team });
  if (calledCoverage) calledPlays.push({ playId: calledCoverage.def.playId, name: calledCoverage.def.name, side: 'defense', teamSide: isHome ? 'away' : 'home' });

  const outcomeForEvent = result.outcome === 'miss' ? 'miss' as const
    : result.channel === 'three' ? '3pt' as const
    : result.isAnd1 ? 'and1' as const
    : '2pt' as const;

  // D1 structured narrative. `kind` follows the possession model: a turnover happens
  // before any shot (steal = turnover with a credited defender); a miss is the LAST shot
  // (block = credited blocker on it); makes reuse the resolve hint. Tags (small, documented
  // set): 'second_chance' (a shot after an offensive rebound), 'clutch' (D10 window),
  // 'poss_win' (possession-battle extra possession).
  const kind: NarrativeKind = result.isTurnover
    ? (stealPlayerId ? 'steal' : 'turnover')
    : result.outcome === 'miss'
      ? (endingMiss?.blockerId ? 'block' : 'miss')
      : (result.narrativeHint as NarrativeKind);
  const isSecondChance = offensiveRebounders.length > 0;
  const tags: string[] = [];
  if (isSecondChance) tags.push('second_chance');
  if (isPossWin) tags.push('poss_win');
  if (isClutch) tags.push('clutch');
  const narrative: PossessionNarrative = {
    kind,
    ...(result.isTurnover ? {} : { channel: result.channel }),
    actorId: result.scorerId ?? turnoverPlayerId ?? offenseIds[0] ?? '',
    ...(result.assistId ? { assistId: result.assistId } : {}),
    ...((stealPlayerId ?? endingMiss?.blockerId ?? defensiveRebounderId)
      ? { defenderId: stealPlayerId ?? endingMiss?.blockerId ?? defensiveRebounderId } : {}),
    ...(calledOffense ? { calledPlayId: calledOffense.def.playId } : {}),
    ...(calledCoverage ? { coverageId: calledCoverage.def.playId } : {}),
    isAnd1: result.isAnd1,
    isPossessionWin: isPossWin,
    isSecondChance,
    ...(steered.steeredTo && steered.shift >= STEER_NARRATE_MIN ? { steeredTo: steered.steeredTo } : {}),
    ftMade,
    ftAttempted,
    tags,
  };

  const event: PossessionEvent = {
    index, quarter, segment, team,
    lineupOnCourt: offenseIds,
    defenseOnCourt: defenseIds,
    outcome: outcomeForEvent,
    scoringPlayerId: result.scorerId,
    assistPlayerId: result.assistId,
    isPossessionWinEvent: isPossWin || undefined,
    ...(isClutch ? { isClutch: true } : {}),
    turnoverPlayerId,
    offensiveRebounders: offensiveRebounders.length ? offensiveRebounders : undefined,
    narrative,
    shots,
    ...(stealPlayerId ? { stealPlayerId } : {}),
    ...(defensiveRebounderId ? { defensiveRebounderId } : {}),
    runningScore: [0, 0], // filled in by the caller once it's updated home/awayScore
    calledPlays,
  };

  return { event, points: result.points };
}
