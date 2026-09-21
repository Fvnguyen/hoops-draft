/**
 * plan render_and_engine_perf D2: `simulateGame(..., { events: false })` skips building the
 * play-by-play. It is only safe if NOTHING else changes — the 82:0 challenge commits these
 * results as a player's permanent record, and a viewer later re-simulates the same seed
 * WITH events to watch the game.
 */
import { describe, it, expect } from 'vitest';
import { loadPlayers, runHeadlessDraft, buildTeams, PLAYS } from './helpers';
import { simulateGame } from '@/engine/game';
import { simulateHalf, buildNbaTeams, buildChallengeSchedule } from '@/engine/challenge';
import { CHALLENGE_TUNING } from '@/engine/balance';
import { createRng } from '@/engine/rng';

const players = loadPlayers();
const teams = buildTeams(runHeadlessDraft(players, PLAYS, 2024));

describe('simulateGame events option', () => {
  it('gives the same score, box score, quarters and overtime with and without events, over 50 seeds', () => {
    let overtimeGames = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const home = teams[seed % teams.length];
      const away = teams[(seed + 3) % teams.length];
      const full = simulateGame(home, away, { rng: createRng(seed), tuning: CHALLENGE_TUNING });
      const lean = simulateGame(home, away, { rng: createRng(seed), tuning: CHALLENGE_TUNING, events: false });

      expect(lean.finalScore).toEqual(full.finalScore);
      expect(lean.boxScore).toEqual(full.boxScore);
      expect(lean.quarterSummaries).toEqual(full.quarterSummaries);
      expect(lean.isOvertime).toBe(full.isOvertime);
      expect(lean.overtimePeriods).toBe(full.overtimePeriods);
      expect(lean.seed).toBe(full.seed);
      expect(lean.possessions).toEqual([]);
      expect(full.possessions.length).toBeGreaterThan(150);
      if (full.isOvertime) overtimeGames++;
    }
    // The overtime loop is a separate code path with its own playOnePossession call.
    expect(overtimeGames).toBeGreaterThan(0);
  });

  it('leaves the rng in the same state, so whatever runs next on that stream is unaffected', () => {
    const a = createRng(77);
    const b = createRng(77);
    simulateGame(teams[0], teams[1], { rng: a });
    simulateGame(teams[0], teams[1], { rng: b, events: false });
    expect(a.next()).toBe(b.next());
  });

  it('defaults to recording events', () => {
    expect(simulateGame(teams[0], teams[1], { rng: createRng(5) }).possessions.length).toBeGreaterThan(150);
  });

  it('the box score still adds up to the final score without events', () => {
    const game = simulateGame(teams[2], teams[5], { rng: createRng(9), events: false });
    const sum = (rows: { points: number }[]) => rows.reduce((n, r) => n + r.points, 0);
    expect(sum(game.boxScore.home)).toBe(game.finalScore[0]);
    expect(sum(game.boxScore.away)).toBe(game.finalScore[1]);
  });
});

describe('simulateHalf', () => {
  it('produces a complete half (results, scores, top performers, totals) from event-free games', () => {
    const opponents = buildNbaTeams(players, PLAYS);
    const half = simulateHalf(teams[0], opponents, buildChallengeSchedule(42), 1, 42, CHALLENGE_TUNING);
    expect(half.results).toMatch(/^[WL]{41}$/);
    expect(half.games).toHaveLength(41);
    expect(half.wins + half.losses).toBe(41);
    expect(half.playerTotals.length).toBeGreaterThan(0);
    for (const game of half.games) expect(game.score[0]).not.toBe(game.score[1]);
  });
});
