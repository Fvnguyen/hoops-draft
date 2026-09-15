'use client';

import Image from 'next/image';
import type { DraftCard } from '@/engine/types';
import { PlayerCard, PlayCard, PlayerCardFront, PlayCardFront } from './PlayerCard';

/**
 * A revealed pack card is flippable on hover, same as everywhere else in the app (D2,
 * plan `ui_polish_small_fixes`) — `PlayerCard`/`PlayCard` already own that hover-flip
 * (front stats face <-> back badges/season-averages face), so the revealed branch just
 * renders them directly instead of the static, front-only `PlayerCardFront`/`PlayCardFront`.
 * The card is still sitting inside PackOpener's own outer flip (sealed back <-> this
 * revealed face), so hovering it stacks a second, independent flip on top once revealed.
 */
/**
 * `interactive` (game_canvas, owner bug "text shows through the packs"): while the
 * outer sealed<->revealed flip is still animating, the revealed face is the STATIC
 * front. The flippable `PlayerCard`/`PlayCard` carry their own preserve-3d + hidden
 * back face, and a second 3D context nested inside the outer rotateY face makes
 * Chrome (Android especially) paint the inner text through the card back. Once the
 * pack is in its picking phase the outer flips are settled and the interactive card
 * (hover/long-press flip) takes over.
 */
export function PackRevealCard({ card, revealed, interactive = true }: { card: DraftCard; revealed: boolean; interactive?: boolean }) {
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

  if (!interactive) {
    return (
      <div className="@container relative aspect-[5/7] w-full">
        {card.type === 'Player' ? <PlayerCardFront player={card} size="sm" /> : <PlayCardFront play={card} />}
      </div>
    );
  }

  if (card.type === 'Player') {
    return <PlayerCard player={card} size="sm" />;
  }

  return <PlayCard play={card} />;
}
