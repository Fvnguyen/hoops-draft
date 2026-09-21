/**
 * Game Simulation Engine
 *
 * Pre-computes a full game into a GameTheater object that the UI plays back.
 *
 * Layers:
 *   1. Rotation — per-possession lineup draws from each position's possession shares
 *   2. Possession count — base pace plus pace noise and identity/play swing. There is no
 *      pre-game "possession battle" (engine_possession_model D6): playmaking, rebounding
 *      and defence are settled inside each possession (turnover, steer, offensive rebound)
 *   3. Scoring — lineup offence vs lineup defence per possession, per shot channel
 *   4. Identity bonuses and called plays applied as modifiers
 *
 * Every random draw in this file goes through the injected `Rng` (mulberry32,
 * see rng.ts) instead of `Math.random()` directly, so a game is fully
 * reproducible from `{ seed }` — see `simulateGame`'s `opts.rng`.
 *
 * plan render_and_engine_perf D6: this file used to hold every layer above end to end;
 * it now keeps only `simulateGame`/`distributeQuarters` (the orchestration) and
 * re-exports the full public API from the modules that hold each layer — gameTypes.ts
 * (interfaces), rotation.ts, shot.ts, possession.ts, boxscore.ts, teamInfo.ts — so no
 * importer anywhere needs to change its `@/engine/game` import path.
 */

import type {
  TeamInfo, GameTheater, PossessionEvent, QuarterSummary, PlayerBoxScore, SimulateGameOptions,
} from './gameTypes';
import { Rng, createRng, randomSeed } from './rng';
import { calcTeamBonuses } from './synergies';
import { evaluatePlaybook, scaledPlayAllocations, playbookPossessionSwing } from './playbook';
import {
  CHANNEL_CENTRE, IDENTITY_CAPS, MAX_OT_PERIODS, OT_POSS_PER_TEAM, OT_PERIOD_MINUTES,
  CLUTCH_WINDOW_POSS, CLUTCH_MARGIN,
} from './balance';
import { calcPossessionShares, prepareLineupDraw, drawPreparedLineup, segmentForQuarter, starterLineupMap } from './rotation';
import { calcPossessionSplit, clampTo } from './shot';
import { playOnePossession, createLineupPool } from './possession';
import { emptyBoxScore } from './boxscore';

// ── Public API re-exports (plan render_and_engine_perf D6) ─────────────────
//
// Every symbol below was importable from '@/engine/game' before the split into
// gameTypes/rotation/shot/possession/boxscore/teamInfo and must stay importable from
// here, unchanged. Symbols that only became module-level exports FOR the split (e.g.
// drawLineup, weightedRandom, playOnePossession) are deliberately NOT re-exported here.

export * from './gameTypes';
export { calcPossessionShares } from './rotation';
export {
  calcLineupShotProfile, steerShotProfile, steerShotProfileDetailed,
  turnoverChance, offensiveReboundChance, resolvePossession, clampAnd1Chance,
} from './shot';
export { buildTeamInfo } from './teamInfo';
export { emptyBoxScore, boxScoreThrough } from './boxscore';

// ── Main Simulation ────────────────────────────────────────────────────────

