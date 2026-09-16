/**
 * Synergy & Play Bonus System (v3 — Archetypes + assigned-player Plays)
 *
 * docs/plan_plays_and_synergies_2026-09-13.md replaced the old "sum every badge across
 * the 12-man roster, check ad-hoc thresholds" synergy system with two decoupled pieces:
 *
 *   1. Archetypes (archetypes.ts) — persistent roster identities the user selects at
 *      roster lock (Offense/Defense Philosophy slots, or one Gold plan spanning both).
 *      `calcTeamBonuses` below applies ONLY the selected archetype(s)' effect.
 *   2. Plays (playbook.ts) — assigned-player tactical packages resolved per possession
 *      by game.ts. They no longer feed team-wide bonuses through this file.
 *
 * Chemistry synergies (Brotherhood, Veteran Core, Young Guns) are removed; there are no
 * mastery tiers. `SYNERGIES` below is now a read-only display view over `ARCHETYPES`,
 * kept only because the KPI-band popover UI still renders it.
 *
 * `evaluatePlay`/`getPlayRequirements`/`getPlayEffectId`/`PLAY_EFFECTS` are UNCHANGED and
 * still describe a play card's badge requirements for the play-card UI affordances
 * (PlayerCard.tsx, DraftRoom.tsx) — they are no longer read by `calcTeamBonuses`.
 *
 * Bonuses target channel-specific modifiers:
 *   - Shot distribution: rimShareBonus, midShareBonus, perShareBonus
 *   - Shot efficiency: rimEffBonus, midEffBonus, perEffBonus
 *   - Possession: possessionSwing
 *   - And-1: and1Bonus
 */

import { PlayerCardData, Play } from './types';
import { ARCHETYPES, evaluateArchetypes, archetypeModifiers, type ArchetypeKind, type ArchetypeSelection } from './archetypes';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Channel-based modifiers applied to game scoring.
 *
 * SIGN CONVENTION (P0-1): a `GameModifiers` value is always added directly to the
 * offense it targets — never subtracted. `TeamBonuses.offenseMods` is added to THIS
 * team's own offense; `TeamBonuses.defenseMods` is added to the OPPONENT's offense.
 * So a defensive bonus that should hurt the opponent (e.g. Lockdown Defender reducing
 * opponent rim efficiency) must be stored as a NEGATIVE share/efficiency delta —
 * gameEngine.ts's calcTeamShotProfile and resolvePossession both do
 * `offenseMods.xBonus + defenseFromOpponent.xBonus`, never a subtraction. Getting the
 * sign backwards here (positive instead of negative) turns "reduce opponent" into
 * "buff opponent", which was the P0-1 bug.
 */
export interface GameModifiers {
  // Shot distribution shifts (additive to team shot profile)
  rimShareBonus: number;    // Shift rim attempt share (e.g., +0.03 = +3%)
  midShareBonus: number;    // Shift mid-range attempt share
  perShareBonus: number;    // Shift perimeter/3pt attempt share
  // Efficiency shifts (additive to base efficiency per channel)
  rimEffBonus: number;      // e.g., +0.02 = +2% rim FG
  midEffBonus: number;      // e.g., +0.02 = +2% mid FG
  perEffBonus: number;      // e.g., +0.02 = +2% 3pt FG
  // Other
  possessionSwing: number;  // Extra possessions won/lost. Only ever read from the
                             // top-level TeamBonuses.possessionSwing (own team's gain,
                             // see P0-3 comment on calcTeamBonuses below) — the
                             // possessionSwing field on offenseMods/defenseMods
                             // themselves is not read by calcPossessionSplit.
  and1Bonus: number;        // Additive and-1 chance (all channels)
  description: string[];    // Narrative descriptions of active bonuses
}

export function emptyModifiers(): GameModifiers {
  return {
    rimShareBonus: 0, midShareBonus: 0, perShareBonus: 0,
    rimEffBonus: 0, midEffBonus: 0, perEffBonus: 0,
    possessionSwing: 0, and1Bonus: 0, description: [],
  };
}

