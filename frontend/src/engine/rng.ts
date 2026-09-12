/**
 * Seeded RNG for the engine.
 *
 * Every `Math.random()` call in the engine goes through an `Rng` instance so
 * drafts, games, and seasons can be replayed deterministically from a stored
 * seed instead of full play-by-play output.
 */

export interface Rng {
  readonly seed: number;
  next(): number; // in [0, 1)
}

/** mulberry32 — small, fast, decent-quality 32-bit PRNG. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    seed,
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** A fresh, non-deterministic 32-bit seed (uses Math.random() exactly once). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Pick a uniformly random element from `arr` using `rng`. */
export function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

/** Fisher-Yates shuffle — returns a new shuffled copy, uniformly at random. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
