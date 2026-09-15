'use client';

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
        <div className="absolute inset-2 rounded-lg border border-line-strong bg-surface-muted/70" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-muted">
          <span className="text-3xl" aria-hidden="true">◈</span>
          <span className="text-xs font-black uppercase tracking-[0.24em]">Magic Ball</span>
        </div>
      </div>
    );
  }

  if (card.type === 'Player') {
    return <PlayerCard player={card} size="sm" />;
  }

  return <PlayCard play={card} />;
}
