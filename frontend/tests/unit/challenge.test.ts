/**
 * 82:0 Challenge engine (plan_challenge_mode T2 — D3, D4, D6, D7, D9).
 *
 * Exercises the real card pool and the real play catalog, no fixtures: the whole point
 * of the mode is that the 30 opponents come out of the same data the draft does.
 */

import { describe, it, expect } from 'vitest';
import {
  NBA_TEAMS, buildNbaTeamRoster, buildNbaTeams, buildChallengeSchedule, challengeGameSeed,
  CHALLENGE_GRADES, gradeForWins, simulateHalf, halfRange, drawTradeOffers, mergePlayerTotals,
} from '@/engine/challenge';
import { CHALLENGE_GAMES, TARGET_ROSTER, TRADE_OFFERS } from '@/engine/balance';
import { DEPTH_COLUMNS } from '@/engine/positions';
import { PLAY_CATALOG } from '@/engine/plays';
import { createRng } from '@/engine/rng';
import { loadPlayers, runHeadlessDraft, buildTeams } from './helpers';
import type { Rarity } from '@/engine/types';

const players = loadPlayers();

describe('NBA opponents (D3)', () => {
  const rosters = NBA_TEAMS.map((t) => ({ abbr: t.abbr, seat: buildNbaTeamRoster(players, t.abbr) }));

  it('builds 30 distinct teams', () => {
    expect(NBA_TEAMS).toHaveLength(30);
    expect(new Set(NBA_TEAMS.map((t) => t.abbr)).size).toBe(30);
  });

  it('every abbreviation matches real cards in the pool', () => {
    for (const t of NBA_TEAMS) {
      expect(players.filter((p) => p.player.team === t.abbr).length).toBeGreaterThan(0);
    }
  });

  it('gives every team 12 active players with no empty depth-chart slot', () => {
    for (const { abbr, seat } of rosters) {
      const chart = seat.builtRoster.depthChart;
      const active = DEPTH_COLUMNS.reduce((s, col) => s + (chart[col] ?? []).length, 0);
      expect(active, `${abbr} active count`).toBe(TARGET_ROSTER);
      for (const col of DEPTH_COLUMNS) {
        expect((chart[col] ?? []).length, `${abbr} ${col}`).toBeGreaterThan(0);
      }
    }
  });

  it('never lists the same player twice', () => {
    for (const { abbr, seat } of rosters) {
      const ids = DEPTH_COLUMNS.flatMap((col) => seat.builtRoster.depthChart[col] ?? []);
      expect(new Set(ids).size, `${abbr} duplicates`).toBe(ids.length);
    }
  });

  it('staffs three plays from the full catalog and assigns only active players', () => {
    for (const { abbr, seat } of rosters) {
      const active = new Set(DEPTH_COLUMNS.flatMap((col) => seat.builtRoster.depthChart[col] ?? []));
      expect(seat.builtRoster.activePlays, `${abbr} plays`).toHaveLength(3);
      for (const id of seat.builtRoster.activePlays) {
        expect(PLAY_CATALOG.some((p) => p.id === id), `${abbr} play ${id} in catalog`).toBe(true);
      }
      for (const assignment of seat.builtRoster.playAssignments ?? []) {
        for (const playerId of Object.values(assignment.roles)) {
          expect(active.has(playerId), `${abbr} role player ${playerId} is active`).toBe(true);
        }
      }
    }
  });

  it('is deterministic — the same abbreviation builds the same roster every time', () => {
    for (const t of NBA_TEAMS.slice(0, 5)) {
      const a = buildNbaTeamRoster(players, t.abbr);
      const b = buildNbaTeamRoster(players, t.abbr);
      expect(b.builtRoster.depthChart).toEqual(a.builtRoster.depthChart);
      expect(b.builtRoster.activePlays).toEqual(a.builtRoster.activePlays);
    }
  });
});

