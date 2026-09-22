/**
 * `engine/playoffs.ts` (pvp_series T2, D1): home-court pattern, sideboard timing, and
 * `seriesState` over every reachable 4-x line.
 */

import { describe, it, expect } from 'vitest';
import {
  coinFlip,
  homeFor,
  gameSeed,
  seriesState,
  SERIES_WINS_NEEDED,
  SERIES_MAX_GAMES,
  SIDEBOARD_AT_WINS,
  type MatchSide,
  type SeriesGameLike,
} from '@/engine/playoffs';

function game(n: number, hostScore: number, guestScore: number): SeriesGameLike {
  return { game: n, score: { host: hostScore, guest: guestScore } };
}

/** Build a games list from a sequence of winners ('host' | 'guest'), one game each,
 *  scores just being a win/loss marker (100-90 or 90-100). */
function gamesFrom(winners: MatchSide[]): SeriesGameLike[] {
  return winners.map((w, i) => (w === 'host' ? game(i + 1, 100, 90) : game(i + 1, 90, 100)));
}

describe('coinFlip / homeFor — home pattern for both flip results', () => {
  for (const seed of [1, 2, 3, 42, 424_242, 999_999]) {
    it(`seed ${seed}: games 1,2,5,7 at the flip winner, 3,4,6 at the other`, () => {
      const flip = coinFlip(seed);
      const other: MatchSide = flip === 'host' ? 'guest' : 'host';
      const expected = [flip, flip, other, other, flip, other, flip];
      for (let g = 1; g <= 7; g++) {
        expect(homeFor(g, flip)).toBe(expected[g - 1]);
      }
    });
  }

  it('covers both flip results explicitly (host and guest winners)', () => {
    // homeFor does not depend on how the flip was produced, so exercise both directly.
    for (const flip of ['host', 'guest'] as MatchSide[]) {
      const other: MatchSide = flip === 'host' ? 'guest' : 'host';
      expect(homeFor(1, flip)).toBe(flip);
      expect(homeFor(2, flip)).toBe(flip);
      expect(homeFor(3, flip)).toBe(other);
      expect(homeFor(4, flip)).toBe(other);
      expect(homeFor(5, flip)).toBe(flip);
      expect(homeFor(6, flip)).toBe(other);
      expect(homeFor(7, flip)).toBe(flip);
    }
  });

  it('coinFlip is deterministic and covers both outcomes across seeds', () => {
    const results = new Set<MatchSide>();
    for (let seed = 0; seed < 200; seed++) {
      const flip = coinFlip(seed);
      expect(coinFlip(seed)).toBe(flip); // reproducible
      results.add(flip);
    }
    expect(results).toEqual(new Set(['host', 'guest']));
  });
});

describe('gameSeed — distinct per game', () => {
  it('produces a different seed for each game number, for a fixed match seed', () => {
    const seed = 12345;
    const seeds = new Set<number>();
    for (let g = 1; g <= SERIES_MAX_GAMES; g++) {
      seeds.add(gameSeed(seed, g));
    }
    expect(seeds.size).toBe(SERIES_MAX_GAMES);
  });

  it('is reproducible', () => {
    expect(gameSeed(999, 3)).toBe(gameSeed(999, 3));
  });

  it('differs across match seeds for the same game number', () => {
    expect(gameSeed(1, 1)).not.toBe(gameSeed(2, 1));
  });
});

