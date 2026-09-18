import { describe, it, expect } from 'vitest';
import { createBotProfiles } from '@/engine/draft';
import { createRng } from '@/engine/rng';
import { ARCHETYPES } from '@/engine/archetypes';
import { MAX_BOTS_PER_ARCHETYPE, MIN_DEFENSIVE_OR_GOLD_BOTS, BOT_SYNERGY_AWARENESS_RANGE } from '@/engine/balance';

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

  it('honours the per-plan cap and the defensive/gold floor over 500 seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      const profiles = createBotProfiles(createRng(seed), 7);
      const counts: Record<string, number> = {};
      for (const p of profiles) counts[p.targetArchetypeId] = (counts[p.targetArchetypeId] ?? 0) + 1;
      for (const count of Object.values(counts)) expect(count).toBeLessThanOrEqual(MAX_BOTS_PER_ARCHETYPE);

      const defensiveOrGoldIds = new Set(ARCHETYPES.filter(a => a.side === 'defense' || a.kind === 'gold').map(a => a.id));
      const defensiveOrGoldBots = profiles.filter(p => defensiveOrGoldIds.has(p.targetArchetypeId)).length;
      expect(defensiveOrGoldBots).toBeGreaterThanOrEqual(MIN_DEFENSIVE_OR_GOLD_BOTS);

      for (const p of profiles) {
        expect(p.synergyAwareness).toBeGreaterThanOrEqual(BOT_SYNERGY_AWARENESS_RANGE[0]);
        expect(p.synergyAwareness).toBeLessThanOrEqual(BOT_SYNERGY_AWARENESS_RANGE[1]);
      }
    }
  });
});
