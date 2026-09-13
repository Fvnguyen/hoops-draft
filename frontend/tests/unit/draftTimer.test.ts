import { describe, it, expect } from 'vitest';
import { PICK_SECONDS, pickTimeMs, deadlineFor, clockScaleFromQuery } from '@/lib/draftTimer';

describe('draftTimer.pickTimeMs', () => {
  it('matches PICK_SECONDS at each pick index 1-8', () => {
    for (let pickNumber = 1; pickNumber <= PICK_SECONDS.length; pickNumber++) {
      expect(pickTimeMs(pickNumber)).toBe(PICK_SECONDS[pickNumber - 1] * 1000);
    }
  });

  it('clamps below pick 1 to the first entry', () => {
    expect(pickTimeMs(0)).toBe(PICK_SECONDS[0] * 1000);
    expect(pickTimeMs(-5)).toBe(PICK_SECONDS[0] * 1000);
  });

  it('reuses the last entry for picks beyond the table', () => {
    expect(pickTimeMs(9)).toBe(PICK_SECONDS[PICK_SECONDS.length - 1] * 1000);
    expect(pickTimeMs(100)).toBe(PICK_SECONDS[PICK_SECONDS.length - 1] * 1000);
  });

  it('applies the scale multiplier and floors at 250ms', () => {
    expect(pickTimeMs(1, 0.02)).toBe(Math.round(PICK_SECONDS[0] * 1000 * 0.02));
    expect(pickTimeMs(8, 0.001)).toBe(250); // would round below the floor otherwise
  });
});

describe('draftTimer.deadlineFor', () => {
  it('adds pickTimeMs(pickNumber, scale) to `now`', () => {
    const now = 1_000_000;
    expect(deadlineFor(1, now)).toBe(now + pickTimeMs(1));
    expect(deadlineFor(5, now, 0.5)).toBe(now + pickTimeMs(5, 0.5));
  });
});

describe('draftTimer.clockScaleFromQuery', () => {
  it('is 1 in production regardless of the query value', () => {
    expect(clockScaleFromQuery('fast', true)).toBe(1);
    expect(clockScaleFromQuery('0.1', true)).toBe(1);
  });

  it('is 1 outside production when no value is given', () => {
    expect(clockScaleFromQuery(null, false)).toBe(1);
    expect(clockScaleFromQuery(undefined, false)).toBe(1);
    expect(clockScaleFromQuery('', false)).toBe(1);
  });

  it('maps "fast" to the 0.02 dev multiplier outside production', () => {
    expect(clockScaleFromQuery('fast', false)).toBe(0.02);
  });

  it('parses a numeric query value outside production', () => {
    expect(clockScaleFromQuery('0.25', false)).toBe(0.25);
    expect(clockScaleFromQuery('2', false)).toBe(2);
  });

  it('falls back to 1 for a non-positive or non-numeric value', () => {
    expect(clockScaleFromQuery('0', false)).toBe(1);
    expect(clockScaleFromQuery('-3', false)).toBe(1);
    expect(clockScaleFromQuery('banana', false)).toBe(1);
  });
});