describe('seriesState — sideboardDue', () => {
  it('is true the moment a side first reaches 2 wins (2-0)', () => {
    const state = seriesState(gamesFrom(['host', 'host']), false);
    expect(state.hostWins).toBe(2);
    expect(state.guestWins).toBe(0);
    expect(state.sideboardDue).toBe(true);
    expect(state.over).toBe(false);
  });

  it('is true at 2-1 as well (either side reaching 2 first)', () => {
    const state = seriesState(gamesFrom(['host', 'guest', 'host']), false);
    expect(state.hostWins).toBe(2);
    expect(state.guestWins).toBe(1);
    expect(state.sideboardDue).toBe(true);
  });

  it('is true exactly once across a series: false again once sideboardHappened', () => {
    const games2_0 = gamesFrom(['host', 'host']);
    expect(seriesState(games2_0, false).sideboardDue).toBe(true);
    expect(seriesState(games2_0, true).sideboardDue).toBe(false);

    // Once past 2 wins with the sideboard done, still false (already happened).
    const games3_0 = gamesFrom(['host', 'host', 'host']);
    expect(seriesState(games3_0, true).sideboardDue).toBe(false);
  });

  it('is false once the series is already over, even without a sideboard', () => {
    const games4_0 = gamesFrom(['host', 'host', 'host', 'host']);
    const state = seriesState(games4_0, false);
    expect(state.over).toBe(true);
    expect(state.sideboardDue).toBe(false);
  });

  it('is false before either side reaches SIDEBOARD_AT_WINS', () => {
    expect(SIDEBOARD_AT_WINS).toBe(2);
    const games1_0 = gamesFrom(['host']);
    expect(seriesState(games1_0, false).sideboardDue).toBe(false);
  });
});

describe('seriesState — every reachable 4-x line, both directions', () => {
  // Host wins 4-0 .. 4-3, and the mirror image for the guest.
  const lines: { losses: number; winner: MatchSide }[] = [
    { losses: 0, winner: 'host' },
    { losses: 1, winner: 'host' },
    { losses: 2, winner: 'host' },
    { losses: 3, winner: 'host' },
    { losses: 0, winner: 'guest' },
    { losses: 1, winner: 'guest' },
    { losses: 2, winner: 'guest' },
    { losses: 3, winner: 'guest' },
  ];

  for (const { losses, winner } of lines) {
    const loser: MatchSide = winner === 'host' ? 'guest' : 'host';
    it(`${winner} wins 4-${losses}`, () => {
      // Interleave losses before the winner's 4th win so sideboardDue also gets exercised,
      // but keep it simple: loser wins first `losses` games, then winner wins 4 straight.
      const winners: MatchSide[] = [
        ...Array(losses).fill(loser),
        ...Array(SERIES_WINS_NEEDED).fill(winner),
      ];
      const games = gamesFrom(winners);
      // sideboardHappened=true throughout so sideboardDue never interferes with `over`.
      const state = seriesState(games, true);
      expect(state.over).toBe(true);
      expect(state.winner).toBe(winner);
      expect(state.nextGame).toBeNull();
      if (winner === 'host') {
        expect(state.hostWins).toBe(SERIES_WINS_NEEDED);
        expect(state.guestWins).toBe(losses);
      } else {
        expect(state.guestWins).toBe(SERIES_WINS_NEEDED);
        expect(state.hostWins).toBe(losses);
      }
      expect(state.played).toBe(losses + SERIES_WINS_NEEDED);
      expect(state.played).toBeLessThanOrEqual(SERIES_MAX_GAMES);
    });
  }

  it('never goes past 7 games (4-3 is the longest possible line)', () => {
    const winners: MatchSide[] = ['guest', 'guest', 'guest', 'host', 'host', 'host', 'host'];
    const state = seriesState(gamesFrom(winners), true);
    expect(state.played).toBe(7);
    expect(state.over).toBe(true);
    expect(state.winner).toBe('host');
  });
});

describe('seriesState — nextGame numbering', () => {
  it('is 1 for no games played', () => {
    expect(seriesState([], false).nextGame).toBe(1);
  });

  it('increments by one game played', () => {
    expect(seriesState(gamesFrom(['host']), false).nextGame).toBe(2);
    expect(seriesState(gamesFrom(['host', 'guest']), false).nextGame).toBe(3);
    expect(seriesState(gamesFrom(['host', 'guest', 'host']), false).nextGame).toBe(4);
  });

  it('is null once the series is over', () => {
    const state = seriesState(gamesFrom(['host', 'host', 'host', 'host']), false);
    expect(state.nextGame).toBeNull();
  });
});
