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

// ── pvp_series D1/D2 ─────────────────────────────────────────────────────────

export const SERIES_WINS_NEEDED = 4;
export const SERIES_MAX_GAMES = 7;
/** D4: the sideboard opens the first time either side reaches this many wins. */
export const SIDEBOARD_AT_WINS = 2;

/** The part of a stored game the series rules read (structural, so the engine never
 *  imports storage types). Scores cannot tie: the engine plays overtime. */
export interface SeriesGameLike {
  game: number;
  score: { host: number; guest: number };
}

export interface SeriesState {
  hostWins: number;
  guestWins: number;
  played: number;
  over: boolean;
  winner: MatchSide | null;
  /** True exactly when a side has reached `SIDEBOARD_AT_WINS`, nobody has won the series,
   *  and the sideboard has not happened yet. */
  sideboardDue: boolean;
  /** The next game number to play, or null once the series is over. */
  nextGame: number | null;
}

/** Wins per side over `games` (in game order), and what comes next. `sideboardHappened`
 *  = both sides have locked a sideboard entry (or the sideboard window was closed). */
export function seriesState(games: readonly SeriesGameLike[], sideboardHappened: boolean): SeriesState {
  let hostWins = 0;
  let guestWins = 0;
  for (const g of games) {
    if (g.score.host > g.score.guest) hostWins++;
    else guestWins++;
  }
  const played = games.length;
  const over = hostWins >= SERIES_WINS_NEEDED || guestWins >= SERIES_WINS_NEEDED;
  const winner: MatchSide | null = over ? (hostWins > guestWins ? 'host' : 'guest') : null;
  const sideboardDue = !over && !sideboardHappened
    && (hostWins >= SIDEBOARD_AT_WINS || guestWins >= SIDEBOARD_AT_WINS);
  const nextGame = over ? null : played + 1;
  return { hostWins, guestWins, played, over, winner, sideboardDue, nextGame };
}
