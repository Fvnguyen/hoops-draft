'use client';

/**
 * pvp_draft T4 (D8/D9): build a 12-man roster from the local seat's 24 drafted cards, then
 * "Lock roster" (`match_lock_roster`) instead of an ordinary save — no auto-fill, the depth
 * chart starts empty (product rule). Once locked, waits (`WaitingFor`) for the opponent to
 * lock theirs; when the row reaches `series`, routes to `/playoffs/[id]`. A match still
 * `drafting` routes back to the draft room; anything else routes to the match page.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStatus } from '@/components/AuthProvider';
import { usePvpDraft } from '@/hooks/usePvpDraft';
import { DeckBuilder } from '@/components/DeckBuilder';
import { WaitingFor } from '@/components/playoffs/WaitingFor';
import { validateReplay, type HumanPicks } from '@/engine/draftReplay';
import { PLAY_CATALOG as playsDB } from '@/engine/plays';
import { MATCH_SEAT_ID, type Match } from '@/storage/matchTypes';
import type { SavedRoster } from '@/storage/types';
import type { Player } from '@/components/PlayerCard';
import type { DraftCard } from '@/engine/types';

function myLockedAt(match: Match, me: 'host' | 'guest'): string | null {
  return me === 'host' ? match.host_locked_at : match.guest_locked_at;
}

export default function PlayoffsBuildPage() {
  const params = useParams<{ id: string }>();
  const matchId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const authStatus = useAuthStatus();
  const { match, me, opponentName, opponentOnline, send } = usePvpDraft(matchId);

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  useEffect(() => {
    let cancelled = false;
    import('@/engine/cards')
      .then(({ getAllCards }) => {
        if (cancelled) return;
        const data = getAllCards() as Array<Omit<Player, 'type'>>;
        setAllPlayers(data.map((c) => ({ ...c, type: 'Player' as const })));
      })
      .catch((e) => console.error('Failed to load cards:', e));
    return () => { cancelled = true; };
  }, []);

  // Route away once this page has nothing to show. `binding` is only non-null while the
  // match is 'drafting' (usePvpDraft), so a `binding` here would mean the match regressed —
  // fall back to the room in that case too.
  useEffect(() => {
    if (!match || !matchId) return;
    // `me` can still be null for one frame while auth is resolving even after the row has
    // loaded — never bounce a signed-in participant on that race (same fix as usePvpDraft's
    // phase computation).
    if (authStatus === 'loading') return;
    if (!me) { router.replace('/playoffs/new'); return; }
    if (match.status === 'drafting') { router.replace(`/playoffs/${matchId}/draft`); return; }
    if (match.status !== 'building') { router.replace(`/playoffs/${matchId}`); return; }
  }, [match, me, authStatus, matchId, router]);

  const draftedCards: DraftCard[] | null = useMemo(() => {
    if (!match || !me || allPlayers.length === 0) return null;
    const humanPicks: HumanPicks = { 'human-0': match.host_picks, 'human-4': match.guest_picks };
    const autoPicked = { 'human-0': match.host_autopicks, 'human-4': match.guest_autopicks };
    const result = validateReplay(match.seed, humanPicks, allPlayers, playsDB, { autoPicked });
    if (!result.ok) return null; // D3: usePvpDraft's own validation effect will void the match
    const seatId = MATCH_SEAT_ID[me];
    return result.state.seats.find((s) => s.id === seatId)?.drafted ?? null;
  }, [match, me, allPlayers]);

  if (!match || !me || match.status === 'drafting') {
    return (
      <div className="flex h-dvh-z items-center justify-center font-sans">
        <div className="text-2xl font-semibold text-ink-subtle animate-pulse">Loading...</div>
      </div>
    );
  }

  if (match.status !== 'building' || !draftedCards) {
    return (
      <div className="flex h-dvh-z items-center justify-center font-sans">
        <div className="text-2xl font-semibold text-ink-subtle animate-pulse">Loading...</div>
      </div>
    );
  }

  const locked = !!myLockedAt(match, me);

  if (locked) {
    return (
      <WaitingFor
        name={opponentName}
        pickDeadline={null}
        opponentOnline={opponentOnline}
        canFinishForOpponent={false}
        finishingForOpponent={false}
        onFinishForOpponent={() => {}}
      />
    );
  }

  const handleLock = (roster: SavedRoster) => {
    void send({ type: 'lockRoster', roster }).catch((err: unknown) => {
      console.error('Failed to lock roster:', err);
    });
  };

  return (
    <main>
      <DeckBuilder
        draftedCards={draftedCards}
        gameMode="tournament"
        embedOverride={{ onSave: handleLock, saveLabel: 'Lock roster' }}
      />
    </main>
  );
}
