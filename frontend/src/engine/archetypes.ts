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
import { positionParts } from './positions';

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
  /**
   * card_balance T3 (2026-09-17, owner-approved): an alternate gold gate for identities
   * that aren't about any single player, but the whole active roster's SUM of some
   * per-player score (built for Positionless's "sum of multipositional levels"
   * requirement). Mutually exclusive with keystones in practice, though nothing stops a
   * plan from using both.
   */
  rosterGate?: { onlineThreshold: number; dedicatedThreshold: number; score: (p: PlayerCardData) => number; label: string };
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
 * Thresholds (tuned 2026-09-13 with `npm run feasibility`). Owner's target: a roster
 * unlocks at most 3-4 plans. With these values a colour-chasing drafter reaches a mono
 * identity Online in 43-71% of drafts (Dedicated 19-34%), PER-drafting bots 7-16%, and
 * rosters unlock ~1.5 plans on average; `shortlistArchetypes` caps what is offered at
 * MAX_UNLOCKED_ARCHETYPES for the rare stacked roster. The two defensive colours carry
 * ~3x fewer badges and get a looser override.
 */
export const MONO_THRESHOLDS: ArchetypeThresholds = {
  online: { carriers: 4, points: 8, starters: 2 },
  dedicated: { carriers: 5, points: 10, starters: 3 },
};
/** Per-colour overrides for rarer badges (see note above). */
export const MONO_THRESHOLDS_BY_COLOR: Partial<Record<Color, ArchetypeThresholds>> = {
  'Lockdown Defender': { online: { carriers: 3, points: 6, starters: 1 }, dedicated: { carriers: 4, points: 8, starters: 2 } },
  'Paint Protector': { online: { carriers: 3, points: 6, starters: 1 }, dedicated: { carriers: 4, points: 8, starters: 2 } },
};
export function monoThresholdsFor(color: Color): ArchetypeThresholds {
  return MONO_THRESHOLDS_BY_COLOR[color] ?? MONO_THRESHOLDS;
}
/** Two-colour and gold plans are meant to be rarer than mono plans. */
export const TWO_COLOR_THRESHOLDS = {
  online: { primary: { carriers: 4, points: 8 }, support: { carriers: 2, points: 4 }, distinct: 5, primaryStarters: 2 },
  dedicated: { primary: { carriers: 5, points: 10 }, support: { carriers: 3, points: 6 }, distinct: 6, primaryStarters: 3 },
};
export const GOLD_THRESHOLDS = {
  online: { primary: { carriers: 4, points: 8 }, secondary: { carriers: 2, points: 4 }, tertiary: { carriers: 2, points: 3 }, distinct: 6, relevantStarters: 3 },
  dedicated: { primary: { carriers: 5, points: 10 }, secondary: { carriers: 3, points: 6 }, tertiary: { carriers: 2, points: 5 }, distinct: 7, relevantStarters: 4 },
};

/** At most this many plans are ever offered to a roster (product rule: 3-4 unlocked max). */
export const MAX_UNLOCKED_ARCHETYPES = 4;

/** Strength of an unlocked plan for ranking: tier first, then how far the primary colour's points exceed the Online requirement. */
function planStrength(s: ArchetypeStatus): number {
  const tierScore = s.tier === 'dedicated' ? 1000 : s.tier === 'online' ? 500 : 0;
  const primary = s.tally[s.def.colors.primary];
  const points = primary?.points ?? 0;
  const carriers = primary?.carriers ?? 0;
  return tierScore + points * 3 + carriers;
}

/**
 * The plans a roster is offered: unlocked plans only, ranked by strength, capped at
 * MAX_UNLOCKED_ARCHETYPES, but the best plan of each lane (offense, defense, gold) is
 * kept first so a lane is never empty when the roster unlocked something for it.
 */
