'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PackOpener } from '@/components/PackOpener';
import type { DraftCard, Rarity } from '@/engine/types';
import cards from '@/data/cards.json';

const allPlayers = (cards as unknown as DraftCard[]).filter(
  (card): card is Extract<DraftCard, { type: 'Player' }> => card.type === 'Player'
);

function firstOfRarity(rarity: Rarity, taken: Set<string>): DraftCard | undefined {
  const found = allPlayers.find(card => card.rarity === rarity && !taken.has(card.id));
  if (found) taken.add(found.id);
  return found;
}

const previewPlay: DraftCard = {
  type: 'Play',
  id: 'preview-play-1',
  name: 'Triangle Offense',
  rarity: 'Rare',
  playCategory: 'system',
  badges: ['Finisher', 'Mid-Range Maestro'],
  mechanicText: 'Requires elite post and mid-range scoring.',
};

/**
 * Fixture with a Rare AND a Mythic so the hold/glow/shake (D6) is visible:
 * `orderForReveal` puts the Rare second-to-last and the Mythic last.
 */
function buildPreviewPack(): DraftCard[] {
  const taken = new Set<string>();
  const wanted: Rarity[] = ['Common', 'Common', 'Common', 'Uncommon', 'Uncommon', 'Rare', 'Mythic'];
  const picked = wanted
    .map(rarity => firstOfRarity(rarity, taken) ?? firstOfRarity('Common', taken))
    .filter((card): card is DraftCard => card !== undefined);
  // Shuffled-ish insertion: the play card sits mid-pack so the reveal order is
  // demonstrably doing the sorting, not the array order.
  return [picked[0], picked[3], previewPlay, picked[6], picked[1], picked[4], picked[5], picked[2]].filter(
    (card): card is DraftCard => card !== undefined
  );
}

function PreviewInner() {
  const params = useSearchParams();
  const packNumber = Number(params.get('pack') ?? '1') || 1;
  const timed = params.get('timed') === '1';
  const [run, setRun] = useState(0);
  const [pack] = useState<DraftCard[]>(buildPreviewPack);
  const [lastPick, setLastPick] = useState<string | null>(null);

  return (
    <div>
      <div key={run}>
        <PackOpener
          pack={pack}
          packNumber={packNumber}
          mode={timed ? 'premier' : 'quick'}
          onPick={pick => setLastPick(`${pick.cardId} -> ${pick.zone}`)}
          onComplete={() => setRun(value => value + 1)}
        />
      </div>
      {lastPick && (
        <p className="fixed bottom-2 left-2 z-50 rounded bg-stone-900/80 px-2 py-1 text-[10px] text-white">
          last pick: {lastPick}
        </p>
      )}
    </div>
  );
}

export default function PackOpenerPreviewPage() {
  return (
    <Suspense fallback={null}>
      <PreviewInner />
    </Suspense>
  );
}