// ── Badge Counting ─────────────────────────────────────────────────────────

export interface BadgeTotals {
  [badgeName: string]: number;  // Total levels across the 12-man roster
}

/** Sum all badge levels across the full roster (not weighted by playing time) */
export function countBadges(players: PlayerCardData[]): BadgeTotals {
  const totals: BadgeTotals = {};
  for (const p of players) {
    for (const t of p.traits || []) {
      totals[t.name] = (totals[t.name] || 0) + t.level;
    }
  }
  return totals;
}

// ── Synergy display view (UI compatibility) ─────────────────────────────────

/**
 * The KPI-band popover (TopKPIBand.tsx) renders `SYNERGIES` as a flat list of
 * `{ id, name, category, description }`. Archetypes replaced the old ad-hoc synergy
 * checks, so this is now a read-only derived view over `ARCHETYPES` — `category` carries
 * the archetype's `kind` ('mono' | 'two' | 'gold') where the UI previously showed
 * 'stacking' | 'combo' | 'chemistry'.
 */
export interface SynergyDisplay {
  id: string;
  name: string;
  category: ArchetypeKind;
  description: string;
}

export const SYNERGIES: SynergyDisplay[] = ARCHETYPES.map(a => ({
  id: a.id,
  name: a.name,
  category: a.kind,
  description: a.description,
}));

// ── Play Activation ────────────────────────────────────────────────────────

export interface PlayRequirement {
  badge: string;
  levels: number;
}

interface PlayEffect {
  /** Display name — must match the play card's name in the plays DB. */
  name: string;
  /** One-line effect text for UI (full activation). */
  summary: string;
  /** Defensive plays apply their efficiency deltas to the OPPONENT's offense. */
  defensive?: boolean;
  requirements: PlayRequirement[];
  fullBonus: GameModifiers;
  halfBonus: GameModifiers;
}

/** Per-requirement result of evaluating a play against a roster's badge totals. */
export interface PlayRequirementStatus extends PlayRequirement {
  /** Badge levels the roster currently has. */
  have: number;
  met: boolean;
}

export interface PlayEvaluation {
  effectId: string;
  name: string;
  summary: string;
  defensive: boolean;
  requirements: PlayRequirementStatus[];
  metCount: number;
  total: number;
  activation: 'full' | 'partial' | 'none';
}

/**
 * Play effects keyed by play ID.
 * Full bonus if all requirements met, half bonus if ≥50% met, nothing if <50%.
 */