export function simulateGame(
  homeTeam: TeamInfo,
  awayTeam: TeamInfo,
  opts?: SimulateGameOptions
): GameTheater {
  const rng = opts?.rng ?? createRng(randomSeed());
  const centre = opts?.centre ?? CHANNEL_CENTRE;
  const tuning = opts?.tuning;

  // 1. Calculate possession shares
  const homeShares = calcPossessionShares(homeTeam.depthChart, homeTeam.players);
  const awayShares = calcPossessionShares(awayTeam.depthChart, awayTeam.players);
  // D1: positions and weights are fixed for the game; only the draw itself is per possession.
  const homeDraw = prepareLineupDraw(homeTeam.depthChart, homeShares);
  const awayDraw = prepareLineupDraw(awayTeam.depthChart, awayShares);

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

  // 3. Possession counts (pace noise + play/identity swing; no possession battle — D6)
  // Minutes are credited per on-court possession (offense and defense), scaled to
  // the actual game length: a player on court for every possession gets exactly 48.
  const split = calcPossessionSplit(homeBonuses, awayBonuses, rng);
  // T6 code review: this used to be declared with a throwaway 0.24 initializer above the
  // split, always overwritten below before any read — dead value, removed.
  const REG_MIN_PER_POSS = 48 / split.totalPoss;

  // 4. Distribute possessions across 4 quarters with noise
  const quarterPoss = distributeQuarters(split.homePoss, split.awayPoss, rng);

  // 5. Simulate possessions, drawing each possession's lineup fresh (see drawLineup)
  const allPossessions: PossessionEvent[] = [];
  const quarterSummaries: QuarterSummary[] = [];

  let homeScore = 0, awayScore = 0;
  let possIndex = 0;

  // Box score tracking
  // Keyed 'home:<id>' / 'away:<id>' — see the note in the possession box-score block: the
  // same card can be on both rosters (challenge mode plays the real NBA teams).
  const boxStats = new Map<string, PlayerBoxScore>();
  // D1: one interned player array per distinct lineup, for this game only, so the lineup
  // aggregates are computed once per lineup instead of ~15 times per possession.
  const lineupPool = createLineupPool();
  for (const p of homeTeam.players) boxStats.set(`home:${p.id}`, emptyBoxScore(p.id, p.player?.name || p.id));
  for (const p of awayTeam.players) boxStats.set(`away:${p.id}`, emptyBoxScore(p.id, p.player?.name || p.id));

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
    // D10 crunch time (Q4 only in regulation; OT has its own loop below).
    let clutchChecked = false;
    let closers = false;

    while (homeIdx < homeQ || awayIdx < awayQ) {
      let team: 'home' | 'away';

      if (homeIdx >= homeQ) { team = 'away'; }
      else if (awayIdx >= awayQ) { team = 'home'; }
      else { team = isHomeTurn ? 'home' : 'away'; isHomeTurn = !isHomeTurn; }

      const isHome = team === 'home';
      if (quarter === 4 && !clutchChecked) {
        const left = isHome ? homeQ - homeIdx : awayQ - awayIdx;
        if (left <= CLUTCH_WINDOW_POSS) {
          clutchChecked = true;
          closers = Math.abs(homeScore - awayScore) <= CLUTCH_MARGIN;
        }
      }
      const offenseTeam = isHome ? homeTeam : awayTeam;
      const defenseTeam = isHome ? awayTeam : homeTeam;
      const offenseDraw = isHome ? homeDraw : awayDraw;
      const defenseDraw = isHome ? awayDraw : homeDraw;
      const offenseMods = isHome ? homeBonuses.offenseMods : awayBonuses.offenseMods;
      const defFromOpp = isHome ? awayBonuses.defenseMods : homeBonuses.defenseMods;
      const offenseScaled = isHome ? homeOffenseScaled : awayOffenseScaled;
      const coverageScaled = isHome ? awayDefenseScaled : homeDefenseScaled;

      // Check if this is a possession-winning event
      let isPossWin = false;
      if (isHome && homeExtraPoss > 0 && rng.next() < homeExtraPoss / (homeQ - homeIdx)) {
        isPossWin = true; homeExtraPoss--;
      } else if (!isHome && awayExtraPoss > 0 && rng.next() < awayExtraPoss / (awayQ - awayIdx)) {
        isPossWin = true; awayExtraPoss--;
      }

      // Fresh per-possession lineup draw, weighted by each roster's possession shares
      // (see drawLineup) — replaces the old precomputed quarter-phase rotation timeline.
      // D10: inside the crunch-time window both teams put their closing five on instead
      // (no weighted draw at all — the bench never closes).
      const { event, points } = playOnePossession({
        index: possIndex, quarter, segment, team,
        offenseTeam, defenseTeam,
        offenseLineupMap: closers ? starterLineupMap(offenseTeam.depthChart) : drawPreparedLineup(offenseDraw, rng),
        defenseLineupMap: closers ? starterLineupMap(defenseTeam.depthChart) : drawPreparedLineup(defenseDraw, rng),
        offenseMods, defFromOpp, offenseScaled, coverageScaled,
        minutesPerPoss: REG_MIN_PER_POSS, isPossWin, isClutch: closers, rng, centre, tuning, boxStats, lineupPool,
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
    // D10: OT already closes with starters; the window still flags isClutch for the UI.
    let otClutchChecked = false;
    let otClutch = false;

    while (homeOTIdx < homeOTPoss || awayOTIdx < awayOTPoss) {
      let team: 'home' | 'away';
      if (homeOTIdx >= homeOTPoss) team = 'away';
      else if (awayOTIdx >= awayOTPoss) team = 'home';
      else { team = otHomeTurn ? 'home' : 'away'; otHomeTurn = !otHomeTurn; }

      const isHome = team === 'home';
      if (!otClutchChecked) {
        const left = isHome ? homeOTPoss - homeOTIdx : awayOTPoss - awayOTIdx;
        if (left <= CLUTCH_WINDOW_POSS) {
          otClutchChecked = true;
          otClutch = Math.abs(homeScore - awayScore) <= CLUTCH_MARGIN;
        }
      }
      const offenseTeam = isHome ? homeTeam : awayTeam;
      const defenseTeam = isHome ? awayTeam : homeTeam;
      const offenseMods = isHome ? homeBonuses.offenseMods : awayBonuses.offenseMods;
      const defFromOpp = isHome ? awayBonuses.defenseMods : homeBonuses.defenseMods;
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
        offenseMods, defFromOpp, offenseScaled, coverageScaled,
        minutesPerPoss: OT_MIN_PER_POSS, isPossWin: false, isClutch: otClutch, rng, centre, tuning, boxStats, lineupPool,
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
    const recipientBox = recipientId ? boxStats.get(`${homeWins ? 'home' : 'away'}:${recipientId}`) : undefined;
    if (recipientBox) recipientBox.points += 1;
  }

  // Round minutes
  for (const bs of boxStats.values()) {
    bs.minutes = Math.round(bs.minutes * 10) / 10;
  }

  // Split box scores by the key's side, not by roster membership: a player on BOTH teams
  // passes a `homeIds.has(...)` test on either side, which used to drop him from the away
  // box entirely and fold his away stats into his home row.
  const boxFor = (side: 'home' | 'away') => Array.from(boxStats.entries())
    .filter(([key]) => key.startsWith(`${side}:`))
    .map(([, bs]) => bs)
    .sort((a, b) => b.points - a.points);
  const homeBox = boxFor('home');
  const awayBox = boxFor('away');

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
