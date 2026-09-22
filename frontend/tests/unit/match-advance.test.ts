/**
 * `@/lib/matchAdvance` (pvp_series T3, D2) — `planAdvance` and `applyPlan`, exercised
 * without Next.js or Supabase. Fixture rows are built the same way
 * `tests/unit/match-simulate.test.ts` builds them: real rosters out of a headless cube
 * draft, wrapped in a hand-built `Match` row.
 */

import { describe, it, expect } from 'vitest';
import type { DraftSessionSeat } from '@/engine/deckbuilder';
import { planAdvance, applyPlan, SEEN_ADVANCE_TIMEOUT_MS } from '@/lib/matchAdvance';
import { simulateMatchGame } from '@/lib/matchSimulate';
import { seriesState } from '@/engine/playoffs';
import type { Match, MatchSide } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import { loadPlayers, runHeadlessDraft, PLAYS } from './helpers';

const players = loadPlayers();

function savedRosterFromSeat(seat: DraftSessionSeat, id: string): SavedRoster {
  return {
    id,
    name: id,
    timestamp: '2026-01-01T00:00:00.000Z',
    draftedCards: seat.drafted,
    depthChartOrder: seat.builtRoster.depthChart,
    activePlays: seat.builtRoster.activePlays,
    playAssignments: seat.builtRoster.playAssignments,
    archetypes: seat.builtRoster.archetypes,
    version: seat.builtRoster.version ?? 2,
    sessionId: null,
  };
}

const draftSeats = runHeadlessDraft(players, PLAYS, 555_002);
const hostRoster = savedRosterFromSeat(draftSeats[0], 'host-roster');
const guestRoster = savedRosterFromSeat(draftSeats[1], 'guest-roster');
const sideboardHostRoster = savedRosterFromSeat(draftSeats[2], 'sideboard-host-roster');
const sideboardGuestRoster = savedRosterFromSeat(draftSeats[3], 'sideboard-guest-roster');

const HOST_ID = 'user-host';
const GUEST_ID = 'user-guest';
const NOW = new Date('2026-02-01T00:00:00.000Z').getTime();

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    seed: 424_242,
    host_id: HOST_ID,
    guest_id: GUEST_ID,
    status: 'series',
    host_picks: [],
    guest_picks: [],
    host_autopicks: [],
    guest_autopicks: [],
    pick_deadline: null,
    host_roster: structuredClone(hostRoster),
    guest_roster: structuredClone(guestRoster),
    host_locked_at: '2026-01-01T00:00:00.000Z',
    guest_locked_at: '2026-01-01T00:00:00.000Z',
    sideboard: {},
    games: [],
    host_seen: null,
    guest_seen: null,
    host_seen_at: null,
    guest_seen_at: null,
    winner_id: null,
    void_reason: null,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Apply one `simulate` plan for real, the way the route does: append the engine's own
 *  `simulateMatchGame` result. */
function simulateStep(match: Match, game: number): Match {
  return { ...match, games: [...match.games, simulateMatchGame(match, game)] };
}

describe('planAdvance — game 1', () => {
  it('simulates game 1 once both rosters are locked and no games exist yet', () => {
    const match = baseMatch();
    expect(planAdvance(match, NOW)).toEqual({ kind: 'simulate', game: 1 });
  });
});

describe('planAdvance — game n+1 only after both have seen game n', () => {
  it('waits when neither side has seen game 1 yet', () => {
    const match = simulateStep(baseMatch(), 1);
    expect(planAdvance(match, NOW)).toEqual({ kind: 'wait', reason: 'waiting-seen' });
  });

  it('waits when only one side has seen game 1 (before the timeout)', () => {
    const match = simulateStep(baseMatch(), 1);
    const withHostSeen: Match = { ...match, host_seen: { game: 1, at: new Date(NOW).toISOString() } };
    expect(planAdvance(withHostSeen, NOW + 1000)).toEqual({ kind: 'wait', reason: 'waiting-seen' });
  });

  it('simulates game 2 once both sides have seen game 1', () => {
    const match = simulateStep(baseMatch(), 1);
    const bothSeen: Match = {
      ...match,
      host_seen: { game: 1, at: new Date(NOW).toISOString() },
      guest_seen: { game: 1, at: new Date(NOW).toISOString() },
    };
    expect(planAdvance(bothSeen, NOW + 1000)).toEqual({ kind: 'simulate', game: 2 });
  });

  it('does not jump ahead: seeing game 1 does not unlock game 3 when game 2 is not played', () => {
    // games only has game 1; even with both seen, nextGame from seriesState is 2, not 3.
    const match = simulateStep(baseMatch(), 1);
    const bothSeen: Match = {
      ...match,
      host_seen: { game: 1, at: new Date(NOW).toISOString() },
      guest_seen: { game: 1, at: new Date(NOW).toISOString() },
    };
    const plan = planAdvance(bothSeen, NOW + 1000);
    expect(plan).toEqual({ kind: 'simulate', game: 2 });
  });
});

