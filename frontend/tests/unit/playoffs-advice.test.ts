/**
 * pvp_series T5 (D4): `engine/challengeAdvice.ts`'s series input adapter
 * (`seriesAdviceHalf`) and the trade-offer sourcing `PlayoffsFrontOffice` builds on top
 * of `drawTradeOffers`.
 *
 * Fixture: a real 2-1 series out of a headless cube draft (mirrors
 * `tests/unit/match-simulate.test.ts` — `seatFromRoster` + `buildTeamInfo` is the same
 * `SavedRoster` -> `TeamInfo` path the 82:0 front office uses), with games produced by
 * `simulateMatchGame` so the box rows are exactly what a real series game would store.
 */

import { describe, it, expect } from 'vitest';
import type { DraftSessionSeat } from '@/engine/deckbuilder';
import { buildTeamInfo } from '@/engine/game';
import { seatFromRoster } from '@/components/challenge/rosterSeat';
import { simulateMatchGame } from '@/lib/matchSimulate';
import { MATCH_SEAT_ID } from '@/storage/matchTypes';
import type { Match, MatchSide } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import { challengeAdvice, seriesAdviceHalf } from '@/engine/challengeAdvice';
import { drawTradeOffers } from '@/engine/challenge';
import { getAllCards } from '@/engine/cards';
import { createRng, mixSeed } from '@/engine/rng';
import type { Rarity } from '@/engine/types';
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

const draftSeats = runHeadlessDraft(players, PLAYS, 909_001);
const hostRoster = savedRosterFromSeat(draftSeats[0], 'host-roster');
const guestRoster = savedRosterFromSeat(draftSeats[1], 'guest-roster');

const HOST_ID = 'user-host';
const GUEST_ID = 'user-guest';

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-advice-1',
    seed: 733_991,
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

/** Simulate real series games onto a match until it reaches a 2-1 line (3 games,
 *  whichever the seed produces — the fixture just needs SOME games, not a specific
 *  score). */
function seriesThroughThreeGames(): Match {
  let match = baseMatch();
  for (let game = 1; game <= 3; game++) {
    const g = simulateMatchGame(match, game);
    match = { ...match, games: [...match.games, g] };
  }
  return match;
}

const match = seriesThroughThreeGames();

function teamFor(side: MatchSide, roster: SavedRoster) {
  const seat = { ...seatFromRoster(roster), id: MATCH_SEAT_ID[side] };
  return buildTeamInfo(seat, true, roster.name || 'Your team');
}

describe('seriesAdviceHalf (D4 input adapter)', () => {
  it('produces a half whose games/wins/losses match the series so far', () => {
    const half = seriesAdviceHalf(match.games, 'host');
    expect(half.games.length).toBe(3);
    expect(half.wins + half.losses).toBe(3);
    expect(half.wins).toBe(match.games.filter((g) => g.score.host > g.score.guest).length);
  });

  it('host and guest views are complementary (one W per game across both sides)', () => {
    const hostHalf = seriesAdviceHalf(match.games, 'host');
    const guestHalf = seriesAdviceHalf(match.games, 'guest');
    expect(hostHalf.wins + guestHalf.wins).toBe(3);
  });

  it('feeds challengeAdvice to at least three reasons, never a rating or a record', () => {
    for (const side of ['host', 'guest'] as MatchSide[]) {
      const roster = side === 'host' ? hostRoster : guestRoster;
      const half = seriesAdviceHalf(match.games, side);
      const team = teamFor(side, roster);
      const advice = challengeAdvice({ team, half, seed: mixSeed(match.seed, `advice:${side}`) });

      expect(advice.reasons.length).toBeGreaterThanOrEqual(3);
      expect(advice.quotes.length).toBe(3);

      const strings = [
        advice.band.label, advice.band.lowGrade.title, advice.band.highGrade.title,
        ...advice.reasons.flatMap((r) => [r.evidence, ...Object.values(r.vars)]),
        ...advice.quotes.flatMap((q) => [q.text, q.evidence]),
      ];
      for (const s of strings) {
        expect(s, s).not.toMatch(/\b(ovr|overall|ratings?)\b/i);
        expect(s, s).not.toMatch(/midRange|perimeterDefense|postDefense/);
      }
    }
  });

  it('is a pure function of (games, side): calling twice gives the same half', () => {
    const a = seriesAdviceHalf(match.games, 'host');
    const b = seriesAdviceHalf(match.games, 'host');
    expect(a).toEqual(b);
  });
});

describe('pvp_series trade offers (D4)', () => {
  const allCards = getAllCards();
  const bothDraftedIds = new Set([
    ...hostRoster.draftedCards.map((c) => c.id),
    ...guestRoster.draftedCards.map((c) => c.id),
  ]);
  const droppedRarity: Rarity = (hostRoster.draftedCards.find((c) => c.type === 'Player')?.rarity ?? 'Common') as Rarity;

  it('is deterministic for the same match seed and side', () => {
    const seed = mixSeed(match.seed, 'trade:host');
    const first = drawTradeOffers(allCards, bothDraftedIds, droppedRarity, createRng(seed));
    const second = drawTradeOffers(allCards, bothDraftedIds, droppedRarity, createRng(seed));
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });

  it('host and guest draw different offers for the same match', () => {
    const hostOffers = drawTradeOffers(
      allCards, bothDraftedIds, droppedRarity, createRng(mixSeed(match.seed, 'trade:host')),
    );
    const guestOffers = drawTradeOffers(
      allCards, bothDraftedIds, droppedRarity, createRng(mixSeed(match.seed, 'trade:guest')),
    );
    expect(hostOffers.map((c) => c.id)).not.toEqual(guestOffers.map((c) => c.id));
  });

  it('never offers a card either player already drafted', () => {
    const offers = drawTradeOffers(
      allCards, bothDraftedIds, droppedRarity, createRng(mixSeed(match.seed, 'trade:host')),
    );
    for (const card of offers) {
      expect(bothDraftedIds.has(card.id)).toBe(false);
    }
  });
});
