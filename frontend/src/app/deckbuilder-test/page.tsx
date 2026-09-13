'use client';
import type { PlayAssignment } from '@/engine/playbook';
import type { ArchetypeSelection } from '@/engine/archetypes';
import { useEffect, useState, Suspense } from 'react';
import { DraftCard } from '@/components/PlayerCard';
import { DeckBuilder } from '@/components/DeckBuilder';
import { useSearchParams, useRouter } from 'next/navigation';
import { getGameStore } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';

function DeckbuilderTestInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rosterId = searchParams.get('rosterId');
  const sessionIdParam = searchParams.get('sessionId');
  const ready = useStorageReady();

  // Redirect to the new /roster/[id] route if rosterId is present
  useEffect(() => {
    if (rosterId) {
      const redirectUrl = `/roster/${rosterId}${sessionIdParam ? `?sessionId=${sessionIdParam}` : ''}`;
      router.replace(redirectUrl);
    }
  }, [rosterId, sessionIdParam, router]);

  const [cards, setCards] = useState<DraftCard[]>([]);
  const [rosterName, setRosterName] = useState<string>('');
  const [initialDepthOrder, setInitialDepthOrder] = useState<Record<string, string[]> | undefined>();
  const [initialPlaysOrder, setInitialPlaysOrder] = useState<string[] | undefined>();
  const [initialPlayAssignments, setInitialPlayAssignments] = useState<PlayAssignment[] | undefined>();
  const [initialArchetypes, setInitialArchetypes] = useState<ArchetypeSelection | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdParam ?? undefined);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function loadRoster() {
      if (rosterId) {
        const store = getGameStore();
        const savedRoster = await store.getRoster(rosterId as string);
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
      }

      // Default Random Load if no rosterId or not found
      loadRandomCards();
    }

    function loadRandomCards() {
      fetch('/api/cards')
      .then(r => r.json())
      .then((data: DraftCard[]) => {
        const randomPlayers = [...data].sort(() => Math.random() - 0.5).slice(0, 30);
        const draftCards = randomPlayers.map(p => ({ ...p, type: 'Player' } as DraftCard));
        
        const plays = [
          { type: 'Play', id: 'p1', name: 'Triangle Offense', rarity: 'Mythic', playCategory: 'system', mechanicText: 'Major boost to all passing badges.', badges: [], imageUrl: '' },
          { type: 'Play', id: 'p2', name: '7 Seconds or Less', rarity: 'Rare', playCategory: 'system', mechanicText: 'Massive transition offense boost.', badges: [], imageUrl: '' },
          { type: 'Play', id: 'p3', name: 'Pick & Roll', rarity: 'Uncommon', playCategory: 'special', mechanicText: 'Boost to PnR initiator and roller.', badges: [], imageUrl: '' },
          { type: 'Play', id: 'p4', name: 'Box-and-One', rarity: 'Uncommon', playCategory: 'special', mechanicText: 'Counters one star player.', badges: [], imageUrl: '' },
          { type: 'Play', id: 'p5', name: 'Basic Offense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Offensive Badges.', badges: [], imageUrl: '' },
          { type: 'Play', id: 'p6', name: 'Basic Defense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Defensive Badges.', badges: [], imageUrl: '' },
        ] as DraftCard[];

        const all = [...draftCards, ...plays].sort(() => Math.random() - 0.5);
        if (!cancelled) setCards(all);
      });
    }

    loadRoster();

    return () => {
      cancelled = true;
    };
  }, [ready, rosterId, sessionIdParam]);

  if (!ready || cards.length === 0) return <div className="p-8 text-white">Loading Deckbuilder...</div>;

  return (
    <div className="bg-black">
      <DeckBuilder
        draftedCards={cards}
        existingRosterName={rosterName}
        rosterId={rosterId || undefined}
        initialDepthOrder={initialDepthOrder}
        initialPlaysOrder={initialPlaysOrder}
        initialPlayAssignments={initialPlayAssignments}
        initialArchetypes={initialArchetypes}
        sessionId={sessionId}
      />
    </div>
  );
}

export default function DeckbuilderTest() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Loading...</div>}>
      <DeckbuilderTestInner />
    </Suspense>
  );
}
