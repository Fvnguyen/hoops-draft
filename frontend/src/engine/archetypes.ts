/**
 * Archetypes — persistent roster identities (docs/plan_plays_and_synergies_2026-09-13.md §1-3).
 *
 * Wave 1 (2026-09-13): catalog + evaluation + selection + modifier application.
 * Chemistry synergies (Brotherhood, Veteran Core, Young Guns) are removed by design;
 * there are no mastery tiers — only Online (≈70% of Dedicated) and Dedicated.
 *
 * Pure module: no React, no DOM, no storage. `GameModifiers` is imported as a
 * TYPE ONLY (erased at compile time) so this file has no runtime dependency on
 * synergies.ts — synergies.ts depends on this file (ARCHETYPES, evaluateArchetypes,
 * archetypeModifiers), and a runtime import back here would create a module cycle
 * that breaks depending on which file loads first (see synergies.ts's SYNERGIES,
 * which is computed from ARCHETYPES at module-eval time).
 */

import type { PlayerCardData } from './types';
import type { GameModifiers } from './synergies';
import { ARCHETYPE_ONLINE_SCALE, IDENTITY_CAPS } from './balance';

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
 * Thresholds. Plan §2 started at mono 5/10/2 → 6/12/3, which a colour-chasing drafter
 * reached only 5-50% of the time in the 168-player cube (scripts sweep, 2026-09-13).
 * Tuned so a FOCUSED drafter reaches Online ~85-95% and Dedicated ~40-60% of drafts on
 * the offensive colours, while PER-drafting bots reach Online ~25-35% and Dedicated
 * ~5%. The two defensive colours carry ~3x fewer badges and get a looser override.
 */
