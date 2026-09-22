/**
 * `@/lib/matchSimulate` (pvp_match T5, D7) — the pure logic behind
 * `POST /api/match/[id]/simulate`, exercised without Next.js or Supabase.
 *
 * Fixture: two real rosters out of a headless cube draft (mirrors the challenge-mode
 * fixtures — `seatFromRoster` + `buildTeamInfo` is the same `SavedRoster` -> `TeamInfo`
 * path the 82:0 front office uses), wrapped in a hand-built `Match` row.
 */

import { describe, it, expect } from 'vitest';
import type { DraftSessionSeat } from '@/engine/deckbuilder';
import { buildTeamInfo, simulateGame } from '@/engine/game';
import { coinFlip, homeFor, gameSeed } from '@/engine/playoffs';
import { createRng } from '@/engine/rng';
import { BALANCE_VERSION } from '@/engine/balance';
import { seatFromRoster } from '@/components/challenge/rosterSeat';
import { simulateMatchGame, validateSimulateRequest } from '@/lib/matchSimulate';
import { MATCH_SEAT_ID } from '@/storage/matchTypes';
import type { Match } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import { loadPlayers, runHeadlessDraft, PLAYS } from './helpers';

const players = loadPlayers();

// ── Fixture: two real, drafted rosters ──────────────────────────────────────

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

// One headless draft, reused (cloned) across tests — deterministic and cheap enough to
// share, since nothing here mutates the drafted seats themselves.
const draftSeats = runHeadlessDraft(players, PLAYS, 555_001);
const hostRoster = savedRosterFromSeat(draftSeats[0], 'host-roster');
const guestRoster = savedRosterFromSeat(draftSeats[1], 'guest-roster');
const sideboardRoster = savedRosterFromSeat(draftSeats[2], 'sideboard-roster');

const HOST_ID = 'user-host';
const GUEST_ID = 'user-guest';

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

/** Strip the wall-clock field so two results from different `Date.now()` calls still
 *  compare equal. */
function stable(game: ReturnType<typeof simulateMatchGame>) {
  return { ...game, simulatedAt: undefined };
}

describe('simulateMatchGame — reproducibility (D7)', () => {
  it('is byte-for-byte reproducible from the seed (same MatchGame twice)', () => {
    const match = baseMatch();
    const a = simulateMatchGame(match, 1);
    const b = simulateMatchGame(match, 1);
    expect(stable(a)).toEqual(stable(b));
  });

  it('matches a direct simulateGame(..., { rng: createRng(gameSeed(seed, game)) }) call', () => {
    const match = baseMatch();
    const game = 1;
    const result = simulateMatchGame(match, game);

    const home = homeFor(game, coinFlip(match.seed));
    const seed = gameSeed(match.seed, game);
    expect(result.seed).toBe(seed);
    expect(result.home).toBe(home);

    const hostSeat = { ...seatFromRoster(hostRoster), id: MATCH_SEAT_ID.host };
    const guestSeat = { ...seatFromRoster(guestRoster), id: MATCH_SEAT_ID.guest };
    const hostTeam = buildTeamInfo(hostSeat, true, 'Host');
    const guestTeam = buildTeamInfo(guestSeat, true, 'Guest');

    const theater = home === 'host'
      ? simulateGame(hostTeam, guestTeam, { rng: createRng(seed), events: false })
      : simulateGame(guestTeam, hostTeam, { rng: createRng(seed), events: false });

    const [homeScore, awayScore] = theater.finalScore;
    const expectedScore = home === 'host'
      ? { host: homeScore, guest: awayScore }
      : { host: awayScore, guest: homeScore };

    expect(result.score).toEqual(expectedScore);
    expect(result.overtimePeriods).toBe(theater.overtimePeriods);
    expect(result.balanceVersion).toBe(BALANCE_VERSION);
  });

  it('never ends tied (the engine forces an OT tiebreak point)', () => {
    const match = baseMatch();
    for (let game = 1; game <= 7; game++) {
      const result = simulateMatchGame({ ...match, games: [] }, game);
      expect(result.score.host, `game ${game}`).not.toBe(result.score.guest);
    }
  });

  it('home side follows the 2-2-1-1-1 schedule off the match coin flip', () => {
    const match = baseMatch();
    const flip = coinFlip(match.seed);
    const other = flip === 'host' ? 'guest' : 'host';
    const expected = [flip, flip, other, other, flip, other, flip];
    for (let game = 1; game <= 7; game++) {
      const result = simulateMatchGame(match, game);
      expect(result.home, `game ${game}`).toBe(expected[game - 1]);
    }
  });

  it('uses the sideboard roster for a side when present', () => {
    const withoutSideboard = simulateMatchGame(baseMatch(), 1);
    const withSideboard = simulateMatchGame(
      baseMatch({
        sideboard: { host: { roster: sideboardRoster, lockedAt: '2026-01-05T00:00:00.000Z' } },
      }),
      1,
    );

    const hostIdsWithout = new Set(withoutSideboard.box.host.map((b) => b.playerId));
    const hostIdsWith = new Set(withSideboard.box.host.map((b) => b.playerId));
    const sideboardStarterIds = new Set(Object.values(sideboardRoster.depthChartOrder).flat());

    // At least the host box score composition changes, and it draws from the sideboard
    // roster's players rather than the originally-locked host roster's.
    expect(hostIdsWith).not.toEqual(hostIdsWithout);
    for (const id of hostIdsWith) {
      expect(sideboardStarterIds.has(id) || sideboardRoster.draftedCards.some((c) => c.id === id)).toBe(true);
    }
  });
});

describe('validateSimulateRequest — request rules (D7)', () => {
  it('is ok for a participant on the next game of a series match', () => {
    expect(validateSimulateRequest(baseMatch(), HOST_ID, 1)).toEqual({ kind: 'ok' });
    expect(validateSimulateRequest(baseMatch(), GUEST_ID, 1)).toEqual({ kind: 'ok' });
  });

  it('is idempotent: an already-recorded game is returned instead of refused', () => {
    const existingGame = simulateMatchGame(baseMatch(), 1);
    const match = baseMatch({ games: [existingGame] });
    // The "next" game (2) would be `ok`, but re-requesting game 1 must replay it.
    expect(validateSimulateRequest(match, HOST_ID, 1)).toEqual({ kind: 'existing', game: existingGame });
  });

  it('refuses a non-participant', () => {
    const result = validateSimulateRequest(baseMatch(), 'someone-else', 1);
    expect(result).toEqual({ kind: 'error', status: 403, reason: 'not_participant' });
  });

  it('refuses the wrong status (not yet series)', () => {
    const match = baseMatch({ status: 'building' });
    const result = validateSimulateRequest(match, HOST_ID, 1);
    expect(result).toEqual({ kind: 'error', status: 409, reason: 'bad_sequence' });
  });

  it('refuses an out-of-order game number (skipping ahead)', () => {
    // games is empty (no game 1 yet), but the caller asks for game 3.
    const match = baseMatch({ games: [] });
    const result = validateSimulateRequest(match, HOST_ID, 3);
    expect(result).toEqual({ kind: 'error', status: 409, reason: 'bad_sequence' });
  });

  it('refuses a game number outside 1..7', () => {
    expect(validateSimulateRequest(baseMatch(), HOST_ID, 0)).toEqual({ kind: 'error', status: 409, reason: 'bad_sequence' });
    expect(validateSimulateRequest(baseMatch(), HOST_ID, 8)).toEqual({ kind: 'error', status: 409, reason: 'bad_sequence' });
  });
});
