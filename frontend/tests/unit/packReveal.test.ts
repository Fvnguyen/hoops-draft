import { describe, expect, it } from 'vitest';
import {
  MYTHIC_HOLD_MS,
  RARE_HOLD_MS,
  REDUCED_FADE_MS,
  REDUCED_GLOW_MS,
  REVEAL_FLIP_MS,
  REVEAL_STAGGER_MS,
  buildRevealTimeline,
  holdFor,
  orderForReveal,
  rarityRank,
} from '@/lib/packReveal';
import type { DraftCard, Rarity } from '@/engine/types';

// buildRevealTimeline only reads `rarity`; these stand in for real cards.
function card(id: string, rarity: Rarity): DraftCard {
  return { id, rarity } as unknown as DraftCard;
}

const PACK: DraftCard[] = [
  card('rare-1', 'Rare'),
  card('common-1', 'Common'),
  card('mythic-1', 'Mythic'),
  card('uncommon-1', 'Uncommon'),
  card('common-2', 'Common'),
];

describe('orderForReveal', () => {
  it('sorts Common -> Mythic so the Rare+ slot flips last', () => {
    const ids = orderForReveal(PACK).map(c => c.id);
    expect(ids).toEqual(['common-1', 'common-2', 'uncommon-1', 'rare-1', 'mythic-1']);
  });

  it('is stable within a rarity (original pack order preserved)', () => {
    const pack = [card('a', 'Common'), card('b', 'Common'), card('c', 'Common')];
    expect(orderForReveal(pack).map(c => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('ranks the play card by its own rarity, not its type', () => {
    const play = { id: 'play-1', rarity: 'Mythic', type: 'Play' } as unknown as DraftCard;
    const ordered = orderForReveal([play, card('common-1', 'Common')]);
    expect(ordered[ordered.length - 1].id).toBe('play-1');
  });

  it('does not mutate the input', () => {
    const input = [...PACK];
    orderForReveal(input);
    expect(input.map(c => c.id)).toEqual(PACK.map(c => c.id));
  });

  it('handles an empty pack', () => {
    expect(orderForReveal([])).toEqual([]);
    expect(buildRevealTimeline([], { reducedMotion: false }).total).toBe(0);
  });
});

describe('rarityRank / holdFor', () => {
  it('ranks rarities ascending', () => {
    expect(rarityRank('Common')).toBeLessThan(rarityRank('Uncommon'));
    expect(rarityRank('Uncommon')).toBeLessThan(rarityRank('Rare'));
    expect(rarityRank('Rare')).toBeLessThan(rarityRank('Mythic'));
  });

  it('holds only Rare and Mythic', () => {
    expect(holdFor('Common', false)).toBe(0);
    expect(holdFor('Uncommon', false)).toBe(0);
    expect(holdFor('Rare', false)).toBe(RARE_HOLD_MS);
    expect(holdFor('Mythic', false)).toBe(MYTHIC_HOLD_MS);
  });

  it('collapses holds to the static glow under reduced motion', () => {
    expect(holdFor('Rare', true)).toBe(REDUCED_GLOW_MS);
    expect(holdFor('Mythic', true)).toBe(REDUCED_GLOW_MS);
    expect(holdFor('Common', true)).toBe(0);
  });
});

describe('buildRevealTimeline', () => {
  const ordered = orderForReveal(PACK);

  it('staggers flips and inserts the Rare/Mythic holds', () => {
    const { flipAt, holdMs } = buildRevealTimeline(ordered, { reducedMotion: false });
    // common, common, uncommon, rare, mythic
    expect(holdMs).toEqual([0, 0, 0, RARE_HOLD_MS, MYTHIC_HOLD_MS]);
    expect(flipAt).toEqual([
      0,
      REVEAL_STAGGER_MS,
      REVEAL_STAGGER_MS * 2,
      REVEAL_STAGGER_MS * 3,
      REVEAL_STAGGER_MS * 4 + RARE_HOLD_MS,
    ]);
  });

  it('flips are strictly increasing', () => {
    const { flipAt } = buildRevealTimeline(ordered, { reducedMotion: false });
    for (let i = 1; i < flipAt.length; i += 1) expect(flipAt[i]).toBeGreaterThan(flipAt[i - 1]);
  });

  it('total covers the last flip plus its hold', () => {
    const { flipAt, holdMs, total } = buildRevealTimeline(ordered, { reducedMotion: false });
    const last = ordered.length - 1;
    expect(total).toBe(flipAt[last] + REVEAL_FLIP_MS + holdMs[last]);
    expect(total).toBeGreaterThan(MYTHIC_HOLD_MS);
  });

  it('reduced motion is one fade plus a single static glow', () => {
    const { flipAt, holdMs, total } = buildRevealTimeline(ordered, { reducedMotion: true });
    expect(flipAt.every(t => t === 0)).toBe(true);
    expect(holdMs).toEqual([0, 0, 0, REDUCED_GLOW_MS, REDUCED_GLOW_MS]);
    expect(total).toBe(REDUCED_FADE_MS + REDUCED_GLOW_MS);
  });

  it('reduced motion without a Rare+ card has no glow tail', () => {
    const plain = [card('c1', 'Common'), card('c2', 'Uncommon')];
    expect(buildRevealTimeline(plain, { reducedMotion: true }).total).toBe(REDUCED_FADE_MS);
  });

  it('reduced motion is always shorter than the full sequence', () => {
    const full = buildRevealTimeline(ordered, { reducedMotion: false }).total;
    const reduced = buildRevealTimeline(ordered, { reducedMotion: true }).total;
    expect(reduced).toBeLessThan(full);
  });
});
