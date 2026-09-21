/**
 * Bot Deck Builder
 *
 * Auto-builds a valid 12-man roster from a bot's drafted card pool. Draft
 * session persistence lives in `src/storage` (GameStore), not
 * here — the engine has no I/O.
 */

import { DraftCard, PlayerCardData, Play } from './types';
import { getPlaybookId, getPlayDef, isEligibleForRole, type PlayAssignment, type PlaySide } from './playbook';
import { evaluateArchetypes, bestSelection, type ArchetypeSelection } from './archetypes';
import { BotProfile } from './draft';
import { TARGET_ROSTER } from './balance';
import { DEPTH_COLUMNS, canPlaceAt, effectivePosition, type DepthColumn } from './positions';
import { placeFromBench, type DenseDepthChart } from './depthChart';
import { createRng } from './rng';

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
  rosterPlayers: string[];                // Bench player card IDs (non-active pool, "Roster" in the UI)
  rosterPlays: string[];                  // Bench play card IDs
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

// ── Click-to-assign helpers (plan deckbuilder_ux, T2/D3) ───────────────────
// Pure rule functions shared by DeckBuilder's click handlers AND its native
// HTML5 drag/drop handlers, so click and drag can never diverge.

/** State `assignPlayToFirstOpenSlot` operates on: the 3 fixed active-play
 *  slots (a card id or empty) plus enough about every known play (active or
 *  benched) to check side/duplicates. */
export interface PlaySlotsState {
  /** Fixed 3 active-play slots; each holds a card id, or null when empty. */
  activeSlots: (string | null)[];
  /** Every play card the UI currently knows about (active + bench), by id. */
  playsById: Record<string, { id: string; side: PlaySide }>;
  /** Optional fixed side per slot index (undefined = the slot accepts either
   *  side). The current UI has no zoned slots, so callers omit this and every
   *  slot accepts any play — kept for a future zoned layout. */
  slotSides?: (PlaySide | undefined)[];
}

export type AssignPlayFailureReason = 'full' | 'wrong-side' | 'duplicate' | 'unknown';

export type AssignPlayResult =
  | { ok: true; next: PlaySlotsState; slotIndex: number }
  | { ok: false; reason: AssignPlayFailureReason };

/** Put `playId` into the first empty active-play slot that accepts its side.
 *  Refuses a play the caller doesn't know about, a play already active, or a
 *  full/side-mismatched set of slots. */
export function assignPlayToFirstOpenSlot(state: PlaySlotsState, playId: string): AssignPlayResult {
  const play = state.playsById[playId];
  if (!play) return { ok: false, reason: 'unknown' };
  if (state.activeSlots.includes(playId)) return { ok: false, reason: 'duplicate' };

  const emptyIndices = state.activeSlots
    .map((id, i) => (id === null ? i : -1))
    .filter(i => i !== -1);
  if (emptyIndices.length === 0) return { ok: false, reason: 'full' };

  const slotIndex = emptyIndices.find(i => !state.slotSides?.[i] || state.slotSides[i] === play.side);
  if (slotIndex === undefined) return { ok: false, reason: 'wrong-side' };

  const next = [...state.activeSlots];
  next[slotIndex] = playId;
  return { ok: true, next: { ...state, activeSlots: next }, slotIndex };
}

/** State `placePlayerInSlot` operates on: the dense depth chart, the bench
 *  pool, and each bench player's raw position (for eligibility). */
export interface DepthChartState {
  chart: DenseDepthChart;
  benchIds: string[];
  positionsById: Record<string, string>;
}

export type PlacePlayerFailureReason = 'ineligible' | 'occupied' | 'unknown';

export type PlacePlayerResult =
  | { ok: true; next: DepthChartState }
  | { ok: false; reason: PlacePlayerFailureReason };

/** Place a bench player into a specific depth-chart slot. Slots fill in order
 *  (index 0 = starter) — `slotIndex` must be the column's next open slot,
 *  matching the disabled/enabled empty slots `DepthSlotColumn` renders.
 *  Delegates the actual placement + position eligibility to
 *  `depthChart.placeFromBench` — the same engine call `DeckBuilder`'s drag
 *  path already uses — so click and drag can never disagree. */
