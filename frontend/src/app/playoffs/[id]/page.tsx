'use client';

/**
 * pvp_draft T4: minimal placeholder for the match's own page once the draft/build phase is
 * behind it — `pvp_series` builds the real thing (coin flip, game results, sideboard). Also
 * the landing spot `draft`/`build` route to for any status they don't otherwise handle
 * (invited, declined, expired, done, forfeit, void, sideboard), so it renders something
 * sane for those too rather than assuming 'series'.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMatch } from '@/hooks/useMatch';
import type { DirectoryUser } from '@/storage/matchTypes';

export default function PlayoffsMatchPage() {
  const params = useParams<{ id: string }>();
  const matchId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { match, me } = useMatch(matchId);

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

  if (!match) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav">
        <p className="text-sm text-ink-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav text-center">
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-ink-subtle">Playoffs</p>
      <h1 className="mb-2 font-display text-4xl uppercase tracking-tight text-ink">
        {match.status === 'series' ? 'The series starts soon' : 'Match'}
      </h1>
      <p className="text-sm text-ink-muted">
        {opponentName ? `Vs ${opponentName}. ` : ''}
        {match.status === 'series' && 'Game results and the sideboard land here soon.'}
        {match.status === 'done' && 'This series is over.'}
        {match.status === 'declined' && 'This invite was declined.'}
        {match.status === 'expired' && 'This invite expired.'}
        {match.status === 'forfeit' && 'This match was forfeited.'}
        {match.status === 'void' && `This match was voided${match.void_reason ? `: ${match.void_reason}` : '.'}`}
        {match.status === 'sideboard' && 'Front office coming soon.'}
      </p>
    </main>
  );
}
