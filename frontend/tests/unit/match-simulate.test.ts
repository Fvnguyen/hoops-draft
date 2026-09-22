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
import { simulateMatchGame, theaterForMatchGame } from '@/lib/matchSimulate';
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

  it('plays the sideboard rosters only once BOTH sides have locked one (pvp_series D4)', () => {
    const locked = simulateMatchGame(baseMatch(), 3);
    const hostEntry = { roster: sideboardRoster, lockedAt: '2026-01-05T00:00:00.000Z' };
    const guestLocked = baseMatch().guest_roster!;
    const guestEntry = { roster: guestLocked, lockedAt: '2026-01-05T00:00:00.000Z' };

    // One side locked: the series has not resumed, a game would still use the locked rosters.
    const oneSided = simulateMatchGame(baseMatch({ sideboard: { host: hostEntry } }), 3);
    expect(oneSided.rosters).toBe('locked');
    expect(oneSided.score).toEqual(locked.score);

    const both = simulateMatchGame(baseMatch({ sideboard: { host: hostEntry, guest: guestEntry } }), 3);
    expect(both.rosters).toBe('sideboard');
    const hostIdsWith = new Set(both.box.host.map((b) => b.playerId));
    expect(hostIdsWith).not.toEqual(new Set(locked.box.host.map((b) => b.playerId)));
    for (const id of hostIdsWith) {
      expect(sideboardRoster.draftedCards.some((c) => c.id === id)).toBe(true);
    }
  });

  it('a replay uses the rosters the game was played with, even after the sideboard', () => {
    const game1 = simulateMatchGame(baseMatch(), 1);
    const afterSideboard = baseMatch({
      games: [game1],
      sideboard: {
        host: { roster: sideboardRoster, lockedAt: '2026-01-05T00:00:00.000Z' },
        guest: { roster: baseMatch().guest_roster!, lockedAt: '2026-01-05T00:00:00.000Z' },
      },
    });
    const { theater, home } = theaterForMatchGame(afterSideboard, 1);
    const [h, a] = theater.finalScore;
    expect(home === 'host' ? { host: h, guest: a } : { host: a, guest: h }).toEqual(game1.score);
  });

  it('records the five starters on each side', () => {
    const g = simulateMatchGame(baseMatch(), 1);
    expect(g.starters?.host).toHaveLength(5);
    expect(g.starters?.guest).toHaveLength(5);
  });
});