export function placePlayerInSlot(
  state: DepthChartState,
  playerId: string,
  column: DepthColumn,
  slotIndex: number,
): PlacePlayerResult {
  const rawPosition = state.positionsById[playerId];
  if (rawPosition === undefined || !state.benchIds.includes(playerId)) return { ok: false, reason: 'unknown' };

  const existing = state.chart[column] ?? [];
  if (slotIndex !== existing.length) return { ok: false, reason: 'occupied' };

  const result = placeFromBench(state.chart, playerId, rawPosition, column);
  if (!result.ok) {
    if (result.reason === 'Not eligible for this position') return { ok: false, reason: 'ineligible' };
    return { ok: false, reason: 'unknown' };
  }
  return {
    ok: true,
    next: {
      ...state,
      chart: result.chart,
      benchIds: state.benchIds.filter(id => id !== playerId),
    },
  };
}

// ── Builder initial state ──────────────────────────────────────────────────

/** Everything the human deck builder holds, seeded in ONE step from the drafted cards
 *  and (when editing) the saved roster. */
export interface BuilderInitialState {
  depthChart: Record<DepthColumn, PlayerCardData[]>;
  /** Bench pool ("Roster" in the UI), in drafted order — the caller sorts for display. */
  rosterPlayers: PlayerCardData[];
  activePlays: (Play | null)[];
  rosterPlays: Play[];
  /** cardId -> assignment, exactly one entry per active play. */
  playAssignments: Record<string, PlayAssignment>;
}

/**
 * Seed the deck builder. A fresh draft (no saved orders) starts with an empty depth chart
 * and no active plays — no auto-fill, the human builds the lineup. A saved roster restores
 * its depth order, active plays and their role assignments; ids the draft no longer has
 * are dropped, a saved assignment for a play that is not active is dropped, and an active
 * play without one gets empty roles.
 *
 * One pure call on purpose: the builder used to seed these slices from an effect while a
 * second effect synced assignments to `activePlays`, and on mount that second effect still
 * saw the empty slots and wiped every saved role.
 */
