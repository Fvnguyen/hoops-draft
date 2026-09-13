/**
 * Bot Deck Builder
 *
 * Auto-builds a valid 12-man roster from a bot's drafted card pool. Draft
 * session persistence lives in `src/storage` (GameStore), not
 * here — the engine has no I/O.
 */

import { DraftCard, PlayerCardData, Play } from './types';
import { getPlaybookId, type PlayAssignment } from './playbook';
import type { ArchetypeSelection } from './archetypes';
import { BotProfile } from './draft';
import { TARGET_ROSTER } from './balance';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BuiltRoster {
  /** Shape version. 2 = playAssignments + archetypes (2026-09-13). Missing = 1. */
  version?: number;
  depthChart: Record<string, string[]>;   // Position -> ordered card IDs (index 0 = starter)
  activePlays: string[];                  // Up to 3 play card IDs (kept in sync with playAssignments' cardIds)
  /** Role assignments for the active plays (v2). One entry per active play card. */
  playAssignments?: PlayAssignment[];
  /** Chosen roster identity (v2). */
  archetypes?: ArchetypeSelection;
  gLeaguePlayers: string[];               // Bench player card IDs
  gLeaguePlays: string[];                 // Bench play card IDs
}

export const BUILT_ROSTER_VERSION = 2;

/**
 * Upgrade a roster saved before playbook/archetypes: every active play gets an
 * assignment with empty roles (so it is inactive until the user assigns players) and an
 * empty archetype selection. Returns the same object when already current.
 */
export function normalizeBuiltRoster(roster: BuiltRoster, cards: DraftCard[] = []): BuiltRoster {
  if (roster.version === BUILT_ROSTER_VERSION && roster.playAssignments && roster.archetypes) return roster;
  const byId = new Map(cards.map(c => [c.id, c]));
  const existing = new Map((roster.playAssignments ?? []).map(a => [a.cardId, a]));
  const playAssignments: PlayAssignment[] = (roster.activePlays ?? []).map(cardId => {
    const prev = existing.get(cardId);
    if (prev) return prev;
    const card = byId.get(cardId);
    const playId = card && card.type === 'Play' ? getPlaybookId(card) : getPlaybookId({ id: cardId });
    return { cardId, playId, roles: {} };
  });
  return { ...roster, version: BUILT_ROSTER_VERSION, playAssignments, archetypes: roster.archetypes ?? {} };
}

/** A single pick record for draft replay / analytics */
export interface DraftPickRecord {
  packNumber: number;           // 1-3
  pickNumber: number;           // 1-12 within the pack
  overallPick: number;          // 1-36 across all packs
  seatId: string;               // 'human-0' or 'bot-1' through 'bot-7'
  packContents: string[];       // Card IDs visible to this seat BEFORE picking
  pickedCardId: string;         // The card ID that was picked
  zone?: 'Roster' | 'GLeague'; // Only for human picks
}

export interface DraftSessionSeat {
  id: string;
  isBot: boolean;
  botProfile?: BotProfile;
  drafted: DraftCard[];       // All cards drafted (players + plays)
  builtRoster: BuiltRoster;   // Auto-built (bots) or human-built lineup
}

export interface DraftSession {
  id: string;
  timestamp: string;
  seats: DraftSessionSeat[];  // seats[0] = human, seats[1..7] = bots
  pickLog: DraftPickRecord[]; // Full pick-by-pick history for replay/analytics
  seed?: number;              // The cube-pool seed this draft was generated from
}

// ── Position Eligibility (mirrors DeckBuilder logic) ───────────────────────

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function getEligiblePositions(rawPos: string): string[] {
  const eligible: string[] = [];
  const p = rawPos.replace('-', '/');

  for (const pos of POSITIONS) {
    if (p.includes(pos)) { eligible.push(pos); continue; }
    if (p === 'G' && (pos === 'PG' || pos === 'SG')) { eligible.push(pos); continue; }
    if (p === 'F' && (pos === 'SF' || pos === 'PF')) { eligible.push(pos); continue; }
    const parts = p.split('/');
    if (parts.includes('G') && (pos === 'PG' || pos === 'SG')) { eligible.push(pos); continue; }
    if (parts.includes('F') && (pos === 'SF' || pos === 'PF')) { eligible.push(pos); continue; }
  }

  return eligible.length > 0 ? eligible : ['SF']; // Fallback
}

// ── Bot Auto Deck Builder ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildBotRoster(drafted: DraftCard[], botProfile?: BotProfile): BuiltRoster {
  const players = drafted.filter((c): c is PlayerCardData => c.type === 'Player');
  const plays = drafted.filter((c): c is Play => c.type === 'Play');

  // Sort players by OVR descending — best players get priority
  const sortedPlayers = [...players].sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0));

  // Phase 1: Assign starters (1 per position, best available)
  const depthChart: Record<string, PlayerCardData[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
  const assigned = new Set<string>();

  // First pass: assign the best player to each position
  for (const pos of POSITIONS) {
    const best = sortedPlayers.find(p => !assigned.has(p.id) && getEligiblePositions(p.player.position).includes(pos));
    if (best) {
      depthChart[pos].push(best);
      assigned.add(best.id);
    }
  }

  // Phase 2: Fill to 12 active players (2-3 per position)
  // Distribute remaining players to their best-fit positions, keeping roster balanced
  const remaining = sortedPlayers.filter(p => !assigned.has(p.id));
  const activeCount = () => Object.values(depthChart).reduce((s, col) => s + col.length, 0);

  for (const player of remaining) {
    if (activeCount() >= TARGET_ROSTER) break;

    const eligible = getEligiblePositions(player.player.position);
    // Pick the position with the fewest players
    const bestPos = eligible.sort((a, b) => depthChart[a].length - depthChart[b].length)[0];
    if (bestPos) {
      depthChart[bestPos].push(player);
      assigned.add(player.id);
    }
  }

  // If we still don't have 12, fill from remaining into smallest columns regardless of position
  const leftover = sortedPlayers.filter(p => !assigned.has(p.id));
  for (const player of leftover) {
    if (activeCount() >= TARGET_ROSTER) break;
    const smallest = POSITIONS.reduce((a, b) => depthChart[a].length <= depthChart[b].length ? a : b);
    depthChart[smallest].push(player);
    assigned.add(player.id);
  }

  // Phase 3: Select 3 best plays (by rarity, prefer system > special > basic)
  const playPriority: Record<string, number> = { system: 3, special: 2, basic: 1 };
  const rarityPriority: Record<string, number> = { Mythic: 4, Rare: 3, Uncommon: 2, Common: 1 };

  const sortedPlays = [...plays].sort((a, b) => {
    const catDiff = (playPriority[b.playCategory] ?? 0) - (playPriority[a.playCategory] ?? 0);
    if (catDiff !== 0) return catDiff;
    return (rarityPriority[b.rarity] ?? 0) - (rarityPriority[a.rarity] ?? 0);
  });

  const activePlays = sortedPlays.slice(0, 3);
  const benchPlays = sortedPlays.slice(3);

  // Phase 4: Everyone not in active roster goes to G-League
  const benchPlayers = sortedPlayers.filter(p => !assigned.has(p.id));

  return {
    depthChart: Object.fromEntries(
      Object.entries(depthChart).map(([pos, cards]) => [pos, cards.map(c => c.id)])
    ),
    activePlays: activePlays.map(p => p.id),
    gLeaguePlayers: benchPlayers.map(p => p.id),
    gLeaguePlays: benchPlays.map(p => p.id),
  };
}
