'use client';

import Image from 'next/image';
import type { DraftCard } from '@/engine/types';
import { PlayerCard, PlayCard } from './PlayerCard';

/**
 * A revealed pack card is flippable on hover, same as everywhere else in the app (D2,
 * plan `ui_polish_small_fixes`) — `PlayerCard`/`PlayCard` already own that hover-flip
 * (front stats face <-> back badges/season-averages face), so the revealed branch just
 * renders them directly instead of the static, front-only `PlayerCardFront`/`PlayCardFront`.
 * The card is still sitting inside PackOpener's own outer flip (sealed back <-> this
 * revealed face), so hovering it stacks a second, independent flip on top once revealed.
 */
export function PackRevealCard({ card, revealed }: { card: DraftCard; revealed: boolean }) {
  if (!revealed) {
    return (
      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl border border-line-strong bg-surface-sunken shadow-md">
        <Image
          src="/cardback.jpg"
          alt=""
          fill
          sizes="(min-width: 640px) 25vw, 50vw"
          className="object-cover"
          priority
        />
      </div>
    );
  }

  if (card.type === 'Player') {
    return <PlayerCard player={card} size="sm" />;
  }

  return <PlayCard play={card} />;
}
