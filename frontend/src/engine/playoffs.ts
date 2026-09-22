/**
 * Playoffs (PvP best-of-seven) pure helpers — pvp_series D1.
 *
 * Created early by `pvp_match` because its simulate route (D7) needs the seed and
 * home-court rules; `pvp_series` owns this file and adds `seriesState`. Game numbers are
 * 1-based everywhere (game 1 .. game 7).
 */

import { mixSeed } from './rng';

export type MatchSide = 'host' | 'guest';

/** Who wins the opening coin flip, and with it home court in games 1, 2, 5 and 7. */
export function coinFlip(seed: number): MatchSide {
  return mixSeed(seed, 'coin') & 1 ? 'guest' : 'host';
}

/** NBA 2-2-1-1-1: games 1, 2, 5, 7 at the flip winner; 3, 4, 6 at the other side. */
export function homeFor(game: number, flipWinner: MatchSide): MatchSide {
  const other: MatchSide = flipWinner === 'host' ? 'guest' : 'host';
  return game === 3 || game === 4 || game === 6 ? other : flipWinner;
}

/** The seed game `game` (1-based) of a match is simulated from. */
export function gameSeed(seed: number, game: number): number {
  return mixSeed(seed, `game:${game}`);
}
