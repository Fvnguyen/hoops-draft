'use client';

/**
 * pvp_series T4 (D5): the series page. Replaces the pvp_draft placeholder for status
 * 'series' / 'sideboard' / 'done' — 'drafting'/'building' still redirect via `matchHref`.
 * On load, and whenever the row's version changes, POSTs `/api/match/[id]/advance`
 * (idempotent, debounced) so a visit alone nudges the series forward when both sides have
 * already watched or the 24h grace has passed (D2) — no polling loop, Realtime carries the
 * result back through `useMatch`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Wifi, WifiOff } from 'lucide-react';
import { useMatch } from '@/hooks/useMatch';
import { getGameStore } from '@/storage';
import { CoinFlip } from '@/components/playoffs/CoinFlip';
import { SeriesStrip } from '@/components/playoffs/SeriesStrip';
import { PlayoffsFrontOffice } from '@/components/playoffs/PlayoffsFrontOffice';
import { SeriesResults } from '@/components/playoffs/SeriesResults';
import { WaitingFor } from '@/components/playoffs/WaitingFor';
import { loadMatchClient } from '@/lib/matchChannel';
import { matchHref, type DirectoryUser, type Match, type MatchSide } from '@/storage/matchTypes';
import type { SavedRoster, ChallengeTrade } from '@/storage/types';

function coinflipMetaKey(matchId: string): string {
  return `coinflip:${matchId}`;
}

/** My roster as it currently plays: the sideboard snapshot once I've locked one, else the
 *  roster I locked at build time. */
function myCurrentRoster(match: Match, me: MatchSide): SavedRoster | null {
  const sideboarded = match.sideboard[me]?.roster;
  if (sideboarded) return sideboarded;
  return me === 'host' ? match.host_roster : match.guest_roster;
}

function mySideboardLocked(match: Match, me: MatchSide): boolean {
  return Boolean(match.sideboard[me]);
}

