/**
 * These tests exercise the full headless simulation pipeline. The PPP band
 * (and possibly other bands) targets the INTENDED post-fix behaviour — see
 * docs/ROADMAP.md P0-1/P0-3/P1-1. They may fail until the parallel engine
 * fixes land; keep the assertions as specified rather than loosening them.
 */
import { describe, it, expect } from 'vitest';
import { simulateMany, ppp, loadPlayers, buildTestTeam } from './helpers';
import { calcPossessionShares, clampAnd1Chance, resolvePossession, simulateGame, type TeamInfo, type TeamShotProfile } from '@/engine/game';
import { AND1_CHANCE_CAP, CHANNEL_CENTRE, MAX_OT_PERIODS } from '@/engine/balance';
import { emptyModifiers } from '@/engine/synergies';
import { createRng } from '@/engine/rng';
import type { PlayerCardData, SeasonStat } from '@/engine/types';

describe('game simulation (200 headless games)', () => {
  // Seeded (2026-09-16): an unseeded fixture made the minutes floor a random flake (HANDOVER #5).
  const games = simulateMany(200, undefined, undefined, 20260916);

  it('produces no ties', () => {
    for (const g of games) {
      expect(g.finalScore[0]).not.toBe(g.finalScore[1]);
    }
  });

  it('keeps every finalScore entry within a plausible band (regulation 50-170, +15/OT period)', () => {
    // Team scores have sd ~16 around a ~114 mean, so a hard cap must leave room for the
    // 3-sigma tail over 400 samples; overtime periods add ~10-15 points each.
    for (const g of games) {
      const cap = 170 + 15 * g.overtimePeriods;
      for (const score of g.finalScore) {
        expect(score).toBeGreaterThanOrEqual(50);
        expect(score).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('quarterSummaries points sum to finalScore', () => {
    for (const g of games) {
      const homeSum = g.quarterSummaries.reduce((s, q) => s + q.homeScore, 0);
      const awaySum = g.quarterSummaries.reduce((s, q) => s + q.awayScore, 0);
      expect(homeSum).toBe(g.finalScore[0]);
      expect(awaySum).toBe(g.finalScore[1]);
    }
  });

  it('boxScore points per team sum to finalScore', () => {
    for (const g of games) {
      const homePts = g.boxScore.home.reduce((s, b) => s + b.points, 0);
      const awayPts = g.boxScore.away.reduce((s, b) => s + b.points, 0);
      expect(homePts).toBe(g.finalScore[0]);
      expect(awayPts).toBe(g.finalScore[1]);
    }
  });

  // T6 code review follow-up (2026-09-14): the 20-minute floor was calibrated for the old
  // quarter-phase rotation, where a starter's share was a deterministic pattern with no
  // variance. drawLineup makes each possession an independent weighted draw, so a
  // starter at the closest-OVR-gap tier (~0.58-0.62 share) now has real sampling
  // variance around that floor — 18 leaves headroom for that without losing the check's
  // purpose (catching a starter who's barely playing at all).
  // card_balance T1 (2026-09-16): bref-primary positions (D1) changed which cards fill
  // which depth-chart slots, so the same seed draws different rosters; this seeded
  // fixture then produced a starter at 17.4 minutes — a legitimate low-share starter,
  // not an engine bug (HANDOVER open issue 5's documented case). Per that issue's
  // guidance, lowered the floor to 16 rather than reseeding around it.
  it('every box-score starter has minutes between 16 and 48 (+5 per OT period)', () => {
    for (const g of games) {
      const starterIds = new Set([...g.homeTeam.starters, ...g.awayTeam.starters]);
      const allBox = [...g.boxScore.home, ...g.boxScore.away];
      const maxMinutes = 48 + 5 * g.overtimePeriods + 0.05; // OT periods are 5 minutes; tolerance for rounding
      for (const bs of allBox) {
        if (starterIds.has(bs.playerId)) {
          expect(bs.minutes).toBeGreaterThanOrEqual(16);
          expect(bs.minutes).toBeLessThanOrEqual(maxMinutes);
        }
      }
    }
  });

  it('keeps regulation possessions per team between 85 and 115 (+6 per OT period)', () => {
    for (const g of games) {
      const homePoss = g.possessions.filter((p) => p.team === 'home').length;
      const awayPoss = g.possessions.filter((p) => p.team === 'away').length;
      // Regulation is clamped to [85, 115] per team in calcPossessionSplit; each OT
      // period adds 5 ± 1 possessions per team on top.
      const cap = 115 + 6 * g.overtimePeriods;
      expect(homePoss).toBeGreaterThanOrEqual(85);
      expect(homePoss).toBeLessThanOrEqual(cap);
      expect(awayPoss).toBeGreaterThanOrEqual(85);
      expect(awayPoss).toBeLessThanOrEqual(cap);
    }
  });

  it('keeps PPP between 0.95 and 1.25', () => {
    const value = ppp(games);
    expect(value).toBeGreaterThanOrEqual(0.95);
    expect(value).toBeLessThanOrEqual(1.25);
  });

  // T6 code review (2026-09-14): the OT loop is now bounded (see MAX_OT_PERIODS) instead
  // of an unbounded `while (tied)` — a repeated-tie streak long enough to hit it is not
  // reachable with today's efficiencies, but the contract (never exceed the cap, never
  // ship a drawn game even if it's hit) should hold regardless.
  it('never exceeds MAX_OT_PERIODS', () => {
    for (const g of games) {
      expect(g.overtimePeriods).toBeLessThanOrEqual(MAX_OT_PERIODS);
    }
  });
});

// T6 code review follow-up (2026-09-14): calcPossessionShares computes a nuanced
// starter/backup split from the OVR gap, but the old quarter-phase rotation only read the
// starter's fraction (and only in Q1/Q3) — a backup's own share value, and its dependence
// on the OVR gap, never actually reached the box score. drawLineup fixes that: this test
// would have failed under the old rotation, which gave every backup an identical minutes
// pattern regardless of how big the gap was.
describe('calcPossessionShares drives real minutes (drawLineup)', () => {
  const minimalStats: SeasonStat = {
    gp: 70, mpg: 0, pts: 10, trb: 4, ast: 3, stl: 1, blk: 0.3, fga: 8, fg3a: 2, fta: 2,
    pct_fga_0_3: 0.3, pct_fga_3_10: 0.15, pct_fga_10_16: 0.1, pct_fga_16_3p: 0.1, pct_fga_3p: 0.35,
    fg_pct_0_3: 0.6, fg_pct_3_10: 0.4, fg_pct_10_16: 0.4, fg_pct_16_3p: 0.4, fg_pct_3p: 0.36,
    fg_pct: 0.46, fg3_pct: 0.36, fg2_pct: 0.5, ft_pct: 0.78, per: 15, ts: 0.55, vorp: 1, dbpm: 0, tov: 2,
  }; // mpg: 0 deliberately — keeps calcPossessionShares' MPG-blend branch inactive so
     // only the OVR-gap tier is under test.

  function makePlayer(id: string, pos: string, overall: number): PlayerCardData {
    return {
      type: 'Player', id,
      player: { id, name: id, position: pos, height: '6-6', weight: 210, age: 26, team: 'TST' },
      stats: minimalStats,
      awards: [],
      ratings: { overall, finishing: overall, midRange: overall, perimeter: overall, playmaking: overall, rebounding: overall, perimeterDefense: overall, postDefense: overall },
      traits: [],
      rarity: 'Common',
    };
  }

  /** One team: a PG starter/backup at the given OVR gap, single-player elsewhere so only
   *  the PG slot's minutes split is under test. */
  function buildTeam(seatId: string, pgStarterOvr: number, pgBackupOvr: number): TeamInfo {
    const pgStarter = makePlayer(`${seatId}-pg1`, 'PG', pgStarterOvr);
    const pgBackup = makePlayer(`${seatId}-pg2`, 'PG', pgBackupOvr);
    const others = ['SG', 'SF', 'PF', 'C'].map(pos => makePlayer(`${seatId}-${pos}`, pos, 75));
    const players = [pgStarter, pgBackup, ...others];
    const depthChart: Record<string, string[]> = { PG: [pgStarter.id, pgBackup.id] };
    others.forEach(p => { depthChart[p.player.position] = [p.id]; });
    return {
      seatId, name: seatId, players,
      starters: [pgStarter.id, ...others.map(p => p.id)],
      plays: [], depthChart,
    };
  }

  function pgMinutesRatio(team: TeamInfo, seed: number, n: number): number {
    const opponent = buildTeam('opp', 75, 75);
    let starterMin = 0, backupMin = 0;
    for (let i = 0; i < n; i++) {
      const g = simulateGame(team, opponent, { rng: createRng(seed + i) });
      const box = [...g.boxScore.home, ...g.boxScore.away];
      starterMin += box.find(b => b.playerId === `${team.seatId}-pg1`)?.minutes ?? 0;
      backupMin += box.find(b => b.playerId === `${team.seatId}-pg2`)?.minutes ?? 0;
    }
    return starterMin / (starterMin + backupMin);
  }

  it('computes a starter share that grows with the OVR gap (sanity on the input)', () => {
    const smallGap = buildTeam('small', 80, 78);
    const bigGap = buildTeam('big', 80, 55);
    const smallShare = calcPossessionShares(smallGap.depthChart, smallGap.players).get('small-pg1')!;
    const bigShare = calcPossessionShares(bigGap.depthChart, bigGap.players).get('big-pg1')!;
    expect(bigShare).toBeGreaterThan(smallShare);
  });

  it('a bigger OVR gap gives the starter meaningfully more actual on-court minutes', () => {
    const smallGap = buildTeam('small', 80, 78); // gap 2 -> ~0.62 starter share
    const bigGap = buildTeam('big', 80, 55);      // gap 25 -> ~0.80 starter share
    const smallRatio = pgMinutesRatio(smallGap, 1000, 60);
    const bigRatio = pgMinutesRatio(bigGap, 2000, 60);
    expect(bigRatio - smallRatio).toBeGreaterThan(0.10);
  });
});

// T2 (game_engine D4, 2026-09-14): home court used to be a complete no-op — the possession
// noise roll was symmetric for both sides. Identical rosters isolate the effect cleanly:
// any home-side edge here can only come from the asymmetric noise ranges.
describe('home court is a fairness-tuned coin flip (D4)', () => {
  it('home wins 52-56% with identical rosters over 3000 seeded games', () => {
    const team = buildTestTeam(loadPlayers().slice(0, 30));
    const n = 3000;
    let homeWins = 0;
    for (let i = 0; i < n; i++) {
      const g = simulateGame(team, team, { rng: createRng(5000 + i) });
      if (g.finalScore[0] > g.finalScore[1]) homeWins++;
    }
    const rate = homeWins / n;
    expect(rate).toBeGreaterThanOrEqual(0.52);
    expect(rate).toBeLessThanOrEqual(0.56);
  });
});

// T1 (game_engine D3, 2026-09-14): OT possessions used to skip play-calling entirely
// (resolvePossession was called directly with no offense/coverage roll at all) — this
// test would have failed before playOnePossession was shared between regulation and OT.
describe('OT rolls for called plays (D3)', () => {
  const minimalStats: SeasonStat = {
    gp: 70, mpg: 30, pts: 10, trb: 4, ast: 3, stl: 1, blk: 0.3, fga: 8, fg3a: 2, fta: 2,
    pct_fga_0_3: 0.3, pct_fga_3_10: 0.15, pct_fga_10_16: 0.1, pct_fga_16_3p: 0.1, pct_fga_3p: 0.35,
    fg_pct_0_3: 0.6, fg_pct_3_10: 0.4, fg_pct_10_16: 0.4, fg_pct_16_3p: 0.4, fg_pct_3p: 0.36,
    fg_pct: 0.46, fg3_pct: 0.36, fg2_pct: 0.5, ft_pct: 0.78, per: 15, ts: 0.55, vorp: 1, dbpm: 0, tov: 2,
  };

  function makePlayer(id: string, pos: string): PlayerCardData {
    return {
      type: 'Player', id,
      player: { id, name: id, position: pos, height: '6-6', weight: 210, age: 26, team: 'TST' },
      stats: minimalStats,
      awards: [],
      ratings: { overall: 75, finishing: 75, midRange: 75, perimeter: 75, playmaking: 75, rebounding: 75, perimeterDefense: 75, postDefense: 75 },
      traits: [],
      rarity: 'Common',
    };
  }

  /** A 5-man, no-bench team (so OT's starters-only lineup is the only possible lineup)
   *  with basic-offense/basic-defense staffed — both accept any player, so they're
   *  always active regardless of badges, isolating the play-calling roll itself. */
  function buildTeamWithPlays(seatId: string): TeamInfo {
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const players = positions.map(pos => makePlayer(`${seatId}-${pos}`, pos));
    const depthChart: Record<string, string[]> = {};
    positions.forEach((pos, i) => { depthChart[pos] = [players[i].id]; });
    return {
      seatId, name: seatId, players,
      starters: players.map(p => p.id),
      plays: [], depthChart,
      playAssignments: [
        { cardId: 'basic-offense-card', playId: 'basic-offense', roles: { featured: players[0].id } },
        { cardId: 'basic-defense-card', playId: 'basic-defense', roles: { featured: players[4].id } },
      ],
    };
  }

  it('logs calledPlays on OT possessions when a team reaches overtime', () => {
    const teamA = buildTeamWithPlays('a');
    const teamB = buildTeamWithPlays('b');
    const otPossessions = [];
    let otGamesFound = 0;

    // Identical teams tie at a modest rate; search enough seeds to gather a solid pool
    // of real OT possessions rather than relying on any single game reaching OT.
    for (let seed = 1; seed <= 1000 && otGamesFound < 30; seed++) {
      const g = simulateGame(teamA, teamB, { rng: createRng(seed) });
      if (!g.isOvertime) continue;
      otGamesFound++;
      otPossessions.push(...g.possessions.filter(p => p.quarter > 4));
    }

    expect(otGamesFound).toBeGreaterThan(0); // otherwise the test below proves nothing
    const otCalls = otPossessions.filter(p => (p.calledPlays?.length ?? 0) > 0);
    expect(otCalls.length).toBeGreaterThan(0);
  });
});

// T6 code review (2026-09-14): and1Chance used to be an unclamped sum (base + bonus) fed
// straight into a probability check — every other combined modifier in resolvePossession
// clamps to a sane range, this didn't. Not reachable with today's content (see
// AND1_CHANCE_CAP's comment in balance.ts), but the invariant should hold regardless.
describe('clampAnd1Chance', () => {
  it('passes through values within range unchanged', () => {
    expect(clampAnd1Chance(0.08, 0.02)).toBeCloseTo(0.10);
  });

  it('never returns negative', () => {
    expect(clampAnd1Chance(0.01, -0.5)).toBe(0);
  });

  it('never exceeds AND1_CHANCE_CAP, even with stacked bonuses beyond today\'s content', () => {
    expect(clampAnd1Chance(0.08, 10)).toBe(AND1_CHANCE_CAP);
  });
});

// T3 (game_engine D5, 2026-09-14): a rim "make" that draws a shooting foul is now two
// real free-throw rolls (RIM_FT_PCT) instead of a flat 1 point — the old flat value
// understated a real FT trip's ~1.5 expected points and was the single largest driver of
// PPP sitting well below NBA norms. That change surfaced a real bug: and-1 and assists
// were gated on `points >= 2`, which a made 2-for-2 FT trip would satisfy even though no
// field goal was made. Both are now gated on `isCleanFieldGoal` instead.
describe('rim free-throw trips are never and-1s or assisted (D5)', () => {
  const stats: SeasonStat = {
    gp: 70, mpg: 30, pts: 10, trb: 4, ast: 3, stl: 1, blk: 0.3, fga: 8, fg3a: 2, fta: 2,
    pct_fga_0_3: 0.3, pct_fga_3_10: 0.15, pct_fga_10_16: 0.1, pct_fga_16_3p: 0.1, pct_fga_3p: 0.35,
    fg_pct_0_3: 0.6, fg_pct_3_10: 0.4, fg_pct_10_16: 0.4, fg_pct_16_3p: 0.4, fg_pct_3p: 0.36,
    fg_pct: 0.46, fg3_pct: 0.36, fg2_pct: 0.5, ft_pct: 0.78, per: 15, ts: 0.55, vorp: 1, dbpm: 0, tov: 2,
  };
  function makePlayer(id: string): PlayerCardData {
    return {
      type: 'Player', id,
      player: { id, name: id, position: 'PG', height: '6-6', weight: 210, age: 26, team: 'TST' },
      stats, awards: [],
      ratings: { overall: 85, finishing: 85, midRange: 85, perimeter: 85, playmaking: 85, rebounding: 85, perimeterDefense: 85, postDefense: 85 },
      traits: [], rarity: 'Common',
    };
  }

  it('a made free-throw trip is never isAnd1 and never has an assistId', () => {
    const offense = Array.from({ length: 5 }, (_, i) => makePlayer(`off-${i}`));
    const defense = Array.from({ length: 5 }, (_, i) => makePlayer(`def-${i}`));
    // 100% rim share, high efficiency (clamped to 0.85 internally), and a large and1Bonus
    // (clamped to AND1_CHANCE_CAP internally) so both the FT-trip branch and a real
    // and-1 chance on clean makes are exercised often across the sample.
    const shotProfile: TeamShotProfile = { rim: 1, mid: 0, per: 0 };
    const offenseMods = { ...emptyModifiers(), and1Bonus: 1.0 };
    const rng = createRng(4242);

    let sawFtTrip = false;
    let sawCleanAnd1 = false;
    for (let i = 0; i < 3000; i++) {
      const result = resolvePossession(offense, defense, shotProfile, offenseMods, emptyModifiers(), CHANNEL_CENTRE, rng);
      if (!result.isCleanFieldGoal) {
        sawFtTrip = true;
        expect(result.isAnd1).toBe(false);
        expect(result.assistId).toBeUndefined();
      } else if (result.isAnd1) {
        sawCleanAnd1 = true;
      }
    }
    // Otherwise the assertions above never actually ran against a real case.
    expect(sawFtTrip).toBe(true);
    expect(sawCleanAnd1).toBe(true);
  });
});
