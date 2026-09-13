import { describe, it, expect } from 'vitest';
import { createSeason, playNextGame } from '@/engine/season';
import type { DraftSession } from '@/engine/deckbuilder';
import { loadPlayers, PLAYS, runHeadlessDraft } from './helpers';

/**
 * plan_data_storage D6: a completed 7-game season serializes under 100 KB, a draft
 * session under 300 KB. This is what D1's slim `StoredGameResult` shape (season.ts) is
 * for — a season used to keep a full `GameTheater` (possessions, substitutions, quarter
 * summaries) per played game, which is what made a 7-game season balloon to ~1.7 MB.
 */
describe('storage size (D6)', () => {
  const players = loadPlayers();

  function makeSession(): DraftSession {
    const seats = runHeadlessDraft(players, PLAYS);
    return {
      id: 'size-test-session',
      timestamp: new Date().toISOString(),
      seats,
      pickLog: [],
    };
  }

  it('a draft session serializes under 300 KB', () => {
    const session = makeSession();
    const bytes = Buffer.byteLength(JSON.stringify(session), 'utf-8');
    expect(bytes).toBeLessThan(300 * 1024);
  });

  it('a fully-played 7-game season serializes under 100 KB', () => {
    const session = makeSession();
    let season = createSeason(session, 'size-test-roster');

    for (let i = 0; i < 7; i++) {
      const result = playNextGame(season, session);
      expect(result).not.toBeNull();
      season = result!.season;
    }
    expect(season.currentGame).toBe(7);

    const bytes = Buffer.byteLength(JSON.stringify(season), 'utf-8');
    expect(bytes).toBeLessThan(100 * 1024);
  });
});
