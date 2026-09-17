/**
 * challenge_mode T6 — the pure parts of the reveal.
 *
 * The reel itself is presentation and is verified by screenshots against boards 2/3/6,
 * but two things under it are load-bearing and silent when they break: the tier ladder's
 * win ranges are DERIVED from the engine's `CHALLENGE_GRADES` (so D6 can move without
 * the ladder lying), and the pacing curve has to actually reach full blur mid-season and
 * come back to a readable, speed-independent last five games.
 */

import { describe, it, expect } from 'vitest';
import { CHALLENGE_GRADES } from '@/engine/challenge';
import { CHALLENGE_GAMES } from '@/engine/balance';
import { TIER_FAMILIES, familyForWins, nextFamilyAbove } from '@/components/challenge/TierLadder';
import { blurForGame, dwellForGame } from '@/components/challenge/ChallengeReel';

describe('TierLadder families', () => {
  it('tile 0..82 contiguously with no gaps or overlaps', () => {
    expect(TIER_FAMILIES[0].min).toBe(0);
    expect(TIER_FAMILIES[TIER_FAMILIES.length - 1].max).toBe(CHALLENGE_GAMES);
    for (let i = 1; i < TIER_FAMILIES.length; i++) {
      expect(TIER_FAMILIES[i].min).toBe(TIER_FAMILIES[i - 1].max + 1);
    }
  });

  it('cover every rung of the engine ladder exactly once', () => {
    const covered = TIER_FAMILIES.flatMap((f) => f.grades).sort();
    const rungs = CHALLENGE_GRADES.map((g) => g.grade).sort();
    expect(covered).toEqual(rungs);
  });

  it('agree with gradeForWins on which band a total lands in', () => {
    // Every family's range is the union of its rungs' ranges, so the family boundaries
    // must be real grade boundaries.
    for (const f of TIER_FAMILIES) {
      const rungs = CHALLENGE_GRADES.filter((g) => f.grades.includes(g.grade));
      expect(Math.min(...rungs.map((g) => g.min))).toBe(f.min);
      expect(Math.max(...rungs.map((g) => g.max))).toBe(f.max);
      expect(familyForWins(f.min).key).toBe(f.key);
      expect(familyForWins(f.max).key).toBe(f.key);
    }
  });

  it('walks up the ladder and stops at the top', () => {
    expect(nextFamilyAbove(0)?.key).toBe('D');
    expect(nextFamilyAbove(70)?.key).toBe('A+');
    expect(nextFamilyAbove(82)).toBeNull();
  });
});

describe('reel pacing (D7)', () => {
  it('is readable for the first week and unreadable by mid-season', () => {
    expect(blurForGame(0)).toBe(0);
    expect(blurForGame(6)).toBe(0);
    expect(blurForGame(29)).toBe(1);
  });

  it('is still blurred when half 1 ends, so the break is entered sealed', () => {
    expect(blurForGame(40)).toBe(1);
  });

  it('comes back to crisp for the last five games', () => {
    expect(blurForGame(CHALLENGE_GAMES - 6)).toBe(1);
    expect(blurForGame(CHALLENGE_GAMES - 5)).toBe(0);
    expect(blurForGame(CHALLENGE_GAMES - 1)).toBe(0);
  });

  it('accelerates monotonically from the opening to the cruise', () => {
    for (let g = 1; g < CHALLENGE_GAMES - 5; g++) {
      expect(dwellForGame(g, 'normal')).toBeLessThanOrEqual(dwellForGame(g - 1, 'normal'));
    }
  });

  it('honours the speed control mid-season but locks the final stretch', () => {
    expect(dwellForGame(3, 'slower')).toBeGreaterThan(dwellForGame(3, 'normal'));
    expect(dwellForGame(3, 'instant')).toBe(0);
    const locked = dwellForGame(CHALLENGE_GAMES - 2, 'normal');
    expect(dwellForGame(CHALLENGE_GAMES - 2, 'slower')).toBe(locked);
    expect(dwellForGame(CHALLENGE_GAMES - 2, 'instant')).toBe(locked);
  });
});