describe("opponents never field the user's own players", () => {
  // simulateGame keys its box score by player id in ONE map for both sides, so a card on
  // both rosters merges into a single row emitted into BOTH box scores and the totals stop
  // reconciling with the final score. Measured before the fix: 13 of 41 games off, one by
  // 32 points. buildNbaTeams holds the user's ids out, which removes it at the source.
  const team = buildTeams(runHeadlessDraft(players, PLAY_CATALOG, 20260917))[0];
  const userIds = new Set(team.players.map((p) => p.id));
  const opponents = buildNbaTeams(players, PLAY_CATALOG, userIds);

  it('excludes every card the user owns, and still fields 12 with no empty slot', () => {
    for (const [abbr, t] of opponents) {
      expect(t.players.filter((p) => userIds.has(p.id)), `${abbr} shares a player`).toEqual([]);
      const active = DEPTH_COLUMNS.reduce((s, col) => s + (t.depthChart[col] ?? []).length, 0);
      expect(active, `${abbr} active count`).toBe(TARGET_ROSTER);
      for (const col of DEPTH_COLUMNS) expect((t.depthChart[col] ?? []).length, `${abbr} ${col}`).toBeGreaterThan(0);
    }
  });

  it("both teams' box scores reconcile with the final scores across a half", () => {
    const schedule = buildChallengeSchedule(555);
    const h = simulateHalf(team, opponents, schedule, 1, 555);
    const userBox = h.playerTotals.reduce((s, t) => s + t.points, 0);
    const userFinal = h.games.reduce((s, g) => s + g.score[0], 0);
    const oppFinal = h.games.reduce((s, g) => s + g.score[1], 0);
    expect(userBox).toBe(userFinal);
    expect(h.opponentTotals.points).toBe(oppFinal);
  });
});

describe('schedule and seeds (D4)', () => {
  const schedule = buildChallengeSchedule(1234);

  it('is 82 games with every team faced 2 or 3 times', () => {
    expect(schedule).toHaveLength(CHALLENGE_GAMES);
    const counts = new Map<string, number>();
    for (const e of schedule) counts.set(e.opponent, (counts.get(e.opponent) ?? 0) + 1);
    expect(counts.size).toBe(30);
    for (const [abbr, n] of counts) {
      expect(n, `${abbr} appearances`).toBeGreaterThanOrEqual(2);
      expect(n, `${abbr} appearances`).toBeLessThanOrEqual(3);
    }
  });

  it('puts the user at home on even indices, 41 each way', () => {
    expect(schedule.filter((e) => e.isHome)).toHaveLength(41);
    expect(schedule.every((e) => e.isHome === (e.index % 2 === 0))).toBe(true);
  });

  it('same run seed = same schedule, different seed = different order', () => {
    expect(buildChallengeSchedule(1234)).toEqual(schedule);
    expect(buildChallengeSchedule(99)).not.toEqual(schedule);
  });

  it('derives a distinct, order-independent seed per game', () => {
    const seeds = Array.from({ length: CHALLENGE_GAMES }, (_, i) => challengeGameSeed(1234, i));
    expect(new Set(seeds).size).toBe(CHALLENGE_GAMES);
    // Asking for game 60 first must not change what game 3's seed is.
    expect(challengeGameSeed(1234, 3)).toBe(seeds[3]);
    expect(challengeGameSeed(99, 3)).not.toBe(seeds[3]);
  });

  it('splits into two halves of 41 that cover every game exactly once', () => {
    expect(halfRange(1)).toEqual({ start: 0, end: 41 });
    expect(halfRange(2)).toEqual({ start: 41, end: 82 });
  });
});

describe('grades (D6)', () => {
  it('covers 0..82 with no gap and no overlap', () => {
    const seen = new Map<number, string[]>();
    for (let w = 0; w <= CHALLENGE_GAMES; w++) {
      const hits = CHALLENGE_GRADES.filter((g) => w >= g.min && w <= g.max).map((g) => g.grade);
      seen.set(w, hits);
      expect(hits, `wins ${w}`).toHaveLength(1);
    }
    expect(gradeForWins(82).grade).toBe('S+');
    expect(gradeForWins(80).grade).toBe('S');
    expect(gradeForWins(72).grade).toBe('A+');
    expect(gradeForWins(50).grade).toBe('C-');
    expect(gradeForWins(0).grade).toBe('F');
  });

  it('clamps out-of-range input rather than returning undefined', () => {
    expect(gradeForWins(-5).grade).toBe('F');
    expect(gradeForWins(200).grade).toBe('S+');
  });
});

