/**
 * pvp_match T3: the transport underneath `useMatch` — subscribes to `public.matches` row
 * `id` over Supabase Realtime (D5), falls back to polling if the channel does not reach
 * `SUBSCRIBED` within `MATCH_SUBSCRIBE_TIMEOUT_MS`, and carries the pure RPC dispatch/retry
 * and heartbeat helpers `useMatch` composes into a hook.
 *
 * supabase-js loads LAZILY: `loadMatchClient()` dynamically imports
 * `@/lib/supabase/browser` on first call and memoizes the client (mirrors
 * `src/storage/lazyCloudClient.ts` — a failed load is not cached, so a later retry can
 * still succeed). Nothing in this file imports `@supabase/supabase-js` directly, so it
 * never lands in the initial bundle of `/`.
 *
 * Everything below is written against small structural interfaces rather than the real
 * `SupabaseClient` type, so tests can pass a plain object double instead of a real client.
 */

import {
  MATCH_POLL_MS,
  MATCH_SUBSCRIBE_TIMEOUT_MS,
  matchErrorCode,
  type Match,
  type MatchAction,
  type MatchTransport,
} from '@/storage/matchTypes';

/** What `openMatchChannel`'s polling fallback and `useMatch`'s initial load need. */
export interface MatchPollClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: Match | null; error: { message?: string } | null }>;
      };
    };
  };
}

/** A minimal `postgres_changes` channel: enough to subscribe and get told the status. */
export interface MatchRealtimeChannel {
  on(
    event: 'postgres_changes',
    filter: { event: string; schema: string; table: string; filter: string },
    callback: (payload: { new: Match }) => void,
  ): MatchRealtimeChannel;
  subscribe(callback: (status: string) => void): MatchRealtimeChannel;
}

export interface MatchRealtimeClient extends MatchPollClient {
  channel(name: string): MatchRealtimeChannel;
  removeChannel(channel: MatchRealtimeChannel): void;
}

/** What `sendMatchAction`/`startHeartbeat` need to call a versioned or heartbeat RPC. */
export interface MatchRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
}

export type MatchClient = MatchRealtimeClient & MatchRpcClient;

export type MatchClientLoader = () => Promise<MatchClient>;

let clientPromise: Promise<MatchClient> | null = null;

/** Memoized lazy Supabase browser client, shared by every `useMatch`/`useMatchList` call
 *  on the page. A failed import/construction (offline, a chunk 404 after a deploy) is not
 *  cached, so the next call tries again instead of staying dead for the session.
 *
 * pvp_draft: `createBrowserClient` (`@supabase/ssr`) reads the session from cookies
 * asynchronously — the client object exists before that resolves. `openMatchChannel`
 * subscribes to the row's `postgres_changes` channel as soon as this promise resolves; a
 * channel joined before the client's own auth is attached connects unauthenticated, and
 * RLS then silently drops every event for a private row like `matches` FOREVER (the
 * subscription never re-authenticates on its own) — the symptom is a room that looks
 * "SUBSCRIBED" but never hears the other side's picks. Awaiting `getSession()` here, once,
 * before the client is handed out guarantees the realtime socket's first join already
 * carries a token. */
