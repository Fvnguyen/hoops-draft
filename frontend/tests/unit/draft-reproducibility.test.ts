import { describe, it, expect } from 'vitest';
import { createBotProfiles } from '@/hooks/useDraftEngine';
import { createRng } from '@/engine/rng';

describe('createBotProfiles', () => {
  it('draws identical bot profiles from the same seed', () => {
    const a = createBotProfiles(createRng(12345));
    const b = createBotProfiles(createRng(12345));
    expect(a).toEqual(b);
  });

  it('draws different bot profiles from a different seed', () => {
    const a = createBotProfiles(createRng(1));
    const b = createBotProfiles(createRng(2));
    expect(a).not.toEqual(b);
  });
});
