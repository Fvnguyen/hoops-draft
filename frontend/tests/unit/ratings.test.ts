import { describe, it, expect } from 'vitest';
import { loadPlayers } from './helpers';

describe('ratings (engine.ts getAllCards)', () => {
  const players = loadPlayers();

  it('returns 448 cards', () => {
    expect(players.length).toBe(448);
  });

  // card_ratings_rebalance D8 (2026-09-18): OVR is now the flat mean of the seven
  // dimension ratings, with no floor multiplier — a deep-bench player weak across every
  // dimension can legitimately land in the teens (AJ Johnson at 16, 9.5 mpg).
  it('every overall rating is within [0, 99]', () => {
    for (const p of players) {
      expect(p.ratings.overall).toBeGreaterThanOrEqual(0);
      expect(p.ratings.overall).toBeLessThanOrEqual(99);
    }
  });

  it('rarity is always one of the four known values', () => {
    const valid = new Set(['Common', 'Uncommon', 'Rare', 'Mythic']);
    for (const p of players) {
      expect(valid.has(p.rarity)).toBe(true);
    }
  });

  it('every player has a traits array (possibly empty)', () => {
    for (const p of players) {
      expect(Array.isArray(p.traits)).toBe(true);
      expect(p.traits.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('sanity check: mean overall is between 45 and 60', () => {
    const mean = players.reduce((s, p) => s + p.ratings.overall, 0) / players.length;
    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(60);
  });
});
