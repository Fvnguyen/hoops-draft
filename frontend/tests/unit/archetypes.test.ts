/**
 * Archetypes (docs/plan_plays_and_synergies_2026-09-13.md §1-3): persistent roster
 * identities. Chemistry synergies and mastery tiers are gone — only Online (~70% of
 * Dedicated) and Dedicated remain, gated by carrier/point/starter tallies (mono/two)
 * plus a keystone trait (gold).
 */
import { describe, it, expect } from 'vitest';
import type { PlayerCardData, Trait } from '@/components/PlayerCard';
import {
  ARCHETYPES,
  tallyColors,
  evaluateArchetypes,
  selectionIsValid,
  archetypeModifiers,
  bestSelection,
  MONO_THRESHOLDS,
  TWO_COLOR_THRESHOLDS,
  type ArchetypeDef,
  type ArchetypeStatus,
} from '@/engine/archetypes';
import { IDENTITY_CAPS } from '@/engine/balance';
import { loadPlayers, runHeadlessDraft, PLAYS } from './helpers';
import { resolveDepthChart } from '@/engine/rosterStats';

// ── Synthetic-player factory (full control over traits, no dependency on real data) ──

let syntheticCounter = 0;

function trait(name: string, level: number): Trait {
  return { name, level };
}

function makePlayer(traits: Trait[]): PlayerCardData {
  const id = `synthetic-${syntheticCounter++}`;
  return {
    type: 'Player',
    id,
    player: { id, name: id, position: 'SF', height: '6-6', weight: 210, age: 26, team: 'TST' },
    stats: {
      gp: 70, mpg: 28, pts: 14, trb: 5, ast: 4, stl: 1, blk: 0.5, fga: 11, fg3a: 3, fta: 3,
      pct_fga_0_3: 0.3, pct_fga_3_10: 0.15, pct_fga_10_16: 0.1, pct_fga_16_3p: 0.1, pct_fga_3p: 0.35,
      fg_pct_0_3: 0.6, fg_pct_3_10: 0.4, fg_pct_10_16: 0.4, fg_pct_16_3p: 0.4, fg_pct_3p: 0.36,
      fg_pct: 0.46, fg3_pct: 0.36, fg2_pct: 0.5, ft_pct: 0.78, per: 15, ts: 0.55, vorp: 1, dbpm: 0, tov: 2,
    },
    awards: [],
    ratings: { overall: 70, finishing: 60, midRange: 55, perimeter: 55, playmaking: 50, rebounding: 50, perimeterDefense: 50, postDefense: 50 },
    traits,
    rarity: 'Common',
  };
}

function badgeLevel(p: PlayerCardData, name: string): number {
  return p.traits.find(t => t.name === name)?.level ?? 0;
}

// ── Tally correctness (real cards) ──────────────────────────────────────────

describe('tallyColors (real cards)', () => {
  const players = loadPlayers();

  it('sums carriers/points/starters per colour, matching a manual sum over real cards', () => {
    const sharpshooters = players.filter(p => p.traits.some(t => t.name === 'Sharpshooter')).slice(0, 6);
    expect(sharpshooters.length).toBeGreaterThan(0);

    const starterIds = new Set(sharpshooters.slice(0, 2).map(p => p.id));
    const tally = tallyColors(sharpshooters, starterIds);

    const expectedPoints = sharpshooters.reduce((sum, p) => sum + badgeLevel(p, 'Sharpshooter'), 0);
    expect(tally['Sharpshooter'].carriers).toBe(sharpshooters.length);
    expect(tally['Sharpshooter'].points).toBe(expectedPoints);
    expect(tally['Sharpshooter'].starters).toBe(Math.min(2, sharpshooters.length));
  });

  it('a player carrying several badges contributes to each colour independently', () => {
    const dual = makePlayer([trait('Finisher', 2), trait('Sharpshooter', 3)]);
    const tally = tallyColors([dual], new Set());
    expect(tally['Finisher']).toEqual({ carriers: 1, points: 2, starters: 0 });
    expect(tally['Sharpshooter']).toEqual({ carriers: 1, points: 3, starters: 0 });
  });
});