export const MONO_THRESHOLDS: ArchetypeThresholds = {
  online: { carriers: 3, points: 6, starters: 1 },
  dedicated: { carriers: 5, points: 9, starters: 2 },
};
/** Per-colour overrides for rarer badges (see note above). */
export const MONO_THRESHOLDS_BY_COLOR: Partial<Record<Color, ArchetypeThresholds>> = {
  'Lockdown Defender': { online: { carriers: 3, points: 5, starters: 1 }, dedicated: { carriers: 4, points: 8, starters: 2 } },
  'Paint Protector': { online: { carriers: 3, points: 5, starters: 1 }, dedicated: { carriers: 4, points: 8, starters: 2 } },
};
export function monoThresholdsFor(color: Color): ArchetypeThresholds {
  return MONO_THRESHOLDS_BY_COLOR[color] ?? MONO_THRESHOLDS;
}
/** Scaled from the plan's 5/10 mono baseline by the same ~0.6-0.7 factor as MONO_THRESHOLDS. */
export const TWO_COLOR_THRESHOLDS = {
  online: { primary: { carriers: 3, points: 6 }, support: { carriers: 2, points: 3 }, distinct: 4, primaryStarters: 1 },
  dedicated: { primary: { carriers: 4, points: 8 }, support: { carriers: 2, points: 5 }, distinct: 5, primaryStarters: 2 },
};
export const GOLD_THRESHOLDS = {
  online: { primary: { carriers: 3, points: 6 }, secondary: { carriers: 2, points: 3 }, tertiary: { carriers: 1, points: 2 }, distinct: 5, relevantStarters: 2 },
  dedicated: { primary: { carriers: 4, points: 8 }, secondary: { carriers: 2, points: 5 }, tertiary: { carriers: 2, points: 4 }, distinct: 6, relevantStarters: 3 },
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

/**
 * Distinct-player and starter counts across the UNION of several colours — a player who
 * carries several of the listed colours still counts once (plan §2: "cannot satisfy the
 * distinct-player requirement more than once").
 */
function unionCarrierStats(activePlayers: PlayerCardData[], starterIds: Set<string>, colors: Color[]): { distinct: number; starters: number } {
  let distinct = 0;
  let starters = 0;
  for (const p of activePlayers) {
    const carries = (p.traits ?? []).some(t => colors.includes(t.name as Color));
    if (!carries) continue;
    distinct += 1;
    if (starterIds.has(p.id)) starters += 1;
  }
  return { distinct, starters };
}

/** True when any active player carries one of a gold plan's keystone traits. */
function hasKeystone(activePlayers: PlayerCardData[], keystones: string[] | undefined): boolean {
  if (!keystones || keystones.length === 0) return true;
  return activePlayers.some(p => (p.traits ?? []).some(t => keystones.includes(t.name)));
}

// ── Catalog (plan §3) ───────────────────────────────────────────────────────
//
// Renamed to avoid clashing with play-card names (plan calls for this explicitly):
//   'Grit and Grind' (two-colour archetype)   -> 'Junkyard Dogs'   (play-sys-3 is also named Grit and Grind)
//   'Four-Out One-In' (two-colour archetype)  -> 'Spacing Machine' (play-std-5 is named Four Out One In)
//
// Every ownShare/oppShare package below sums to (approximately) zero per plan §2.

export const ARCHETYPES: ArchetypeDef[] = [
  // ── Mono-colour foundations ────────────────────────────────────────────
  {
    id: 'rim-pressure', name: 'Rim Pressure', kind: 'mono', side: 'offense',
    colors: { primary: 'Finisher' },
    dedicated: { ownShare: { rim: 0.10, mid: -0.07, three: -0.03 }, ownEff: { rim: 0.02 }, and1: 0.02 },
    description: 'Rim +10%, Mid -7%, 3PT -3%; Rim efficiency +2%, and-one chance +2%',
  },
  {
    id: 'midrange-clinic', name: 'Midrange Clinic', kind: 'mono', side: 'offense',
    colors: { primary: 'Mid-Range Maestro' },
    dedicated: { ownShare: { rim: -0.05, mid: 0.10, three: -0.05 }, ownEff: { mid: 0.03 } },
    description: 'Rim -5%, Mid +10%, 3PT -5%; Mid efficiency +3%',
  },
  {
    id: 'shooting-gallery', name: 'Shooting Gallery', kind: 'mono', side: 'offense',
    colors: { primary: 'Sharpshooter' },
    dedicated: { ownShare: { rim: 0.03, mid: -0.13, three: 0.10 }, ownEff: { three: 0.03 } },
    description: 'Rim +3%, Mid -13%, 3PT +10%; 3PT efficiency +3%',
  },
  {
    id: 'beautiful-game', name: 'The Beautiful Game', kind: 'mono', side: 'offense',
    colors: { primary: 'Floor General' },
    dedicated: { possessions: 3, ownShare: { rim: 0.03, mid: 0.03, three: -0.06 }, ownEff: { rim: 0.01, mid: 0.01 } },
    description: '+3 possessions; Rim +3%, Mid +3%, 3PT -6%; Rim and Mid efficiency +1%',
  },
  {
    id: 'second-chance-engine', name: 'Second-Chance Engine', kind: 'mono', side: 'offense',
    colors: { primary: 'Glass Cleaner' },
    dedicated: { possessions: 4, ownShare: { rim: 0.06, mid: -0.03, three: -0.03 }, ownEff: { rim: 0.01 } },
    description: '+4 possessions; Rim +6%, Mid -3%, 3PT -3%; Rim efficiency +1%',
  },
  {
    id: 'no-fly-zone', name: 'No-Fly Zone', kind: 'mono', side: 'defense',
    colors: { primary: 'Lockdown Defender' },
    dedicated: { oppShare: { three: -0.06, rim: 0.02, mid: 0.04 }, oppEff: { three: -0.03 } },
    description: 'Opponent 3PT -6%, Rim +2%, Mid +4%; opponent 3PT efficiency -3%',
  },
  {
    id: 'paint-wall', name: 'Paint Wall', kind: 'mono', side: 'defense',
    colors: { primary: 'Paint Protector' },
    dedicated: { oppShare: { rim: -0.06, mid: 0.02, three: 0.04 }, oppEff: { rim: -0.04 } },
    description: 'Opponent Rim -6%, Mid +2%, 3PT +4%; opponent Rim efficiency -4%',
  },

  // ── Two-colour archetypes ───────────────────────────────────────────────
  {
    id: 'inside-out', name: 'Inside-Out', kind: 'two', side: 'offense',
    colors: { primary: 'Finisher', support: 'Sharpshooter' },
    dedicated: { ownShare: { rim: 0.10, mid: -0.15, three: 0.05 }, ownEff: { rim: 0.02, three: 0.02 } },
    description: 'Rim +10%, Mid -15%, 3PT +5%; Rim and 3PT efficiency +2%',
  },
  {
    id: 'elbow-orchestra', name: 'Elbow Orchestra', kind: 'two', side: 'offense',
    colors: { primary: 'Mid-Range Maestro', support: 'Floor General' },
    dedicated: { ownShare: { rim: -0.05, mid: 0.11, three: -0.06 }, ownEff: { mid: 0.04 } },
    description: 'Rim -5%, Mid +11%, 3PT -6%; Mid efficiency +4%',
  },
  {
    id: 'pick-and-roll-republic', name: 'Pick-and-Roll Republic', kind: 'two', side: 'offense',
    colors: { primary: 'Floor General', support: 'Finisher' },
    dedicated: { possessions: 3, ownShare: { rim: 0.08, mid: -0.04, three: -0.04 }, ownEff: { rim: 0.02 }, and1: 0.01 },
    description: '+3 possessions; Rim +8%, Mid -4%, 3PT -4%; Rim efficiency +2%, and-one chance +1%',
  },
  {
    id: 'spacing-machine', name: 'Spacing Machine', kind: 'two', side: 'offense',
    colors: { primary: 'Sharpshooter', support: 'Glass Cleaner' },
    dedicated: { ownShare: { rim: -0.04, mid: -0.08, three: 0.12 }, ownEff: { three: 0.02, rim: 0.01 } },
    description: 'Rim -4%, Mid -8%, 3PT +12%; 3PT efficiency +2%, Rim efficiency +1%',
  },
  {
    id: 'junkyard-dogs', name: 'Junkyard Dogs', kind: 'two', side: 'defense',
    colors: { primary: 'Lockdown Defender', support: 'Glass Cleaner' },
    dedicated: { possessions: 3, oppEff: { rim: -0.02, mid: -0.02, three: -0.02 } },
    description: '+3 possessions; opponent Rim efficiency -2%, Mid efficiency -2%, 3PT efficiency -2%',
  },
  {
    id: 'glass-fortress', name: 'Glass Fortress', kind: 'two', side: 'defense',
    colors: { primary: 'Paint Protector', support: 'Glass Cleaner' },
    dedicated: { possessions: 2, oppShare: { rim: -0.07, mid: 0.03, three: 0.04 }, oppEff: { rim: -0.03 } },
    description: 'Opponent Rim -7%, Mid +3%, 3PT +4%; opponent Rim efficiency -3%; +2 possessions',
  },

  // ── Gold archetypes ─────────────────────────────────────────────────────
  {
    id: '3-and-d-paradigm', name: '3-and-D Paradigm', kind: 'gold', side: 'both',
    colors: { primary: 'Lockdown Defender', support: 'Sharpshooter', tertiary: 'Floor General' },
    keystones: ['Two-Way Disruptor'],
    dedicated: {
      ownShare: { mid: -0.05, three: 0.05 }, ownEff: { three: 0.02 },
      oppShare: { three: -0.05, rim: 0.02, mid: 0.03 }, oppEff: { three: -0.04 },
    },
    description: 'Own Mid -5%, 3PT +5%; own 3PT efficiency +2%. Opponent 3PT -5%, Rim +2%, Mid +3%; opponent 3PT efficiency -4%',
  },
  {
    id: 'switchblade-pressure', name: 'Switchblade Pressure', kind: 'gold', side: 'both',
    colors: { primary: 'Lockdown Defender', support: 'Floor General', tertiary: 'Finisher' },
    keystones: ['Playmaking Maestro', 'Two-Way Disruptor'],
    dedicated: {
      possessions: 4, ownShare: { rim: 0.05, mid: -0.03, three: -0.02 },
      oppEff: { three: -0.03, rim: -0.02 },
    },
    description: '+4 possessions; Rim +5%, Mid -3%, 3PT -2%; opponent 3PT efficiency -3%, opponent Rim efficiency -2%',
  },
  {
    id: 'five-out-fortress', name: 'Five-Out Fortress', kind: 'gold', side: 'both',
    colors: { primary: 'Sharpshooter', support: 'Glass Cleaner', tertiary: 'Paint Protector' },
    keystones: ['Sniper', 'Two-Way Disruptor'],
    dedicated: {
      ownShare: { rim: -0.03, mid: -0.07, three: 0.10 }, ownEff: { three: 0.02 },
      oppShare: { rim: -0.05, mid: 0.02, three: 0.03 }, oppEff: { rim: -0.03 },
    },
    description: 'Own Rim -3%, Mid -7%, 3PT +10%; own 3PT efficiency +2%. Opponent Rim -5%, Mid +2%, 3PT +3%; opponent Rim efficiency -3%',
  },
];

// ── Evaluation ───────────────────────────────────────────────────────────────

/** "Sharpshooter 3/5 carriers", "Sharpshooter 7/10 points", "Sharpshooter 1/2 starters". */
function fmtMissing(label: string, have: number, need: number, unit: string): string | null {
  if (have >= need) return null;
  return `${label}: ${have}/${need} ${unit}`;
}

function ratio(have: number, need: number): number {
  if (need <= 0) return 1;
  return Math.max(0, Math.min(1, have / need));
}

function evaluateMono(def: ArchetypeDef, tallies: Record<Color, ColorTally>): { tier: ArchetypeTier; missing: string[]; progress: number } {
  const t = tallies[def.colors.primary];
  const thr = monoThresholdsFor(def.colors.primary);
  const on = thr.online;
  const ded = thr.dedicated;
  const meetsOnline = t.carriers >= on.carriers && t.points >= on.points && t.starters >= on.starters;
  const meetsDedicated = t.carriers >= ded.carriers && t.points >= ded.points && t.starters >= ded.starters;
  const tier: ArchetypeTier = meetsDedicated ? 'dedicated' : meetsOnline ? 'online' : 'none';
  const next = tier === 'none' ? on : tier === 'online' ? ded : null;
  const missing: string[] = [];
  if (next) {
    const label = def.colors.primary;
    for (const m of [
      fmtMissing(label, t.carriers, next.carriers, 'carriers'),
      fmtMissing(label, t.points, next.points, 'points'),
      fmtMissing(label, t.starters, next.starters, 'starters'),
    ]) if (m) missing.push(m);
  }
  const progress = Math.min(ratio(t.carriers, on.carriers), ratio(t.points, on.points), ratio(t.starters, on.starters));
  return { tier, missing, progress };
}

function evaluateTwo(def: ArchetypeDef, activePlayers: PlayerCardData[], starterIds: Set<string>, tallies: Record<Color, ColorTally>): { tier: ArchetypeTier; missing: string[]; progress: number } {
  const primary = def.colors.primary;
  const support = def.colors.support!;
  const pt = tallies[primary];
  const st = tallies[support];
  const { distinct } = unionCarrierStats(activePlayers, starterIds, [primary, support]);
  const on = TWO_COLOR_THRESHOLDS.online;
  const ded = TWO_COLOR_THRESHOLDS.dedicated;

  const meets = (th: typeof on) =>
    pt.carriers >= th.primary.carriers && pt.points >= th.primary.points &&
    st.carriers >= th.support.carriers && st.points >= th.support.points &&
    distinct >= th.distinct && pt.starters >= th.primaryStarters;

  const tier: ArchetypeTier = meets(ded) ? 'dedicated' : meets(on) ? 'online' : 'none';
  const next = tier === 'none' ? on : tier === 'online' ? ded : null;
  const missing: string[] = [];
  if (next) {
    for (const m of [
      fmtMissing(primary, pt.carriers, next.primary.carriers, 'carriers'),
      fmtMissing(primary, pt.points, next.primary.points, 'points'),
      fmtMissing(support, st.carriers, next.support.carriers, 'carriers'),
      fmtMissing(support, st.points, next.support.points, 'points'),
      fmtMissing('Distinct players', distinct, next.distinct, ''),
      fmtMissing(primary, pt.starters, next.primaryStarters, 'starters'),
    ]) if (m) missing.push(m);
  }
  const progress = Math.min(
    ratio(pt.carriers, on.primary.carriers), ratio(pt.points, on.primary.points),
    ratio(st.carriers, on.support.carriers), ratio(st.points, on.support.points),
    ratio(distinct, on.distinct), ratio(pt.starters, on.primaryStarters),
  );
  return { tier, missing, progress };
}

function evaluateGold(def: ArchetypeDef, activePlayers: PlayerCardData[], starterIds: Set<string>, tallies: Record<Color, ColorTally>): { tier: ArchetypeTier; missing: string[]; progress: number } {
  const primary = def.colors.primary;
  const secondary = def.colors.support!;
  const tertiary = def.colors.tertiary!;
  const pt = tallies[primary];
  const st = tallies[secondary];
  const tt = tallies[tertiary];
  const { distinct, starters: relevantStarters } = unionCarrierStats(activePlayers, starterIds, [primary, secondary, tertiary]);
  const keystoneOk = hasKeystone(activePlayers, def.keystones);
  const on = GOLD_THRESHOLDS.online;
  const ded = GOLD_THRESHOLDS.dedicated;

  const meets = (th: typeof on) =>
    pt.carriers >= th.primary.carriers && pt.points >= th.primary.points &&
    st.carriers >= th.secondary.carriers && st.points >= th.secondary.points &&
    tt.carriers >= th.tertiary.carriers && tt.points >= th.tertiary.points &&
    distinct >= th.distinct && relevantStarters >= th.relevantStarters && keystoneOk;

  const tier: ArchetypeTier = meets(ded) ? 'dedicated' : meets(on) ? 'online' : 'none';
  const next = tier === 'none' ? on : tier === 'online' ? ded : null;
  const missing: string[] = [];
  if (next) {
    for (const m of [
      fmtMissing(primary, pt.carriers, next.primary.carriers, 'carriers'),
      fmtMissing(primary, pt.points, next.primary.points, 'points'),
      fmtMissing(secondary, st.carriers, next.secondary.carriers, 'carriers'),
      fmtMissing(secondary, st.points, next.secondary.points, 'points'),
      fmtMissing(tertiary, tt.carriers, next.tertiary.carriers, 'carriers'),
      fmtMissing(tertiary, tt.points, next.tertiary.points, 'points'),
      fmtMissing('Distinct players', distinct, next.distinct, ''),
      fmtMissing('Starters', relevantStarters, next.relevantStarters, ''),
    ]) if (m) missing.push(m);
    if (!keystoneOk) missing.push(`Keystone trait needed: ${(def.keystones ?? []).join(' or ')}`);
  }
  const progress = Math.min(
    ratio(pt.carriers, on.primary.carriers), ratio(pt.points, on.primary.points),
    ratio(st.carriers, on.secondary.carriers), ratio(st.points, on.secondary.points),
    ratio(tt.carriers, on.tertiary.carriers), ratio(tt.points, on.tertiary.points),
    ratio(distinct, on.distinct), ratio(relevantStarters, on.relevantStarters),
    keystoneOk ? 1 : 0,
  );
  return { tier, missing, progress };
}

/** Evaluate every archetype in the catalog against the active roster. */
export function evaluateArchetypes(
  activePlayers: PlayerCardData[],
  starterIds: Set<string>,
  // Selection does not change any archetype's own tier/tally/progress — every plan in the
  // catalog is evaluated the same way regardless of what the user has chosen. Accepted here
  // only so callers that already have a selection in hand don't need to special-case this call.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selection?: ArchetypeSelection,
): ArchetypeStatus[] {
  const tallies = tallyColors(activePlayers, starterIds);
  return ARCHETYPES.map((def): ArchetypeStatus => {
    const result = def.kind === 'mono' ? evaluateMono(def, tallies)
      : def.kind === 'two' ? evaluateTwo(def, activePlayers, starterIds, tallies)
      : evaluateGold(def, activePlayers, starterIds, tallies);
    const tally: Partial<Record<Color, ColorTally>> = { [def.colors.primary]: tallies[def.colors.primary] };
    if (def.colors.support) tally[def.colors.support] = tallies[def.colors.support];
    if (def.colors.tertiary) tally[def.colors.tertiary] = tallies[def.colors.tertiary];
    return { def, tier: result.tier, tally, missing: result.missing, progress: result.progress };
  });
}

// ── Selection validation ─────────────────────────────────────────────────────

/** A gold plan occupies both Philosophy slots; otherwise offense/defense are chosen independently. */
export function selectionIsValid(selection: ArchetypeSelection, statuses: ArchetypeStatus[]): { ok: boolean; reason?: string } {
  const byId = new Map(statuses.map(s => [s.def.id, s]));

  if (selection.gold) {
    if (selection.offense || selection.defense) {
      return { ok: false, reason: 'A Gold plan occupies both Philosophy slots — offense/defense cannot also be selected.' };
    }
    const s = byId.get(selection.gold);
    if (!s) return { ok: false, reason: `Unknown archetype id: ${selection.gold}` };
    if (s.def.kind !== 'gold') return { ok: false, reason: `${s.def.name} is not a Gold plan.` };
    if (s.tier === 'none') return { ok: false, reason: `${s.def.name} is not Online.` };
    return { ok: true };
  }

  if (selection.offense) {
    const s = byId.get(selection.offense);
    if (!s) return { ok: false, reason: `Unknown archetype id: ${selection.offense}` };
    if (s.def.kind === 'gold' || s.def.side !== 'offense') return { ok: false, reason: `${s.def.name} is not an offensive plan.` };
    if (s.tier === 'none') return { ok: false, reason: `${s.def.name} is not Online.` };
  }
  if (selection.defense) {
    const s = byId.get(selection.defense);
    if (!s) return { ok: false, reason: `Unknown archetype id: ${selection.defense}` };
    if (s.def.kind === 'gold' || s.def.side !== 'defense') return { ok: false, reason: `${s.def.name} is not a defensive plan.` };
    if (s.tier === 'none') return { ok: false, reason: `${s.def.name} is not Online.` };
  }
  return { ok: true };
}

// ── Modifier application ─────────────────────────────────────────────────────

function emptyGameModifiers(): GameModifiers {
  return {
    rimShareBonus: 0, midShareBonus: 0, perShareBonus: 0,
    rimEffBonus: 0, midEffBonus: 0, perEffBonus: 0,
    possessionSwing: 0, and1Bonus: 0, description: [],
  };
}

/** Online = 70% of Dedicated (ARCHETYPE_ONLINE_SCALE), rounded to legible precision. */
function scaleValue(v: number | undefined, tier: ArchetypeTier, kind: 'share' | 'eff' | 'poss' | 'and1'): number {
  if (!v || tier === 'none') return 0;
  if (tier === 'dedicated') return v;
  const scaled = v * ARCHETYPE_ONLINE_SCALE;
  if (kind === 'poss') {
    let rounded = Math.round(scaled);
    if (rounded === 0 && Math.abs(v) >= 1) rounded = Math.sign(v); // min 1 if dedicated has >= 1
    return rounded;
  }
  const step = 0.005; // 0.5 percentage point
  return Math.round(scaled / step) * step;
}

function clamp(v: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, v));
}

