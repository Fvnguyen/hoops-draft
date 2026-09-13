/**
 * Playbook — assigned-player tactical plays (docs/plan_plays_and_synergies_2026-09-13.md §4-5,
 * reduced scope agreed 2026-09-13: no mastery tiers, fixed allocations, no chemistry).
 *
 * A play names ROLES with badge minimums. The user assigns active-roster players to the
 * roles. A play is ACTIVE when every role holds a distinct, eligible player; otherwise
 * it is inactive and does nothing. On the play's CALLED possessions the assigned players
 * are guaranteed on court (in their own depth-chart position) and favoured as the
 * scorer, and the play's modifiers apply to that possession only.
 *
 * Pure module: no React, no DOM, no storage.
 */

import type { PlayerCardData } from './types';
import { PLAY_BUDGET_DEFENSE, PLAY_BUDGET_OFFENSE } from './balance';

// ── Types ──────────────────────────────────────────────────────────────────

export type PlaySide = 'offense' | 'defense';

export interface PlayRole {
  id: string;
  name: string;
  /** Badge requirement: the player needs `badge` at >= `minLevel`, OR `altBadge` at >= `altMinLevel`. */
  badge?: string;
  minLevel?: number;
  altBadge?: string;
  altMinLevel?: number;
}

/** Deltas applied on the play's called possessions (offense) / covered possessions (defense). */
export interface PlayCallModifiers {
  /** Additive share shifts for the OWN offense (offense plays) — should sum to ~0. */
  rimShare?: number;
  midShare?: number;
  threeShare?: number;
  /** Additive efficiency deltas. Offense plays: own offense (positive helps). Defense plays: applied to the OPPONENT's offense (negative hurts them). */
  rimEff?: number;
  midEff?: number;
  threeEff?: number;
  /** Additive and-1 chance (offense plays). */
  and1?: number;
  /** Team-level possession swing per game while the play is active (not per call). */
  possessions?: number;
}

export interface PlayDef {
  playId: string;
  name: string;
  side: PlaySide;
  rarity: 'Basic' | 'Common' | 'Uncommon' | 'Rare' | 'Mythic';
  /** Share of team possessions (offense) or opponent possessions (defense) this play is called on. Fixed per card. */
  allocation: number;
  roles: PlayRole[];
  mods: PlayCallModifiers;
  summary: string;
}

/** What the user saved: which card, which play, who is in which role. */
export interface PlayAssignment {
  cardId: string;
  playId: string;
  /** roleId → playerId (active-roster player). Missing roles are unassigned. */
  roles: Record<string, string>;
}

export interface RoleStatus {
  role: PlayRole;
  playerId?: string;
  /** True when a player is assigned AND meets the requirement (and is in the active roster). */
  filled: boolean;
  /** Human-readable problem when not filled, e.g. "Needs Finisher 1+" / "Unassigned" / "Not in active roster". */
  reason?: string;
}

export interface PlayStatus {
  assignment: PlayAssignment;
  def: PlayDef;
  active: boolean;
  roles: RoleStatus[];
  /** Effective allocation: def.allocation when active, else 0. */
  allocation: number;
  /** Assigned, eligible player ids (empty when inactive). */
  playerIds: string[];
}

export interface PlaybookStatus {
  plays: PlayStatus[];
  offenseAllocation: number;
  defenseAllocation: number;
  offenseBudget: number;
  defenseBudget: number;
  overBudget: boolean;
}

// ── Catalog ────────────────────────────────────────────────────────────────

const R = (id: string, name: string, badge?: string, minLevel?: number, altBadge?: string, altMinLevel?: number): PlayRole =>
  ({ id, name, badge, minLevel, altBadge, altMinLevel });