describe('simulateHalf (D7)', () => {
  const team = buildTeams(runHeadlessDraft(players, PLAY_CATALOG, 20260917))[0];
  // Built the way the product builds them: the user's own cards held out (see the
  // box-score collision above), which is also what makes the totals reconcile.
  const opponents = buildNbaTeams(players, PLAY_CATALOG, new Set(team.players.map((p) => p.id)));
  const runSeed = 555;
  const schedule = buildChallengeSchedule(runSeed);
  const first = simulateHalf(team, opponents, schedule, 1, runSeed);
  const second = simulateHalf(team, opponents, schedule, 2, runSeed);

  it('plays 41 games per half and reports a W/L string matching them', () => {
    for (const half of [first, second]) {
      expect(half.games).toHaveLength(41);
      expect(half.results).toHaveLength(41);
      expect(half.wins + half.losses).toBe(41);
      expect(half.results).toBe(half.games.map((g) => (g.won ? 'W' : 'L')).join(''));
      expect(half.results).toMatch(/^[WL]+$/);
    }
  });

  it('records a real score and a top performer for every game', () => {
    for (const g of [...first.games, ...second.games]) {
      expect(g.score[0]).toBeGreaterThan(50);
      expect(g.score[1]).toBeGreaterThan(50);
      expect(g.score[0] === g.score[1]).toBe(false);
      expect(g.won).toBe(g.score[0] > g.score[1]);
      expect(g.topPerformer.playerName).not.toBe('');
    }
  });

  it('same seed and roster = same results regardless of call order (D4)', () => {
    // Half 2 asked for on its own, before half 1 ever ran, must be identical.
    const secondAlone = simulateHalf(team, opponents, schedule, 2, runSeed);
    expect(secondAlone.results).toBe(second.results);
    expect(secondAlone.games.map((g) => g.score)).toEqual(second.games.map((g) => g.score));
    expect(simulateHalf(team, opponents, schedule, 1, runSeed).results).toBe(first.results);
  });

  it('a different run seed gives a different season', () => {
    const other = simulateHalf(team, opponents, buildChallengeSchedule(556), 1, 556);
    expect(other.results).not.toBe(first.results);
  });

  it('keeps opponent team totals that make the defensive four factors computable', () => {
    for (const h of [first, second]) {
      expect(h.opponentTotals.fieldGoalsAttempted).toBeGreaterThan(h.opponentTotals.fieldGoalsMade);
      expect(h.opponentTotals.points).toBeGreaterThan(0);
      expect(h.opponentTotals.offensiveRebounds).toBeGreaterThan(0);
      expect(h.opponentTotals.defensiveRebounds).toBeGreaterThan(0);
      // Opponents' points must equal what the scoreboard credited them.
      expect(h.opponentTotals.points).toBe(h.games.reduce((s, g) => s + g.score[1], 0));
    }
  });

  it('sums player totals across both halves', () => {
    const merged = mergePlayerTotals([first, second]);
    expect(merged.length).toBeGreaterThan(0);
    const mvp = merged[0];
    const inFirst = first.playerTotals.find((p) => p.playerId === mvp.playerId);
    const inSecond = second.playerTotals.find((p) => p.playerId === mvp.playerId);
    expect(mvp.points).toBe((inFirst?.points ?? 0) + (inSecond?.points ?? 0));
    expect(mvp.gamesPlayed).toBe((inFirst?.gamesPlayed ?? 0) + (inSecond?.gamesPlayed ?? 0));
    expect(mvp.gamesPlayed).toBeLessThanOrEqual(CHALLENGE_GAMES);
  });
});

describe('trade pack (D9)', () => {
  const owned = new Set(players.slice(0, 12).map((p) => p.id));

  it('draws five distinct cards the user does not own', () => {
    const offers = drawTradeOffers(players, owned, 'Common', createRng(1));
    expect(offers).toHaveLength(TRADE_OFFERS);
    expect(new Set(offers.map((o) => o.id)).size).toBe(TRADE_OFFERS);
    for (const o of offers) expect(owned.has(o.id)).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const a = drawTradeOffers(players, owned, 'Rare', createRng(42)).map((o) => o.id);
    const b = drawTradeOffers(players, owned, 'Rare', createRng(42)).map((o) => o.id);
    expect(b).toEqual(a);
  });

  it('dropping a Mythic offers Mythics far above the 3% base rate', () => {
    const rate = (dropped: Rarity) => {
      let mythics = 0;
      let total = 0;
      for (let s = 0; s < 400; s++) {
        for (const o of drawTradeOffers(players, owned, dropped, createRng(s))) {
          total++;
          if (o.rarity === 'Mythic') mythics++;
        }
      }
      return mythics / total;
    };
    const droppedMythic = rate('Mythic');
    const droppedCommon = rate('Common');
    expect(droppedCommon).toBeLessThan(0.08);
    expect(droppedMythic).toBeGreaterThan(0.09);
    expect(droppedMythic).toBeGreaterThan(droppedCommon * 2);
  });
});
