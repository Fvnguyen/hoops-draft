'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { DraftCard, PlayerHoverPreview, PlayCard, CardListRow, Play, PlayerCardData, getPosColors } from './PlayerCard';
import { useHoverPreview } from './useHoverPreview';
import { PlayPanel } from './PlayPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { calcRosterIdentity, calcRosterShotDiet } from '../engine/rosterStats';
import type { RosterIdentity } from '../engine/rosterStats';
import { calcTeamBonuses, evaluatePlay, countBadges } from '../engine/synergies';
import { PLAYBOOK, evaluatePlaybook, getPlaybookId, isEligibleForRole, type PlayAssignment, type PlayStatus, type PlaySide } from '../engine/playbook';
import { evaluateArchetypes, shortlistArchetypes, type ArchetypeSelection } from '../engine/archetypes';
import { TopKPIBand } from './TopKPIBand';
import { getGameStore } from '@/storage';
import { StorageQuotaError, type SavedRoster } from '@/storage/types';
import { DEPTH_COLUMNS, canPlaceAt, positionFit, type DepthColumn } from '@/engine/positions';
import {
  MAX_ROSTER,
  countPlayers,
  moveWithinChart,
  placeFromBench,
  removeFromChart,
  type DenseDepthChart,
} from '@/engine/depthChart';
import { DepthSlotColumn } from './DepthSlotColumn';
import { RosterChecklist } from './RosterChecklist';
import { evaluateRosterChecklist } from '@/lib/rosterChecklist';
import { ToastProvider, useToast } from './Toast';

const rarityValue: Record<string, number> = {
  'Mythic': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1,
};

// Sort order used for the Roster (bench) player list: rarity desc, then position, then name.
const posOrder: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4, G: 5, F: 6, 'G-F': 7, 'F-G': 7, ALL: 8, STAR: 8 };

const sortRosterPlayers = (a: PlayerCardData, b: PlayerCardData) => {
  const rarityDiff = rarityValue[b.rarity] - rarityValue[a.rarity];
  if (rarityDiff !== 0) return rarityDiff;
  const posA = posOrder[a.player.position] ?? 9;
  const posB = posOrder[b.player.position] ?? 9;
  if (posA !== posB) return posA - posB;
  return a.player.name.localeCompare(b.player.name);
};

/** One Roster (bench) row + its own hover-preview state (D-hover) — a `useState` per row
 *  needs its own component instance, can't be called from inside a `.map()` directly. */
