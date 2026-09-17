/**
 * card_balance D4/T4 plan-coverage test: "Every plan in the catalog must have at least
 * one play whose roles use only that plan's colours."
 *
 * "Colours a play uses" = the union of each role's PRIMARY badge requirement
 * (`role.badge`) plus, for an AND role, its `andBadge` too (both are mandatory for that
 * role) — an `altBadge` is excluded, since it's an alternative eligibility path, not a
 * colour the play is actually built around (Full Court Press's helper role, for example,
 * accepts Lockdown Defender OR Glass Cleaner, but the play itself is a Lockdown Defender
 * scheme). Basic offense/defense (no badges) are excluded, they aren't "natural" to any
 * plan.
 *
 * Reality check done while writing this (2026-09-17, T4): with only 4 new plays budgeted
 * by D4, and 7 mono-colour plans needing a PURE single-colour play each to be "natural"
 * under this rule, full coverage of all 17 plans in the catalog is not reachable from
 * this batch alone. T4's two new defensive plays (Switch Everything: pure Lockdown
 * Defender, Drop Coverage: pure Paint Protector) close both previously-uncovered
 * defensive monos; reworking Post-Up Series to pure Finisher (dropping the originally
 * planned Mid-Range Maestro pairing, which would have duplicated Triangle Offense's
 * existing colour pair without covering anything new) closes one offensive mono
 * (Rim Pressure). Elbow Orchestra (Mid-Range Maestro + Floor General, predates T4 — not
 * in D4's remit) and four more monos (Midrange Clinic, Shooting Gallery, The Beautiful
 * Game, Second-Chance Engine) still have no covering play and are asserted as a KNOWN
 * gap below — closing them needs more mono-focused plays than D4 budgeted, a decision
 * for the next content pass, not something to silently paper over here.
 */
import { describe, it, expect } from 'vitest';
import { PLAYBOOK, type PlayDef, type PlayRole } from '@/engine/playbook';
import { ARCHETYPES, type Color } from '@/engine/archetypes';

function roleColours(role: PlayRole): Color[] {
  const colours: Color[] = [];
  if (role.badge) colours.push(role.badge as Color);
  if (role.andBadge) colours.push(role.andBadge as Color);
  return colours;
}

function playColours(def: PlayDef): Set<Color> {
  return new Set(def.roles.flatMap(roleColours));
}

const REAL_PLAYS = Object.values(PLAYBOOK).filter(def => def.rarity !== 'Basic');

function planColours(def: (typeof ARCHETYPES)[number]): Set<Color> {
  const cs = [def.colors.primary, def.colors.support, def.colors.tertiary].filter((c): c is Color => !!c);
  return new Set(cs);
}

/** A play "belongs" to a plan when its colour set is non-empty and a subset of the
 *  plan's colours (so a mono plan needs a pure single-colour play; a two/gold plan
 *  accepts any play built only from colours it includes, not necessarily all of them). */
function isSubsetOf(small: Set<Color>, big: Set<Color>): boolean {
  return small.size > 0 && [...small].every(c => big.has(c));
}

describe('play catalog colour coverage (card_balance D4/T4)', () => {
  const coverage = new Map<string, boolean>();
  for (const plan of ARCHETYPES) {
    const colours = planColours(plan);
    const covered = REAL_PLAYS.some(play => isSubsetOf(playColours(play), colours));
    coverage.set(plan.id, covered);
  }

  it('T4 closes both previously-uncovered defensive monos', () => {
    expect(coverage.get('no-fly-zone')).toBe(true); // Switch Everything: pure Lockdown Defender
    expect(coverage.get('paint-wall')).toBe(true); // Drop Coverage: pure Paint Protector
  });

  it('T4 closes one offensive mono (Post-Up Series reworked to pure Finisher)', () => {
    expect(coverage.get('rim-pressure')).toBe(true);
  });

  it('every gold plan already has a covering play', () => {
    // Gold plans have 3 colours, so any play built from a subset of 1-2 of them already
    // qualifies — the wide net makes full gold coverage realistic even without dedicated
    // gold-plan plays, unlike mono/two-colour plans below.
    const gold = ARCHETYPES.filter(p => p.kind === 'gold');
    const uncovered = gold.filter(p => !coverage.get(p.id)).map(p => p.name);
    expect(uncovered).toEqual([]);
  });

  it('KNOWN GAP: five mono/two-colour plans still have no covering play', () => {
    // Update this list (and note why in HANDOVER/the next content plan) if a future play
    // closes one of these — don't just delete the assertion. Elbow Orchestra predates T4
    // (Mid-Range Maestro + Floor General was never D4's remit); the four monos are the
    // ones T4's two offensive plays (post-up: pure Finisher; drive-and-kick: Floor
    // General + Sharpshooter, per D4) don't reach.
    const stillUncovered = ARCHETYPES
      .filter(p => (p.kind === 'mono' || p.kind === 'two') && !coverage.get(p.id))
      .map(p => p.name)
      .sort();
    expect(stillUncovered).toEqual([
      'Elbow Orchestra', 'Midrange Clinic', 'Second-Chance Engine', 'Shooting Gallery',
      'The Beautiful Game',
    ]);
  });

  it('play catalog has 14 real plays (10 pre-T4 + 4 new)', () => {
    expect(REAL_PLAYS.length).toBe(14);
  });
});