/** Keyed by stable play id (the card's `playId`). Basic plays use 'basic-offense' / 'basic-defense'. */
export const PLAYBOOK: Record<string, PlayDef> = {
  'basic-offense': {
    playId: 'basic-offense', name: 'Basic Offense', side: 'offense', rarity: 'Basic', allocation: 0.06,
    roles: [R('featured', 'Featured player')],
    mods: {},
    summary: 'Featured player is guaranteed on court and favoured to score on 6% of possessions',
  },
  'basic-defense': {
    playId: 'basic-defense', name: 'Basic Defense', side: 'defense', rarity: 'Basic', allocation: 0.06,
    roles: [R('featured', 'Featured defender')],
    mods: {},
    summary: 'Featured defender is guaranteed on court on 6% of opponent possessions',
  },
  'play-std-3': {
    playId: 'play-std-3', name: 'Horns', side: 'offense', rarity: 'Common', allocation: 0.07,
    roles: [R('elbow', 'Elbow big', 'Glass Cleaner', 1, 'Mid-Range Maestro', 1), R('cutter', 'Cutter', 'Finisher', 1)],
    mods: { rimShare: 0.06, midShare: 0.08, threeShare: -0.14, rimEff: 0.01, midEff: 0.02 },
    summary: 'On calls: rim +6%, mid +8%, 3pt −14%; rim eff +1%, mid eff +2%',
  },
  'play-std-4': {
    playId: 'play-std-4', name: 'Full Court Press', side: 'defense', rarity: 'Common', allocation: 0.07,
    roles: [R('point', 'Point defender', 'Lockdown Defender', 1), R('helper', 'Back-line helper', 'Lockdown Defender', 1, 'Glass Cleaner', 1)],
    mods: { rimEff: -0.01, midEff: -0.01, possessions: 1 },
    summary: 'On coverage: opp rim/mid eff −1%; +1 possession per game',
  },
  'play-std-1': {
    playId: 'play-std-1', name: 'High Pick & Roll', side: 'offense', rarity: 'Uncommon', allocation: 0.09,
    roles: [R('handler', 'Handler', 'Floor General', 1), R('roller', 'Roller', 'Finisher', 1)],
    mods: { rimShare: 0.10, midShare: -0.04, threeShare: -0.06, rimEff: 0.02, and1: 0.02 },
    summary: 'On calls: rim +10%, mid −4%, 3pt −6%; rim eff +2%, and-1 +2%',
  },
  'play-std-2': {
    playId: 'play-std-2', name: 'Box-and-One', side: 'defense', rarity: 'Uncommon', allocation: 0.09,
    roles: [R('chaser', 'Chaser', 'Lockdown Defender', 2), R('helper', 'Helper', 'Lockdown Defender', 1, 'Paint Protector', 1)],
    mods: { threeEff: -0.03, midEff: -0.01 },
    summary: 'On coverage: opp 3pt eff −3%, mid eff −1%',
  },
  'play-sys-4': {
    playId: 'play-sys-4', name: 'Motion Offense', side: 'offense', rarity: 'Rare', allocation: 0.10,
    roles: [R('organizer', 'Lead organizer', 'Floor General', 2), R('connector', 'Connector', 'Floor General', 1, 'Mid-Range Maestro', 1), R('spacer', 'Spacer', 'Sharpshooter', 1)],
    mods: { rimShare: 0.04, midShare: 0.04, threeShare: -0.08, rimEff: 0.01, midEff: 0.01, threeEff: 0.01, possessions: 1 },
    summary: 'On calls: rim +4%, mid +4%, 3pt −8%; all eff +1%; +1 possession per game',
  },
  'play-sys-3': {
    playId: 'play-sys-3', name: 'Grit and Grind', side: 'defense', rarity: 'Rare', allocation: 0.10,
    roles: [R('stopper', 'Perimeter stopper', 'Lockdown Defender', 1), R('anchor', 'Anchor', 'Paint Protector', 1), R('rebounder', 'Rebounder', 'Glass Cleaner', 1)],
    mods: { rimEff: -0.03, midEff: -0.02, possessions: 1 },
    summary: 'On coverage: opp rim eff −3%, mid eff −2%; +1 possession per game',
  },
  'play-std-5': {
    playId: 'play-std-5', name: 'Four Out One In', side: 'offense', rarity: 'Rare', allocation: 0.10,
    roles: [R('shooter1', 'Shooter 1', 'Sharpshooter', 1), R('shooter2', 'Shooter 2', 'Sharpshooter', 1), R('anchor', 'Interior anchor', 'Glass Cleaner', 1)],
    mods: { rimShare: -0.04, midShare: -0.10, threeShare: 0.14, threeEff: 0.02, rimEff: 0.01 },
    summary: 'On calls: rim −4%, mid −10%, 3pt +14%; 3pt eff +2%, rim eff +1%',
  },
  'play-sys-1': {
    playId: 'play-sys-1', name: 'Triangle Offense', side: 'offense', rarity: 'Mythic', allocation: 0.12,
    roles: [R('initiator', 'Initiator', 'Floor General', 1), R('elbow', 'Elbow scorer', 'Mid-Range Maestro', 2), R('interior', 'Interior scorer', 'Finisher', 1)],
    mods: { rimShare: 0.08, midShare: 0.16, threeShare: -0.24, rimEff: 0.02, midEff: 0.03 },
    summary: 'On calls: rim +8%, mid +16%, 3pt −24%; rim eff +2%, mid eff +3%',
  },
  'play-sys-2': {
    playId: 'play-sys-2', name: '7 Seconds or Less', side: 'offense', rarity: 'Mythic', allocation: 0.12,
    roles: [R('passer', 'Advance passer', 'Floor General', 2), R('trail', 'Trail shooter', 'Sharpshooter', 1), R('lead', 'Lead shooter', 'Sharpshooter', 1)],
    mods: { rimShare: 0.04, midShare: -0.18, threeShare: 0.14, threeEff: 0.03, possessions: 1 },
    summary: 'On calls: rim +4%, mid −18%, 3pt +14%; 3pt eff +3%; +1 possession per game',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Stable playbook id for a card: `playId`, or derived from `id` (drops `_packN` and basic-play timestamps). */
export function getPlaybookId(card: { id: string; playId?: string }): string {
  if (card.playId) return card.playId;
  if (card.id.startsWith('basic-offense')) return 'basic-offense';
  if (card.id.startsWith('basic-defense')) return 'basic-defense';
  return card.id.replace(/_pack\d+$/, '');
}

export function getPlayDef(card: { id: string; playId?: string }): PlayDef | undefined {
  return PLAYBOOK[getPlaybookId(card)];
}

function badgeLevel(player: PlayerCardData, badge: string): number {
  return player.traits?.find(t => t.name === badge)?.level ?? 0;
}

/** Does this player satisfy the role's badge requirement? (Roles without a badge accept anyone.) */
export function isEligibleForRole(player: PlayerCardData, role: PlayRole): boolean {
  if (!role.badge) return true;
  if (badgeLevel(player, role.badge) >= (role.minLevel ?? 1)) return true;
  if (role.altBadge && badgeLevel(player, role.altBadge) >= (role.altMinLevel ?? 1)) return true;
  return false;
}

/** "Finisher 1+" / "Glass Cleaner 1+ or Mid-Range Maestro 1+" / "any player" */
export function describeRoleRequirement(role: PlayRole): string {
  if (!role.badge) return 'any player';
  const main = `${role.badge} ${role.minLevel ?? 1}+`;
  return role.altBadge ? `${main} or ${role.altBadge} ${role.altMinLevel ?? 1}+` : main;
}

/**
 * Evaluate one play assignment against the ACTIVE roster (the 12 players in the depth
 * chart). A role is filled only when its player exists in the active roster, is eligible,
 * and is not used twice within the same play.
 */
export function evaluatePlayAssignment(assignment: PlayAssignment, activePlayers: PlayerCardData[]): PlayStatus | null {
  const def = PLAYBOOK[assignment.playId];
  if (!def) return null;
  const byId = new Map(activePlayers.map(p => [p.id, p]));
  const used = new Set<string>();
  const roles: RoleStatus[] = def.roles.map(role => {
    const playerId = assignment.roles[role.id];
    if (!playerId) return { role, filled: false, reason: 'Unassigned' };
    const player = byId.get(playerId);
    if (!player) return { role, playerId, filled: false, reason: 'Not in active roster' };
    if (used.has(playerId)) return { role, playerId, filled: false, reason: 'Already holds another role in this play' };
    if (!isEligibleForRole(player, role)) return { role, playerId, filled: false, reason: `Needs ${describeRoleRequirement(role)}` };
    used.add(playerId);
    return { role, playerId, filled: true };
  });
  const active = roles.every(r => r.filled);
  return {
    assignment,
    def,
    active,
    roles,
    allocation: active ? def.allocation : 0,
    playerIds: active ? roles.map(r => r.playerId!) : [],
  };
}

/** Evaluate the whole playbook and the two allocation budgets. Unknown play ids are skipped. */
export function evaluatePlaybook(assignments: PlayAssignment[], activePlayers: PlayerCardData[]): PlaybookStatus {
  const plays = assignments
    .map(a => evaluatePlayAssignment(a, activePlayers))
    .filter((s): s is PlayStatus => s !== null);
  const offenseAllocation = plays.filter(p => p.def.side === 'offense').reduce((s, p) => s + p.allocation, 0);
  const defenseAllocation = plays.filter(p => p.def.side === 'defense').reduce((s, p) => s + p.allocation, 0);
  return {
    plays,
    offenseAllocation,
    defenseAllocation,
    offenseBudget: PLAY_BUDGET_OFFENSE,
    defenseBudget: PLAY_BUDGET_DEFENSE,
    overBudget: offenseAllocation > PLAY_BUDGET_OFFENSE + 1e-9 || defenseAllocation > PLAY_BUDGET_DEFENSE + 1e-9,
  };
}
