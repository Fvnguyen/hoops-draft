import { describe, it, expect } from 'vitest';
import { loadPlayers } from './helpers';

describe('ratings (engine.ts getAllCards)', () => {
  const players = loadPlayers();

  it('returns 448 cards', () => {
    expect(players.length).toBe(448);
  });

  // card_ratings_rebalance D8 (2026-09-18, rescaled 2026-09-19): OVR is a composite of
  // the seven dimension raws re-indexed through the same idx() as every dimension
  // (league-average composite -> ~50, rotation top-7.5% -> 99), with no floor
  // multiplier — a deep-bench player weak across every dimension can legitimately land
  // near 0.
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

  // card_ratings_rebalance rescale (2026-09-19): idx() is normalised over ROTATION
  // players only (mpg >= 15), so the full 448-card pool's mean sits a bit under the
  // rotation-only 50 centre — sub-rotation bench players pull it down.
  it('sanity check: mean overall is between 40 and 55', () => {
    const mean = players.reduce((s, p) => s + p.ratings.overall, 0) / players.length;
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(55);
  });
});