/**
 * Apply the selected archetype(s)' Online/Dedicated effect to a fresh pair of
 * offense/defense GameModifiers, then clamp the COMBINED result to IDENTITY_CAPS
 * (plan §2 "Effect caps" — applied after selections are combined, not per-archetype).
 */
export function archetypeModifiers(
  statuses: ArchetypeStatus[],
  selection: ArchetypeSelection,
): { offense: GameModifiers; defense: GameModifiers; possessionSwing: number; active: { def: ArchetypeDef; tier: ArchetypeTier }[] } {
  const byId = new Map(statuses.map(s => [s.def.id, s]));
  const offense = emptyGameModifiers();
  const defense = emptyGameModifiers();
  let possessionSwing = 0;
  const active: { def: ArchetypeDef; tier: ArchetypeTier }[] = [];

  const apply = (id: string | undefined) => {
    if (!id) return;
    const s = byId.get(id);
    if (!s || s.tier === 'none') return;
    const eff = s.def.dedicated;
    const tier = s.tier;

    offense.rimShareBonus += scaleValue(eff.ownShare?.rim, tier, 'share');
    offense.midShareBonus += scaleValue(eff.ownShare?.mid, tier, 'share');
    offense.perShareBonus += scaleValue(eff.ownShare?.three, tier, 'share');
    offense.rimEffBonus += scaleValue(eff.ownEff?.rim, tier, 'eff');
    offense.midEffBonus += scaleValue(eff.ownEff?.mid, tier, 'eff');
    offense.perEffBonus += scaleValue(eff.ownEff?.three, tier, 'eff');
    offense.and1Bonus += scaleValue(eff.and1, tier, 'and1');

    defense.rimShareBonus += scaleValue(eff.oppShare?.rim, tier, 'share');
    defense.midShareBonus += scaleValue(eff.oppShare?.mid, tier, 'share');
    defense.perShareBonus += scaleValue(eff.oppShare?.three, tier, 'share');
    defense.rimEffBonus += scaleValue(eff.oppEff?.rim, tier, 'eff');
    defense.midEffBonus += scaleValue(eff.oppEff?.mid, tier, 'eff');
    defense.perEffBonus += scaleValue(eff.oppEff?.three, tier, 'eff');

    possessionSwing += scaleValue(eff.possessions, tier, 'poss');
    active.push({ def: s.def, tier });
  };

  if (selection.gold) {
    apply(selection.gold);
  } else {
    apply(selection.offense);
    apply(selection.defense);
  }

  offense.rimShareBonus = clamp(offense.rimShareBonus, IDENTITY_CAPS.share);
  offense.midShareBonus = clamp(offense.midShareBonus, IDENTITY_CAPS.share);
  offense.perShareBonus = clamp(offense.perShareBonus, IDENTITY_CAPS.share);
  offense.rimEffBonus = clamp(offense.rimEffBonus, IDENTITY_CAPS.eff);
  offense.midEffBonus = clamp(offense.midEffBonus, IDENTITY_CAPS.eff);
  offense.perEffBonus = clamp(offense.perEffBonus, IDENTITY_CAPS.eff);
  offense.and1Bonus = clamp(offense.and1Bonus, IDENTITY_CAPS.and1);

  defense.rimShareBonus = clamp(defense.rimShareBonus, IDENTITY_CAPS.share);
  defense.midShareBonus = clamp(defense.midShareBonus, IDENTITY_CAPS.share);
  defense.perShareBonus = clamp(defense.perShareBonus, IDENTITY_CAPS.share);
  defense.rimEffBonus = clamp(defense.rimEffBonus, IDENTITY_CAPS.eff);
  defense.midEffBonus = clamp(defense.midEffBonus, IDENTITY_CAPS.eff);
  defense.perEffBonus = clamp(defense.perEffBonus, IDENTITY_CAPS.eff);

  possessionSwing = clamp(possessionSwing, IDENTITY_CAPS.possessions);

  return { offense, defense, possessionSwing, active };
}

// ── Bot helper ────────────────────────────────────────────────────────────────

const TIER_RANK: Record<ArchetypeTier, number> = { dedicated: 2, online: 1, none: 0 };

function bestOfSide(statuses: ArchetypeStatus[], side: ArchetypeSide): string | undefined {
  const candidates = statuses.filter(s => s.def.side === side && s.tier !== 'none');
  candidates.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.progress - a.progress);
  return candidates[0]?.def.id;
}

/**
 * Greedy pick for bots: the highest-tier eligible Gold plan if any (ties broken by
 * progress), else the best eligible offense plan + best eligible defense plan
 * (each independently, by tier then progress).
 */
export function bestSelection(statuses: ArchetypeStatus[]): ArchetypeSelection {
  const eligibleGold = statuses.filter(s => s.def.kind === 'gold' && s.tier !== 'none');
  eligibleGold.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.progress - a.progress);
  if (eligibleGold.length > 0) {
    return { gold: eligibleGold[0].def.id };
  }
  const offense = bestOfSide(statuses, 'offense');
  const defense = bestOfSide(statuses, 'defense');
  const selection: ArchetypeSelection = {};
  if (offense) selection.offense = offense;
  if (defense) selection.defense = defense;
  return selection;
}