function RosterPlayerRow({ player, selected, onDragStart, onClick }: {
  player: PlayerCardData;
  selected: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  // Destructured (not `const hover = ...; hover.ref`) — eslint-plugin-react-hooks'
  // `refs` rule conservatively taints every property read off an object that also
  // carries a ref, so `hover.isHovered` gets misflagged as a ref access otherwise.
  const { ref: hoverRef, isHovered, onMouseEnter, onMouseLeave } = useHoverPreview<HTMLDivElement>();
  return (
    <div
      ref={hoverRef}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="relative cursor-grab active:cursor-grabbing w-full"
    >
      <CardListRow card={player} selected={selected} />
      {/* Screen-centred + badge panel (D-hover) — a row near the bottom of this
          scrollable list has nowhere for an anchored popup to go. */}
      {isHovered && <PlayerHoverPreview player={player} />}
    </div>
  );
}

type PosFilter = 'All' | 'G' | 'F' | 'C';

export interface DeckBuilderProps {
  draftedCards: DraftCard[];
  existingRosterName?: string;
  rosterId?: string;
  initialDepthOrder?: Record<string, string[]>;
  initialPlaysOrder?: string[];
  initialPlayAssignments?: PlayAssignment[];
  initialArchetypes?: ArchetypeSelection;
  /** Draft session this roster belongs to. Enables "Save & play season" (D19). */
  sessionId?: string;
  podAverageIdentity?: RosterIdentity;
  /** season_lifecycle_notifications D3: true when this roster's season is Completed —
   *  view-only, depth chart/plays can't be rearranged and Save is disabled. */
  readOnly?: boolean;
}

/** Mounts the toast layer the builder body needs (D15) around the real builder. */
export function DeckBuilder(props: DeckBuilderProps) {
  return (
    <ToastProvider>
      <DeckBuilderBody {...props} />
    </ToastProvider>
  );
}

/** Snapshot restored by a toast's Undo action (D15). */
interface BuilderSnapshot {
  depthChart: Record<string, PlayerCardData[]>;
  rosterPlayers: PlayerCardData[];
  playAssignments: Record<string, PlayAssignment>;
  activePlays: (Play | null)[];
  rosterPlays: Play[];
}

function DeckBuilderBody({ draftedCards, existingRosterName, rosterId, initialDepthOrder, initialPlaysOrder, initialPlayAssignments, initialArchetypes, sessionId, podAverageIdentity, readOnly = false }: DeckBuilderProps) {
  const router = useRouter();
  const toast = useToast();

  /** Position filter chips (All / G / F / C) above the Roster list. Natural fit only. */
  const matchesPosFilter = (rawPos: string, filter: PosFilter): boolean => {
    if (filter === 'All') return true;
    if (filter === 'G') return canPlaceAt(rawPos, 'PG', false) || canPlaceAt(rawPos, 'SG', false);
    if (filter === 'F') return canPlaceAt(rawPos, 'SF', false) || canPlaceAt(rawPos, 'PF', false);
    return canPlaceAt(rawPos, 'C', false);
  };

  const [depthChart, setDepthChart] = useState<Record<string, PlayerCardData[]>>({
    PG: [], SG: [], SF: [], PF: [], C: []
  });
  const [activePlays, setActivePlays] = useState<(Play | null)[]>([null, null, null]);
  const [rosterPlayers, setRosterPlayers] = useState<PlayerCardData[]>([]);
  const [rosterPlays, setRosterPlays] = useState<Play[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ card: DraftCard, sourceZone: string, sourceIndex?: number } | null>(null);
  // Hidden bench-sized drag image (D24): imperatively updated (not React state) so it's
  // already correct by the time handleDragStart calls setDragImage synchronously.
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const dragGhostBarRef = useRef<HTMLDivElement>(null);
  const dragGhostImgRef = useRef<HTMLImageElement>(null);
  const dragGhostNameRef = useRef<HTMLDivElement>(null);

  // Click-to-place selection state
  const [selectedRosterPlayer, setSelectedRosterPlayer] = useState<PlayerCardData | null>(null);
  const [posFilter, setPosFilter] = useState<PosFilter>('All');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Empty depth slot whose AssignPopover is open (D14). Cleared by any selection.
  const [openSlotPopover, setOpenSlotPopover] = useState<{ column: DepthColumn; slot: number } | null>(null);

  // Play-role assignment state: cardId -> assignment (roleId -> playerId). Kept in
  // sync with activePlays by the effect below. `assigning` is the role currently
  // being filled (selected via a role row click); mutually exclusive with the
  // player placement selection above.
  const [playAssignments, setPlayAssignments] = useState<Record<string, PlayAssignment>>(() => {
    const map: Record<string, PlayAssignment> = {};
    (initialPlayAssignments ?? []).forEach(a => { map[a.cardId] = a; });
    return map;
  });
  // Chosen roster identity (offense/defense or gold). Selections that fall below Online
  // when the roster changes are dropped automatically (locked plans are never shown).
  const [archetypes, setArchetypes] = useState<ArchetypeSelection>(initialArchetypes ?? {});
  const [assigning, setAssigning] = useState<{ cardId: string; roleId: string } | null>(null);

  const [isPlaysOpen, setIsPlaysOpen] = useState(true);
  const [isPlayersOpen, setIsPlayersOpen] = useState(true);
  // Whole-sidebar collapse: frees the Active Roster column's width for the depth
  // chart (5 columns need the room) without losing drag targets — collapsed, the
  // Roster still accepts drops, it just shows as a thin bar instead of the full list.
  // Starts collapsed: the depth chart (5 columns) needs the width more than
  // the Roster list needs to be open by default; one click still reopens it.
  const [isRosterCollapsed, setIsRosterCollapsed] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDestination, setSaveDestination] = useState<'rosters' | 'season'>('rosters');
  const [rosterName, setRosterName] = useState(existingRosterName || `Draft Roster - ${new Date().toLocaleString()}`);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const initDepth: Record<string, PlayerCardData[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    const initRosterPlayers: PlayerCardData[] = [];
    const initRosterPlays: Play[] = [];

    const players = draftedCards.filter((c): c is PlayerCardData => c.type === 'Player');
    const plays = draftedCards.filter((c): c is Play => c.type === 'Play');

    if (initialDepthOrder) {
      // Saved-roster edit: seed the depth chart from the saved order, everyone
      // else (never placed, or placed at an id the draft no longer has) goes to
      // the Roster sidebar list.
      const assignedIds = new Set<string>();
      for (const pos in initDepth) {
        if (initialDepthOrder[pos]) {
           const orderedCol: PlayerCardData[] = [];
           initialDepthOrder[pos].forEach(id => {
              const found = draftedCards.find(p => p.id === id) as PlayerCardData;
              if (found) {
                orderedCol.push(found);
                assignedIds.add(id);
              }
           });
           initDepth[pos] = orderedCol;
        }
      }
      players.forEach(p => {
        if (!assignedIds.has(p.id)) initRosterPlayers.push(p);
      });
    } else {
      // Fresh draft (no saved depth order): every drafted card starts in the
      // Roster sidebar list, the depth chart starts empty — no auto-fill, the
      // human builds the lineup (D27, supersedes D20/D21's autoDistributeRoster).
      initRosterPlayers.push(...players);
    }

    const newActivePlays: (Play | null)[] = [null, null, null];
    if (initialPlaysOrder) {
      const assignedPlayIds = new Set<string>();
      initialPlaysOrder.forEach((id, idx) => {
         if (idx < 3) {
            const found = plays.find(p => p.id === id);
            if (found) {
              newActivePlays[idx] = found;
              assignedPlayIds.add(id);
            }
         }
      });
      plays.forEach(p => {
        if (!assignedPlayIds.has(p.id)) initRosterPlays.push(p);
      });
    } else {
      // Fresh draft: every play card starts in the Roster sidebar list too —
      // no active plays pre-selected.
      initRosterPlays.push(...plays);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivePlays(newActivePlays);
    initRosterPlayers.sort(sortRosterPlayers);
    setDepthChart(initDepth);
    setRosterPlayers(initRosterPlayers);
    setRosterPlays(initRosterPlays);

    const initAssignments: Record<string, PlayAssignment> = {};
    (initialPlayAssignments ?? []).forEach(a => { initAssignments[a.cardId] = a; });
    setPlayAssignments(initAssignments);
  }, [draftedCards, initialDepthOrder, initialPlaysOrder, initialPlayAssignments]);

  // Keep playAssignments in sync with activePlays: a play entering a slot gets a
  // fresh (or its previous) assignment; a play leaving a slot drops its assignment
  // entirely (covers both "swap play" and "return play to Roster").
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayAssignments(prev => {
      const next: Record<string, PlayAssignment> = {};
      let changed = false;
      activePlays.forEach(play => {
        if (!play) return;
        const existing = prev[play.id];
        next[play.id] = existing ?? { cardId: play.id, playId: getPlaybookId(play), roles: {} };
        if (!existing) changed = true;
      });
      if (Object.keys(next).length !== Object.keys(prev).length) changed = true;
      return changed ? next : prev;
    });
  }, [activePlays]);

  // Escape clears whatever is selected (bench player or a role being assigned —
  // mutually exclusive selection modes; a placed player has no selection state of
  // its own any more, a click on it acts immediately).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedRosterPlayer(null);
        setAssigning(null);
        setOpenSlotPopover(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const clearSelection = () => {
    setSelectedRosterPlayer(null);
    setAssigning(null);
    setOpenSlotPopover(null);
  };

  // ── Depth chart mutations (D12: every placement rule lives in engine/depthChart) ──

  const cardById = useMemo(() => {
    const map = new Map<string, PlayerCardData>();
    draftedCards.forEach(c => { if (c.type === 'Player') map.set(c.id, c as PlayerCardData); });
    return map;
  }, [draftedCards]);

  /** PlayerCardData chart → the dense id chart the engine helpers operate on. */
  const toIdChart = (chart: Record<string, PlayerCardData[]>): DenseDepthChart =>
    Object.fromEntries(DEPTH_COLUMNS.map(col => [col, (chart[col] ?? []).map(p => p.id)]));

  const fromIdChart = (dense: DenseDepthChart): Record<string, PlayerCardData[]> =>
    Object.fromEntries(DEPTH_COLUMNS.map(col => [
      col,
      (dense[col] ?? []).map(id => cardById.get(id)).filter((p): p is PlayerCardData => !!p),
    ]));

  const takeSnapshot = (): BuilderSnapshot => ({
    depthChart, rosterPlayers, playAssignments, activePlays, rosterPlays,
  });

  const restoreSnapshot = (snap: BuilderSnapshot) => {
    setDepthChart(snap.depthChart);
    setRosterPlayers(snap.rosterPlayers);
    setActivePlays(snap.activePlays);
    setRosterPlays(snap.rosterPlays);
    setPlayAssignments(snap.playAssignments);
    clearSelection();
  };

  /** The move already happened — the toast just offers 5s of regret (D15). */
  const toastUndo = (message: string, snap: BuilderSnapshot) => {
    toast.show(message, { actionLabel: 'Undo', durationMs: 5000, onAction: () => restoreSnapshot(snap) });
  };

  /** Move a Roster (bench) player onto the chart. Engine refusals become error toasts. */
  const placeFromRoster = (player: PlayerCardData, column: DepthColumn) => {
    const snap = takeSnapshot();
    const result = placeFromBench(toIdChart(depthChart), player.id, player.player.position, column);
    if (!result.ok) {
      toast.show(result.reason ?? 'Cannot place there', { tone: 'error' });
      return;
    }
    setDepthChart(fromIdChart(result.chart));
    setRosterPlayers(prev => prev.filter(p => p.id !== player.id));
    setSelectedRosterPlayer(null);
    setOpenSlotPopover(null);
    toastUndo(`${player.player.name} → ${column}`, snap);
  };

  /** Move a player already on the chart to another column / slot. */
  const moveOnChart = (player: PlayerCardData, column: DepthColumn, slotIndex?: number, opts: { silent?: boolean } = {}) => {
    const snap = takeSnapshot();
    const result = moveWithinChart(toIdChart(depthChart), player.id, player.player.position, column, slotIndex);
    if (!result.ok) {
      toast.show(result.reason ?? 'Cannot place there', { tone: 'error' });
      return;
    }
    setDepthChart(fromIdChart(result.chart));
    setOpenSlotPopover(null);
    if (!opts.silent) toastUndo(`${player.player.name} → ${column}`, snap);
  };

  const handleDragStart = (e: React.DragEvent, card: DraftCard, sourceZone: string, sourceIndex?: number) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem({ card, sourceZone, sourceIndex });

    // Always drag the small bench-sized ghost (D24), never the source card's own
    // rendered size — a starter card is a full 5:7 card, much bigger than any drop
    // target, and the browser's default drag image is the actual dragged element.
    if (card.type === 'Player' && dragGhostRef.current && dragGhostBarRef.current && dragGhostImgRef.current && dragGhostNameRef.current) {
      const [c1, c2] = getPosColors(card.player.position);
      dragGhostBarRef.current.style.background = `linear-gradient(to bottom, ${c1}, ${c2})`;
      dragGhostImgRef.current.src = `/headshots/${card.player.id}.png`;
      dragGhostNameRef.current.textContent = card.player.name;
      e.dataTransfer.setDragImage(dragGhostRef.current, 12, 18);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const removeCardFromSource = (cardId: string, sourceZone: string) => {
    if (sourceZone === 'RosterPlayers') {
      setRosterPlayers(prev => prev.filter(p => p.id !== cardId));
    } else if (sourceZone === 'RosterPlays') {
      setRosterPlays(prev => prev.filter(p => p.id !== cardId));
    } else if (sourceZone.startsWith('ActivePlay')) {
      const idx = parseInt(sourceZone.split('-')[1]);
      setActivePlays(prev => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
    } else if (['PG', 'SG', 'SF', 'PF', 'C'].includes(sourceZone)) {
      setDepthChart(prev => ({
        ...prev,
        [sourceZone]: prev[sourceZone].filter(p => p.id !== cardId)
      }));
    }
  };

  /** Drop onto a NON-depth-chart zone (play slots, Roster lanes). Depth-chart
   *  drops go through `handleDropOnSlot` so they share the engine's rules. */
  const handleDropOnZone = (e: React.DragEvent, targetZone: string) => {
    e.preventDefault();
    if (!draggedItem) return;

    const { card, sourceZone } = draggedItem;

    if (card.type === 'Play' && !targetZone.includes('Play')) { setDraggedItem(null); return; }
    if (card.type === 'Player' && targetZone.includes('Play')) { setDraggedItem(null); return; }
    if (targetZone === sourceZone) { setDraggedItem(null); return; }

    // Depth chart → Roster: the engine removes, held roles are cleared with it.
    if (DEPTH_COLUMNS.includes(sourceZone as DepthColumn) && targetZone === 'RosterPlayers') {
      sendPlacedToRoster(card as PlayerCardData);
      setDraggedItem(null);
      return;
    }

    removeCardFromSource(card.id, sourceZone);

    if (targetZone === 'RosterPlayers') {
      setRosterPlayers(prev => [...prev, card as PlayerCardData].sort(sortRosterPlayers));
    } else if (targetZone === 'RosterPlays') {
      if (!card.id.startsWith('basic-')) {
        setRosterPlays(prev => [...prev, card as Play]);
      }
    } else if (targetZone.startsWith('ActivePlay')) {
      const idx = parseInt(targetZone.split('-')[1]);
      setActivePlays(prev => {
        const next = [...prev];
        const existing = next[idx];
        if (existing && !existing.id.startsWith('basic-')) {
          setRosterPlays(g => [...g, existing]);
        }
        next[idx] = card as Play;
        return next;
      });
    }

    setDraggedItem(null);
  };

  /** Native HTML5 drop onto one depth-chart slot (D14 keeps drag for pointer devices). */
  const handleDropOnSlot = (e: React.DragEvent, column: DepthColumn, slotIndex: number) => {
    e.preventDefault();
    const item = draggedItem;
    setDraggedItem(null);
    if (!item || item.card.type !== 'Player') return;
    const player = item.card as PlayerCardData;
    if (item.sourceZone === 'RosterPlayers') {
      placeFromRoster(player, column);
    } else if (DEPTH_COLUMNS.includes(item.sourceZone as DepthColumn)) {
      moveOnChart(player, column, slotIndex);
    }
  };

  /** Click handling for Play cards keeps its old immediate behaviour: click a
   *  Roster play to fill the first empty slot, click a filled slot to send
   *  it back to the Roster. (Only Player click behaviour changes to the new
   *  select → highlight → place model below.) */
  const handlePlayClick = (play: Play, currentZone: string) => {
    setAssigning(null);
    if (currentZone.startsWith('ActivePlay')) {
      removeCardFromSource(play.id, currentZone);
      if (!play.id.startsWith('basic-')) {
        setRosterPlays(prev => [...prev, play]);
      }
    } else {
      const emptyIdx = activePlays.findIndex(p => p === null);
      if (emptyIdx !== -1) {
        removeCardFromSource(play.id, currentZone);
        setActivePlays(prev => {
          const next = [...prev];
          next[emptyIdx] = play;
          return next;
        });
      } else {
        toast.show('Maximum 3 active plays — remove one first.', { tone: 'error' });
      }
    }
  };

  const handleRosterPlayerClick = (player: PlayerCardData) => {
    setAssigning(null);
    setOpenSlotPopover(null);
    setSelectedRosterPlayer(prev => (prev?.id === player.id ? null : player));
  };

  /** Click on a placed player (D-remove): mid-role-assignment it assigns them to the
   *  role being filled; otherwise it sends them straight back to Roster (undoable
   *  toast). No more select-then-▲/▼/✕ — drag already covers reordering/moving a
   *  placed player, so a click only needs to do the one thing a drag can't: remove. */
  const handlePlacedPlayerClick = (player: PlayerCardData) => {
    if (assigning) {
      tryAssignRole(player);
      return;
    }
    sendPlacedToRoster(player);
  };

  // ── Play-role assignment ──────────────────────────────────────────────────

  const handleRoleClick = (cardId: string, roleId: string) => {
    setSelectedRosterPlayer(null);
    setAssigning(prev => (prev?.cardId === cardId && prev.roleId === roleId ? null : { cardId, roleId }));
  };

  const handleRoleClear = (cardId: string, roleId: string) => {
    setPlayAssignments(prev => {
      const a = prev[cardId];
      if (!a || !(roleId in a.roles)) return prev;
      const roles = { ...a.roles };
      delete roles[roleId];
      return { ...prev, [cardId]: { ...a, roles } };
    });
    setAssigning(null);
  };

  /** Removes every role assignment held by this player, across every active play. */
  const removePlayerRoles = (playerId: string) => {
    setPlayAssignments(prev => {
      let anyChanged = false;
      const next: Record<string, PlayAssignment> = {};
      for (const [cardId, a] of Object.entries(prev)) {
        if (!Object.values(a.roles).includes(playerId)) { next[cardId] = a; continue; }
        const roles = { ...a.roles };
        for (const rid of Object.keys(roles)) {
          if (roles[rid] === playerId) delete roles[rid];
        }
        next[cardId] = { ...a, roles };
        anyChanged = true;
      }
      return anyChanged ? next : prev;
    });
  };

  /** Attempt to place `player` into the role currently being assigned (`assigning`).
   *  No-ops silently when the player is ineligible or already holds a different
   *  role in the same play — those cards are dimmed/non-clickable in the UI, but
   *  this guards drag-and-drop and any other entry point too. */
  /** Assign `player` to a role of a play if eligible and not already holding another role in it. Returns true on success. */
  const assignRole = (cardId: string, roleId: string, player: PlayerCardData): boolean => {
    const play = activePlays.find(p => p?.id === cardId);
    const def = play ? PLAYBOOK[getPlaybookId(play)] : undefined;
    const role = def?.roles.find(r => r.id === roleId);
    if (!def || !role) return false;
    if (!isEligibleForRole(player, role)) return false;
    const currentRoles = playAssignments[cardId]?.roles ?? {};
    const holdsOtherRole = Object.entries(currentRoles).some(([rid, pid]) => rid !== roleId && pid === player.id);
    if (holdsOtherRole) return false;
    setPlayAssignments(prev => ({
      ...prev,
      [cardId]: { cardId, playId: def.playId, roles: { ...currentRoles, [roleId]: player.id } },
    }));
    return true;
  };

  const tryAssignRole = (player: PlayerCardData) => {
    if (!assigning) return;
    const { cardId, roleId } = assigning;
    const play = activePlays.find(p => p?.id === cardId);
    if (!play) { setAssigning(null); return; }
    if (assignRole(cardId, roleId, player)) setAssigning(null);
  };

  /** Drop of a depth-chart card (dataTransfer text = card id) onto a play's role row. */
  const handleRoleDrop = (cardId: string, roleId: string, droppedId: string) => {
    const player = allPlayers.find(p => p.id === droppedId);
    if (player) assignRole(cardId, roleId, player);
    setAssigning(null);
  };

  /** Click on an empty slot (D14): place the pending selection, or open the popover. */
  const handleEmptySlotClick = (column: DepthColumn, slotIndex: number) => {
    setAssigning(null);
    if (selectedRosterPlayer) {
      placeFromRoster(selectedRosterPlayer, column);
      return;
    }
    setOpenSlotPopover(prev =>
      prev && prev.column === column && prev.slot === slotIndex ? null : { column, slot: slotIndex },
    );
  };

  /** Pick from an empty slot's AssignPopover — the same component a play role uses. */
  const handleSlotPopoverPick = (column: DepthColumn, playerId: string) => {
    const player = rosterPlayers.find(p => p.id === playerId);
    if (player) placeFromRoster(player, column);
  };

  /** Send a placed player back to the Roster. Roles they held are cleared with
   *  them — no `confirm`, the toast's Undo puts everything back (D15). */
  const sendPlacedToRoster = (player: PlayerCardData) => {
    const snap = takeSnapshot();
    const heldRoles = rolesByPlayer.get(player.id) ?? [];
    if (heldRoles.length > 0) removePlayerRoles(player.id);
    setDepthChart(fromIdChart(removeFromChart(toIdChart(depthChart), player.id)));
    setRosterPlayers(prev => [...prev, player].sort(sortRosterPlayers));
    setOpenSlotPopover(null);
    toastUndo(
      heldRoles.length > 0
        ? `${player.player.name} → Roster (${heldRoles.length} role${heldRoles.length > 1 ? 's' : ''} cleared)`
        : `${player.player.name} → Roster`,
      snap,
    );
  };

  const handleClearRoster = () => {
    const snap = takeSnapshot();
    const allPlaced = Object.values(depthChart).flat();
    setRosterPlayers(prev => [...prev, ...allPlaced].sort(sortRosterPlayers));
    setDepthChart({ PG: [], SG: [], SF: [], PF: [], C: [] });
    const returningPlays = activePlays.filter((p): p is Play => p !== null && !p.id.startsWith('basic-'));
    setRosterPlays(prev => [...prev, ...returningPlays]);
    setActivePlays([null, null, null]);
    setSelectedRosterPlayer(null);
    setAssigning(null);
    setOpenSlotPopover(null);
    setShowClearConfirm(false);
    toastUndo('Roster cleared', snap);
  };

  // Mechanics validation
  const playersInRoster = Object.values(depthChart).reduce((acc, col) => acc + col.length, 0);
  const activePlaysCount = activePlays.filter(p => p !== null).length;
  const validActivePlays = activePlays.filter(p => p !== null) as Play[];
  const identity = calcRosterIdentity(depthChart);
  const shotDiet = calcRosterShotDiet(depthChart, validActivePlays);
  const allPlayers = Object.values(depthChart).flat();
  // Badge totals across the current depth chart (starters + bench), recomputed
  // whenever the roster changes — feeds evaluatePlay() so play cards can show
  // live requirement status without exposing any OVR/rating numbers.
  const badgeTotals = useMemo(() => countBadges(Object.values(depthChart).flat()), [depthChart]);
  const bonuses = calcTeamBonuses(allPlayers, validActivePlays, new Map());
  const rosterFull = countPlayers(toIdChart(depthChart)) >= MAX_ROSTER;

  // Play-role assignment: evaluate every equipped play's roles against the active
  // 12-man roster (playAssignments/evaluatePlaybook — docs/plan_plays_and_synergies
  // §4). Only depth-chart players are eligible; roles referencing anyone else read
  // as unfilled with a reason.
  const playbookAssignments = useMemo(() => Object.values(playAssignments), [playAssignments]);
  const starterIds = useMemo(() => new Set(Object.values(depthChart).map(col => col[0]?.id).filter((id): id is string => !!id)), [depthChart]);
  const archetypeStatuses = useMemo(() => evaluateArchetypes(Object.values(depthChart).flat(), starterIds, archetypes), [depthChart, starterIds, archetypes]);
  // Only unlocked plans may stay selected; anything that dropped below Online is pruned.
  const validArchetypes = useMemo<ArchetypeSelection>(() => {
    const unlocked = new Set(shortlistArchetypes(archetypeStatuses).map(st => st.def.id));
    const keep = (id?: string) => (id && unlocked.has(id) ? id : undefined);
    return archetypes.gold ? { gold: keep(archetypes.gold) } : { offense: keep(archetypes.offense), defense: keep(archetypes.defense) };
  }, [archetypes, archetypeStatuses]);
  const playbookStatus = useMemo(
    () => evaluatePlaybook(playbookAssignments, Object.values(depthChart).flat()),
    [playbookAssignments, depthChart]
  );
  const playStatusByCardId = useMemo(() => {
    const map = new Map<string, PlayStatus>();
    playbookStatus.plays.forEach(s => map.set(s.assignment.cardId, s));
    return map;
  }, [playbookStatus]);

  // playerId -> every role they currently hold, across every equipped play — feeds
  // the RoleTag overlay on depth-chart cards.
  const roleEntries = useMemo(() => {
    const entries: { playerId: string; playName: string; roleName: string; side: PlaySide }[] = [];
    for (const a of playbookAssignments) {
      const def = PLAYBOOK[a.playId];
      if (!def) continue;
      for (const [roleId, playerId] of Object.entries(a.roles)) {
        const role = def.roles.find(r => r.id === roleId);
        if (!role) continue;
        entries.push({ playerId, playName: def.name, roleName: role.name, side: def.side });
      }
    }
    return entries;
  }, [playbookAssignments]);

  // Not wrapped in useMemo: grouping a Map of arrays defeats the React Compiler's
  // ability to preserve manual memoization (verified — every mutation style tried
  // still failed `react-hooks/preserve-manual-memoization`). roleEntries above is
  // already memoized, and this grouping pass over at most a few dozen entries is
  // cheap enough to redo every render.
  const rolesByPlayer = new Map<string, { playName: string; roleName: string; side: PlaySide }[]>();
  for (const entry of roleEntries) {
    rolesByPlayer.set(entry.playerId, [...(rolesByPlayer.get(entry.playerId) ?? []), entry]);
  }

  // "Roster ready" checklist (D15) — the single source of save-blocker truth, shown
  // in the header instead of hiding in a disabled button's tooltip. Cheap enough to
  // recompute every render (the react-compiler lint rejects memoizing it here).
  const checklist = evaluateRosterChecklist(
    {
      version: 2,
      depthChart: toIdChart(depthChart),
      activePlays: activePlays.filter((p): p is Play => p !== null).map(p => p.id),
      playAssignments: playbookAssignments,
      archetypes: validArchetypes,
      rosterPlayers: rosterPlayers.map(p => p.id),
      rosterPlays: rosterPlays.map(p => p.id),
    },
    draftedCards,
  );

  // Assigning a role? Precompute which role/def is targeted so every depth-chart
  // card can be scored for eligibility in the same render pass.
  const assigningRole = useMemo(() => {
    if (!assigning) return undefined;
    const play = activePlays.find(p => p?.id === assigning.cardId);
    const def = play ? PLAYBOOK[getPlaybookId(play)] : undefined;
    return def?.roles.find(r => r.id === assigning.roleId);
  }, [assigning, activePlays]);

  const isAssignEligible = (player: PlayerCardData): boolean => {
    if (!assigning || !assigningRole) return false;
    if (!isEligibleForRole(player, assigningRole)) return false;
    const currentRoles = playAssignments[assigning.cardId]?.roles ?? {};
    return !Object.entries(currentRoles).some(([rid, pid]) => rid !== assigning.roleId && pid === player.id);
  };

  /** Eligibility check for a given (play, role, player) triple — used by PlayPanel to
   *  highlight a role row green/red while a depth-chart player is being dragged over it. */
  const isRoleEligible = (cardId: string, roleId: string, playerId: string): boolean => {
    const play = activePlays.find(p => p?.id === cardId);
    const def = play ? PLAYBOOK[getPlaybookId(play)] : undefined;
    const role = def?.roles.find(r => r.id === roleId);
    const player = allPlayers.find(p => p.id === playerId);
    if (!def || !role || !player) return false;
    if (!isEligibleForRole(player, role)) return false;
    const currentRoles = playAssignments[cardId]?.roles ?? {};
    return !Object.entries(currentRoles).some(([rid, pid]) => rid !== roleId && pid === playerId);
  };

  // Eligible active-roster candidates for the role currently being assigned, sorted by
  // badge level desc — feeds the PlayPanel "Assign" popover (a second path to the same
  // assignRole() call the depth-chart click-to-place flow already uses).
  const pickerCandidates = !assigning || !assigningRole ? undefined : allPlayers
    .filter(isAssignEligible)
    .sort((a, b) => {
      const levelOf = (p: PlayerCardData) => {
        if (!assigningRole.badge) return 0;
        const main = p.traits?.find(t => t.name === assigningRole.badge)?.level ?? 0;
        const alt = assigningRole.altBadge ? (p.traits?.find(t => t.name === assigningRole.altBadge)?.level ?? 0) : 0;
        return Math.max(main, alt);
      };
      return levelOf(b) - levelOf(a);
    });

  const handlePick = (playerId: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (player) tryAssignRole(player);
  };

  // Player currently mid-drag, for the PlayPanel role-row drag-eligibility highlight
  // (best-effort — dataTransfer payload isn't readable during dragover in all browsers).
  const draggingPlayerId = draggedItem?.card.type === 'Player' ? draggedItem.card.id : undefined;

  const isComplete = checklist.ready;
  const statusText = checklist.ready
    ? 'Roster is valid'
    : checklist.unmet.map(i => `${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ');

  const filteredRosterPlayers = rosterPlayers.filter(p => matchesPosFilter(p.player.position, posFilter));

  // The player whose placement the depth chart is currently previewing: a selected
  // bench row, or the card being dragged.
  const pendingPlayer: PlayerCardData | null =
    selectedRosterPlayer ??
    (draggedItem?.card.type === 'Player' ? (draggedItem.card as PlayerCardData) : null);

  /** Roster candidates eligible for a column — feeds an empty slot's AssignPopover. */
  const slotCandidates = (column: DepthColumn) =>
    rosterPlayers.filter(p => canPlaceAt(p.player.position, column));

  /** D19: "Save" lands on `/rosters`; "Save & play season" jumps straight into the
   *  season for this draft session (only offered when there IS a session). */
  const handleSaveRoster = async (destination: 'rosters' | 'season' = 'rosters') => {
    if (readOnly) return;
    try {
      setSaveError(null);

      const saveId = rosterId || `roster_${Date.now()}`;
      const depthChartOrder = Object.fromEntries(Object.entries(depthChart).map(([k, v]) => [k, v.map(p => p.id)]));
      const activePlayIds = activePlays.map(p => p ? p.id : null).filter((id): id is string => id !== null);

      const newRosterData: SavedRoster = {
        id: saveId,
        name: rosterName,
        timestamp: new Date().toISOString(),
        draftedCards,
        depthChartOrder,
        activePlays: activePlayIds,
        playAssignments: playbookAssignments,
        archetypes: validArchetypes,
        version: 2,
        sessionId: sessionId ?? null,
      };

      const store = getGameStore();
      await store.saveRoster(newRosterData);

      // Update the human's built roster in the draft session so opponents can be retrieved
      if (sessionId) {
        const session = await store.getDraftSession(sessionId);
        if (session) {
          session.seats[0].builtRoster = {
            version: 2,
            depthChart: depthChartOrder,
            activePlays: activePlayIds,
            playAssignments: playbookAssignments,
            archetypes: validArchetypes,
            rosterPlayers: rosterPlayers.map(p => p.id),
            rosterPlays: rosterPlays.map(p => p.id),
          };
          await store.saveDraftSession(session);
        }
      }

      if (destination === 'season' && sessionId) {
        router.push(`/season?rosterId=${encodeURIComponent(saveId)}&sessionId=${encodeURIComponent(sessionId)}`);
      } else {
        router.push('/rosters');
      }
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to save roster. Please try again.');
      }
    }
  };

  return (
    <div className="@container h-screen pt-[60px] text-stone-800 flex flex-col overflow-hidden relative bg-stone-50" onClick={clearSelection}>
      {/* Hidden bench-sized HTML5 drag image (D24) — see handleDragStart. */}
      <div
        ref={dragGhostRef}
        className="fixed -left-[999px] -top-[999px] w-[160px] h-9 bg-white border border-stone-300 rounded-lg shadow flex items-center overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div ref={dragGhostBarRef} className="h-full w-1.5 shrink-0" />
        <div className="w-8 h-8 shrink-0 mx-1 rounded-full overflow-hidden bg-stone-100">
          <img ref={dragGhostImgRef} alt="" className="w-full h-full object-cover object-top" />
        </div>
        <div ref={dragGhostNameRef} className="flex-1 min-w-0 px-1 text-[10px] font-bold uppercase truncate text-stone-800" />
      </div>
      <TopKPIBand identity={identity} shotDiet={shotDiet} bonuses={bonuses} depthChart={depthChart} average={podAverageIdentity} starterIds={starterIds} archetypes={archetypes} onArchetypesChange={setArchetypes} />
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <p className="text-sm text-red-700 font-semibold">{saveError}</p>
        </div>
      )}
      {readOnly && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <p className="text-sm text-blue-700 font-semibold">This season is complete — the roster is locked and view-only.</p>
        </div>
      )}
      {/* D17: the builder body is the container-query context — the plays column and
          the Roster sidebar are sized in `cqw` with clamps, and the whole band wraps
          to a column under a 1000px CONTAINER width (not viewport width). */}
      <div className={`flex-1 p-4 flex flex-col @min-[1000px]:flex-row gap-4 overflow-hidden relative ${readOnly ? 'pointer-events-none opacity-75' : ''}`}>
        {/* ACTIVE ROSTER */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-stone-200 shadow-sm p-4 min-h-0">
          <div className="flex justify-between items-start gap-3 mb-4 shrink-0 flex-wrap">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-4">
                 <h2 className="text-lg font-bold uppercase text-stone-800 tracking-wider flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                   Active Roster
                 </h2>
                 <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded bg-stone-50 border text-[10px] font-bold uppercase tracking-widest ${playersInRoster === MAX_ROSTER ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}`}>
                      Players {playersInRoster}/{MAX_ROSTER}
                    </span>
                    <span className={`px-2 py-1 rounded bg-stone-50 border text-[10px] font-bold uppercase tracking-widest ${activePlaysCount === 3 ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}`}>
                      Plays {activePlaysCount}/3
                    </span>
                 </div>
              </div>
              {/* D15: the save blockers are VISIBLE, not a tooltip on a dead button. */}
              <RosterChecklist result={checklist} />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowClearConfirm(true); }}
                className="px-4 py-2 text-xs rounded-lg font-black uppercase tracking-widest border border-stone-300 text-stone-500 hover:text-red-600 hover:border-red-300 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setSaveDestination('rosters'); setShowSaveModal(true); }}
                disabled={!isComplete}
                title={isComplete ? undefined : statusText}
                className={`px-6 py-2 text-xs rounded-lg font-black uppercase tracking-widest transition-all ${
                  isComplete
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] shadow-emerald-500/30'
                  : 'bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200'
                }`}
              >
                Save
              </button>
              {/* D19: only offered when this roster belongs to a draft session. */}
              {sessionId && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSaveDestination('season'); setShowSaveModal(true); }}
                  disabled={!isComplete}
                  title={isComplete ? undefined : statusText}
                  className={`px-6 py-2 text-xs rounded-lg font-black uppercase tracking-widest transition-all ${
                    isComplete
                    ? 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white shadow-[0_0_15px_rgba(234,88,12,0.3)]'
                    : 'bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200'
                  }`}
                >
                  Save &amp; play season
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-row gap-3 flex-1 min-h-0">
            {/* Left Column: Active Plays — full-size cards so requirements/mechanics
                are actually readable (was a 60px compact row). */}
            <div className="w-[clamp(200px,20cqw,280px)] shrink-0 flex flex-col min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-1 shrink-0">Plays (Max 3)</h3>
              <div className={`text-[9px] font-bold uppercase tracking-wider mb-2 shrink-0 ${playbookStatus.overBudget ? 'text-amber-600' : 'text-stone-400'}`}>
                Offense {Math.round(playbookStatus.offenseAllocation * 100)}% / {Math.round(playbookStatus.offenseBudget * 100)}%
                {' · '}
                Defense {Math.round(playbookStatus.defenseAllocation * 100)}% / {Math.round(playbookStatus.defenseBudget * 100)}%
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto px-1 pb-1">
                {[0, 1, 2].map(slotIndex => {
                  const play = activePlays[slotIndex];
                  const zoneId = `ActivePlay-${slotIndex}`;
                  const roleStatus = play ? playStatusByCardId.get(play.id) : undefined;
                  const selectedRoleId = play && assigning?.cardId === play.id ? assigning.roleId : undefined;
                  if (!play || !roleStatus) {
                    return (
                      <div
                        key={slotIndex}
                        className={`w-full h-[90px] rounded-xl border-2 border-dashed ${draggedItem?.card.type === 'Play' ? 'border-blue-500/50 bg-blue-50' : 'border-stone-300/50 bg-stone-50'} flex items-center justify-center relative transition-colors`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnZone(e, zoneId)}
                      >
                        <span className="text-stone-500 font-bold uppercase text-[10px] pointer-events-none text-center px-2">Empty play slot — drag a play here</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={slotIndex}
                      className="relative w-full"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnZone(e, zoneId)}
                    >
                      <motion.div
                        layoutId={`play-${play.id}`}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                        className="w-full cursor-grab active:cursor-grabbing"
                        draggable
                        // framer-motion's motion.div overloads onDragStart for its own drag
                        // gesture (PointerEvent/MouseEvent/TouchEvent), which conflicts with the
                        // native HTML5 DragEvent this handler actually needs — `any` bridges that.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onDragStart={(e: any) => handleDragStart(e, play, zoneId)}
                      >
                        <PlayPanel
                          play={play}
                          status={roleStatus}
                          players={allPlayers}
                          selectedRoleId={selectedRoleId}
                          draggingPlayerId={draggingPlayerId}
                          isEligible={(roleId, playerId) => isRoleEligible(play.id, roleId, playerId)}
                          onRoleClick={(roleId) => { handleRoleClick(play.id, roleId); }}
                          onRoleClear={(roleId) => { handleRoleClear(play.id, roleId); }}
                          onRoleDrop={(roleId, droppedId) => { handleRoleDrop(play.id, roleId, droppedId); }}
                          onRemove={() => handlePlayClick(play, zoneId)}
                          pickerCandidates={selectedRoleId ? pickerCandidates : undefined}
                          onPick={handlePick}
                        />
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Area: Depth Chart — starters get the full card at the top of
                each column, 2nd/3rd string are medium compact cards below. */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 shrink-0">Depth Chart (Starters at Top)</h3>
              <div className="grid grid-cols-5 gap-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 pb-4">
                {DEPTH_COLUMNS.map(col => (
                  <DepthSlotColumn
                    key={col}
                    column={col}
                    players={depthChart[col] ?? []}
                    selectionActive={!!pendingPlayer}
                    pendingFit={pendingPlayer ? positionFit(pendingPlayer.player.position, col) : undefined}
                    rosterFull={rosterFull}
                    rolesByPlayer={rolesByPlayer}
                    assigning={!!assigning}
                    isAssignEligible={isAssignEligible}
                    openPopoverSlot={openSlotPopover?.column === col ? openSlotPopover.slot : undefined}
                    popoverCandidates={openSlotPopover?.column === col ? slotCandidates(col) : undefined}
                    onEmptySlotClick={handleEmptySlotClick}
                    onPopoverPick={handleSlotPopoverPick}
                    onPlayerClick={handlePlacedPlayerClick}
                    onDragStart={(e, player, column, index) => handleDragStart(e, player, column, index)}
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnSlot}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ROSTER / SIDEBOARD — collapses to a thin bar so the Active Roster
            column (and its 5-across depth chart) can claim the freed width. */}
        <div
          className={`flex flex-col bg-white rounded-xl border border-stone-200 shadow-sm min-h-0 transition-[width] ${
            isRosterCollapsed ? 'w-12 shrink-0 items-center py-3' : 'w-full @min-[1000px]:w-[clamp(280px,26cqw,400px)] shrink-0 p-4'
          }`}
        >
          {isRosterCollapsed ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsRosterCollapsed(false); }}
              title="Expand Roster"
              className="flex flex-col items-center gap-3 text-stone-400 hover:text-stone-600"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[11px] font-bold italic uppercase tracking-wider [writing-mode:vertical-rl]">Roster</span>
            </button>
          ) : (
          <>
          <h2 className="text-xl font-bold italic uppercase text-stone-400 mb-4 tracking-wider flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-stone-500"></span>
            Roster
            <div className="flex-1" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsRosterCollapsed(true); }}
              title="Collapse Roster"
              className="text-stone-400 hover:text-stone-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </h2>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">

            {/* Roster Players Lane (Moved above Plays) */}
            <div
              className={`border rounded-lg overflow-hidden transition-colors ${draggedItem?.card.type === 'Player' ? 'border-orange-500 bg-orange-50' : 'border-stone-200 bg-white'}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnZone(e, 'RosterPlayers')}
            >
              <button onClick={(e) => { e.stopPropagation(); setIsPlayersOpen(!isPlayersOpen); }} className="w-full flex justify-between items-center bg-stone-50 p-3 hover:bg-stone-100 transition-colors">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Players ({rosterPlayers.length})</h3>
                {isPlayersOpen ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
              </button>

              <AnimatePresence>
                {isPlayersOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="px-3 pt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {(['All', 'G', 'F', 'C'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setPosFilter(f)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border transition-colors ${
                            posFilter === f ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="p-3 pt-2 flex flex-col gap-2 min-h-[80px]">
                      {filteredRosterPlayers.map(player => (
                        <RosterPlayerRow
                          key={player.id}
                          player={player}
                          selected={selectedRosterPlayer?.id === player.id}
                          onDragStart={(e) => handleDragStart(e, player, 'RosterPlayers')}
                          onClick={(e) => { e.stopPropagation(); handleRosterPlayerClick(player); }}
                        />
                      ))}
                      {filteredRosterPlayers.length === 0 && <div className="text-center text-xs text-stone-600 italic py-4 pointer-events-none">No players match this filter.</div>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Roster Plays Lane */}
            <div
              className={`border rounded-lg overflow-hidden transition-colors ${draggedItem?.card.type === 'Play' ? 'border-blue-500 bg-blue-50' : 'border-stone-200 bg-white'}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnZone(e, 'RosterPlays')}
            >
              <button onClick={(e) => { e.stopPropagation(); setIsPlaysOpen(!isPlaysOpen); }} className="w-full flex justify-between items-center bg-stone-50 p-3 hover:bg-stone-100 transition-colors">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Plays ({rosterPlays.length})</h3>
                {isPlaysOpen ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
              </button>

              <AnimatePresence>
                {isPlaysOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-3 flex flex-col gap-2 min-h-[80px]">
                      {rosterPlays.map((play, idx) => (
                        <div
                          key={`${play.id}-${idx}`}
                          draggable
                          onDragStart={(e: React.DragEvent) => handleDragStart(e, play, 'RosterPlays')}
                          onClick={(e) => { e.stopPropagation(); handlePlayClick(play, 'RosterPlays'); }}
                          className="cursor-grab active:cursor-grabbing w-full"
                        >
                           <PlayCard play={play as Play} compact evaluation={evaluatePlay(play, badgeTotals)} />
                        </div>
                      ))}
                      {rosterPlays.length === 0 && <div className="text-center text-xs text-stone-600 italic py-4 pointer-events-none">No plays on bench.</div>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Basic Plays */}
          <div className="shrink-0 mt-4 pt-4 border-t border-stone-200">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mb-3">Basic Plays</h3>
            <div className="flex gap-2">
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, { type: 'Play', id: `basic-offense-${Date.now()}`, name: 'Basic Offense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Offensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays')}
                title="Adds a basic play card with no requirements"
                className="flex-1 bg-stone-50 border border-stone-200 hover:border-orange-500 hover:bg-stone-100 transition-colors p-2.5 rounded-lg flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
              >
                <span className="text-orange-500 font-black pointer-events-none">+</span>
                <span className="text-stone-500 font-bold uppercase text-[10px] group-hover:text-stone-800 pointer-events-none">Offense</span>
              </div>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, { type: 'Play', id: `basic-defense-${Date.now()}`, name: 'Basic Defense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Defensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays')}
                title="Adds a basic play card with no requirements"
                className="flex-1 bg-stone-50 border border-stone-200 hover:border-blue-500 hover:bg-stone-100 transition-colors p-2.5 rounded-lg flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
              >
                <span className="text-blue-500 font-black pointer-events-none">+</span>
                <span className="text-stone-500 font-bold uppercase text-[10px] group-hover:text-stone-800 pointer-events-none">Defense</span>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setShowSaveModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl w-full max-w-md shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setShowSaveModal(false)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold uppercase text-stone-800 mb-2">Save Roster</h2>
              <p className="text-stone-400 text-sm mb-6">Give your active roster a name. You can edit this later from the My Rosters menu.</p>

              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Roster Name</label>
                <input
                  type="text"
                  value={rosterName}
                  onChange={e => setRosterName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-stone-400 transition-colors"
                  placeholder="e.g. 2025 Championship Run"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-6 py-2 rounded-lg font-bold text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveRoster(saveDestination)}
                  disabled={!rosterName.trim()}
                  className="px-6 py-2 rounded-lg font-black uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saveDestination === 'season' ? 'Save & play season' : 'Save to Collection'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setShowClearConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl w-full max-w-sm shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold uppercase text-stone-800 mb-2">Clear Roster?</h2>
              <p className="text-stone-400 text-sm mb-6">This sends every player and play back to the Roster and cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-6 py-2 rounded-lg font-bold text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearRoster}
                  className="px-6 py-2 rounded-lg font-black uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Clear Roster
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