// ── Mono: Shooting Gallery online -> dedicated (real Sharpshooter carriers) ─────

describe('Shooting Gallery (mono) reaches Online then Dedicated on real cards', () => {
  const players = loadPlayers();
  const carriers = players
    .filter(p => p.traits.some(t => t.name === 'Sharpshooter'))
    .sort((a, b) => badgeLevel(b, 'Sharpshooter') - badgeLevel(a, 'Sharpshooter'));

  it('has enough real Sharpshooter carriers in the pool to exercise both tiers', () => {
    expect(carriers.length).toBeGreaterThanOrEqual(MONO_THRESHOLDS.dedicated.carriers);
  });

  it('5 top carriers + 2 starters reach Online but not Dedicated (carriers pinned at 5 < 6)', () => {
    const roster = carriers.slice(0, MONO_THRESHOLDS.online.carriers);
    const points = roster.reduce((s, p) => s + badgeLevel(p, 'Sharpshooter'), 0);
    // Sanity: taking the highest-level carriers first gives the best chance of the real
    // pool actually reaching the points threshold; if this fails the pool doesn't support
    // the mono threshold as tuned (see plan §9 — thresholds are provisional).
    expect(points).toBeGreaterThanOrEqual(MONO_THRESHOLDS.online.points);

    const starterIds = new Set(roster.slice(0, MONO_THRESHOLDS.online.starters).map(p => p.id));
    const status = evaluateArchetypes(roster, starterIds).find(s => s.def.id === 'shooting-gallery')!;
    expect(status.tier).toBe('online');
    expect(status.missing.length).toBeGreaterThan(0); // still short of Dedicated
  });

  it('6 top carriers + 3 starters (with enough points) reach Dedicated', () => {
    const roster = carriers.slice(0, MONO_THRESHOLDS.dedicated.carriers);
    const points = roster.reduce((s, p) => s + badgeLevel(p, 'Sharpshooter'), 0);
    expect(points).toBeGreaterThanOrEqual(MONO_THRESHOLDS.dedicated.points);

    const starterIds = new Set(roster.slice(0, MONO_THRESHOLDS.dedicated.starters).map(p => p.id));
    const status = evaluateArchetypes(roster, starterIds).find(s => s.def.id === 'shooting-gallery')!;
    expect(status.tier).toBe('dedicated');
    expect(status.missing).toEqual([]);
  });
});

// ── Two-colour: distinct-player de-duplication ──────────────────────────────

describe('two-colour distinct-player requirement', () => {
  it('a player carrying both colours counts once toward "distinct", not twice', () => {
    // Inside-Out online (TWO_COLOR_THRESHOLDS): Finisher primary 3 carriers / 6 pts,
    // Sharpshooter support 2 carriers / 3 pts, 4 DISTINCT players, 1 primary starter.
    const on = TWO_COLOR_THRESHOLDS.online;
    const pA = makePlayer([trait('Finisher', 3)]);
    const pB = makePlayer([trait('Finisher', 3), trait('Sharpshooter', 2)]); // dual carrier
    const pC = makePlayer([trait('Finisher', 1), trait('Sharpshooter', 2)]); // dual carrier
    const roster = [pA, pB, pC];
    const starterIds = new Set([pA.id]);

    // Primary (3 carriers / 7 pts) and support (2 carriers / 4 pts) are both individually
    // satisfied, but only 3 DISTINCT players are involved (pB and pC each carry both
    // colours) — one short of the online distinct requirement.
    expect(on.distinct).toBe(roster.length + 1);
    const before = evaluateArchetypes(roster, starterIds).find(s => s.def.id === 'inside-out')!;
    expect(before.tier).toBe('none');
    expect(before.missing.some(m => m.startsWith('Distinct players'))).toBe(true);

    // A genuinely new distinct carrier (of either colour) tips it over.
    const pD = makePlayer([trait('Sharpshooter', 1)]);
    const after = evaluateArchetypes([...roster, pD], starterIds).find(s => s.def.id === 'inside-out')!;
    expect(after.tier).toBe('online');
  });
});

