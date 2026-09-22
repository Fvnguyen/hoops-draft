/**
 * pvp_match T3: `matchChannel.ts` with a mocked client — no real supabase-js/websocket.
 * Covers D5 (subscribe, fallback to polling after `MATCH_SUBSCRIBE_TIMEOUT_MS`), the
 * `sendMatchAction` version-mismatch retry-once (D5's `useMatch().send`), and the D6
 * heartbeat interval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openMatchChannel,
  rpcForAction,
  sendMatchAction,
  startHeartbeat,
  type MatchClient,
  type MatchRealtimeChannel,
} from '@/lib/matchChannel';
import type { Match, MatchAction } from '@/storage/matchTypes';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match_1',
    seed: 1,
    host_id: 'host-1',
    guest_id: 'guest-1',
    status: 'drafting',
    host_picks: [],
    guest_picks: [],
    host_autopicks: [],
    guest_autopicks: [],
    pick_deadline: null,
    host_roster: null,
    guest_roster: null,
    host_locked_at: null,
    guest_locked_at: null,
    sideboard: {},
    games: [],
    host_seen: null,
    guest_seen: null,
    host_seen_at: null,
    guest_seen_at: null,
    winner_id: null,
    version: 1,
    created_at: '2026-09-22T00:00:00.000Z',
    updated_at: '2026-09-22T00:00:00.000Z',
    ...overrides,
  };
}

/** A fake channel whose `.subscribe()` callback is captured so the test can drive it. */
function makeFakeChannel() {
  let onCb: ((payload: { new: Match }) => void) | null = null;
  let subscribeCb: ((status: string) => void) | null = null;
  const channel: MatchRealtimeChannel = {
    on: (_event, _filter, cb) => {
      onCb = cb;
      return channel;
    },
    subscribe: (cb) => {
      subscribeCb = cb;
      return channel;
    },
  };
  return {
    channel,
    emitUpdate: (row: Match) => onCb?.({ new: row }),
    emitStatus: (status: string) => subscribeCb?.(status),
  };
}

describe('openMatchChannel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('subscribes and receives an update over the channel, reporting realtime transport', async () => {
    const fake = makeFakeChannel();
    const client: MatchClient = {
      channel: () => fake.channel,
      removeChannel: vi.fn(),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      rpc: vi.fn(),
    };

    const onChange = vi.fn();
    const onTransport = vi.fn();
    const handle = openMatchChannel('match_1', { onChange, onTransport }, async () => client);

    // Let the loadClient() promise resolve and openMatchChannel wire up the channel.
    await vi.advanceTimersByTimeAsync(0);
    fake.emitStatus('SUBSCRIBED');
    expect(onTransport).toHaveBeenCalledWith('realtime');

    const updated = makeMatch({ version: 2 });
    fake.emitUpdate(updated);
    expect(onChange).toHaveBeenCalledWith(updated);

    handle.close();
    expect(client.removeChannel).toHaveBeenCalled();
  });

  it('falls back to polling after 5s when the channel never reaches SUBSCRIBED', async () => {
    const fake = makeFakeChannel();
    let pollCount = 0;
    const client: MatchClient = {
      channel: () => fake.channel,
      removeChannel: vi.fn(),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              pollCount++;
              return { data: makeMatch({ version: pollCount }), error: null };
            },
          }),
        }),
      }),
      rpc: vi.fn(),
    };

    const onChange = vi.fn();
    const onTransport = vi.fn();
    const handle = openMatchChannel('match_1', { onChange, onTransport }, async () => client);

    await vi.advanceTimersByTimeAsync(0); // resolve loadClient()
    // Never call fake.emitStatus('SUBSCRIBED') — the channel just hangs.
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(0); // let the immediate poll's promise settle

    expect(onTransport).toHaveBeenCalledWith('polling');
    expect(pollCount).toBeGreaterThan(0);
    expect(onChange).toHaveBeenCalled();

    handle.close();
  });
});

describe('sendMatchAction', () => {
  const action: MatchAction = { type: 'seen', game: 2 };

  it('sends the mapped RPC with the current version on the first try', async () => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe('match_seen');
      expect(args).toEqual({ p_id: 'match_1', p_version: 3, p_game: 2 });
      return { data: makeMatch({ version: 4 }), error: null };
    });
    const result = await sendMatchAction({ rpc }, 'match_1', action, () => 3, async () => null);
    expect(result.version).toBe(4);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('retries once after a version_mismatch, then succeeds with the refetched version', async () => {
    // The server is already at version 5 (someone else acted first); the caller's local
    // copy is stale at 3, so the first send is rejected and must retry after a refetch.
    const serverVersion = 5;
    const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => {
      if (args.p_version !== serverVersion) {
        return { data: null, error: { message: 'version_mismatch: stale' } };
      }
      return { data: makeMatch({ version: serverVersion + 1 }), error: null };
    });
    let currentVersion = 3;
    const getVersion = () => currentVersion;
    // refetch must update what getVersion reads, same as useMatch wires matchRef to it.
    const refetch = vi.fn(async () => {
      currentVersion = serverVersion;
      return makeMatch({ version: serverVersion });
    });

    const result = await sendMatchAction({ rpc }, 'match_1', action, getVersion, refetch);
    expect(result.version).toBe(6);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('rejects on a second version_mismatch (only one retry)', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'version_mismatch: stale' } }));
    const refetch = vi.fn(async () => makeMatch({ version: 9 }));

    await expect(sendMatchAction({ rpc }, 'match_1', action, () => 3, refetch)).rejects.toThrow('version_mismatch');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately on a non-version error, without retrying', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'not_participant: nope' } }));
    const refetch = vi.fn(async () => makeMatch());

    await expect(sendMatchAction({ rpc }, 'match_1', action, () => 3, refetch)).rejects.toThrow('not_participant');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe('rpcForAction', () => {
  it('maps every action variant to its RPC name and p_-prefixed args', () => {
    expect(rpcForAction('m1', 5, { type: 'respond', accept: true })).toEqual({
      fn: 'match_respond',
      args: { p_id: 'm1', p_version: 5, p_accept: true },
    });
    expect(rpcForAction('m1', 5, { type: 'pick', index: 2, cardId: 'card-1' })).toEqual({
      fn: 'match_pick',
      args: { p_id: 'm1', p_version: 5, p_index: 2, p_card_id: 'card-1', p_auto: false },
    });
    expect(rpcForAction('m1', 5, { type: 'autopick', seat: 'guest', index: 2, cardId: 'card-1' })).toEqual({
      fn: 'match_autopick',
      args: { p_id: 'm1', p_version: 5, p_seat: 'guest', p_index: 2, p_card_id: 'card-1' },
    });
    expect(rpcForAction('m1', 5, { type: 'seen', game: 3 })).toEqual({
      fn: 'match_seen',
      args: { p_id: 'm1', p_version: 5, p_game: 3 },
    });
  });
});

describe('startHeartbeat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls match_heartbeat immediately and again on every interval', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const stop = startHeartbeat({ rpc }, 'match_1', 15_000);

    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('match_heartbeat', { p_id: 'match_1' });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(rpc).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(rpc).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(rpc).toHaveBeenCalledTimes(4);
  });
});
