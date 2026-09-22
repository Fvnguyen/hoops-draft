/**
 * A roster simulates identically whatever order its depth-chart keys arrive in. Postgres
 * `jsonb` stores keys shortest-first (C, PF, PG, SF, SG), so a roster that came back from
 * cloud sync or a Playoffs match row used to replay to a different score (4 of 4 probe
 * games differed, one winner flipped) than the same roster fresh from the deck builder.
 */
import { describe, it, expect } from 'vitest';
import { buildTeamInfo, simulateGame } from '@/engine/game';
import { canonicalDepthChart } from '@/engine/teamInfo';
import { createRng } from '@/engine/rng';
import type { DraftSessionSeat } from '@/engine/deckbuilder';
import { loadPlayers, runHeadlessDraft, PLAYS } from './helpers';

/** Every object's keys in Postgres jsonb order: shorter first, then bytewise. */
function jsonbOrder<T>(v: T): T {
  if (Array.isArray(v)) return v.map(jsonbOrder) as T;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as object).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(keys.map((k) => [k, jsonbOrder((v as Record<string, unknown>)[k])])) as T;
  }
  return v;
}

describe('depth-chart key order', () => {
  const seats = runHeadlessDraft(loadPlayers(), PLAYS, 555_001);

  it('canonicalDepthChart puts PG, SG, SF, PF, C first and keeps extra keys', () => {
    const out = canonicalDepthChart({ C: ['c'], PF: ['pf'], PG: ['pg'], SF: ['sf'], SG: ['sg'], X: ['x'] });
    expect(Object.keys(out)).toEqual(['PG', 'SG', 'SF', 'PF', 'C', 'X']);
  });

  it('a jsonb-ordered roster plays the exact same game', () => {
    for (let s = 0; s < 4; s++) {
      const play = (a: DraftSessionSeat, b: DraftSessionSeat) =>
        simulateGame(buildTeamInfo(a, true, 'A'), buildTeamInfo(b, true, 'B'), { rng: createRng(1234 + s), events: false });
      const fresh = play(seats[s], seats[s + 4]);
      const synced = play(jsonbOrder(seats[s]), jsonbOrder(seats[s + 4]));
      expect(synced.finalScore, `seat ${s}`).toEqual(fresh.finalScore);
      expect(synced.boxScore, `seat ${s}`).toEqual(fresh.boxScore);
    }
  });
});
