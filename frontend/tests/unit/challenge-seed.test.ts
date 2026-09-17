/**
 * The shareable seed code round-trips (plan_challenge_mode D10 / T8).
 *
 * The results screen shows a stylised code and copies THAT string, so the round trip has
 * to hold exactly: a pasted code must rebuild the same 82-game schedule the run played.
 */

import { describe, it, expect } from 'vitest';
import { formatSeed, parseSeed } from '@/components/challenge/Results';
import { buildChallengeSchedule } from '@/engine/challenge';

describe('shareable seed code', () => {
  const seeds = [0, 1, 42, 555, 1234, 987654, 4294967295, 2147483647];

  it('round-trips every seed the engine can produce', () => {
    for (const seed of seeds) {
      expect(parseSeed(formatSeed(seed)), `seed ${seed}`).toBe(seed);
    }
  });

  it('a pasted code rebuilds the identical schedule', () => {
    for (const seed of seeds) {
      const pasted = parseSeed(formatSeed(seed));
      expect(pasted).not.toBeNull();
      expect(buildChallengeSchedule(pasted!)).toEqual(buildChallengeSchedule(seed));
    }
  });

  it('tolerates how people actually paste: lowercase, no dash, stray spaces', () => {
    const code = formatSeed(1234567);
    expect(parseSeed(code.toLowerCase())).toBe(1234567);
    expect(parseSeed(code.replace('-', ''))).toBe(1234567);
    expect(parseSeed(`  ${code}  `)).toBe(1234567);
  });

  it('returns null for junk rather than a wrong season', () => {
    for (const junk of ['', '   ', 'not a seed', '!!!', 'ABC-DE!', '-']) {
      expect(parseSeed(junk), junk).toBeNull();
    }
  });
});
