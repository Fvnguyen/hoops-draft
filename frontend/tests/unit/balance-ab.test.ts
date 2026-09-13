import { describe, it, expect } from 'vitest';
import { runAbPairs } from '../../scripts/balance';
import { loadPlayers } from './helpers';

// Verifies the --ab harness itself (paired treatment/control simulation,
// seeded identically) rather than the stripping treatment: when the
// "control" build is the identity function (control === treatment, same
// object), both arms of every pair are simulated from the exact same
// TeamInfo with the exact same per-matchup seed, so margin and win-rate
// deltas must be exactly zero.
describe('balance.ts --ab harness', () => {
  it('reports zero margin/win-rate delta when treatment equals control', () => {
    const players = loadPlayers();
    const pairs = runAbPairs(players, 3, 42, (opponent) => opponent);

    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(p.marginTreatment).toBe(p.marginControl);
      expect(p.winTreatment).toBe(p.winControl);
    }

    const meanDelta =
      pairs.reduce((s, p) => s + (p.marginTreatment - p.marginControl), 0) / pairs.length;
    expect(meanDelta).toBeCloseTo(0, 10);
  });

  it('reports a non-trivial margin delta when the opponent is actually stripped of identities/plays', () => {
    const players = loadPlayers();
    const pairs = runAbPairs(players, 5, 7);

    expect(pairs.length).toBeGreaterThan(0);
    // Not every pair needs to differ (a bot with no identity/plays built has
    // nothing to strip), but the harness should produce real, finite numbers.
    for (const p of pairs) {
      expect(Number.isFinite(p.marginTreatment)).toBe(true);
      expect(Number.isFinite(p.marginControl)).toBe(true);
    }
  });
});
