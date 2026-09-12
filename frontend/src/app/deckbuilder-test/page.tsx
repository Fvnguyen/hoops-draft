'use client';
import { useEffect, useState, Suspense } from 'react';
import { DraftCard } from '@/components/PlayerCard';
import { DeckBuilder } from '@/components/DeckBuilder';
import { useSearchParams } from 'next/navigation';
import { safeGetJSON } from '@/lib/storage';

interface RosterData {
  id: string;
  name: string;
  timestamp: string;
  draftedCards: DraftCard[];
  zones: Record<string, 'Roster' | 'GLeague'>;
  depthChartOrder: Record<string, string[]>;
  activePlays: string[];
  sessionId: string | null;
}

function DeckbuilderTestInner() {
  const searchParams = useSearchParams();
  const rosterId = searchParams.get('rosterId');

  const [cards, setCards] = useState<DraftCard[]>([]);
  const [initialZones, setInitialZones] = useState<Record<string, 'Roster' | 'GLeague'>>({});
  const [rosterName, setRosterName] = useState<string>('');
  const [initialDepthOrder, setInitialDepthOrder] = useState<Record<string, string[]> | undefined>();
  const [initialPlaysOrder, setInitialPlaysOrder] = useState<string[] | undefined>();

  useEffect(() => {
    if (rosterId) {
      // Load from localStorage
      const stored = safeGetJSON<RosterData[]>('myRosters', []);
      const savedRoster = stored.find((r: RosterData) => r.id === rosterId);

      if (savedRoster) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCards(savedRoster.draftedCards);
        setInitialZones(savedRoster.zones);
        setRosterName(savedRoster.name);
        setInitialDepthOrder(savedRoster.depthChartOrder);
        setInitialPlaysOrder(savedRoster.activePlays);
        return;
      }
    }

    // Default Random Load if no rosterId or not found
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
        setCards(all);
        
        const initial = all.reduce((acc, c) => {
          acc[c.id] = 'GLeague';
          return acc;
        }, {} as Record<string, 'Roster' | 'GLeague'>);
        setInitialZones(initial);
      });
  }, [rosterId]);

  if (cards.length === 0) return <div className="p-8 text-white">Loading Deckbuilder...</div>;

  return (
    <div className="bg-black">
      <DeckBuilder 
        draftedCards={cards} 
        initialZones={initialZones} 
        existingRosterName={rosterName}
        rosterId={rosterId || undefined}
        initialDepthOrder={initialDepthOrder}
        initialPlaysOrder={initialPlaysOrder}
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