// ── Gold: keystone gate ──────────────────────────────────────────────────────

describe('gold archetype keystone gate', () => {
  it('stays "none" without the keystone trait even when every tally is met, then reaches Online once present', () => {
    // 3-and-D Paradigm online: Lockdown Defender 4c/9p, Sharpshooter 2c/4p, Floor General
    // 2c/4p, distinct 6, relevant starters 3, keystone 'Two-Way Disruptor'.
    const p1 = makePlayer([trait('Lockdown Defender', 3)]);
    const p2 = makePlayer([trait('Lockdown Defender', 3)]);
    const p3 = makePlayer([trait('Lockdown Defender', 2)]);
    const p4 = makePlayer([trait('Lockdown Defender', 1)]);
    const p5 = makePlayer([trait('Sharpshooter', 2)]);
    const p6 = makePlayer([trait('Sharpshooter', 2)]);
    const p7 = makePlayer([trait('Floor General', 2)]);
    const p8 = makePlayer([trait('Floor General', 2)]);
    const roster = [p1, p2, p3, p4, p5, p6, p7, p8];
    const starterIds = new Set([p1.id, p2.id, p3.id]);

    const before = evaluateArchetypes(roster, starterIds).find(s => s.def.id === '3-and-d-paradigm')!;
    expect(before.tier).toBe('none');
    expect(before.missing.some(m => m.includes('Keystone'))).toBe(true);

    const p9 = makePlayer([trait('Two-Way Disruptor', 2)]);
    const after = evaluateArchetypes([...roster, p9], starterIds).find(s => s.def.id === '3-and-d-paradigm')!;
    expect(after.tier).toBe('online');
  });
});

// ── selectionIsValid ─────────────────────────────────────────────────────────

describe('selectionIsValid', () => {
  // No active players -> every archetype tiers 'none', but side-mismatch is checked
  // before tier, so this is enough to exercise the slot-eligibility rules.
  const statuses = evaluateArchetypes([], new Set());

  it('rejects an offense-side plan placed in the defense slot', () => {
    const result = selectionIsValid({ defense: 'rim-pressure' }, statuses); // rim-pressure is offense-side
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not a defensive plan/i);
  });

  it('rejects a defense-side plan placed in the offense slot', () => {
    const result = selectionIsValid({ offense: 'paint-wall' }, statuses); // paint-wall is defense-side
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not an offensive plan/i);
  });

  it('rejects a Gold plan combined with another selection (Gold occupies both slots)', () => {
    const result = selectionIsValid({ gold: '3-and-d-paradigm', offense: 'rim-pressure' }, statuses);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/both philosophy slots/i);
  });

  it('accepts an empty selection', () => {
    expect(selectionIsValid({}, statuses).ok).toBe(true);
  });
});

// ── Online = 70% of Dedicated ────────────────────────────────────────────────

describe('Online effect is ~70% of Dedicated (ARCHETYPE_ONLINE_SCALE), rounded to 0.5pp', () => {
  it('every share/efficiency channel scales down by ~0.7x going from Dedicated to Online', () => {
    const def = ARCHETYPES.find(a => a.id === 'shooting-gallery')!;
    const dedicatedStatus: ArchetypeStatus = { def, tier: 'dedicated', tally: {}, missing: [], progress: 1 };
    const onlineStatus: ArchetypeStatus = { def, tier: 'online', tally: {}, missing: [], progress: 1 };

    const dedicated = archetypeModifiers([dedicatedStatus], { offense: def.id }).offense;
    const online = archetypeModifiers([onlineStatus], { offense: def.id }).offense;

    for (const field of ['rimShareBonus', 'midShareBonus', 'perShareBonus', 'rimEffBonus', 'midEffBonus', 'perEffBonus'] as const) {
      expect(Math.abs(online[field] - 0.7 * dedicated[field])).toBeLessThanOrEqual(0.0026); // within half a 0.5pp rounding step
    }
    // Dedicated values are untouched (tier === 'dedicated' skips scaling entirely).
    expect(dedicated.perShareBonus).toBeCloseTo(def.dedicated.ownShare!.three!, 10);
  });

  it('possessions scale the same way, rounded to the nearest whole possession', () => {
    const def = ARCHETYPES.find(a => a.id === 'beautiful-game')!; // dedicated possessions: 3
    const onlineStatus: ArchetypeStatus = { def, tier: 'online', tally: {}, missing: [], progress: 1 };
    const { possessionSwing } = archetypeModifiers([onlineStatus], { offense: def.id });
    expect(possessionSwing).toBe(Math.round(0.7 * def.dedicated.possessions!));
  });
});