describe('planAdvance — 24h one-sided timeout (D2 rule 5)', () => {
  it('waits just before 24h with only one side having seen the last game', () => {
    const match = simulateStep(baseMatch(), 1);
    const oneSeen: Match = { ...match, host_seen: { game: 1, at: new Date(NOW).toISOString() } };
    const almost24h = NOW + SEEN_ADVANCE_TIMEOUT_MS - 1;
    expect(planAdvance(oneSeen, almost24h)).toEqual({ kind: 'wait', reason: 'waiting-seen' });
  });

  it('simulates the next game exactly at/after 24h with only one side seen', () => {
    const match = simulateStep(baseMatch(), 1);
    const oneSeen: Match = { ...match, host_seen: { game: 1, at: new Date(NOW).toISOString() } };
    const after24h = NOW + SEEN_ADVANCE_TIMEOUT_MS;
    expect(planAdvance(oneSeen, after24h)).toEqual({ kind: 'simulate', game: 2 });
  });

  it('also fires for the guest side alone', () => {
    const match = simulateStep(baseMatch(), 1);
    const oneSeen: Match = { ...match, guest_seen: { game: 1, at: new Date(NOW).toISOString() } };
    const after24h = NOW + SEEN_ADVANCE_TIMEOUT_MS;
    expect(planAdvance(oneSeen, after24h)).toEqual({ kind: 'simulate', game: 2 });
  });
});

describe('planAdvance — sideboard gate', () => {
  function seriesAtTwoHostWins(): Match {
    // Force two host wins directly on the fixture rosters is awkward with the real
    // engine, so drive two real simulated games and check whichever side is ahead by 2;
    // if the fixture seed does not produce a 2-0/2-1 lead after 2 games, extend to game 3.
    let match = baseMatch();
    for (let g = 1; g <= 3; g++) {
      match = simulateStep({
        ...match,
        host_seen: match.games.length > 0 ? { game: match.games.length, at: new Date(NOW).toISOString() } : null,
        guest_seen: match.games.length > 0 ? { game: match.games.length, at: new Date(NOW).toISOString() } : null,
      }, g);
      const state = seriesState(match.games, false);
      if (state.sideboardDue) return match;
    }
    throw new Error('fixture did not reach a sideboardDue state in 3 games — adjust the seed');
  }

  it('returns sideboard, not simulate, once sideboardDue and status stays series', () => {
    const match = seriesAtTwoHostWins();
    const plan = planAdvance(match, NOW);
    expect(plan).toEqual({ kind: 'sideboard' });
  });

  it('applyPlan turns a sideboard plan into status "sideboard"', () => {
    const patch = applyPlan({ kind: 'sideboard' }, { hostId: HOST_ID, guestId: GUEST_ID });
    expect(patch).toEqual({ status: 'sideboard' });
  });

  it('is blocked while status is already "sideboard" (waits for match_sideboard itself)', () => {
    const match = seriesAtTwoHostWins();
    const inSideboard: Match = { ...match, status: 'sideboard' };
    expect(planAdvance(inSideboard, NOW)).toEqual({ kind: 'wait', reason: 'not-series' });
  });

  it('after both sideboard entries are locked, the next game is simulated with rosters: "sideboard"', () => {
    const match = seriesAtTwoHostWins();
    const bothLocked: Match = {
      ...match,
      status: 'series',
      sideboard: {
        host: { roster: sideboardHostRoster, lockedAt: '2026-01-05T00:00:00.000Z' },
        guest: { roster: sideboardGuestRoster, lockedAt: '2026-01-05T00:00:00.000Z' },
      },
    };
    // sideboardDue is now false (sideboardHappened=true), and both sides have "seen" every
    // game so far isn't required for a game that hasn't been simulated yet — but game n+1
    // still needs both to have seen game n. Mark both as having seen the last game.
    const lastGame = bothLocked.games.length;
    const ready: Match = {
      ...bothLocked,
      host_seen: { game: lastGame, at: new Date(NOW).toISOString() },
      guest_seen: { game: lastGame, at: new Date(NOW).toISOString() },
    };
    const plan = planAdvance(ready, NOW);
    expect(plan.kind).toBe('simulate');
    if (plan.kind === 'simulate') {
      const nextGame = simulateMatchGame(ready, plan.game);
      expect(nextGame.rosters).toBe('sideboard');
    }
  });
});

