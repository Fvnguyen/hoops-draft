import { describe, it, expect } from 'vitest';
import {
  createSeason, playNextGame, recomputeStandingsFromSchedule, getSeasonPhase,
  computeUserSeasonStats, HUMAN_SEAT_ID, type Season,
} from '@/engine/season';
import type { DraftSession } from '@/engine/deckbuilder';
import { loadPlayers, PLAYS, runHeadlessDraft } from './helpers';

// createSeason/playNextGame never touch localStorage (only saveSeason does),
// so these tests never call saveSeason.
describe('seasonEngine', () => {
  const players = loadPlayers();

  function makeSession(): DraftSession {
    const seats = runHeadlessDraft(players, PLAYS);
    return {
      id: 'test-session',
      timestamp: new Date().toISOString(),
      seats,
      pickLog: [],
    };
  }

  it('createSeason schedules 7 distinct opponents for the human', () => {
    const session = makeSession();
    const season = createSeason(session, 'test-roster');

    expect(season.schedule.length).toBe(7);
    const opponentIndices = season.schedule.map((s) => {
      const hm = s.matchups.find(m => m.homeSeatIndex === 0 || m.awaySeatIndex === 0)!;
      return hm.homeSeatIndex === 0 ? hm.awaySeatIndex : hm.homeSeatIndex;
    });
    expect(new Set(opponentIndices).size).toBe(7);
    for (const idx of opponentIndices) {
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(7);
    }
  });

  it('after playing all 7 games, every team has played 7 games (56 total W+L)', () => {
    const session = makeSession();
    let season = createSeason(session, 'test-roster');

    for (let i = 0; i < 7; i++) {
      const result = playNextGame(season, session);
      expect(result).not.toBeNull();
      season = result!.season;
    }

    expect(season.currentGame).toBe(7);

    const totalWL = season.standings.reduce((s, row) => s + row.wins + row.losses, 0);
    expect(totalWL).toBe(56);

    const humanRow = season.standings.find((row) => row.seatId === HUMAN_SEAT_ID);
    expect(humanRow).toBeDefined();
    expect((humanRow!.wins + humanRow!.losses)).toBe(7);
  });

  // accounts_cloud_saves T2: recomputeStandingsFromSchedule must reproduce whatever
  // playNextGame's incremental bookkeeping already produced, from the schedule alone.
  it('recomputeStandingsFromSchedule matches playNextGame after a partial season', () => {
    const session = makeSession();
    let season = createSeason(session, 'test-roster');

    for (let i = 0; i < 3; i++) {
      const result = playNextGame(season, session);
      season = result!.season;
    }

    const recomputed = recomputeStandingsFromSchedule(season.schedule, session, season.humanTeam.name);

    const sortedActual = [...season.standings].sort((a, b) => a.seatId.localeCompare(b.seatId));
    const sortedRecomputed = [...recomputed].sort((a, b) => a.seatId.localeCompare(b.seatId));
    expect(sortedRecomputed).toEqual(sortedActual);
  });

  it('recomputeStandingsFromSchedule ignores unplayed game days', () => {
    const session = makeSession();
    const season = createSeason(session, 'test-roster');

    const recomputed = recomputeStandingsFromSchedule(season.schedule, session, season.humanTeam.name);
    expect(recomputed.every((row) => row.wins === 0 && row.losses === 0)).toBe(true);
    expect(recomputed).toHaveLength(8);
  });
});

// season_lifecycle_notifications T1
describe('getSeasonPhase', () => {
  const players = loadPlayers();

  function makeSession(): DraftSession {
    const seats = runHeadlessDraft(players, PLAYS);
    return { id: 'test-session', timestamp: new Date().toISOString(), seats, pickLog: [] };
  }

  it('reports preseason for no season at all', () => {
    expect(getSeasonPhase(null)).toBe('preseason');
    expect(getSeasonPhase(undefined)).toBe('preseason');
  });

  it('reports preseason before the first game, live mid-season, completed after game 7', () => {
    const session = makeSession();
    let season = createSeason(session, 'test-roster');
    expect(getSeasonPhase(season)).toBe('preseason');

    for (let i = 0; i < 3; i++) {
      season = playNextGame(season, session)!.season;
    }
    expect(getSeasonPhase(season)).toBe('live');

    for (let i = 0; i < 4; i++) {
      season = playNextGame(season, session)!.season;
    }
    expect(getSeasonPhase(season)).toBe('completed');
  });
});

describe('computeUserSeasonStats', () => {
  const players = loadPlayers();

  function makeSession(): DraftSession {
    const seats = runHeadlessDraft(players, PLAYS);
    return { id: 'test-session', timestamp: new Date().toISOString(), seats, pickLog: [] };
  }

  function playFullSeason(): Season {
    const session = makeSession();
    let season = createSeason(session, 'test-roster');
    for (let i = 0; i < 7; i++) {
      season = playNextGame(season, session)!.season;
    }
    return season;
  }

  it('reports all zeros for no seasons, avoiding division by zero', () => {
    const stats = computeUserSeasonStats([]);
    expect(stats).toEqual({ seasonsPlayed: 0, wins: 0, losses: 0, avgWins: '0.0', avgLosses: '0.0' });
  });

  it('ignores seasons still in preseason/live', () => {
    const session = makeSession();
    const preseason = createSeason(session, 'test-roster');
    const live = playNextGame(createSeason(session, 'test-roster-2'), session)!.season;
    const stats = computeUserSeasonStats([preseason, live]);
    expect(stats.seasonsPlayed).toBe(0);
  });

  it('sums the human record across completed seasons and averages to one decimal', () => {
    const a = playFullSeason();
    const b = playFullSeason();
    const humanA = a.standings.find((s) => s.seatId === HUMAN_SEAT_ID)!;
    const humanB = b.standings.find((s) => s.seatId === HUMAN_SEAT_ID)!;

    const stats = computeUserSeasonStats([a, b]);
    expect(stats.seasonsPlayed).toBe(2);
    expect(stats.wins).toBe(humanA.wins + humanB.wins);
    expect(stats.losses).toBe(humanA.losses + humanB.losses);
    expect(stats.avgWins).toBe(((humanA.wins + humanB.wins) / 2).toFixed(1));
    expect(stats.avgLosses).toBe(((humanA.losses + humanB.losses) / 2).toFixed(1));
  });
});
