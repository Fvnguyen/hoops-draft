import { describe, it, expect } from 'vitest';
import cards from '@/data/cards.json';
import showcase from '@/data/showcase.json';
import { CARD_SET_VERSION } from '@/engine/cardSetVersion';
import type { PlayerCardData } from '@/engine/types';

/**
 * plan_mobile_load D2/T2: the home page's hero + 4 pack cards only ever draw Mythic/Rare
 * (owner decision), so `scripts/build-cards.ts` also writes `src/data/showcase.json` — a
 * pre-filtered slice of `cards.json` the home page imports instead of `getAllCards()`
 * (482 KB -> ~41 KB). This guards the two ways that slice could silently drift: missing a
 * Mythic/Rare card the full set has, or including something it shouldn't.
 */
const allCards = cards as unknown as PlayerCardData[];
const showcaseCards = showcase as unknown as PlayerCardData[];

describe('showcase.json (mobile_load D2/T2)', () => {
  it('contains only Mythic/Rare cards', () => {
    const wrongRarity = showcaseCards.filter((c) => c.rarity !== 'Mythic' && c.rarity !== 'Rare');
    expect(wrongRarity).toEqual([]);
  });

  it('contains every Mythic/Rare card from cards.json, and nothing else', () => {
    const expectedIds = new Set(
      allCards.filter((c) => c.rarity === 'Mythic' || c.rarity === 'Rare').map((c) => c.id)
    );
    const actualIds = new Set(showcaseCards.map((c) => c.id));
    expect(actualIds).toEqual(expectedIds);
  });

  it('has at least 2 Mythic and 2 Rare cards from different teams (what pickPackPreview needs)', () => {
    for (const rarity of ['Mythic', 'Rare'] as const) {
      const teams = new Set(
        showcaseCards.filter((c) => c.rarity === rarity).map((c) => c.player.team)
      );
      expect(teams.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('every entry carries the current CARD_SET_VERSION', () => {
    const stale = showcaseCards.filter((c) => c.cardSetVersion !== CARD_SET_VERSION);
    expect(stale).toEqual([]);
  });
});
