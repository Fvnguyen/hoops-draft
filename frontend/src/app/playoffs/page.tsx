'use client';

/**
 * pvp_series T6 (D5/D6): "My Playoffs" — every match the signed-in user is a participant
 * in, grouped into pending invites (received: Accept/Decline; sent: pending), matches in
 * progress (link via `matchHref`), and finished matches (a result line, win/loss or the
 * terminal reason). A prominent "New series" button starts a fresh invite.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Swords, Trophy } from 'lucide-react';
import { useCurrentProfile } from '@/components/AuthProvider';
import { useMatchList } from '@/hooks/useMatch';
import { loadMatchClient } from '@/lib/matchChannel';
import {
  TERMINAL_MATCH_STATUSES,
  matchHref,
  sideOf,
  type DirectoryUser,
  type MatchSummary,
} from '@/storage/matchTypes';
import { Button, Panel } from '@/components/ui';
import { cn } from '@/lib/cn';

const STATUS_LABEL: Record<string, string> = {
  drafting: 'Drafting',
  building: 'Building roster',
  series: 'Series live',
  sideboard: 'Sideboard open',
};

function opponentIdOf(match: MatchSummary, userId: string): string {
  return match.host_id === userId ? match.guest_id : match.host_id;
}

/** A finished match's one-line result, from the viewer's side. */
function resultLine(match: MatchSummary, userId: string): string {
  if (match.status === 'done') {
    const won = match.winner_id === userId;
    const side = sideOf(match, userId);
    const myWins = side === 'host' ? match.games.filter((g) => g.score.host > g.score.guest).length
      : match.games.filter((g) => g.score.guest > g.score.host).length;
    const theirWins = match.games.length - myWins;
    return `${won ? 'Won' : 'Lost'} ${myWins}-${theirWins}`;
  }
  if (match.status === 'forfeit') return match.winner_id === userId ? 'Won by forfeit' : 'Lost by forfeit';
  if (match.status === 'void') return 'Voided';
  if (match.status === 'declined') return 'Declined';
  if (match.status === 'expired') return 'Expired';
  return 'Finished';
}

export default function PlayoffsPage() {
  const profile = useCurrentProfile();
  const userId = profile?.id ?? null;
  const router = useRouter();
  const { matches, loading, refetch } = useMatchList();

  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [respondBusy, setRespondBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/users')
      .then((r) => r.json())
      .then((data: { users?: DirectoryUser[] }) => {
        if (cancelled || !data.users) return;
        setNames(new Map(data.users.map((u) => [u.id, u.display_name || u.username || 'Unknown'])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const nameOf = useCallback((id: string) => names.get(id) ?? 'your opponent', [names]);

  const respond = useCallback(async (match: MatchSummary, accept: boolean) => {
    setRespondBusy((s) => ({ ...s, [match.id]: true }));
    try {
      const client = await loadMatchClient();
      const { error } = await client.rpc('match_respond', { p_id: match.id, p_version: match.version, p_accept: accept });
      if (error) throw new Error(error.message);
      if (accept) {
        router.push(`/playoffs/${match.id}/draft`);
        return;
      }
    } catch (err) {
      console.error('Failed to respond to playoffs invite:', err);
    } finally {
      setRespondBusy((s) => ({ ...s, [match.id]: false }));
      void refetch();
    }
  }, [refetch, router]);

  if (!userId) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav text-center">
        <p className="text-sm text-ink-muted">Sign in to see your Playoffs matches.</p>
      </main>
    );
  }

  const receivedInvites = matches.filter((m) => m.status === 'invited' && m.guest_id === userId);
  const sentInvites = matches.filter((m) => m.status === 'invited' && m.host_id === userId);
  const inProgress = matches.filter((m) => !TERMINAL_MATCH_STATUSES.includes(m.status) && m.status !== 'invited');
  const finished = matches.filter((m) => TERMINAL_MATCH_STATUSES.includes(m.status));

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-ink-subtle">Playoffs</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">My Playoffs</h1>
        </div>
        <Button href="/playoffs/new" variant="primary" size="lg" icon={<Swords className="h-4 w-4" />} className="shrink-0">
          New series
        </Button>
      </div>

      {loading && matches.length === 0 && <p className="text-sm text-ink-muted">Loading your matches…</p>}

      {!loading && matches.length === 0 && (
        <Panel variant="sunken" className="text-center text-sm text-ink-muted">
          No matches yet — start a new series to challenge someone.
        </Panel>
      )}

      {receivedInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-ink-subtle">Invites for you</h2>
          <div className="flex flex-col gap-2">
            {receivedInvites.map((m) => (
              <Panel key={m.id} variant="sunken" padding="sm" className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-bold text-ink">{nameOf(m.host_id)} challenged you</p>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="md" disabled={respondBusy[m.id]} onClick={() => void respond(m, true)}>Accept</Button>
                  <Button variant="ghost" size="md" disabled={respondBusy[m.id]} onClick={() => void respond(m, false)} className="text-danger hover:text-danger">Decline</Button>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      )}

      {sentInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-ink-subtle">Invites sent</h2>
          <div className="flex flex-col gap-2">
            {sentInvites.map((m) => (
              <Panel key={m.id} variant="sunken" padding="sm" className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-ink">Waiting on {nameOf(m.guest_id)}</p>
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-muted">Pending</span>
              </Panel>
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-ink-subtle">In progress</h2>
          <div className="flex flex-col gap-2">
            {inProgress.map((m) => (
              <Link key={m.id} href={matchHref(m)} className="block">
                <Panel variant="raised" padding="sm" className="flex items-center justify-between gap-3 transition-colors hover:bg-surface-sunken">
                  <p className="min-w-0 truncate text-sm font-bold text-ink">vs {nameOf(opponentIdOf(m, userId))}</p>
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-info">{STATUS_LABEL[m.status] ?? m.status}</span>
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-ink-subtle">Finished</h2>
          <div className="flex flex-col gap-2">
            {finished.map((m) => {
              const won = m.status === 'done' && m.winner_id === userId;
              return (
                <Link key={m.id} href={matchHref(m)} className="block">
                  <Panel variant="sunken" padding="sm" className="flex items-center justify-between gap-3 transition-colors hover:bg-surface-raised">
                    <p className="min-w-0 truncate text-sm text-ink">vs {nameOf(opponentIdOf(m, userId))}</p>
                    <span className={cn('shrink-0 flex items-center gap-1 text-xs font-bold uppercase tracking-wide', won ? 'text-positive' : 'text-ink-muted')}>
                      {won && <Trophy className="h-3.5 w-3.5" />}
                      {resultLine(m, userId)}
                    </span>
                  </Panel>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
