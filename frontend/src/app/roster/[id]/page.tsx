'use client';
import type { PlayAssignment } from '@/engine/playbook';
import type { ArchetypeSelection } from '@/engine/archetypes';
import { useEffect, useState, Suspense } from 'react';
import { DraftCard } from '@/components/PlayerCard';
import { DeckBuilder } from '@/components/DeckBuilder';
import { useSearchParams, useParams } from 'next/navigation';
import { getGameStore } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';
import { getSeasonPhase } from '@/engine/season';

function RosterPageInner() {
  const searchParams = useSearchParams();
  const params = useParams();
  const rosterId = params.id as string;
  const sessionIdParam = searchParams.get('sessionId');
  const ready = useStorageReady();

  const [cards, setCards] = useState<DraftCard[]>([]);
  const [rosterName, setRosterName] = useState<string>('');
  const [initialDepthOrder, setInitialDepthOrder] = useState<Record<string, string[]> | undefined>();
  const [initialPlaysOrder, setInitialPlaysOrder] = useState<string[] | undefined>();
  const [initialPlayAssignments, setInitialPlayAssignments] = useState<PlayAssignment[] | undefined>();
  const [initialArchetypes, setInitialArchetypes] = useState<ArchetypeSelection | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdParam ?? undefined);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function loadRoster() {
      const store = getGameStore();
      const savedRoster = await store.getRoster(rosterId);
      if (cancelled) return;

      if (savedRoster) {
        setCards(savedRoster.draftedCards);
        setRosterName(savedRoster.name);
        setInitialDepthOrder(savedRoster.depthChartOrder);
        setInitialPlaysOrder(savedRoster.activePlays);
        setInitialPlayAssignments(savedRoster.playAssignments);
        setInitialArchetypes(savedRoster.archetypes);
        if (!sessionIdParam && savedRoster.sessionId) setSessionId(savedRoster.sessionId);

        const season = await store.getSeasonByRoster(rosterId);
        if (!cancelled) setReadOnly(getSeasonPhase(season) === 'completed');
        return;
      }

      // Roster not found
      setError(`Roster ${rosterId} not found`);
    }

    loadRoster();

    return () => {
      cancelled = true;
    };
  }, [ready, rosterId, sessionIdParam]);

  if (!ready || cards.length === 0) {
    if (error) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-surface-inverse-deep p-8 text-ink-inverse">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold">Error</h1>
            <p className="text-ink-inverse-muted">{error}</p>
          </div>
        </div>
      );
    }
    return <div className="min-h-dvh bg-surface-inverse-deep p-8 text-ink-inverse">Loading Roster...</div>;
  }

  return (
    <div className="bg-surface-inverse-deep">
      <DeckBuilder
        draftedCards={cards}
        existingRosterName={rosterName}
        rosterId={rosterId}
        initialDepthOrder={initialDepthOrder}
        initialPlaysOrder={initialPlaysOrder}
        initialPlayAssignments={initialPlayAssignments}
        initialArchetypes={initialArchetypes}
        sessionId={sessionId}
        readOnly={readOnly}
      />
    </div>
  );
}

export default function RosterPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface-inverse-deep p-8 text-ink-inverse">Loading...</div>}>
      <RosterPageInner />
    </Suspense>
  );
}