export function loadMatchClient(): Promise<MatchClient> {
  if (!clientPromise) {
    clientPromise = import('@/lib/supabase/browser')
      .then(async ({ createSupabaseBrowserClient }) => {
        const client = createSupabaseBrowserClient();
        await client.auth.getSession();
        return client as unknown as MatchClient;
      })
      .catch((error: unknown) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

/** Test-only: forces the next `loadMatchClient()` call to re-import/construct. */
export function resetMatchClientForTests(): void {
  clientPromise = null;
}

export interface MatchChannelCallbacks {
  /** Fired with the fresh row from either the realtime channel or a poll tick. */
  onChange: (match: Match) => void;
  /** Fired whenever the transport mode changes. Called once synchronously-ish with
   *  'connecting' is NOT guaranteed — callers should seed their own state with
   *  'connecting' and treat this as updates only. */
  onTransport: (transport: MatchTransport) => void;
  onError?: (error: unknown) => void;
}

export interface MatchChannelHandle {
  /** Stops the subscription and/or poll and releases the channel. Idempotent. */
  close: () => void;
}

/**
 * D5: subscribe to row `id` of `public.matches`. If the channel is not `SUBSCRIBED` within
 * `subscribeTimeoutMs` (default `MATCH_SUBSCRIBE_TIMEOUT_MS`), starts polling `select`
 * every `pollMs` (default `MATCH_POLL_MS`) instead — and keeps polling if the channel later
 * errors out or closes. If it does reach `SUBSCRIBED` (even after the timeout fired and
 * polling started), polling stops and the transport flips to 'realtime'.
 */
export function openMatchChannel(
  id: string,
  callbacks: MatchChannelCallbacks,
  loadClient: MatchClientLoader = loadMatchClient,
  opts: { subscribeTimeoutMs?: number; pollMs?: number } = {},
): MatchChannelHandle {
  const subscribeTimeoutMs = opts.subscribeTimeoutMs ?? MATCH_SUBSCRIBE_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? MATCH_POLL_MS;

  let closed = false;
  let client: MatchClient | null = null;
  let channel: MatchRealtimeChannel | null = null;
  let subscribeTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let transport: MatchTransport = 'connecting';

  function setTransport(next: MatchTransport) {
    if (transport === next) return;
    transport = next;
    callbacks.onTransport(next);
  }

  async function pollOnce() {
    if (closed || !client) return;
    try {
      const { data, error } = await client.from('matches').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message ?? 'poll failed');
      if (data && !closed) callbacks.onChange(data);
    } catch (error) {
      callbacks.onError?.(error);
    }
  }

  function startPolling() {
    if (closed || pollTimer) return;
    setTransport('polling');
    void pollOnce();
    pollTimer = setInterval(() => void pollOnce(), pollMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  loadClient()
    .then((real) => {
      if (closed) return;
      client = real;
      channel = real
        .channel(`match:${id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` },
          (payload) => {
            if (!closed) callbacks.onChange(payload.new);
          },
        )
        .subscribe((status) => {
          if (closed) return;
          if (status === 'SUBSCRIBED') {
            if (subscribeTimer) {
              clearTimeout(subscribeTimer);
              subscribeTimer = null;
            }
            stopPolling();
            setTransport('realtime');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            startPolling();
          }
        });

      subscribeTimer = setTimeout(() => {
        subscribeTimer = null;
        if (transport !== 'realtime') startPolling();
      }, subscribeTimeoutMs);
    })
    .catch((error: unknown) => {
      callbacks.onError?.(error);
      if (!closed) startPolling();
    });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      if (subscribeTimer) clearTimeout(subscribeTimer);
      stopPolling();
      if (channel && client) {
        try {
          client.removeChannel(channel);
        } catch {
          // best-effort cleanup only
        }
      }
    },
  };
}

/** Maps one `MatchAction` to its RPC name + args (contract in `storage/matchTypes.ts`). */
export function rpcForAction(id: string, version: number, action: MatchAction): { fn: string; args: Record<string, unknown> } {
  switch (action.type) {
    case 'respond':
      return { fn: 'match_respond', args: { p_id: id, p_version: version, p_accept: action.accept } };
    case 'pick':
      return {
        fn: 'match_pick',
        args: { p_id: id, p_version: version, p_index: action.index, p_card_id: action.cardId, p_auto: action.auto ?? false },
      };
    case 'autopick':
      return {
        fn: 'match_autopick',
        args: { p_id: id, p_version: version, p_seat: action.seat, p_index: action.index, p_card_id: action.cardId },
      };
    case 'lockRoster':
      return { fn: 'match_lock_roster', args: { p_id: id, p_version: version, p_roster: action.roster } };
    case 'sideboard':
      return {
        fn: 'match_sideboard',
        args: { p_id: id, p_version: version, p_roster: action.roster, p_trade: action.trade ?? null },
      };
    case 'seen':
      return { fn: 'match_seen', args: { p_id: id, p_version: version, p_game: action.game } };
    case 'void':
      return { fn: 'match_void', args: { p_id: id, p_version: version, p_reason: action.reason } };
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown match action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * D5: calls the RPC for `action` with the CURRENT version (read via `getVersion` at call
 * time, not captured up front, so the retry below sees the refetched value). On
 * `version_mismatch` it refetches once (via `refetch`, which is expected to update
 * whatever `getVersion` reads from) and retries exactly once more; any other error, or a
 * second failure, rejects.
 */
export async function sendMatchAction(
  client: MatchRpcClient,
  id: string,
  action: MatchAction,
  getVersion: () => number,
  refetch: () => Promise<Match | null>,
): Promise<Match> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      const fresh = await refetch();
      if (!fresh) throw lastError;
    }
    const { fn, args } = rpcForAction(id, getVersion(), action);
    const { data, error } = await client.rpc(fn, args);
    if (!error) {
      if (!data) throw new Error(`${fn} returned no row`);
      return data as Match;
    }
    lastError = new Error(error.message ?? `${fn} failed`);
    if (matchErrorCode(error.message) !== 'version_mismatch') throw lastError;
  }
  throw lastError;
}

/** D6: calls `match_heartbeat` immediately, then every `intervalMs`. Returns a stop
 *  function; failures are swallowed (heartbeat is informational — see D6). */
export function startHeartbeat(client: MatchRpcClient, id: string, intervalMs: number): () => void {
  const beat = () => {
    // pvp_draft: the real supabase-js client's `.rpc()` returns a `PostgrestFilterBuilder`
    // — thenable (has `.then`) but NOT a real Promise, so it has no `.catch`. `void x.catch`
    // threw (`TypeError: ... .catch is not a function`) the moment this ever actually ran
    // against a live client (only exercised once a per-match page — pvp_draft's room —
    // mounted `useMatch`; nothing before this plan did). `Promise.resolve(...)` normalizes
    // it to a real Promise first.
    void Promise.resolve(client.rpc('match_heartbeat', { p_id: id })).catch(() => {
      // best-effort; opponentOnline just stays stale until the next beat succeeds
    });
  };
  beat();
  const timer = setInterval(beat, intervalMs);
  return () => clearInterval(timer);
}