// ── Caps ─────────────────────────────────────────────────────────────────────

describe('IDENTITY_CAPS are enforced on the combined result', () => {
  it('clamps an oversized effect to the share/efficiency/possession/and-1 caps', () => {
    const fakeDef: ArchetypeDef = {
      id: 'test-overload', name: 'Test Overload', kind: 'mono', side: 'offense',
      colors: { primary: 'Sharpshooter' },
      dedicated: { ownShare: { rim: 0.5 }, ownEff: { rim: 0.5 }, possessions: 50, and1: 0.5 },
      description: 'test fixture — deliberately exceeds every cap',
    };
    const status: ArchetypeStatus = { def: fakeDef, tier: 'dedicated', tally: {}, missing: [], progress: 1 };
    const { offense, possessionSwing } = archetypeModifiers([status], { offense: 'test-overload' });

    expect(offense.rimShareBonus).toBe(IDENTITY_CAPS.share);
    expect(offense.rimEffBonus).toBe(IDENTITY_CAPS.eff);
    expect(offense.and1Bonus).toBe(IDENTITY_CAPS.and1);
    expect(possessionSwing).toBe(IDENTITY_CAPS.possessions);
  });

  it('clamps a negative oversized effect symmetrically', () => {
    const fakeDef: ArchetypeDef = {
      id: 'test-overload-neg', name: 'Test Overload Negative', kind: 'mono', side: 'defense',
      colors: { primary: 'Paint Protector' },
      dedicated: { oppEff: { rim: -0.5 }, oppShare: { rim: -0.9 } },
      description: 'test fixture — deliberately exceeds every cap (negative)',
    };
    const status: ArchetypeStatus = { def: fakeDef, tier: 'dedicated', tally: {}, missing: [], progress: 1 };
    const { defense } = archetypeModifiers([status], { defense: 'test-overload-neg' });

    expect(defense.rimEffBonus).toBe(-IDENTITY_CAPS.eff);
    expect(defense.rimShareBonus).toBe(-IDENTITY_CAPS.share);
  });
});

// ── bestSelection (bot helper) ───────────────────────────────────────────────

describe('bestSelection', () => {
  it('picks the eligible Gold plan over separate offense/defense plans', () => {
    const goldDef = ARCHETYPES.find(a => a.id === '3-and-d-paradigm')!;
    const offenseDef = ARCHETYPES.find(a => a.id === 'rim-pressure')!;
    const defenseDef = ARCHETYPES.find(a => a.id === 'paint-wall')!;
    const statuses: ArchetypeStatus[] = [
      { def: goldDef, tier: 'online', tally: {}, missing: [], progress: 1 },
      { def: offenseDef, tier: 'dedicated', tally: {}, missing: [], progress: 1 },
      { def: defenseDef, tier: 'dedicated', tally: {}, missing: [], progress: 1 },
    ];
    expect(bestSelection(statuses)).toEqual({ gold: '3-and-d-paradigm' });
  });

  it('falls back to the best offense + best defense plan when no Gold plan is eligible', () => {
    const offenseDef = ARCHETYPES.find(a => a.id === 'rim-pressure')!;
    const defenseDef = ARCHETYPES.find(a => a.id === 'paint-wall')!;
    const goldDef = ARCHETYPES.find(a => a.id === '3-and-d-paradigm')!;
    const statuses: ArchetypeStatus[] = [
      { def: goldDef, tier: 'none', tally: {}, missing: ['x'], progress: 0.2 },
      { def: offenseDef, tier: 'dedicated', tally: {}, missing: [], progress: 1 },
      { def: defenseDef, tier: 'online', tally: {}, missing: ['x'], progress: 0.5 },
    ];
    expect(bestSelection(statuses)).toEqual({ offense: 'rim-pressure', defense: 'paint-wall' });
  });

  it('returns an empty selection when nothing is eligible', () => {
    const offenseDef = ARCHETYPES.find(a => a.id === 'rim-pressure')!;
    const statuses: ArchetypeStatus[] = [{ def: offenseDef, tier: 'none', tally: {}, missing: ['x'], progress: 0 }];
    expect(bestSelection(statuses)).toEqual({});
  });
});