describe('planAdvance — series over', () => {
  it('reaches done with the correct winner once a side has 4 wins', () => {
    // Drive games until seriesState reports over, always marking both seen so nothing stalls.
    let match = baseMatch();
    let state = seriesState(match.games, false);
    let guard = 0;
    while (!state.over && guard < 20) {
      guard++;
      const lastGame = match.games.length;
      const seen: Match = lastGame > 0
        ? { ...match, host_seen: { game: lastGame, at: new Date(NOW).toISOString() }, guest_seen: { game: lastGame, at: new Date(NOW).toISOString() } }
        : match;
      const plan = planAdvance(seen, NOW);
      if (plan.kind === 'simulate') {
        match = simulateStep(seen, plan.game);
      } else if (plan.kind === 'sideboard') {
        match = { ...seen, status: 'series', sideboard: {
          host: { roster: sideboardHostRoster, lockedAt: new Date(NOW).toISOString() },
          guest: { roster: sideboardGuestRoster, lockedAt: new Date(NOW).toISOString() },
        } };
      } else {
        break;
      }
      state = seriesState(match.games, Boolean(match.sideboard.host && match.sideboard.guest));
    }
    expect(state.over).toBe(true);
    const finalPlan = planAdvance(match, NOW);
    expect(finalPlan.kind).toBe('done');
    if (finalPlan.kind === 'done') {
      const patch = applyPlan(finalPlan, { hostId: HOST_ID, guestId: GUEST_ID });
      expect(patch).toEqual({
        status: 'done',
        winner_id: finalPlan.winner === 'host' ? HOST_ID : GUEST_ID,
      });
      expect(patch!.winner_id).toBe(state.winner === 'host' ? HOST_ID : GUEST_ID);
    }
  });
});

describe('a full series driven by repeated planAdvance + apply', () => {
  it('terminates at 4-x within at most 7 games, with exactly one sideboard', () => {
    let match = baseMatch();
    let sideboardCount = 0;
    let guard = 0;

    for (;;) {
      guard++;
      expect(guard).toBeLessThan(50); // sanity: must terminate well before this

      const lastGame = match.games.length;
      const withSeen: Match = lastGame > 0
        ? {
          ...match,
          host_seen: { game: lastGame, at: new Date(NOW).toISOString() },
          guest_seen: { game: lastGame, at: new Date(NOW).toISOString() },
        }
        : match;

      const plan = planAdvance(withSeen, NOW);
      if (plan.kind === 'wait') {
        // Should not happen once both are marked seen and no sideboard is pending, but
        // bail cleanly if it ever does (would indicate a bug to chase, not loop forever).
        break;
      }
      if (plan.kind === 'simulate') {
        match = simulateStep(withSeen, plan.game);
        continue;
      }
      if (plan.kind === 'sideboard') {
        sideboardCount++;
        match = {
          ...withSeen,
          status: 'series',
          sideboard: {
            host: { roster: sideboardHostRoster, lockedAt: new Date(NOW).toISOString() },
            guest: { roster: sideboardGuestRoster, lockedAt: new Date(NOW).toISOString() },
          },
        };
        continue;
      }
      if (plan.kind === 'done') {
        const patch = applyPlan(plan, { hostId: HOST_ID, guestId: GUEST_ID })!;
        match = { ...withSeen, ...patch } as Match;
        break;
      }
    }

    const state = seriesState(match.games, Boolean(match.sideboard.host && match.sideboard.guest));
    expect(state.over).toBe(true);
    expect(match.status).toBe('done');
    expect(match.games.length).toBeLessThanOrEqual(7);
    expect(match.games.length).toBeGreaterThanOrEqual(4);
    expect(sideboardCount).toBe(1);
    const expectedWinnerId: MatchSide = state.winner === 'host' ? 'host' : 'guest';
    expect(match.winner_id).toBe(expectedWinnerId === 'host' ? HOST_ID : GUEST_ID);
  });
});
