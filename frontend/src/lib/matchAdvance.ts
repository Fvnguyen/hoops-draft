/**
 * pvp_series D2: the pure rule for what `POST /api/match/[id]/advance` does next. The route
 * is the ONLY writer of a series' progress (games, `sideboard` / `done` status, `winner_id`):
 * it loads the row with the service role, applies `planAdvance` repeatedly (simulate ->
 * maybe sideboard/done) until it returns `wait`, writing each step under version CAS.
 * It replaces pvp_match's `/simulate` route, which let a participant simulate the next
 * game at any time and so skip D2's "both have watched" rule.
 *
 * Rules, in order, for a row in status 'series':
 *   1. `seriesState(games, sideboardHappened).over`  -> done (winner = the side with 4).
 *   2. `.sideboardDue`                                -> sideboard (status 'sideboard').
 *   3. no games yet                                   -> simulate game 1.
 *   4. both `*_seen.game >= games.length`             -> simulate the next game.
 *   5. one side has seen the last game, and it is `SEEN_ADVANCE_TIMEOUT_MS` since that
 *      side's `*_seen.at`                             -> simulate the next game.
 *   6. otherwise                                      -> wait.
 * Any other status -> wait ('sideboard' is resumed by `match_sideboard` itself once both
 * lock; the 7-day forfeit is `match_expire`'s job, which the route calls first).
 * `sideboardHappened` = both sideboard entries exist.
 */

import type { Match, MatchSide } from '@/storage/matchTypes';
import { seriesState } from '@/engine/playoffs';

export const SEEN_ADVANCE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export type AdvancePlan =
  | { kind: 'simulate'; game: number }
  | { kind: 'sideboard' }
  | { kind: 'done'; winner: MatchSide }
  | { kind: 'wait'; reason: 'not-series' | 'waiting-seen' };

export function planAdvance(match: Pick<Match, 'status' | 'games' | 'sideboard' | 'host_seen' | 'guest_seen'>, now: number): AdvancePlan {
  if (match.status !== 'series') return { kind: 'wait', reason: 'not-series' };

  const sideboardHappened = Boolean(match.sideboard.host && match.sideboard.guest);
  const state = seriesState(match.games, sideboardHappened);

  if (state.over) {
    return { kind: 'done', winner: state.winner! };
  }
  if (state.sideboardDue) {
    return { kind: 'sideboard' };
  }
  if (match.games.length === 0) {
    return { kind: 'simulate', game: 1 };
  }

  const lastGame = match.games.length;
  const hostSeenLast = (match.host_seen?.game ?? 0) >= lastGame;
  const guestSeenLast = (match.guest_seen?.game ?? 0) >= lastGame;
  if (hostSeenLast && guestSeenLast) {
    return { kind: 'simulate', game: state.nextGame! };
  }

  // Rule 5: exactly one side has seen the last game (the both-seen case returned above),
  // and it has been SEEN_ADVANCE_TIMEOUT_MS since that side's *_seen.at — a vanished
  // opponent cannot freeze the series.
  const seenAt = hostSeenLast ? match.host_seen?.at : guestSeenLast ? match.guest_seen?.at : undefined;
  if (seenAt && now - new Date(seenAt).getTime() >= SEEN_ADVANCE_TIMEOUT_MS) {
    return { kind: 'simulate', game: state.nextGame! };
  }

  return { kind: 'wait', reason: 'waiting-seen' };
}

/**
 * The pure part of applying one `AdvancePlan` to a match row: what fields change. The
 * route does the actual simulate-engine call (it needs the full `Match` for
 * `simulateMatchGame`, not just this pick) and the version-CAS write; this only shapes the
 * patch for the non-`simulate` cases (and is reused by tests without a live route).
 * `winner_id` for a `done` plan is looked up from `hostId`/`guestId`.
 */
export function applyPlan(
  plan: AdvancePlan,
  ids: { hostId: string; guestId: string },
): Partial<Match> | null {
  if (plan.kind === 'sideboard') return { status: 'sideboard' };
  if (plan.kind === 'done') {
    return { status: 'done', winner_id: plan.winner === 'host' ? ids.hostId : ids.guestId };
  }
  // 'simulate' needs the engine call (done by the route with the full match); 'wait' is a
  // no-op — both return null here.
  return null;
}
