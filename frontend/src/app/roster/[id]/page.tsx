'use client';
import type { PlayAssignment } from '@/engine/playbook';
import type { ArchetypeSelection } from '@/engine/archetypes';
import { useEffect, useState, Suspense } from 'react';
import { DraftCard } from '@/components/PlayerCard';
import { DeckBuilder } from '@/components/DeckBuilder';
import { useSearchParams, useParams } from 'next/navigation';
import { getGameStore } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';

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
        <div className="p-8 text-white bg-black min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Error</h1>
            <p className="text-stone-300">{error}</p>
          </div>
        </div>
      );
    }
    return <div className="p-8 text-white bg-black min-h-screen">Loading Roster...</div>;
  }

  return (
    <div className="bg-black">
      <DeckBuilder
        draftedCards={cards}
        existingRosterName={rosterName}
        rosterId={rosterId}
        initialDepthOrder={initialDepthOrder}
        initialPlaysOrder={initialPlaysOrder}
        initialPlayAssignments={initialPlayAssignments}
        initialArchetypes={initialArchetypes}
        sessionId={sessionId}
      />
    </div>
  );
}

export default function RosterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white bg-black min-h-screen">Loading...</div>}>
      <RosterPageInner />
    </Suspense>
  );
}
