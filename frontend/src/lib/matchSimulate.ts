/**
 * pvp_match T5 (D7) — the pure part of `POST /api/match/[id]/simulate`.
 *
 * No Next.js, no Supabase: `validateSimulateRequest` decides whether a simulate call is
 * allowed (or is a repeat of an already-simulated game), and `simulateMatchGame` runs the
 * real engine for one series game. The route (`app/api/match/[id]/simulate/route.ts`) is
 * thin glue around these two functions plus the version-CAS write.
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
import { createRng } from '@/engine/rng';
import { coinFlip, homeFor, gameSeed } from '@/engine/playoffs';
import { BALANCE_VERSION } from '@/engine/balance';

export type SimulateValidation =
  | { kind: 'existing'; game: MatchGame }
  | { kind: 'ok' }
  | { kind: 'error'; status: number; reason: string };

/**
 * D7's request rules, in order: caller must be a participant (403), a game already
 * recorded at this number is returned as-is (idempotent replay), otherwise the match must
 * be `series` with exactly the games before this one already recorded and `game` in
 * [1, 7] (409 `bad_sequence` otherwise — covers "too early", "already past this game" and
 * a bad game number alike).
 */
export function validateSimulateRequest(match: Match, userId: string, game: number): SimulateValidation {
  if (match.host_id !== userId && match.guest_id !== userId) {
    return { kind: 'error', status: 403, reason: 'not_participant' };
  }
  const existing = match.games.find((g) => g.game === game);
  if (existing) return { kind: 'existing', game: existing };
  if (
    match.status !== 'series' ||
    !Number.isInteger(game) ||
    game < 1 ||
    game > 7 ||
    match.games.length !== game - 1
  ) {
    return { kind: 'error', status: 409, reason: 'bad_sequence' };
  }
  return { kind: 'ok' };
}

/** Sideboard entry for `side` when present, else the roster locked pre-series. Throws if
 *  neither exists — `validateSimulateRequest` already required `status === 'series'`, so a
 *  missing roster at this point is a data bug, not a normal refusal. */
function rosterFor(match: Match, side: MatchSide): SavedRoster {
  const sideboard = match.sideboard[side]?.roster;
  const locked = side === 'host' ? match.host_roster : match.guest_roster;
  const roster = sideboard ?? locked;
  if (!roster) throw new Error(`matchSimulate: no roster locked for ${side} on match ${match.id}`);
  return roster;
}

const SIDE_NAME: Record<MatchSide, string> = { host: 'Host', guest: 'Guest' };

/** Build a `TeamInfo` for one side of a match from its `SavedRoster` (locked or
 *  sideboarded), the same `SavedRoster` -> `DraftSessionSeat` -> `TeamInfo` path the 82:0
 *  Challenge front office uses (`components/challenge/rosterSeat.ts` + `engine/game.ts`).
 *  `SavedRoster.draftedCards` already carries full card data, so no separate card pool
 *  lookup is needed here. */
function teamInfoFor(match: Match, side: MatchSide) {
  const seat = { ...seatFromRoster(rosterFor(match, side)), id: MATCH_SEAT_ID[side] };
  return buildTeamInfo(seat, true, SIDE_NAME[side]);
}

/** Simulate series game `game` of `match`. Reproducible from `match.seed` alone: the coin
 *  flip, the home side and the RNG seed are all pure functions of `(match.seed, game)`. */
export function simulateMatchGame(match: Match, game: number): MatchGame {
  const hostTeam = teamInfoFor(match, 'host');
  const guestTeam = teamInfoFor(match, 'guest');

  const home = homeFor(game, coinFlip(match.seed));
  const seed = gameSeed(match.seed, game);
  const rng = createRng(seed);

  // events: false — a series game only needs the final score and box score (MatchGame is
  // slim by design, T1); skips building the ~110 KB play-by-play. Consumes the RNG
  // identically to events: true, so the score/box are unaffected (SimulateGameOptions).
  const theater = home === 'host'
    ? simulateGame(hostTeam, guestTeam, { rng, events: false })
    : simulateGame(guestTeam, hostTeam, { rng, events: false });

  const [homeScore, awayScore] = theater.finalScore;
  const score = home === 'host'
    ? { host: homeScore, guest: awayScore }
    : { host: awayScore, guest: homeScore };
  const box = home === 'host'
    ? { host: theater.boxScore.home, guest: theater.boxScore.away }
    : { host: theater.boxScore.away, guest: theater.boxScore.home };

  return {
    game,
    home,
    seed,
    balanceVersion: BALANCE_VERSION,
    score,
    overtimePeriods: theater.overtimePeriods,
    box,
    simulatedAt: new Date().toISOString(),
  };
}
