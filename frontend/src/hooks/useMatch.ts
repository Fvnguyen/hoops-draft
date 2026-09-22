'use client';

/**
 * pvp_match T3: `useMatch(id)` (D5/D6) — loads a `public.matches` row, keeps it fresh via
 * `matchChannel`, determines which side the signed-in user is on, sends heartbeats while
 * mounted, and dispatches `MatchAction`s through the versioned RPCs (retry-once on
 * `version_mismatch`, see `sendMatchAction`). `useMatchList()` is the bell/`/playoffs`
 * source: expires stale rows server-side, then lists the caller's matches newest first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentProfile } from '@/components/AuthProvider';
import { loadMatchClient, openMatchChannel, sendMatchAction, type MatchClient } from '@/lib/matchChannel';
import {
  MATCH_HEARTBEAT_MS,
  MATCH_OFFLINE_MS,
  MATCH_SUMMARY_COLUMNS,
  sideOf,
  type Match,
  type MatchAction,
  type MatchSummary,
  type MatchSide,
  type MatchTransport,
  type UseMatchListResult,
  type UseMatchResult,
} from '@/storage/matchTypes';

export function useMatch(id: string | null | undefined): UseMatchResult {
  const profile = useCurrentProfile();
  const userId = profile?.id ?? null;

  const [match, setMatch] = useState<Match | null>(null);
  const [transport, setTransport] = useState<MatchTransport>('connecting');
  const [error, setError] = useState<string | null>(null);

  // Mirrors `match` synchronously: `sendMatchAction`'s `getVersion` and the retry's
  // `refetch` both need "the version right now", not a value captured in a stale closure.
  const matchRef = useRef<Match | null>(null);
  const clientRef = useRef<MatchClient | null>(null);

  const applyMatch = useCallback((row: Match | null) => {
    matchRef.current = row;
    setMatch(row);
  }, []);

  const getClient = useCallback(async (): Promise<MatchClient> => {
    if (!clientRef.current) clientRef.current = await loadMatchClient();
    return clientRef.current;
  }, []);

  const fetchMatch = useCallback(async (): Promise<Match | null> => {
    if (!id) return null;
    try {
      const client = await getClient();
      const { data, error: fetchError } = await client.from('matches').select('*').eq('id', id).maybeSingle();
      if (fetchError) throw new Error(fetchError.message ?? 'Failed to load match');
      applyMatch(data ?? null);
      setError(null);
      return data ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load match');
      return null;
    }
  }, [id, getClient, applyMatch]);

  const refetch = useCallback(async () => {
    await fetchMatch();
  }, [fetchMatch]);

  // Load + subscribe (D5). Re-runs only when `id` changes.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets on a real `id` change, not a re-render
    setTransport('connecting');
    void fetchMatch();
    const handle = openMatchChannel(id, {
      onChange: (row) => { if (!cancelled) applyMatch(row); },
      onTransport: (t) => { if (!cancelled) setTransport(t); },
      onError: (err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Realtime error'); },
    });
    return () => {
      cancelled = true;
      handle.close();
    };
    // fetchMatch/applyMatch are stable across an `id`, recreated only when `id` changes.
  }, [id, fetchMatch, applyMatch]);

  // Heartbeat (D6) while a match page is open.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    getClient()
      .then((client) => {
        if (cancelled) return;
        // Local import to avoid a top-level dependency edge just for the type.
        import('@/lib/matchChannel').then(({ startHeartbeat }) => {
          if (!cancelled) stop = startHeartbeat(client, id, MATCH_HEARTBEAT_MS);
        });
      })
      .catch(() => {
        // Heartbeat is informational (D6) — a failed client load just means no heartbeat.
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [id, getClient]);

  const me: MatchSide | null = useMemo(() => (match ? sideOf(match, userId) : null), [match, userId]);

  // D6: `opponentOnline` compares a heartbeat timestamp against "now", which drifts as time
  // passes even with no new match data — so it needs its own clock tick (same pattern as
  // PickTimerRing) rather than calling Date.now() straight from a memo, which would be an
  // impure read during render and never re-evaluate on its own besides.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const opponentOnline = useMemo(() => {
    if (!match || !me) return false;
    const seenAt = me === 'host' ? match.guest_seen_at : match.host_seen_at;
    if (!seenAt) return false;
    return now - new Date(seenAt).getTime() < MATCH_OFFLINE_MS;
  }, [match, me, now]);

  const send = useCallback(async (action: MatchAction): Promise<Match> => {
    if (!id) throw new Error('useMatch: no match id');
    const client = await getClient();
    const result = await sendMatchAction(
      client,
      id,
      action,
      () => matchRef.current?.version ?? 0,
      () => fetchMatch(),
    );
    applyMatch(result);
    return result;
  }, [id, getClient, fetchMatch, applyMatch]);

  return { match, me, transport, opponentOnline, error, send, refetch };
}

/** D3/D4/D8: expires stale rows, then lists every match the signed-in user is a
 *  participant in, newest first. Used both by `/playoffs/new` (pending invites) and
 *  `useNotices` (match-invite/match-turn/match-done kinds). */
export function useMatchList(): UseMatchListResult {
  const profile = useCurrentProfile();
  const userId = profile?.id ?? null;

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const client = await loadMatchClient();
      // D8: no cron — the caller's own reads sweep expiry first.
      await client.rpc('match_expire', { p_id: null });
      // `MatchPollClient` only models the single-row `eq(...).maybeSingle()` shape used by
      // `useMatch`; the list query needs `or`/`order`, so it goes through the underlying
      // client directly rather than widening that shared interface for one call site.
      const listClient = client as unknown as {
        from(table: string): {
          select(columns: string): {
            or(filter: string): {
              order(column: string, opts: { ascending: boolean }): Promise<{ data: Match[] | null; error: { message?: string } | null }>;
            };
          };
        };
      };
      const { data: rows, error: listError } = await listClient
        .from('matches')
        .select(MATCH_SUMMARY_COLUMNS)
        .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      if (listError) throw new Error(listError.message ?? 'Failed to load matches');
      setMatches(rows ?? []);
    } catch (err) {
      // A warning, not an error: the bell mounts on every route and a missing table or an
      // offline blip must not read as a page failure (smoke.spec fails on console.error).
      console.warn('Failed to load matches:', err);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, same pattern as useNotices' load()
    void load();
  }, [load]);

  return { matches, loading, refetch: load };
}
