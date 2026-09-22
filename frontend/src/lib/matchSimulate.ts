/**
 * pvp_match T5 (D7), now driven by `POST /api/match/[id]/advance` (pvp_series T3) —
 * `simulateMatchGame` runs the real engine for one series game.
 *
 * No Next.js, no Supabase: the route (`app/api/match/[id]/advance/route.ts`) loops
 * `planAdvance` (`@/lib/matchAdvance`) and calls `simulateMatchGame` for each `simulate`
 * step; request/participant validation for that route lives there, not here — unlike the
 * old `/simulate` route this replaced, a game is only ever produced by the server's own
 * loop, never at a participant's direct request (D2).
 *
 * Which roster plays: the sideboard snapshot for that side when present (`pvp_series` D4),
 * else the roster locked at `match_lock_roster` time. Home court follows the 2-2-1-1-1
 * schedule off the match's own coin flip (`engine/playoffs.ts`, `pvp_series` D1 — created
 * early for this route). Tournament tuning always applies here — `simulateGame`'s default,
 * never `CHALLENGE_TUNING` (that is the 82:0 solo mode's engine feel, not PvP's).
 */

import type { Match, MatchGame, MatchSide } from '@/storage/matchTypes';
import { MATCH_SEAT_ID } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import { seatFromRoster } from '@/components/challenge/rosterSeat';
import { buildTeamInfo, simulateGame } from '@/engine/game';
import type { GameTheater } from '@/engine/gameTypes';
import { createRng } from '@/engine/rng';
import { coinFlip, homeFor, gameSeed } from '@/engine/playoffs';
import { BALANCE_VERSION } from '@/engine/balance';

/** pvp_series: which rosters a NEW game plays with — 'sideboard' once both sides have
 *  locked a sideboard entry, else 'locked'. Stored on the game so a replay matches. */
export function rostersForNextGame(match: Pick<Match, 'sideboard'>): 'locked' | 'sideboard' {
  return match.sideboard.host && match.sideboard.guest ? 'sideboard' : 'locked';
}

/** The roster `side` played game-set `rosters` with. Throws if it is missing (a data bug:
 *  a series game is only ever simulated after both rosters were locked). */
function rosterFor(match: Match, side: MatchSide, rosters: 'locked' | 'sideboard'): SavedRoster {
  const roster = rosters === 'sideboard'
    ? match.sideboard[side]?.roster
    : side === 'host' ? match.host_roster : match.guest_roster;
  if (!roster) throw new Error(`matchSimulate: no ${rosters} roster for ${side} on match ${match.id}`);
  return roster;
}

const SIDE_NAME: Record<MatchSide, string> = { host: 'Host', guest: 'Guest' };

/** Build a `TeamInfo` for one side of a match from its `SavedRoster` (locked or
 *  sideboarded), the same `SavedRoster` -> `DraftSessionSeat` -> `TeamInfo` path the 82:0
 *  Challenge front office uses (`components/challenge/rosterSeat.ts` + `engine/game.ts`).
 *  `SavedRoster.draftedCards` already carries full card data, so no separate card pool
 *  lookup is needed here. */
function teamInfoFor(match: Match, side: MatchSide, rosters: 'locked' | 'sideboard', names?: Partial<Record<MatchSide, string>>) {
  const seat = { ...seatFromRoster(rosterFor(match, side, rosters)), id: MATCH_SEAT_ID[side] };
  return buildTeamInfo(seat, true, names?.[side] ?? SIDE_NAME[side]);
}

/** The full `GameTheater` of series game `game` (events on, for the game page), exactly as
 *  the server simulated it: same rosters, home side and seed. `rosters` defaults to the
 *  stored game's own `rosters` field, so a replay after the sideboard still shows games
 *  1-2 with the locked rosters. Returns the home side too, for mapping home/away to sides. */
export function theaterForMatchGame(
  match: Match,
  game: number,
  opts?: { rosters?: 'locked' | 'sideboard'; events?: boolean; names?: Partial<Record<MatchSide, string>> },
): { theater: GameTheater; home: MatchSide } {
  const rosters = opts?.rosters ?? match.games.find((g) => g.game === game)?.rosters ?? 'locked';
  const hostTeam = teamInfoFor(match, 'host', rosters, opts?.names);
  const guestTeam = teamInfoFor(match, 'guest', rosters, opts?.names);
  const home = homeFor(game, coinFlip(match.seed));
  const rng = createRng(gameSeed(match.seed, game));
  const events = opts?.events ?? true;
  const theater = home === 'host'
    ? simulateGame(hostTeam, guestTeam, { rng, events })
    : simulateGame(guestTeam, hostTeam, { rng, events });
  return { theater, home };
}

/** Simulate series game `game` of `match` for storage: the rosters are whatever plays
 *  NEXT (`rostersForNextGame`). Reproducible from `match.seed` alone: the coin flip, the
 *  home side and the RNG seed are all pure functions of `(match.seed, game)`. */
export function simulateMatchGame(match: Match, game: number): MatchGame {
  const rosters = rostersForNextGame(match);
  const { theater, home } = theaterForMatchGame(match, game, { rosters, events: false });

  const [homeScore, awayScore] = theater.finalScore;
  const score = home === 'host'
    ? { host: homeScore, guest: awayScore }
    : { host: awayScore, guest: homeScore };
  const box = home === 'host'
    ? { host: theater.boxScore.home, guest: theater.boxScore.away }
    : { host: theater.boxScore.away, guest: theater.boxScore.home };
  const starters = home === 'host'
    ? { host: theater.homeTeam.starters, guest: theater.awayTeam.starters }
    : { host: theater.awayTeam.starters, guest: theater.homeTeam.starters };

  return {
    game,
    home,
    seed: gameSeed(match.seed, game),
    balanceVersion: BALANCE_VERSION,
    score,
    overtimePeriods: theater.overtimePeriods,
    box,
    simulatedAt: new Date().toISOString(),
    rosters,
    starters,
  };
}
