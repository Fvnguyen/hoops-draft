/**
 * game_theater D9 — box score attribution. The outcome-invariance half of T7 is pinned by
 * `npm run balance -- 500 --seed 42` (PPP 1.050, sd 13.1, [90,130] 86.6%, home 57.2%,
 * margin 15.3/13.0 before AND after) — attribution draws come from a derived rng, never
 * the sim stream. These tests cover internal consistency, derivation and rates.
 */
import { describe, it, expect } from 'vitest';
import { simulateMany, loadPlayers, runHeadlessDraft, buildTeams, PLAYS } from './helpers';
import { boxScoreThrough, simulateGame, type GameTheater, type PlayerBoxScore } from '@/engine/game';
import { createSeason, playNextGame, seasonPlayerTotals } from '@/engine/season';
import { createRng } from '@/engine/rng';

const rows = (g: GameTheater): PlayerBoxScore[] => [...g.boxScore.home, ...g.boxScore.away];
const sum = (xs: PlayerBoxScore[], k: keyof PlayerBoxScore) => xs.reduce((s, b) => s + (b[k] as number), 0);

/** The MAX_OT_PERIODS tiebreak adds +1 to the winner's first starter outside any event. */
function tiebreakPoint(g: GameTheater): { side: 'home' | 'away'; playerId: string } | null {
  const last = g.possessions[g.possessions.length - 1];
  if (!last) return null;
  if (g.finalScore[0] === last.runningScore[0] + 1 && g.finalScore[1] === last.runningScore[1]) return { side: 'home', playerId: g.homeTeam.starters[0] };
  if (g.finalScore[1] === last.runningScore[1] + 1 && g.finalScore[0] === last.runningScore[0]) return { side: 'away', playerId: g.awayTeam.starters[0] };
  return null;
}

describe('box score (D9) — 20 seeded games', () => {
  const games = simulateMany(20, undefined, undefined, 424242);

  it('shooting columns are internally consistent for every player', () => {
    for (const g of games) {
      const tb = tiebreakPoint(g);
      for (const b of rows(g)) {
        expect(b.fieldGoalsMade).toBe(b.twoPointers + b.threePointers);
        expect(b.threesMade).toBeLessThanOrEqual(b.threesAttempted);
        expect(b.fieldGoalsMade).toBeLessThanOrEqual(b.fieldGoalsAttempted);
        expect(b.threesAttempted).toBeLessThanOrEqual(b.fieldGoalsAttempted);
        expect(b.freeThrowsMade).toBeLessThanOrEqual(b.freeThrowsAttempted);
        const extra = tb && tb.playerId === b.playerId ? 1 : 0;
        expect(b.points).toBe(2 * b.twoPointers + 3 * b.threePointers + b.freeThrowsMade + extra);
      }
    }
  });

  it('team plus/minus sums to the points scored x players on the floor, per side (tiebreak point excluded — it is not an event)', () => {
    // Usually 5 x margin. Derived from the events rather than assumed, because a bot roster
    // can draft no player eligible for a position (seen: an empty C column at seed 424242,
    // game 3) and then plays four on five all game — a deckbuilder issue logged in
    // docs/HANDOVER.md, not a box-score one.
    for (const g of games) {
      let home = 0, away = 0;
      let prev: [number, number] = [0, 0];
      for (const e of g.possessions) {
        const pts = e.team === 'home' ? e.runningScore[0] - prev[0] : e.runningScore[1] - prev[1];
        prev = e.runningScore;
        const offN = e.lineupOnCourt.length, defN = e.defenseOnCourt.length;
        if (e.team === 'home') { home += pts * offN; away -= pts * defN; } else { away += pts * offN; home -= pts * defN; }
      }
      expect(sum(g.boxScore.home, 'plusMinus')).toBe(home);
      expect(sum(g.boxScore.away, 'plusMinus')).toBe(away);
    }
  });

  it('steals credited to the defense never exceed the offense turnovers', () => {
    for (const g of games) {
      expect(sum(g.boxScore.home, 'steals')).toBeLessThanOrEqual(sum(g.boxScore.away, 'turnovers'));
      expect(sum(g.boxScore.away, 'steals')).toBeLessThanOrEqual(sum(g.boxScore.home, 'turnovers'));
    }
  });

  it('team FGA/FTA/DREB/blocks reconcile with the event log', () => {
    for (const g of games) {
      const fga = g.possessions.reduce((s, e) => s + e.shots.length, 0);
      expect(sum(rows(g), 'fieldGoalsAttempted')).toBe(fga);
      const blocks = g.possessions.reduce((s, e) => s + e.shots.filter(x => x.blockerId).length, 0);
      expect(sum(rows(g), 'blocks')).toBe(blocks);
      const dreb = g.possessions.filter(e => e.defensiveRebounderId).length;
      expect(sum(rows(g), 'defensiveRebounds')).toBe(dreb);
      const fta = g.possessions.reduce((s, e) => s + e.narrative.ftAttempted, 0);
      expect(sum(rows(g), 'freeThrowsAttempted')).toBe(fta);
      // A defensive rebound only ends a possession that ended on a missed FGA.
      for (const e of g.possessions) {
        if (e.defensiveRebounderId) {
          expect(e.turnoverPlayerId).toBeUndefined();
          expect(e.outcome).toBe('miss');
          expect(e.shots[e.shots.length - 1].made).toBe(false);
        }
      }
    }
  });

  it('boxScoreThrough at the last possession reproduces theater.boxScore exactly', () => {
    for (const g of games) {
      const derived = boxScoreThrough(g, g.possessions.length - 1);
      expect(derived).toEqual(g.boxScore);
    }
  });

  it('boxScoreThrough is monotone in possessions and zero before the first', () => {
    const g = games[0];
    const mid = boxScoreThrough(g, Math.floor(g.possessions.length / 2));
    const midHome = mid.home.reduce((s, b) => s + b.points, 0);
    expect(midHome).toBe(g.possessions[Math.floor(g.possessions.length / 2)].runningScore[0]);
    const none = boxScoreThrough(g, -1);
    expect(none.home.every(b => b.points === 0 && b.minutes === 0 && b.possessions === 0)).toBe(true);
  });

  it('is deterministic: the same seed produces identical boxes', () => {
    const a = simulateMany(3, undefined, undefined, 777);
    const b = simulateMany(3, undefined, undefined, 777);
    for (let i = 0; i < a.length; i++) expect(a[i].boxScore).toEqual(b[i].boxScore);
  });
});