// ── Catalog sanity ───────────────────────────────────────────────────────────

describe('ARCHETYPES catalog', () => {
  it('has no id collisions and renames the two plans that clashed with play names', () => {
    const ids = ARCHETYPES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = ARCHETYPES.map(a => a.name);
    expect(names).toContain('Junkyard Dogs');
    expect(names).toContain('Spacing Machine');
    expect(names).not.toContain('Grit and Grind'); // play-sys-3's name
    expect(names).not.toContain('Four Out One In'); // play-std-5's name
    expect(names).not.toContain('Four-Out One-In');
  });

  it('every Gold plan spans both sides and lists at least one keystone', () => {
    for (const a of ARCHETYPES.filter(a => a.kind === 'gold')) {
      expect(a.side).toBe('both');
      expect(a.keystones && a.keystones.length).toBeGreaterThan(0);
      expect(a.colors.support).toBeDefined();
      expect(a.colors.tertiary).toBeDefined();
    }
  });

  it('every mono/two plan has a definite offense or defense side', () => {
    for (const a of ARCHETYPES.filter(a => a.kind !== 'gold')) {
      expect(['offense', 'defense']).toContain(a.side);
    }
  });
});

// ── Feasibility table (200 seeded headless drafts) — logs only, asserts nothing ────

describe('mono archetype feasibility across headless drafts', () => {
  it('logs how many of the 8 seats reach Online/Dedicated for each mono plan over 200 seeded drafts', () => {
    const players = loadPlayers();
    const monoDefs = ARCHETYPES.filter(a => a.kind === 'mono');
    const counts: Record<string, { online: number; dedicated: number }> = {};
    for (const def of monoDefs) counts[def.name] = { online: 0, dedicated: 0 };

    const DRAFTS = 200;
    let totalSeats = 0;
    for (let seed = 0; seed < DRAFTS; seed++) {
      const seats = runHeadlessDraft(players, PLAYS, seed);
      for (const seat of seats) {
        const playerCards = seat.drafted.filter((c): c is PlayerCardData => c.type === 'Player');
        const depthChart = resolveDepthChart(playerCards, seat.builtRoster.depthChart);
        const allPlayers = Object.values(depthChart).flat();
        const starterIds = new Set(
          Object.values(depthChart).map(arr => arr[0]?.id).filter((id): id is string => !!id),
        );
        const statuses = evaluateArchetypes(allPlayers, starterIds);
        for (const s of statuses) {
          if (s.def.kind !== 'mono') continue;
          if (s.tier !== 'none') counts[s.def.name].online++;
          if (s.tier === 'dedicated') counts[s.def.name].dedicated++;
        }
        totalSeats++;
      }
    }

    const rows = monoDefs.map(def => {
      const c = counts[def.name];
      return {
        archetype: def.name,
        color: def.colors.primary,
        online_pct: ((c.online / totalSeats) * 100).toFixed(1) + '%',
        dedicated_pct: ((c.dedicated / totalSeats) * 100).toFixed(1) + '%',
      };
    });
    console.log(`\nMono archetype feasibility over ${DRAFTS} seeded headless drafts (${totalSeats} seats):`);
    console.table(rows);
  }, 120_000);
});
