'use client';

import type { DraftCard } from '@/engine/types';
import { PlayerCardFront, PlayCardFront } from './PlayerCard';

export function PackRevealCard({ card, revealed }: { card: DraftCard; revealed: boolean }) {
  if (!revealed) {
    return (
      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl border border-stone-300 bg-stone-100 shadow-md">
        <div className="absolute inset-2 rounded-lg border border-stone-300 bg-stone-200/70" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-500">
          <span className="text-3xl" aria-hidden="true">◈</span>
          <span className="text-[8px] font-black uppercase tracking-[0.24em]">Magic Ball</span>
        </div>
      </div>
    );
  }

  if (card.type === 'Player') {
    return (
      <div className="relative @container aspect-[5/7] w-full">
        <PlayerCardFront player={card} size="sm" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[5/7] w-full">
      <PlayCardFront play={card} />
    </div>
  );
}
