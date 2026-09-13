'use client';

import { useState } from 'react';
import { PackOpener } from '@/components/PackOpener';
import type { DraftCard } from '@/engine/types';
import cards from '@/data/cards.json';

const previewPlayers = (cards as unknown as DraftCard[])
  .filter((card): card is Extract<DraftCard, { type: 'Player' }> => card.type === 'Player')
  .slice(0, 5);

const previewPlay: DraftCard = {
  type: 'Play',
  id: 'preview-play-1',
  name: 'Triangle Offense',
  rarity: 'Mythic',
  playCategory: 'system',
  badges: ['Finisher', 'Mid-Range Maestro'],
  mechanicText: 'Requires elite post and mid-range scoring.',
};

const previewPack: DraftCard[] = [previewPlayers[0], previewPlayers[1], previewPlay, ...previewPlayers.slice(2)].filter(
  (card): card is DraftCard => card !== undefined
);

export default function PackOpenerPreviewPage() {
  const [run, setRun] = useState(0);

  return (
    <div key={run}>
      <PackOpener pack={previewPack} onComplete={() => setRun(value => value + 1)} />
    </div>
  );
}