export default function PlayoffsSeriesPage() {
  const params = useParams<{ id: string }>();
  const matchId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { match, me, opponentOnline, send } = useMatch(matchId);

  const opponentId = match && me ? (me === 'host' ? match.guest_id : match.host_id) : null;
  const [opponentName, setOpponentName] = useState<string | null>(null);
  useEffect(() => {
    if (!opponentId) return;
    let cancelled = false;
    fetch('/api/users')
      .then((r) => r.json())
      .then((data: { users?: DirectoryUser[] }) => {
        if (cancelled) return;
        const u = data.users?.find((u) => u.id === opponentId);
        if (u) setOpponentName(u.display_name || u.username || 'your opponent');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [opponentId]);

  // D2: advance is idempotent and safe to call repeatedly — debounced per (matchId,
  // version) so a viewer doesn't re-fire it on every unrelated re-render, and the request
  // in flight is never duplicated. The ref is stamped only once the fetch actually goes
  // out (not when the timer is merely scheduled): React's dev StrictMode double-invokes
  // every effect (mount -> cleanup -> mount) and the cleanup here cancels the first
  // timer, so stamping eagerly would have permanently skipped that version's advance —
  // the second (kept) mount would see the ref already set and never reschedule it.
  const advancedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!match || !matchId) return;
    if (match.status !== 'series' && match.status !== 'sideboard') return;
    const key = `${matchId}:${match.version}`;
    if (advancedForRef.current === key) return;
    const timer = setTimeout(() => {
      advancedForRef.current = key;
      fetch(`/api/match/${matchId}/advance`, { method: 'POST' }).catch(() => {
        // Best-effort: the next visit (or the opponent's) retries.
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [match, matchId]);

  // Redirect away for phases this page doesn't own.
  useEffect(() => {
    if (!match || !matchId) return;
    if (match.status === 'drafting' || match.status === 'building') {
      router.replace(matchHref(match));
    }
  }, [match, matchId, router]);

  const [coinflipSeen, setCoinflipSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    getGameStore().getMeta(coinflipMetaKey(matchId)).then((v) => {
      if (!cancelled) setCoinflipSeen(Boolean(v));
    }).catch(() => {
      if (!cancelled) setCoinflipSeen(true); // fail open — never block the page on this
    });
    return () => { cancelled = true; };
  }, [matchId]);

  const handleCoinflipDone = () => {
    if (!matchId) return;
    setCoinflipSeen(true);
    void getGameStore().setMeta(coinflipMetaKey(matchId), new Date().toISOString());
  };

  const myRoster = useMemo(() => (match && me ? myCurrentRoster(match, me) : null), [match, me]);
  const [locking, setLocking] = useState(false);
  const handleLock = async (roster: SavedRoster, trade?: ChallengeTrade) => {
    setLocking(true);
    try {
      await send({ type: 'sideboard', roster, trade });
    } finally {
      setLocking(false);
    }
  };

  const handleRematch = async () => {
    if (!match || !opponentId) return;
    const client = await loadMatchClient();
    const { data, error } = await client.rpc('match_invite', { p_guest_id: opponentId });
    if (error) throw new Error(error.message ?? 'Failed to invite a rematch');
    const created = data as Match;
    router.push(`/playoffs/${created.id}`);
  };

  if (!match || !me || coinflipSeen === null) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav">
        <p className="text-sm text-ink-muted">Loading...</p>
      </main>
    );
  }

  if (match.status === 'drafting' || match.status === 'building') {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav">
        <p className="text-sm text-ink-muted">Loading...</p>
      </main>
    );
  }

  if (!['series', 'sideboard', 'done'].includes(match.status)) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-ink-subtle">Playoffs</p>
        <h1 className="mb-2 font-display text-4xl uppercase tracking-tight text-ink">Match</h1>
        <p className="text-sm text-ink-muted">
          {opponentName ? `Vs ${opponentName}. ` : ''}
          {match.status === 'declined' && 'This invite was declined.'}
          {match.status === 'expired' && 'This invite expired.'}
          {match.status === 'forfeit' && 'This match was forfeited.'}
          {match.status === 'void' && `This match was voided${match.void_reason ? `: ${match.void_reason}` : '.'}`}
        </p>
      </main>
    );
  }

  if (!coinflipSeen) {
    return <CoinFlip seed={match.seed} me={me} opponentName={opponentName} onDone={handleCoinflipDone} />;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="mb-0.5 text-xs font-bold uppercase tracking-[0.3em] text-ink-subtle">Playoffs</p>
          <h1 className="font-display text-3xl uppercase tracking-tight text-ink">Series</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-ink">{opponentName ?? 'your opponent'}</p>
          <p className="flex items-center justify-end gap-1 text-xs">
            {opponentOnline ? (
              <span className="flex items-center gap-1 text-ink-subtle"><Wifi size={12} /> Online</span>
            ) : (
              <span className="flex items-center gap-1 text-ink-subtle"><WifiOff size={12} /> Offline</span>
            )}
          </p>
        </div>
      </div>

      <SeriesStrip match={match} me={me} opponentName={opponentName} />

      {match.status === 'sideboard' && myRoster && (
        mySideboardLocked(match, me) ? (
          <div className="mt-8">
            <WaitingFor
              name={opponentName}
              pickDeadline={null}
              opponentOnline={opponentOnline}
              canFinishForOpponent={false}
              finishingForOpponent={false}
              onFinishForOpponent={() => {}}
            />
          </div>
        ) : (
          <div className="mt-8">
            <PlayoffsFrontOffice match={match} me={me} roster={myRoster} onLock={handleLock} />
          </div>
        )
      )}
      {match.status === 'sideboard' && locking && (
        <p className="mt-2 text-center text-xs text-ink-subtle">Locking...</p>
      )}

      {match.status === 'done' && (
        <div className="mt-8">
          <SeriesResults match={match} me={me} opponentName={opponentName} onRematch={handleRematch} />
        </div>
      )}
    </main>
  );
}