export function initBuilderState(
  draftedCards: DraftCard[],
  saved: { depthOrder?: Record<string, string[]>; playsOrder?: string[]; playAssignments?: PlayAssignment[] } = {},
): BuilderInitialState {
  const players = draftedCards.filter((c): c is PlayerCardData => c.type === 'Player');
  const plays = draftedCards.filter((c): c is Play => c.type === 'Play');

  const depthChart: Record<DepthColumn, PlayerCardData[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
  const placedIds = new Set<string>();
  if (saved.depthOrder) {
    for (const column of DEPTH_COLUMNS) {
      for (const id of saved.depthOrder[column] ?? []) {
        const found = players.find(p => p.id === id);
        if (found && !placedIds.has(id)) {
          depthChart[column].push(found);
          placedIds.add(id);
        }
      }
    }
  }

  const activePlays: (Play | null)[] = [null, null, null];
  const activeIds = new Set<string>();
  (saved.playsOrder ?? []).slice(0, 3).forEach((id, idx) => {
    const found = plays.find(p => p.id === id);
    if (found && !activeIds.has(id)) {
      activePlays[idx] = found;
      activeIds.add(id);
    }
  });

  const savedAssignments = new Map((saved.playAssignments ?? []).map(a => [a.cardId, a]));
  const playAssignments: Record<string, PlayAssignment> = {};
  for (const play of activePlays) {
    if (!play) continue;
    playAssignments[play.id] = savedAssignments.get(play.id) ?? { cardId: play.id, playId: getPlaybookId(play), roles: {} };
  }

  return {
    depthChart,
    rosterPlayers: players.filter(p => !placedIds.has(p.id)),
    activePlays,
    rosterPlays: plays.filter(p => !activeIds.has(p.id)),
    playAssignments,
  };
}

// ── Builder reducer contract (plan render_and_engine_perf D8, wave 0) ──────
// Types only. T9 implements `applyBuilderAction` here and `hooks/useRosterBuilder.ts` on top
// of it; nothing consumes these yet. The point of a reducer: the builder keeps five state
// slices that must change TOGETHER, and today they are changed by separate setters — two of
// them from inside another setter's updater, which under StrictMode duplicates a displaced
// play into the bench. One pure transition per user action makes that impossible.

/** The five slices, exactly what `initBuilderState` returns. */
export type BuilderState = BuilderInitialState;

/** Every way the human changes the lineup. Ids, not card objects: the reducer looks cards up
 *  in the state, so a stale object captured by a closure cannot leak in. */
export type BuilderAction =
  /** Roster list -> depth chart. `slotIndex` defaults to the column's next open slot. */
  | { type: 'place'; playerId: string; column: DepthColumn; slotIndex?: number }
  /** Depth chart -> another column or slot. */
  | { type: 'move'; playerId: string; column: DepthColumn; slotIndex?: number }
  /** Depth chart -> roster list. Also clears every play role that player held. */
  | { type: 'sendToRoster'; playerId: string }
  /** A roster play, or a freshly minted basic play, into the first open slot of its side. */
  | { type: 'activatePlay'; play: Play }
  /** Replace the play in an occupied slot with a roster play; the displaced one returns. */
  | { type: 'swapPlay'; slotIndex: number; playId: string }
  /** Empty a slot. A drafted play returns to the roster list; a basic play just vanishes. */
  | { type: 'removePlay'; slotIndex: number }
  | { type: 'assignRole'; cardId: string; roleId: string; playerId: string }
  | { type: 'clearRole'; cardId: string; roleId: string }
  /** Everything back to the roster list (the "Clear" button). */
  | { type: 'clear' }
  /** Put back a snapshot taken before an action (the toast's Undo). */
  | { type: 'undo'; snapshot: BuilderState };

export type BuilderActionError =
  | PlacePlayerFailureReason
  | AssignPlayFailureReason
  /** The player does not meet the role's badge requirement. */
  | 'role-ineligible'
  /** The player already holds a different role in the same play. */
  | 'role-conflict'
  /** The id is not where the action expects it (not on the roster, slot empty, ...). */
  | 'not-found';

/** `error` set means the action was refused and `state` is the SAME reference that came in,
 *  so callers can toast on `error` and React skips the re-render. */
export interface BuilderActionResult {
  state: BuilderState;
  error?: BuilderActionError;
}

/**
 * Invariants every transition must keep (T9's tests assert them after each action):
 *  1. Conservation: every drafted card is in exactly one place — a depth-chart column, the
 *     roster players, an active-play slot or the roster plays. Basic plays are the one
 *     exception: they are minted by `activatePlay` and destroyed by `removePlay`/`swapPlay`/`clear`.
 *  2. `playAssignments` has exactly one entry per active play, keyed by its card id; a play
 *     that leaves its slot loses its entry, a play that enters gets one with empty roles.
 *  3. No role points at a player who is not on the depth chart.
 *  4. `rosterPlayers` stays sorted by the comparator passed in (a display concern the engine
 *     does not own, hence a parameter).
 */
export type ApplyBuilderAction = (
  state: BuilderState,
  action: BuilderAction,
  options: { sortRosterPlayers: (a: PlayerCardData, b: PlayerCardData) => number },
) => BuilderActionResult;

/** A single pick record for draft replay / analytics */
export interface DraftPickRecord {
  packNumber: number;           // 1-3
  pickNumber: number;           // 1-12 within the pack
  overallPick: number;          // 1-36 across all packs
  seatId: string;               // 'human-0' or 'bot-1' through 'bot-7'
  packContents: string[];       // Card IDs visible to this seat BEFORE picking
  pickedCardId: string;         // The card ID that was picked
  /** Set when the Premier pick clock expired and `expirePick` picked for the
   *  human (plan ui_draft_deckbuild_pack, D5). Absent for every other pick. */
  autoPicked?: boolean;
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
  ownerId?: string;
  timestamp: string;
  seats: DraftSessionSeat[];  // seats[0] = human, seats[1..7] = bots
  pickLog: DraftPickRecord[]; // Full pick-by-pick history for replay/analytics
  seed?: number;              // The cube-pool seed this draft was generated from
  /** plan_data_storage D4: which `src/data/cards.json` generation this draft's cards
   *  came from. Stamped by the storage layer at save time if absent, never overwritten. */
  cardSetVersion?: string;
  /** plan ui_draft_deckbuild_pack D1: which draft mode produced this session.
   *  Missing = 'premier' (old sessions predate the mode split). */
  mode?: 'quick' | 'premier';
  /** plan_challenge_mode D1: which game this draft was for. Missing = 'tournament'
   *  (every session that predates the 82:0 Challenge). A roster can only start the
   *  mode it was drafted for. */
  gameMode?: 'tournament' | 'challenge';
}

// ── Position Eligibility ───────────────────────────────────────────────────
// Single source of truth: `engine/positions.ts` (plan ui_draft_deckbuild_pack, D13).
// Bots stay natural-only (`canPlaceAt(..., allowAdjacent = false)`); the `['SF']`
// fallback keeps a player with an unparseable position placeable rather than
// undraftable, exactly as the old private copy did.

const POSITIONS = DEPTH_COLUMNS;

function getEligiblePositions(player: PlayerCardData): string[] {
  const rawPos = effectivePosition(player.player.position, player.traits);
  const natural = DEPTH_COLUMNS.filter(col => canPlaceAt(rawPos, col, false));
  return natural.length > 0 ? natural : ['SF'];
}

// ── Play role assignment ──────────────────────────────────────────────────

function assignPlayRoles(
  playCard: Play,
  activePlayers: PlayerCardData[],
  starterIds: Set<string>,
  inProgressAssignments: Map<string, Set<string>>, // playCardId -> used playerIds
): Record<string, string> {
  const def = getPlayDef(playCard);
  if (!def) return {};

  const usedInThisPlay = inProgressAssignments.get(playCard.id) ?? new Set();
  const assigned: Record<string, string> = {};

  for (const role of def.roles) {
    // Find eligible players not yet used in this play
    let best: PlayerCardData | undefined;
    let bestBadgeLevel = -1;

    for (const player of activePlayers) {
      if (usedInThisPlay.has(player.id)) continue; // Already assigned in this play
      if (!isEligibleForRole(player, role)) continue; // Doesn't meet the badge requirement

      // Get the badge level for this role
      const badge = role.badge;
      const badgeLevel = badge
        ? (player.traits?.find(t => t.name === badge)?.level ?? 0)
        : 0;

      // Prefer starters on ties, then highest badge level
      const isStarter = starterIds.has(player.id);
      if (
        best === undefined ||
        badgeLevel > bestBadgeLevel ||
        (badgeLevel === bestBadgeLevel && isStarter && !starterIds.has(best.id))
      ) {
        best = player;
        bestBadgeLevel = badgeLevel;
      }
    }

    if (best) {
      assigned[role.id] = best.id;
      usedInThisPlay.add(best.id);
    }
  }

  inProgressAssignments.set(playCard.id, usedInThisPlay);
  return assigned;
}

/** Calculate how many roles a play can successfully fill from the active roster. */
function countFillableRoles(
  playCard: Play,
  activePlayers: PlayerCardData[],
  usedSoFar: Set<string>,
): { fillable: number; total: number } {
  const def = getPlayDef(playCard);
  if (!def) return { fillable: 0, total: 0 };

  let fillable = 0;
  const used = new Set(usedSoFar);

  for (const role of def.roles) {
    // Check if any eligible player exists and hasn't been used
    const found = activePlayers.some(p => !used.has(p.id) && isEligibleForRole(p, role));
    if (found) {
      fillable++;
      // Mark the first eligible player as used for the next role check
      const player = activePlayers.find(p => !used.has(p.id) && isEligibleForRole(p, role));
      if (player) used.add(player.id);
    }
  }

  return { fillable, total: def.roles.length };
}

// ── Bot Auto Deck Builder ──────────────────────────────────────────────────

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
    const best = sortedPlayers.find(p => !assigned.has(p.id) && getEligiblePositions(p).includes(pos));
    if (best) {
      depthChart[pos].push(best);
      assigned.add(best.id);
    }
  }

  // Phase 1b: guarantee coverage. A column can still be empty here if the bot drafted
  // zero players naturally eligible for it — Phase 2/3 below only redistribute by
  // count, so an empty column stays empty once the roster reaches 12 elsewhere (a real
  // bug: seed 424242 produced PG 5 / SG 5 / SF 1 / PF 1 / C 0, a 4-on-5 team). Every
  // column must end up with at least one player, natural fit or not; fall back to the
  // best remaining player who fits adjacently (one column over) — same rule a human
  // gets in the deck builder (`canPlaceAt(..., allowAdjacent: true)`), so this off-
  // position slot draws the same in-game penalty (`buildTeamInfo`'s OOP derate), not a
  // silent free pass.
  for (const pos of POSITIONS) {
    if (depthChart[pos].length > 0) continue;
    const rawPos = (p: PlayerCardData) => effectivePosition(p.player.position, p.traits);
    // Adjacent (one column over) first; PG/SG-only roster can't adjacently reach PF or C
    // (the PG-SG-SF-PF-C chain is only one hop wide), so fall further back to the best
    // remaining player of any position — still off-position, still penalised, just no
    // longer capped at "one column over" once that's provably not enough to cover 5.
    const fallback = sortedPlayers.find(p => !assigned.has(p.id) && canPlaceAt(rawPos(p), pos, true))
      ?? sortedPlayers.find(p => !assigned.has(p.id));
    if (fallback) {
      depthChart[pos].push(fallback);
      assigned.add(fallback.id);
    }
  }

  // Phase 2: Fill to 12 active players (2-3 per position)
  // Distribute remaining players to their best-fit positions, keeping roster balanced
  const remaining = sortedPlayers.filter(p => !assigned.has(p.id));
  const activeCount = () => Object.values(depthChart).reduce((s, col) => s + col.length, 0);

  for (const player of remaining) {
    if (activeCount() >= TARGET_ROSTER) break;

    const eligible = getEligiblePositions(player);
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

  // Build active player list for play role assignment
  const activePlayers = Object.values(depthChart).flat();
  const starterIds = new Set(
    Object.values(depthChart)
      .filter(col => col.length > 0)
      .map(col => col[0].id)
  );

  // Phase 3: Select 3 best plays, preferring ones that can be fully staffed
  const playPriority: Record<string, number> = { system: 3, special: 2, basic: 1 };
  const rarityPriority: Record<string, number> = { Mythic: 4, Rare: 3, Uncommon: 2, Common: 1 };

  // Score each play: (fillable / total, then rarity priority)
  const scoredPlays = plays.map(play => {
    const { fillable, total } = countFillableRoles(play, activePlayers, new Set());
    const catPriority = playPriority[play.playCategory] ?? 0;
    const rarityScore = rarityPriority[play.rarity] ?? 0;
    const canFillFully = fillable === total && total > 0;

    return {
      play,
      canFillFully,
      fillable,
      total,
      catPriority,
      rarityScore,
    };
  });

  // Sort: prefer fillable plays, then by category, then by rarity
  const sortedPlays = scoredPlays.sort((a, b) => {
    // First, prefer plays that can be filled completely
    if (a.canFillFully !== b.canFillFully) return a.canFillFully ? -1 : 1;
    // Then by category priority (system > special > basic)
    if (a.catPriority !== b.catPriority) return b.catPriority - a.catPriority;
    // Then by rarity
    return b.rarityScore - a.rarityScore;
  });

  const selectedPlayCards = sortedPlays.slice(0, 3).map(s => s.play);
  const benchPlays = sortedPlays.slice(3).map(s => s.play);

  // Phase 3b: Assign roles for each selected play
  const playAssignments: PlayAssignment[] = [];
  const inProgressAssignments = new Map<string, Set<string>>();

  for (const playCard of selectedPlayCards) {
    const roles = assignPlayRoles(playCard, activePlayers, starterIds, inProgressAssignments);
    playAssignments.push({
      cardId: playCard.id,
      playId: getPlaybookId(playCard),
      roles,
    });
  }

  // Phase 4: Everyone not in the active roster stays in the bench pool.
  const benchPlayers = sortedPlayers.filter(p => !assigned.has(p.id));

  return {
    version: BUILT_ROSTER_VERSION,
    archetypes: chooseBotArchetypes(activePlayers, starterIds, botProfile?.noiseSeed),
    depthChart: Object.fromEntries(
      Object.entries(depthChart).map(([pos, cards]) => [pos, cards.map(c => c.id)])
    ),
    activePlays: selectedPlayCards.map(p => p.id),
    playAssignments,
    rosterPlayers: benchPlayers.map(p => p.id),
    rosterPlays: benchPlays.map(p => p.id),
  };
}

/**
 * Simple pseudo-random hash, same pattern as draft.ts's bot-pick noise: deterministic
 * from the roster's own sorted player ids, so a caller without a `noiseSeed` (an NBA
 * opponent roster, a synthetic balance-script team) still gets a stable, reproducible
 * pick instead of needing its own seed threaded through.
 */
function seedFromRoster(activePlayers: PlayerCardData[], noiseSeed?: number): number {
  if (noiseSeed !== undefined) return noiseSeed >>> 0;
  const ids = activePlayers.map(p => p.id).sort().join('|');
  let h = 0x9e3779b9;
  for (let i = 0; i < ids.length; i++) h = Math.imul(h ^ ids.charCodeAt(i), 2654435761);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Random-among-eligible archetype selection for a bot roster (see `bestSelection`). Also usable as a UI 'suggest'. */
export function chooseBotArchetypes(activePlayers: PlayerCardData[], starterIds: Set<string>, noiseSeed?: number): ArchetypeSelection {
  const rng = createRng(seedFromRoster(activePlayers, noiseSeed));
  return bestSelection(evaluateArchetypes(activePlayers, starterIds), rng);
}
