/**
 * Pack-opener reveal order and timeline (plan ui_draft_deckbuild_pack, D6).
 *
 * Pure: no DOM, no timers. The opener component drives framer-motion from the
 * numbers returned here so the sequence is testable and the reduced-motion path is
 * the same code with different constants.
 */
import type { DraftCard, Rarity } from '../engine/types';

export const REVEAL_STAGGER_MS = 120;
export const REVEAL_FLIP_MS = 450;
export const RARE_HOLD_MS = 700;
export const MYTHIC_HOLD_MS = 950;
export const REDUCED_FADE_MS = 200;
export const REDUCED_GLOW_MS = 400;

const RARITY_RANK: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Mythic: 3 };

export function rarityRank(rarity: Rarity): number {
  return RARITY_RANK[rarity] ?? 0;
}

/** Stable sort by rarity so the guaranteed Rare+ slot is dealt (and flipped) last. */
export function orderForReveal<T extends { rarity: Rarity }>(pack: readonly T[]): T[] {
  return pack
    .map((card, index) => ({ card, index }))
    .sort((a, b) => rarityRank(a.card.rarity) - rarityRank(b.card.rarity) || a.index - b.index)
    .map(x => x.card);
}

export interface RevealTimeline {
  /** ms after the reveal phase starts at which card i begins its flip. */
  flipAt: number[];
  /** ms of extra hold (glow) after card i's flip; 0 for Common/Uncommon. */
  holdMs: number[];
  /** ms at which the whole sequence is over and the spread is pickable. */
  total: number;
}

export function holdFor(rarity: Rarity, reducedMotion: boolean): number {
  if (rarity === 'Mythic') return reducedMotion ? REDUCED_GLOW_MS : MYTHIC_HOLD_MS;
  if (rarity === 'Rare') return reducedMotion ? REDUCED_GLOW_MS : RARE_HOLD_MS;
  return 0;
}

/**
 * Build the flip schedule for cards already in reveal order. Each card flips
 * STAGGER after the previous card's flip started, plus that card's hold. Reduced
 * motion collapses flips into one fade but keeps a short static glow on Rare+.
 */
export function buildRevealTimeline(cards: readonly DraftCard[], opts: { reducedMotion: boolean }): RevealTimeline {
  const flipAt: number[] = [];
  const holdMs: number[] = [];
  let t = 0;
  if (opts.reducedMotion) {
    for (const card of cards) {
      flipAt.push(0);
      holdMs.push(holdFor(card.rarity, true));
    }
    const glow = Math.max(0, ...holdMs);
    return { flipAt, holdMs, total: REDUCED_FADE_MS + glow };
  }
  for (const card of cards) {
    flipAt.push(t);
    const hold = holdFor(card.rarity, false);
    holdMs.push(hold);
    t += REVEAL_STAGGER_MS + hold;
  }
  const last = cards.length - 1;
  const total = last < 0 ? 0 : flipAt[last] + REVEAL_FLIP_MS + holdMs[last];
  return { flipAt, holdMs, total };
}
