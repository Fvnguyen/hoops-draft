/**
 * Archetypes — persistent roster identities (docs/plan_plays_and_synergies_2026-09-13.md §1-3).
 *
 * Wave 0 (2026-09-13): TYPES AND THRESHOLDS ONLY. The catalog and `evaluateArchetypes`
 * are implemented by the wave-1 archetypes agent against these signatures. Chemistry
 * synergies (Brotherhood, Veteran Core, Young Guns) are removed by design.
 *
 * Pure module: no React, no DOM, no storage.
 */

import type { PlayerCardData } from './types';

/** The seven skill badges are the game's "colours". */
export type Color =
  | 'Finisher'
  | 'Mid-Range Maestro'
  | 'Sharpshooter'
  | 'Floor General'
  | 'Glass Cleaner'
  | 'Lockdown Defender'
  | 'Paint Protector';

export const COLORS: Color[] = [
  'Finisher', 'Mid-Range Maestro', 'Sharpshooter', 'Floor General', 'Glass Cleaner', 'Lockdown Defender', 'Paint Protector',
];

export type ArchetypeKind = 'mono' | 'two' | 'gold';
export type ArchetypeSide = 'offense' | 'defense' | 'both';
export type ArchetypeTier = 'none' | 'online' | 'dedicated';

/** Share packages sum to zero; efficiencies are additive; possessions per game; and-1 additive. */
export interface ArchetypeEffect {
  ownShare?: { rim?: number; mid?: number; three?: number };
  ownEff?: { rim?: number; mid?: number; three?: number };
  /** Applied to the OPPONENT's offense (negative eff hurts them; share shifts redirect their attempts). */
  oppShare?: { rim?: number; mid?: number; three?: number };
  oppEff?: { rim?: number; mid?: number; three?: number };
  possessions?: number;
  and1?: number;
}

export interface ArchetypeDef {
  id: string;
  name: string;
  kind: ArchetypeKind;
  side: ArchetypeSide;
  colors: { primary: Color; support?: Color; tertiary?: Color };
  /** Gold plans require one of these trait names on an active player. */
  keystones?: string[];
  /** Full-strength (Dedicated) effect; Online is ARCHETYPE_ONLINE_SCALE of it. */
  dedicated: ArchetypeEffect;
  description: string;
}

/** What the user chose at roster lock. A gold plan occupies both slots. */
export interface ArchetypeSelection {
  offense?: string;
  defense?: string;
  gold?: string;
}

export interface ColorTally {
  /** Distinct active players carrying the badge. */
  carriers: number;
  /** Sum of badge levels across the active roster. */
  points: number;
  /** Starters (depth-chart index 0) carrying the badge. */
  starters: number;
}

export interface ArchetypeStatus {
  def: ArchetypeDef;
  tier: ArchetypeTier;
  tally: Partial<Record<Color, ColorTally>>;
  /** Human-readable unmet conditions for the NEXT tier (empty when dedicated). */
  missing: string[];
  /** 0..1 progress toward Online (for UI teasers). */
  progress: number;
}

export interface ArchetypeThresholds {
  online: { carriers: number; points: number; starters: number };
  dedicated: { carriers: number; points: number; starters: number };
}

/**
 * Plan §2 thresholds. These are the STARTING values; wave 3 tunes them per colour from the
 * card pool (Paint Protector carriers are ~3x rarer than Sharpshooters).
 */
export const MONO_THRESHOLDS: ArchetypeThresholds = {
  online: { carriers: 5, points: 10, starters: 2 },
  dedicated: { carriers: 6, points: 12, starters: 3 },
};
export const TWO_COLOR_THRESHOLDS = {
  online: { primary: { carriers: 4, points: 9 }, support: { carriers: 2, points: 4 }, distinct: 5, primaryStarters: 2 },
  dedicated: { primary: { carriers: 5, points: 11 }, support: { carriers: 3, points: 6 }, distinct: 6, primaryStarters: 3 },
};
export const GOLD_THRESHOLDS = {
  online: { primary: { carriers: 4, points: 9 }, secondary: { carriers: 2, points: 4 }, tertiary: { carriers: 2, points: 4 }, distinct: 6, relevantStarters: 3 },
  dedicated: { primary: { carriers: 5, points: 11 }, secondary: { carriers: 3, points: 6 }, tertiary: { carriers: 2, points: 5 }, distinct: 7, relevantStarters: 4 },
};

/** Tally badge carriers / points / starters per colour over the active roster. */
export function tallyColors(activePlayers: PlayerCardData[], starterIds: Set<string>): Record<Color, ColorTally> {
  const out = Object.fromEntries(COLORS.map(c => [c, { carriers: 0, points: 0, starters: 0 }])) as Record<Color, ColorTally>;
  for (const p of activePlayers) {
    for (const t of p.traits ?? []) {
      if ((COLORS as string[]).includes(t.name)) {
        const c = out[t.name as Color];
        c.carriers += 1;
        c.points += t.level;
        if (starterIds.has(p.id)) c.starters += 1;
      }
    }
  }
  return out;
}
