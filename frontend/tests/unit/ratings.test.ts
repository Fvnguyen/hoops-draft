import { describe, it, expect } from 'vitest';
import { loadPlayers } from './helpers';

describe('ratings (engine.ts getAllCards)', () => {
  const players = loadPlayers();

  it('returns 448 cards', () => {
    expect(players.length).toBe(448);
  });

  it('every overall rating is within [40, 99]', () => {
    for (const p of players) {
      expect(p.ratings.overall).toBeGreaterThanOrEqual(40);
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
