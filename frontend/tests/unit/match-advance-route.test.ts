/**
 * `POST /api/match/[id]/advance` (pvp_series T3) exercised against a mocked Supabase
 * layer — `@/lib/supabase/server` and `@/lib/supabase/admin` are vi.mock'd so this runs
 * without a live Supabase project. The mock's `matches` table is a single in-memory row
 * with the same version-CAS update semantics the real table enforces via RLS + the route's
 * own `.eq('version', ...)` predicate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DraftSessionSeat } from '@/engine/deckbuilder';
import type { Match } from '@/storage/matchTypes';
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

const draftSeats = runHeadlessDraft(players, PLAYS, 555_003);
const hostRoster = savedRosterFromSeat(draftSeats[0], 'host-roster');
const guestRoster = savedRosterFromSeat(draftSeats[1], 'guest-roster');

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

// ── In-memory "matches" table + a chainable query-builder stub ─────────────

let table: Record<string, Match>;
let currentUserId: string | null;

function makeAdminQuery(op: 'select' | 'update', patch?: Record<string, unknown>) {
  const filters: Array<(row: Match) => boolean> = [];
  const builder = {
    eq(col: string, val: unknown) {
      filters.push((row) => (row as unknown as Record<string, unknown>)[col] === val);
      return builder;
    },
    select() {
      return builder;
    },
    async maybeSingle() {
      const id = Object.keys(table).find((k) => filters.every((f) => f(table[k])));
      if (!id) return { data: null, error: null };
      if (op === 'update' && patch) {
        const row = table[id];
        const updated: Match = { ...row, ...(patch as Partial<Match>) };
        table[id] = updated;
        return { data: updated, error: null };
      }
      return { data: table[id], error: null };
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: (_tableName: string) => ({
      select: () => makeAdminQuery('select'),
      update: (patch: Record<string, unknown>) => makeAdminQuery('update', patch),
    }),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }),
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

describe('POST /api/match/[id]/advance (mocked Supabase)', () => {
  beforeEach(() => {
    table = { 'match-1': baseMatch() };
    currentUserId = HOST_ID;
  });

  it('401s when not signed in', async () => {
    currentUserId = null;
    const { POST } = await import('@/app/api/match/[id]/advance/route');
    const res = await POST(new Request('http://test/api/match/match-1/advance', { method: 'POST' }), {
      params: Promise.resolve({ id: 'match-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('403s a signed-in user who is not a participant', async () => {
    currentUserId = 'someone-else';
    const { POST } = await import('@/app/api/match/[id]/advance/route');
    const res = await POST(new Request('http://test/api/match/match-1/advance', { method: 'POST' }), {
      params: Promise.resolve({ id: 'match-1' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('not_participant');
  });

  it('404s a match that does not exist', async () => {
    const { POST } = await import('@/app/api/match/[id]/advance/route');
    const res = await POST(new Request('http://test/api/match/nope/advance', { method: 'POST' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('simulates game 1 for a participant when both rosters are locked and no games exist', async () => {
    const { POST } = await import('@/app/api/match/[id]/advance/route');
    const res = await POST(new Request('http://test/api/match/match-1/advance', { method: 'POST' }), {
      params: Promise.resolve({ id: 'match-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match.games).toHaveLength(1);
    expect(body.match.games[0].game).toBe(1);
    expect(body.match.version).toBe(2);
    // The stored row was actually updated (persisted), not just echoed in the response.
    expect(table['match-1'].games).toHaveLength(1);
  });

  it('is a no-op (wait) when nobody has seen game 1 yet, on the second call', async () => {
    const { POST } = await import('@/app/api/match/[id]/advance/route');
    const req = () => new Request('http://test/api/match/match-1/advance', { method: 'POST' });
    const first = await POST(req(), { params: Promise.resolve({ id: 'match-1' }) });
    expect((await first.json()).match.games).toHaveLength(1);

    const second = await POST(req(), { params: Promise.resolve({ id: 'match-1' }) });
    const body = await second.json();
    expect(body.match.games).toHaveLength(1); // unchanged — waiting on both sides to see game 1
    expect(body.match.version).toBe(2); // no further write happened
  });
});
