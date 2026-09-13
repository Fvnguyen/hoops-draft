import { describe, it, expect } from 'vitest';
import { createSeason, playNextGame } from '@/engine/season';
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

    const humanRow = season.standings.find((row) => row.seatId === 'human-0');
    expect(humanRow).toBeDefined();
    expect((humanRow!.wins + humanRow!.losses)).toBe(7);
  });
});