export function shortlistArchetypes(statuses: ArchetypeStatus[], max: number = MAX_UNLOCKED_ARCHETYPES): ArchetypeStatus[] {
  const unlocked = statuses.filter(s => s.tier !== 'none').sort((a, b) => planStrength(b) - planStrength(a));
  const laneOf = (s: ArchetypeStatus) => (s.def.kind === 'gold' ? 'gold' : s.def.side === 'defense' ? 'defense' : 'offense');
  const picked: ArchetypeStatus[] = [];
  for (const lane of ['offense', 'defense', 'gold'] as const) {
    const best = unlocked.find(s => laneOf(s) === lane);
    if (best) picked.push(best);
  }
  for (const s of unlocked) {
    if (picked.length >= max) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.slice(0, max);
}

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

/**
 * card_balance T3 (2026-09-17, owner-approved): keystones are combo conditions over two
 * SKILL BADGE levels, not their own traits — never shown as a card icon, never pushed
 * onto `traits`, unlike the mono colours. Checked directly against badge levels so they
 * always track the current BADGE_THRESHOLDS retune with no separate raw-stat formula to
 * keep in sync. Two-Way Disruptor deliberately requires L2+L2 (not the default L1+L1 the
 * other three use) — perimeter and post defense correlate enough that L1+L1 overshoots
 * every single-skill L3 count; L2+L2 brings it back in line ("upping level requirements",
 * owner's rule for scaling an overly common combo).
 */
function hasBadgeLevel(p: PlayerCardData, badge: string, level: number): boolean {
  return (p.traits ?? []).some(t => t.name === badge && t.level >= level);
}

export const KEYSTONE_CONDITIONS: Record<string, (p: PlayerCardData) => boolean> = {
  'Two-Way Disruptor': p => hasBadgeLevel(p, 'Lockdown Defender', 2) && hasBadgeLevel(p, 'Paint Protector', 2),
  'Point Forward': p => hasBadgeLevel(p, 'Floor General', 1) && hasBadgeLevel(p, 'Glass Cleaner', 1),
  '3-and-D': p => hasBadgeLevel(p, 'Sharpshooter', 1) && hasBadgeLevel(p, 'Lockdown Defender', 1),
  'Stretch-5': p => hasBadgeLevel(p, 'Sharpshooter', 1) && hasBadgeLevel(p, 'Paint Protector', 1),
};

/**
 * card_balance T3 (2026-09-17, owner-approved) / D10 follow-up (2026-09-19, concept-only
 * — see card_balance_thresholds for the real number re-tune against this): per-player
 * score for the Positionless gold plan's roster gate. The Positionless trait (a
 * genuinely versatile, hand-rolled name — see balance.ts POSITIONLESS_PLAYERS) counts 3
 * outright, a ceiling nothing stats-driven can exceed. Everyone else scores on real
 * eligibility width now that bref bio pages make genuine 3-5-way combos common (D10):
 * a 2-way crossover ('SG/SF', 'PF/C') still counts 1 exactly as it always has, and each
 * additional eligible column adds 1 more, capped at 3 — a stats-driven 4-5-way player
 * reads as versatile as the curated Positionless list, never above it. Classification
 * via the trait check, additive via position width — a Positionless holder never also
 * stacks their own crossover width on top of the flat 3.
 * Concept locked; onlineThreshold/dedicatedThreshold (6/9, ARCHETYPES below) are NOT
 * retuned here — more cards now score >0 and existing scores can score higher, both
 * make Positionless Revolution easier to reach, and that needs a real balance pass
 * (`npm run feasibility`), not a guess bundled into this commit.
 */
export function multipositionalLevel(p: PlayerCardData): number {
  if ((p.traits ?? []).some(t => t.name === 'Positionless')) return 3;
  const parts = positionParts(p.player.position).length;
  return Math.min(3, Math.max(0, parts - 1));
}

/** True when any active player satisfies one of a gold plan's keystone combo conditions. */
function hasKeystone(activePlayers: PlayerCardData[], keystones: string[] | undefined): boolean {
  if (!keystones || keystones.length === 0) return true;
  return activePlayers.some(p => keystones.some(k => KEYSTONE_CONDITIONS[k]?.(p)));
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
    // card_balance T3 (2026-09-17): now keyed on the '3-and-D' combo condition
    // (Sharpshooter + Lockdown Defender), an exact name and colour match — was
    // Two-Way Disruptor (Lockdown + Paint Protector), which shares only one colour here.
    keystones: ['3-and-D'],
    dedicated: {
      ownShare: { mid: -0.05, three: 0.05 }, ownEff: { three: 0.02 },
      oppShare: { three: -0.05, rim: 0.02, mid: 0.03 }, oppEff: { three: -0.04 },
    },
    description: 'Own Mid -5%, 3PT +5%; own 3PT efficiency +2%. Opponent 3PT -5%, Rim +2%, Mid +3%; opponent 3PT efficiency -4%',
  },
  {
    id: 'switchblade-pressure', name: 'Switchblade Pressure', kind: 'gold', side: 'both',
    colors: { primary: 'Lockdown Defender', support: 'Floor General', tertiary: 'Finisher' },
    // card_balance T3 (2026-09-17): Playmaking Maestro no longer exists as a trait
    // (folded into the combo-condition system); no combo condition matches this plan's
    // actual colour set (Lockdown/Floor General/Finisher) cleanly, so this keeps its
    // other keystone, Two-Way Disruptor, as the sole option. Flagged in the plays/
    // synergies review — may want a dedicated combo condition of its own.
    keystones: ['Two-Way Disruptor'],
    dedicated: {
      possessions: 4, ownShare: { rim: 0.05, mid: -0.03, three: -0.02 },
      oppEff: { three: -0.03, rim: -0.02 },
    },
    description: '+4 possessions; Rim +5%, Mid -3%, 3PT -2%; opponent 3PT efficiency -3%, opponent Rim efficiency -2%',
  },
  {
    id: 'five-out-fortress', name: 'Five-Out Fortress', kind: 'gold', side: 'both',
    colors: { primary: 'Sharpshooter', support: 'Glass Cleaner', tertiary: 'Paint Protector' },
    // card_balance T3 (2026-09-17): Sniper no longer exists as a trait; replaced with
    // 'Stretch-5' (Sharpshooter + Paint Protector), which matches 2 of this plan's 3
    // colours directly. Two-Way Disruptor kept as the second path (unchanged).
    keystones: ['Stretch-5', 'Two-Way Disruptor'],
    dedicated: {
      ownShare: { rim: -0.03, mid: -0.07, three: 0.10 }, ownEff: { three: 0.02 },
      oppShare: { rim: -0.05, mid: 0.02, three: 0.03 }, oppEff: { rim: -0.03 },
    },
    description: 'Own Rim -3%, Mid -7%, 3PT +10%; own 3PT efficiency +2%. Opponent Rim -5%, Mid +2%, 3PT +3%; opponent Rim efficiency -3%',
  },
  {
    // card_balance T3 (2026-09-17, owner-approved): not gated by a single keystone
    // player — Positionless has only 3 pool-wide holders (LeBron, Giannis, Barnes), so a
    // single-player gate would make this nearly unreachable most seasons. Instead a
    // roster-wide gate: sum(multipositionalLevel) across the active 12 >= threshold.
    // Colours (Floor General/Glass Cleaner/Finisher) mirror the Point Forward archetype's
    // skill spread deliberately, so building toward that identity's colours also builds
    // toward this one — "somewhat supported, doesn't need many cards" per the owner.
    id: 'positionless-revolution', name: 'Positionless Revolution', kind: 'gold', side: 'both',
    colors: { primary: 'Floor General', support: 'Glass Cleaner', tertiary: 'Finisher' },
    rosterGate: { onlineThreshold: 6, dedicatedThreshold: 9, score: multipositionalLevel, label: 'Multipositional levels' },
    dedicated: {
      ownEff: { rim: 0.02, mid: 0.02, three: 0.02 },
      oppEff: { rim: -0.02, mid: -0.02, three: -0.02 },
      possessions: 2,
    },
    description: 'Own efficiency +2% at rim, mid, 3PT. Opponent efficiency -2% at rim, mid, 3PT (no position to scheme against). +2 possessions',
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
  const gateSum = def.rosterGate ? activePlayers.reduce((s, p) => s + def.rosterGate!.score(p), 0) : 0;
  const on = GOLD_THRESHOLDS.online;
  const ded = GOLD_THRESHOLDS.dedicated;

  const meets = (th: typeof on, gateThreshold: number) =>
    pt.carriers >= th.primary.carriers && pt.points >= th.primary.points &&
    st.carriers >= th.secondary.carriers && st.points >= th.secondary.points &&
    tt.carriers >= th.tertiary.carriers && tt.points >= th.tertiary.points &&
    distinct >= th.distinct && relevantStarters >= th.relevantStarters && keystoneOk &&
    (!def.rosterGate || gateSum >= gateThreshold);

  const tier: ArchetypeTier = meets(ded, def.rosterGate?.dedicatedThreshold ?? 0) ? 'dedicated'
    : meets(on, def.rosterGate?.onlineThreshold ?? 0) ? 'online' : 'none';
  const next = tier === 'none' ? on : tier === 'online' ? ded : null;
  const nextGateThreshold = tier === 'none' ? def.rosterGate?.onlineThreshold : def.rosterGate?.dedicatedThreshold;
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
      def.rosterGate && nextGateThreshold !== undefined ? fmtMissing(def.rosterGate.label, gateSum, nextGateThreshold, '') : null,
    ]) if (m) missing.push(m);
    if (!keystoneOk) missing.push(`Keystone trait needed: ${(def.keystones ?? []).join(' or ')}`);
  }
  const progress = Math.min(
    ratio(pt.carriers, on.primary.carriers), ratio(pt.points, on.primary.points),
    ratio(st.carriers, on.secondary.carriers), ratio(st.points, on.secondary.points),
    ratio(tt.carriers, on.tertiary.carriers), ratio(tt.points, on.tertiary.points),
    ratio(distinct, on.distinct), ratio(relevantStarters, on.relevantStarters),
    def.rosterGate ? ratio(gateSum, def.rosterGate.onlineThreshold) : 1,
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
export function bestSelection(allStatuses: ArchetypeStatus[]): ArchetypeSelection {
  // Bots and humans choose from the same shortlist (MAX_UNLOCKED_ARCHETYPES).
  const statuses = shortlistArchetypes(allStatuses);
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