describe('box score (D9) — per-team rates over 200 games', () => {
  const games = simulateMany(200, undefined, undefined, 20260916);
  const n = games.length * 2;
  const perTeam = (k: keyof PlayerBoxScore) => games.reduce((s, g) => s + sum(g.boxScore.home, k) + sum(g.boxScore.away, k), 0) / n;
  const steals = perTeam('steals');
  const blocks = perTeam('blocks');
  const dreb = perTeam('defensiveRebounds');
  const fga = perTeam('fieldGoalsAttempted');
  const fta = perTeam('freeThrowsAttempted');
  console.log(`[boxscore] per team per game: STL ${steals.toFixed(2)} BLK ${blocks.toFixed(2)} DREB ${dreb.toFixed(2)} FGA ${fga.toFixed(1)} FTA ${fta.toFixed(1)}`);

  it('steals 5-11, blocks 3-8, defensive rebounds 30-45 per team per game (measured 8.2 / 5.3 / 38.3 at seed 20260916)', () => {
    expect(steals).toBeGreaterThanOrEqual(5);
    expect(steals).toBeLessThanOrEqual(11);
    expect(blocks).toBeGreaterThanOrEqual(3);
    expect(blocks).toBeLessThanOrEqual(8);
    expect(dreb).toBeGreaterThanOrEqual(30);
    expect(dreb).toBeLessThanOrEqual(45);
  });
});

describe('seasonPlayerTotals (D9)', () => {
  const players = loadPlayers();
  const seats = runHeadlessDraft(players, PLAYS, 4242);
  const session = { id: 'box-session', timestamp: '2026-09-16T00:00:00.000Z', seats, pickLog: [] };

  it('returns [] before any game and sums the human rows across played games', () => {
    let season = createSeason(session, 'r', createRng(1));
    expect(seasonPlayerTotals(season)).toEqual([]);

    const expected = new Map<string, PlayerBoxScore>();
    let gamesWithBox = 0;
    for (let i = 0; i < 3; i++) {
      const r = playNextGame(season, session, createRng(100 + i));
      expect(r).not.toBeNull();
      season = r!.season;
      const g = r!.gameResult;
      const humanRows = g.homeTeam.seatId === season.humanTeam.seatId ? g.boxScore.home : g.boxScore.away;
      gamesWithBox++;
      for (const b of humanRows) {
        const t = expected.get(b.playerId);
        if (!t) { expected.set(b.playerId, { ...b }); continue; }
        for (const k of Object.keys(b) as (keyof PlayerBoxScore)[]) {
          if (typeof b[k] === 'number') (t as unknown as Record<string, number>)[k] = (t[k] as number) + (b[k] as number);
        }
      }
    }
    const totals = seasonPlayerTotals(season);
    expect(totals.length).toBe(expected.size);
    for (const t of totals) {
      const e = expected.get(t.playerId)!;
      expect(t.points).toBe(e.points);
      expect(t.plusMinus).toBe(e.plusMinus);
      expect(t.fieldGoalsAttempted).toBe(e.fieldGoalsAttempted);
      expect(t.steals + t.blocks + t.defensiveRebounds).toBe(e.steals + e.blocks + e.defensiveRebounds);
      expect(t.minutes).toBeCloseTo(e.minutes, 1);
      expect(t.gamesPlayed).toBeLessThanOrEqual(gamesWithBox);
    }
    // Sorted by points desc.
    for (let i = 1; i < totals.length; i++) expect(totals[i - 1].points).toBeGreaterThanOrEqual(totals[i].points);
  });
});

describe('boxScoreThrough on a direct simulateGame call', () => {
  it('matches for a seeded pairing', () => {
    const players = loadPlayers();
    const teams = buildTeams(runHeadlessDraft(players, PLAYS, 99));
    const g = simulateGame(teams[0], teams[1], { rng: createRng(12345) });
    expect(boxScoreThrough(g, g.possessions.length - 1)).toEqual(g.boxScore);
  });
});