const PLAY_EFFECTS: Record<string, PlayEffect> = {
  'play-sys-1': {
    name: 'Triangle Offense',
    summary: '+3% rim / +4% mid share, +2% rim / +3% mid eff',
    requirements: [{ badge: 'Finisher', levels: 2 }, { badge: 'Mid-Range Maestro', levels: 2 }],
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.03, midShareBonus: 0.04, rimEffBonus: 0.02, midEffBonus: 0.03, description: ['▲ Triangle Offense (+3% rim/+4% mid share, +2/+3% eff)'] },
    halfBonus: { ...emptyModifiers(), midShareBonus: 0.02, midEffBonus: 0.01, description: ['▲ Triangle Offense (partial, +2% mid share, +1% eff)'] },
  },
  'play-sys-2': {
    name: '7 Seconds or Less',
    summary: '+5% 3pt share, +2% 3pt eff, +1 possession',
    requirements: [{ badge: 'Sharpshooter', levels: 3 }, { badge: 'Floor General', levels: 1 }],
    fullBonus: { ...emptyModifiers(), perShareBonus: 0.05, perEffBonus: 0.02, possessionSwing: 1, description: ['⚡ 7SOL (+5% 3pt share, +2% 3pt eff, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), perShareBonus: 0.02, perEffBonus: 0.01, description: ['⚡ 7SOL (partial, +2% 3pt share, +1% eff)'] },
  },
  'play-sys-3': {
    name: 'Grit and Grind',
    summary: '-3% opp rim eff, -2% opp mid eff, +1 possession',
    defensive: true,
    requirements: [{ badge: 'Lockdown Defender', levels: 2 }, { badge: 'Glass Cleaner', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimEffBonus: -0.03, midEffBonus: -0.02, possessionSwing: 1, description: ['🛡️ Grit and Grind (-3% opp rim eff, -2% opp mid eff, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), rimEffBonus: -0.01, description: ['🛡️ Grit and Grind (partial, -1% opp rim eff)'] },
  },
  'play-sys-4': {
    name: 'Motion Offense',
    summary: '+1% rim / +2% mid / +2% 3pt eff, +1 possession',
    requirements: [{ badge: 'Floor General', levels: 2 }],
    fullBonus: { ...emptyModifiers(), rimEffBonus: 0.01, midEffBonus: 0.02, perEffBonus: 0.02, possessionSwing: 1, description: ['🔄 Motion Offense (+1/+2/+2% eff, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), midEffBonus: 0.01, perEffBonus: 0.01, description: ['🔄 Motion Offense (partial, +1% mid/3pt eff)'] },
  },
  'play-std-1': {
    name: 'High Pick & Roll',
    summary: '+3% rim share, +2% rim eff, +2% and-1',
    requirements: [{ badge: 'Floor General', levels: 1 }, { badge: 'Finisher', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.03, rimEffBonus: 0.02, and1Bonus: 0.02, description: ['🏀 High PnR (+3% rim share, +2% rim eff, +2% and-1)'] },
    halfBonus: { ...emptyModifiers(), rimShareBonus: 0.01, description: ['🏀 High PnR (partial, +1% rim share)'] },
  },
  // Box-and-One: a defensive scheme that takes away the opponent's best shooter.
  'play-std-2': {
    name: 'Box-and-One',
    summary: '-3% opp 3pt eff, -1% opp mid eff',
    defensive: true,
    requirements: [{ badge: 'Lockdown Defender', levels: 1 }],
    fullBonus: { ...emptyModifiers(), perEffBonus: -0.03, midEffBonus: -0.01, description: ['🛡️ Box-and-One (-3% opp 3pt eff, -1% opp mid eff)'] },
    halfBonus: { ...emptyModifiers(), perEffBonus: -0.01, description: ['🛡️ Box-and-One (partial, -1% opp 3pt eff)'] },
  },
  // Horns: a half-court set built around two bigs at the elbows.
  'play-std-3': {
    name: 'Horns',
    summary: '+2% rim / +2% mid share, +1% rim / +2% mid eff',
    requirements: [{ badge: 'Finisher', levels: 1 }, { badge: 'Glass Cleaner', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.02, midShareBonus: 0.02, rimEffBonus: 0.01, midEffBonus: 0.02, description: ['🐂 Horns (+2% rim/mid share, +1/+2% eff)'] },
    halfBonus: { ...emptyModifiers(), midShareBonus: 0.01, description: ['🐂 Horns (partial, +1% mid share)'] },
  },
  // Full Court Press: forces turnovers (extra possessions) at a small efficiency cost to the opponent.
  'play-std-4': {
    name: 'Full Court Press',
    summary: '+2 possessions, -1% opp rim eff',
    defensive: true,
    requirements: [{ badge: 'Lockdown Defender', levels: 1 }],
    fullBonus: { ...emptyModifiers(), possessionSwing: 2, rimEffBonus: -0.01, description: ['🏃 Full Court Press (+2 poss, -1% opp rim eff)'] },
    halfBonus: { ...emptyModifiers(), possessionSwing: 1, description: ['🏃 Full Court Press (partial, +1 poss)'] },
  },
  // Four Out One In: spacing — four shooters around one big.
  'play-std-5': {
    name: 'Four Out One In',
    summary: '+5% 3pt share, +2% 3pt eff, -2% rim share',
    requirements: [{ badge: 'Sharpshooter', levels: 2 }, { badge: 'Glass Cleaner', levels: 1 }],
    fullBonus: { ...emptyModifiers(), perShareBonus: 0.05, perEffBonus: 0.02, rimShareBonus: -0.02, description: ['☄️ Four Out One In (+5% 3pt share, +2% 3pt eff, -2% rim share)'] },
    halfBonus: { ...emptyModifiers(), perShareBonus: 0.02, description: ['☄️ Four Out One In (partial, +2% 3pt share)'] },
  },
  // Point Forward (card_balance T3, 2026-09-17): a playmaking big (Floor General AND
  // Glass Cleaner together — the same combo as the archetypes.ts keystone) kicks out to
  // two shooters. requirements is a flat list (this UI helper has no AND concept of its
  // own), but the real play role in playbook.ts does enforce the combo on one player.
  'play-std-6': {
    name: 'Point Forward',
    summary: '+10% 3pt share, +2% 3pt eff, +2% rim share, +1 possession',
    requirements: [{ badge: 'Floor General', levels: 1 }, { badge: 'Glass Cleaner', levels: 1 }, { badge: 'Sharpshooter', levels: 2 }],
    fullBonus: { ...emptyModifiers(), perShareBonus: 0.10, perEffBonus: 0.02, rimShareBonus: 0.02, possessionSwing: 1, description: ['\u{1F3C0} Point Forward (+10% 3pt share, +2% 3pt eff, +2% rim share, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), perShareBonus: 0.04, description: ['\u{1F3C0} Point Forward (partial, +4% 3pt share)'] },
  },
};

/** Stable effect id for a play card (draft packs suffix `id` with `_pack{N}` for React keys). */
export function getPlayEffectId(play: Pick<Play, 'id' | 'playId'>): string {
  return play.playId ?? play.id.replace(/_pack\d+$/, '');
}

/** The badge requirements of a play (empty for unknown ids). */
export function getPlayRequirements(playId: string): PlayRequirement[] {
  return PLAY_EFFECTS[playId]?.requirements.map(r => ({ ...r })) ?? [];
}

/**
 * Evaluate a play against a roster's badge totals: which requirements are met, by how
 * much, and the resulting activation.
 *
 * T6 code review (2026-09-14): this docstring used to claim it was also read by the
 * simulation (a `checkPlayActivation` that no longer exists anywhere in the codebase).
 * It isn't — per this file's top-of-file note, plays are resolved per-possession in
 * game.ts against the assigned-player playbook (playbook.ts), not through badge totals.
 * `evaluatePlay`/`PLAY_EFFECTS` are UI-only now: DeckBuilder's play-card badge-progress
 * display and PlayerCard's requirement icons (see call sites).
 */
export function evaluatePlay(play: Pick<Play, 'id' | 'playId' | 'name'>, badges: BadgeTotals): PlayEvaluation {
  const effectId = getPlayEffectId(play);
  const effect = PLAY_EFFECTS[effectId];
  if (!effect) {
    return { effectId, name: play.name, summary: '', defensive: false, requirements: [], metCount: 0, total: 0, activation: 'none' };
  }
  const requirements: PlayRequirementStatus[] = effect.requirements.map(r => {
    const have = badges[r.badge] || 0;
    return { ...r, have, met: have >= r.levels };
  });
  const metCount = requirements.filter(r => r.met).length;
  const total = requirements.length;
  const ratio = total > 0 ? metCount / total : 1;
  const activation: PlayEvaluation['activation'] = ratio >= 1 ? 'full' : ratio >= 0.5 ? 'partial' : 'none';
  return { effectId, name: effect.name, summary: effect.summary, defensive: !!effect.defensive, requirements, metCount, total, activation };
}

// ── Main: Compute All Bonuses ──────────────────────────────────────────────

export interface TeamBonuses {
  /** Modifiers ADDED to THIS team's own offense (calcTeamShotProfile/resolvePossession). */
  offenseMods: GameModifiers;
  /**
   * Modifiers ADDED to the OPPONENT's offense (defensive bonuses) — never subtracted.
   * A defensive effect that should hurt the opponent must be stored as a negative
   * share/efficiency delta here (see the GameModifiers sign-convention comment above).
   * `defenseMods.possessionSwing` is not read anywhere and is always 0 — possession
   * gains always flow through the top-level `possessionSwing` field below instead,
   * applied exactly once as the owning team's own gain.
   */
  defenseMods: GameModifiers;
  /** Extra possessions this team gains from its own selected archetype(s) (the single
   *  place possession swings are counted — see calcTeamBonuses and calcPossessionSplit). */
  possessionSwing: number;
  /** The active archetype(s) (Offense/Defense Philosophy, or one Gold plan), for display. */
  activeSynergies: { name: string; description: string }[];
  /** Plays are resolved per-possession in game.ts (docs/plan_plays_and_synergies_2026-09-13.md
   *  §4-7) — this is always empty from calcTeamBonuses; game.ts fills its own copy. */
  activePlays: { name: string; description: string; activated: 'full' | 'partial' | 'none' }[];
  /** Playstyle description */
  playstyle: string[];
}

/**
 * Calculate a team's archetype-derived bonuses.
 *
 * v3 (2026-09-13): `activePlays`/`possShares` are accepted for call-signature stability
 * (existing callers pass them) but are no longer read here — Plays are resolved
 * per-possession in game.ts against the assigned-player playbook (playbook.ts), not as a
 * roster-wide bonus. Only the caller-selected archetype(s) in `options.archetypes` are
 * applied. This is a TRANSITION STATE: until the roster-builder UI lets a user choose
 * Offense/Defense Philosophy (or a Gold plan), `options` is omitted by every caller and
 * this function returns empty modifiers — no archetype silently auto-activates.
 *
 * @param rosterPlayers - All active players (used to evaluate archetype tallies)
 * @param activePlays - Unused (kept for API stability; see above)
 * @param possShares - Unused (kept for API stability; see above)
 * @param options.starterIds - Depth-chart starters, used by archetype tier thresholds. Missing = no starters (tier is computed with starters=0, most plans land on 'none').
 * @param options.archetypes - The user's chosen Offense/Defense Philosophy (or Gold plan). Missing/empty = no archetype applies.
 */
export function calcTeamBonuses(
  rosterPlayers: PlayerCardData[],
  // Kept for API stability; plays are resolved per-possession in game.ts against playbook.ts now.
  activePlays: Play[],
  // Kept for API stability; not read (archetypes replace roster-wide play/synergy bonuses).
  possShares: Map<string, number>,
  options?: { starterIds?: Set<string>; archetypes?: ArchetypeSelection },
): TeamBonuses {
  const selection = options?.archetypes;
  const hasSelection = !!selection && (!!selection.offense || !!selection.defense || !!selection.gold);
  if (!hasSelection) {
    return {
      offenseMods: emptyModifiers(),
      defenseMods: emptyModifiers(),
      possessionSwing: 0,
      activeSynergies: [],
      activePlays: [],
      playstyle: [],
    };
  }

  const starterIds = options?.starterIds ?? new Set<string>();
  const statuses = evaluateArchetypes(rosterPlayers, starterIds, selection);
  const { offense, defense, possessionSwing, active } = archetypeModifiers(statuses, selection!);

  const activeSynergies = active.map(({ def, tier }) => ({
    name: def.name,
    description: `${tier === 'dedicated' ? 'Dedicated' : 'Online'} — ${def.description}`,
  }));

  return {
    offenseMods: offense,
    defenseMods: defense,
    possessionSwing,
    activeSynergies,
    activePlays: [],
    playstyle: [],
  };
}
