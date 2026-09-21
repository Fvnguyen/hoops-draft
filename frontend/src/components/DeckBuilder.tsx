'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { DraftCard, PlayerHoverPreview, CardListRow, Play, PlayerCardData, getPosColors } from './PlayerCard';
import { useHoverPreview } from './useHoverPreview';
import { PlayPanel } from './PlayPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { calcRosterIdentity, calcRosterShotDiet } from '../engine/rosterStats';
import type { RosterIdentity } from '../engine/rosterStats';
import { calcTeamBonuses } from '../engine/synergies';
import { PLAYBOOK, evaluatePlaybook, getPlaybookId, isEligibleForRole, type PlayAssignment, type PlayStatus, type PlaySide } from '../engine/playbook';
import { evaluateArchetypes, shortlistArchetypes, type ArchetypeSelection } from '../engine/archetypes';
import { TopKPIBand } from './TopKPIBand';
import { getGameStore } from '@/storage';
import { StorageQuotaError, type SavedRoster } from '@/storage/types';
import { DEPTH_COLUMNS, canPlaceAt, positionFit, positionParts, effectivePosition, type DepthColumn } from '@/engine/positions';
import {
  MAX_ROSTER,
  countPlayers,
  moveWithinChart,
  removeFromChart,
  type DenseDepthChart,
} from '@/engine/depthChart';
import {
  assignPlayToFirstOpenSlot,
  initBuilderState,
  placePlayerInSlot,
  type AssignPlayFailureReason,
  type PlaySlotsState,
  type DepthChartState,
  type PlacePlayerFailureReason,
} from '@/engine/deckbuilder';
import { DepthSlotColumn } from './DepthSlotColumn';
import { evaluateRosterChecklist } from '@/lib/rosterChecklist';
import { ToastProvider, useToast } from './Toast';
import { useAndroidBackGuard } from '@/hooks/useAndroidBackGuard';
import { BackGuardSheet } from './BackGuardSheet';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Overlay } from './ui/Overlay';
import { Panel } from './ui/Panel';
import { PlaySwapPopover } from './AssignPopover';
import { PlayTile, PlayTileEmptySlot } from './PlayTile';

// deckbuilder_ux D4: each sidebar's own docked/strip toggle persists per browser,
// same pattern TopKPIBand's collapse toggle already uses.
const ROSTER_DOCK_KEY = 'deckbuilder.rosterDocked';
const PLAYS_DOCK_KEY = 'deckbuilder.playsDocked';

function readStoredDock(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

function writeStoredDock(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // best-effort persistence only
  }
}

const rarityValue: Record<string, number> = {
  'Mythic': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1,
};

// Sort order used for the Roster (bench) player list: rarity desc, then position, then name.
// D10 follow-up (2026-09-19): the old dict keyed the whole position STRING ('PG', 'G-F',
// 'ALL', ...), so any multi-way combo it didn't hardcode (most of them, once bref bio
// pages made 3-5-way combos common) fell through to `?? 9` and sorted after every
// recognized position, not grouped with its real depth-chart neighbors. Keyed on the
// EARLIEST column (PG..C order) the card is eligible for instead — 'SG/SF/PF' sorts with
// the SGs, 'ALL' (Positionless) sorts first, same spot a lone 'PG' pill 5-way beat it in
// the old dict too, since a positionless player is real point-guard eligible.
const posOrder: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4, G: 0, F: 2 };

function positionSortKey(rawPos: string): number {
  if (rawPos === 'ALL' || rawPos === 'STAR') return 0;
  const parts = positionParts(rawPos);
  const known = parts.map(p => posOrder[p]).filter((v): v is number => v !== undefined);
  return known.length ? Math.min(...known) : 9;
}

const sortRosterPlayers = (a: PlayerCardData, b: PlayerCardData) => {
  const rarityDiff = rarityValue[b.rarity] - rarityValue[a.rarity];
  if (rarityDiff !== 0) return rarityDiff;
  const posDiff = positionSortKey(a.player.position) - positionSortKey(b.player.position);
  if (posDiff !== 0) return posDiff;
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
      data-testid="roster-player-row"
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
  /** plan_challenge_mode D1: which game this roster was drafted for. Passed
   *  directly by `DraftRoom` right after a fresh draft; absent when editing an
   *  existing roster from `/roster/[id]` — the body resolves it itself from
   *  the saved `DraftSession` (see `resolvedGameMode`). Missing everywhere
   *  (both the prop and the session) means a tournament roster. */
  gameMode?: 'tournament' | 'challenge';
  podAverageIdentity?: RosterIdentity;
  /** season_lifecycle_notifications D3: true when this roster's season is Completed —
   *  view-only, depth chart/plays can't be rearranged and Save is disabled. */
  readOnly?: boolean;
  /** plan_challenge_mode T7: embeds this builder inside the 82:0 front office (D8).
   *  When set, "Save" skips the roster-naming modal, `store.saveRoster` and the
   *  session's `builtRoster` update entirely — D11 requires the front office's edits
   *  to land only in the run's `rosterPost` SNAPSHOT, never mutate the roster record
   *  the user actually drafted — and hands the built `SavedRoster` to this callback
   *  instead. "Save & play season" is hidden (superseded by "Spin the second half"). */
  embedOverride?: { onSave: (roster: SavedRoster) => void };
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

function DeckBuilderBody({ draftedCards, existingRosterName, rosterId, initialDepthOrder, initialPlaysOrder, initialPlayAssignments, initialArchetypes, sessionId, gameMode, podAverageIdentity, readOnly = false, embedOverride }: DeckBuilderProps) {
  const router = useRouter();
  const toast = useToast();

  // plan_mobile_native_feel D3: nothing here saves until "Save" is pressed (and that
  // requires a complete roster — see `isComplete` below), so a back press can only warn.
  // Covers both entry points that mount this component: the standalone `/roster/[id]`
  // page and DraftRoom's post-draft deckbuilding phase. Off for read-only viewing and
  // the 82:0 front office's embedded editor (its own panel owns dismissal there).
  const [showBackGuard, setShowBackGuard] = useState(false);

  // Stable id for a freshly-drafted roster (no `rosterId` prop yet): computed once per
  // mount so repeated/concurrent saves in this DeckBuilder session upsert the same
  // IndexedDB row instead of minting a new "roster_<timestamp>" each time (which showed
  // up as duplicate entries in /rosters, only one of which ever got a ChallengeRun).
  const [generatedRosterId] = useState(() => rosterId || `roster_${Date.now()}`);
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const { goBack } = useAndroidBackGuard({
    enabled: !readOnly && !embedOverride,
    onBackAttempt: () => setShowBackGuard(true),
  });

  // plan_challenge_mode D1: `gameMode` arrives as a prop right after a fresh draft
  // (DraftRoom knows it already); editing a saved roster from `/roster/[id]` doesn't
  // pass it, so it's fetched here from the session it was drafted from — only when
  // the prop is absent, so this never fights a prop that's already known. Missing
  // either way means a tournament roster (session predates the 82:0 Challenge).
  const [fetchedGameMode, setFetchedGameMode] = useState<'tournament' | 'challenge' | null>(null);
  useEffect(() => {
    if (gameMode || !sessionId) return;
    let cancelled = false;
    getGameStore().getDraftSession(sessionId).then(session => {
      if (!cancelled) setFetchedGameMode(session?.gameMode ?? 'tournament');
    });
    return () => { cancelled = true; };
  }, [gameMode, sessionId]);
  const resolvedGameMode: 'tournament' | 'challenge' = gameMode ?? fetchedGameMode ?? 'tournament';
  const isChallenge = resolvedGameMode === 'challenge';

  /** Position filter chips (All / G / F / C) above the Roster list. Natural fit only. */
  const matchesPosFilter = (rawPos: string, filter: PosFilter): boolean => {
    if (filter === 'All') return true;
    if (filter === 'G') return canPlaceAt(rawPos, 'PG', false) || canPlaceAt(rawPos, 'SG', false);
    if (filter === 'F') return canPlaceAt(rawPos, 'SF', false) || canPlaceAt(rawPos, 'PF', false);
    return canPlaceAt(rawPos, 'C', false);
  };

  // Seeded ONCE, at mount, from the props (every caller mounts the builder only after its
  // roster has loaded; remount with a `key` to load a different one). Seeding from an
  // effect raced the activePlays -> playAssignments sync effect below, which still saw
  // three empty slots on mount and wiped every saved role assignment.
  const [initial] = useState(() => initBuilderState(draftedCards, {
    depthOrder: initialDepthOrder,
    playsOrder: initialPlaysOrder,
    playAssignments: initialPlayAssignments,
  }));
  const [depthChart, setDepthChart] = useState<Record<string, PlayerCardData[]>>(initial.depthChart);
  const [activePlays, setActivePlays] = useState<(Play | null)[]>(initial.activePlays);
  const [rosterPlayers, setRosterPlayers] = useState<PlayerCardData[]>(() => [...initial.rosterPlayers].sort(sortRosterPlayers));
  const [rosterPlays, setRosterPlays] = useState<Play[]>(initial.rosterPlays);
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
  // Active-play slot (index) whose Remove/Swap popover is open (deckbuilder_ux D3).
  const [openPlaySlotPopover, setOpenPlaySlotPopover] = useState<number | null>(null);

  // Play-role assignment state: cardId -> assignment (roleId -> playerId). Kept in
  // sync with activePlays by the effect below. `assigning` is the role currently
  // being filled (selected via a role row click); mutually exclusive with the
  // player placement selection above.
  const [playAssignments, setPlayAssignments] = useState<Record<string, PlayAssignment>>(initial.playAssignments);
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
  // ── deckbuilder_ux D4: container-query tiers (compact < 960, regular < 1440,
  // wide >= 1440) drive whether the Plays/Roster sidebars can dock side by side.
  // Measured via ResizeObserver (not viewport media queries) on the builder's own
  // `@container` shell so the tiers match whatever the shell is actually given.
  const shellRef = useRef<HTMLDivElement>(null);
  // Basic-play tiles are draggable (pointer devices) AND clickable (touch, keyboard);
  // this guards the click path from also firing right after a genuine drag+drop.
  const basicPlayDragRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(1600);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tier: 'compact' | 'regular' | 'wide' = containerWidth < 960 ? 'compact' : containerWidth < 1440 ? 'regular' : 'wide';

  const [rosterDocked, setRosterDockedState] = useState(false);
  const [playsDocked, setPlaysDockedState] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRosterDockedState(readStoredDock(ROSTER_DOCK_KEY, false));
    setPlaysDockedState(readStoredDock(PLAYS_DOCK_KEY, true));
  }, []);
  // Compact tier has no docked/strip state at all — both sidebars are overlay
  // drawers, closed by default regardless of the docked toggle above.
  const [rosterDrawerOpen, setRosterDrawerOpen] = useState(false);
  const [playsDrawerOpen, setPlaysDrawerOpen] = useState(false);

  /** Both sidebars may dock at once in every docked tier (owner review 2026-09-15:
   *  dragging a play from the roster into a slot needs both open; the earlier
   *  "< 1440 collapses the other" rule is withdrawn). The depth chart scales to
   *  whatever width is left. */
  const dockRoster = (next: boolean) => {
    setRosterDockedState(next);
    writeStoredDock(ROSTER_DOCK_KEY, next);
  };
  const dockPlays = (next: boolean) => {
    setPlaysDockedState(next);
    writeStoredDock(PLAYS_DOCK_KEY, next);
  };

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDestination, setSaveDestination] = useState<'rosters' | 'season'>('rosters');
  const [rosterName, setRosterName] = useState(existingRosterName || `Draft Roster - ${new Date().toLocaleString()}`);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        setOpenPlaySlotPopover(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const clearSelection = () => {
    setSelectedRosterPlayer(null);
    setAssigning(null);
    setOpenSlotPopover(null);
    setOpenPlaySlotPopover(null);
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

  /** The move already happened — the toast just offers 5s of regret (D15). Kept only for
   *  the roster-clear bulk action (plan_mobile_native_feel D7): per-move place/swap/remove
   *  toasts were dropped since those are two-way drags the user can trivially reverse by
   *  dragging the card back, and on mobile the toast covered the roster/depth chart. */
  const toastUndo = (message: string, snap: BuilderSnapshot) => {
    toast.show(message, { actionLabel: 'Undo', durationMs: 5000, onAction: () => restoreSnapshot(snap) });
  };

  /** Bench players + their raw positions, in the shape `placePlayerInSlot` needs. */
  const depthChartEngineState = (): DepthChartState => ({
    chart: toIdChart(depthChart),
    benchIds: rosterPlayers.map(p => p.id),
    positionsById: Object.fromEntries(rosterPlayers.map(p => [p.id, effectivePosition(p.player.position, p.traits)])),
  });

  const placePlayerFailureMessage: Record<PlacePlayerFailureReason, string> = {
    ineligible: 'Not eligible for this position',
    occupied: 'That slot is already filled',
    unknown: 'Cannot place there',
  };

  /** Move a Roster (bench) player onto the chart. `slotIndex` defaults to the
   *  column's next open slot — the only slot `DepthSlotColumn` ever lets a
   *  click or drop target (plan deckbuilder_ux, D3/T2: shares `placePlayerInSlot`
   *  with the drag path below so click and drag can never disagree). Engine
   *  refusals become error toasts. */
  const placeFromRoster = (player: PlayerCardData, column: DepthColumn, slotIndex?: number) => {
    const idx = slotIndex ?? (depthChart[column]?.length ?? 0);
    const result = placePlayerInSlot(depthChartEngineState(), player.id, column, idx);
    if (!result.ok) {
      toast.show(placePlayerFailureMessage[result.reason], { tone: 'error' });
      return;
    }
    setDepthChart(fromIdChart(result.next.chart));
    setRosterPlayers(prev => prev.filter(p => p.id !== player.id));
    setSelectedRosterPlayer(null);
    setOpenSlotPopover(null);
  };

  /** Move a player already on the chart to another column / slot. */
  const moveOnChart = (player: PlayerCardData, column: DepthColumn, slotIndex?: number) => {
    const result = moveWithinChart(toIdChart(depthChart), player.id, effectivePosition(player.player.position, player.traits), column, slotIndex);
    if (!result.ok) {
      toast.show(result.reason ?? 'Cannot place there', { tone: 'error' });
      return;
    }
    setDepthChart(fromIdChart(result.chart));
    setOpenSlotPopover(null);
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

  /** Every play the UI currently knows about (active + bench), in the shape
   *  `assignPlayToFirstOpenSlot` needs. No `slotSides` — the builder has no
   *  zoned play slots today, so every empty slot accepts any side. */
  const playSlotsState = (): PlaySlotsState => ({
    activeSlots: activePlays.map(p => (p ? p.id : null)),
    playsById: Object.fromEntries(
      [...activePlays.filter((p): p is Play => p !== null), ...rosterPlays]
        .map(p => [p.id, { id: p.id, side: PLAYBOOK[getPlaybookId(p)]?.side ?? 'offense' }]),
    ),
  });

  const assignPlayFailureMessage = (play: Play, reason: AssignPlayFailureReason): string => {
    switch (reason) {
      case 'full': return 'All play slots are full';
      case 'wrong-side': return `${play.name} has no open slot for its side`;
      case 'duplicate': return `${play.name} is already active`;
      default: return 'Cannot activate that play';
    }
  };

  /** Click handling for Play cards: click a filled slot opens Remove/Swap
   *  (deckbuilder_ux D3); click a Roster play fills the first open slot via
   *  the shared `assignPlayToFirstOpenSlot` rule (same one `handleDropOnZone`'s
   *  ActivePlay drop target keeps using for its own, index-targeted drop). */
  const handlePlayClick = (play: Play, currentZone: string) => {
    setAssigning(null);
    if (currentZone.startsWith('ActivePlay')) {
      removeCardFromSource(play.id, currentZone);
      if (!play.id.startsWith('basic-')) {
        setRosterPlays(prev => [...prev, play]);
      }
      return;
    }
    const result = assignPlayToFirstOpenSlot(playSlotsState(), play.id);
    if (!result.ok) {
      toast.show(assignPlayFailureMessage(play, result.reason), { tone: 'error' });
      return;
    }
    removeCardFromSource(play.id, currentZone);
    setActivePlays(prev => {
      const next = [...prev];
      next[result.slotIndex] = play;
      return next;
    });
  };

  /** Tap/click path for the Basic Offense / Basic Defense tiles (no drag-and-drop
   *  on touch devices). Builds the same synthetic Play `handleDragStart` builds for
   *  these tiles, then goes through the shared `assignPlayToFirstOpenSlot` rule —
   *  same first-open-slot placement and "slots full" toast as `handlePlayClick`
   *  uses for a Roster play. The synthetic id is minted fresh per click, so it
   *  isn't in `playSlotsState()`'s `playsById` yet; it's added inline. */
  const handleBasicPlayClick = (kind: 'offense' | 'defense') => {
    const play: Play = {
      type: 'Play',
      id: `basic-${kind}-${Date.now()}`,
      name: kind === 'offense' ? 'Basic Offense' : 'Basic Defense',
      rarity: 'Common',
      playCategory: 'basic',
      mechanicText: kind === 'offense' ? 'Minor boost to all Offensive Badges.' : 'Minor boost to all Defensive Badges.',
      badges: [],
      imageUrl: '',
    } as Play;
    const state = playSlotsState();
    state.playsById[play.id] = { id: play.id, side: kind };
    const result = assignPlayToFirstOpenSlot(state, play.id);
    if (!result.ok) {
      toast.show(assignPlayFailureMessage(play, result.reason), { tone: 'error' });
      return;
    }
    setActivePlays(prev => {
      const next = [...prev];
      next[result.slotIndex] = play;
      return next;
    });
  };

  /** Swap a bench play into an already-occupied active-play slot (the placed
   *  play's Remove/Swap popover, opened by clicking the slot). The displaced
   *  play returns to the Roster, same as a drag-swap onto that slot. */
  const handlePlaySwap = (slotIndex: number, playId: string) => {
    const incoming = rosterPlays.find(p => p.id === playId);
    if (!incoming) return;
    setRosterPlays(prev => prev.filter(p => p.id !== playId));
    setActivePlays(prev => {
      const next = [...prev];
      const existing = next[slotIndex];
      if (existing && !existing.id.startsWith('basic-')) {
        setRosterPlays(g => [...g, existing]);
      }
      next[slotIndex] = incoming;
      return next;
    });
    setOpenPlaySlotPopover(null);
  };

  const handleRosterPlayerClick = (player: PlayerCardData) => {
    setAssigning(null);
    setOpenSlotPopover(null);
    setSelectedRosterPlayer(prev => (prev?.id === player.id ? null : player));
    // Compact tier (D4): picking a player closes the drawer so the depth chart
    // underneath — now showing the eligible-slot highlight — is visible again.
    setRosterDrawerOpen(false);
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
      placeFromRoster(selectedRosterPlayer, column, slotIndex);
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
   *  them — no `confirm`, dragging the player back onto the chart reverses it. */
  const sendPlacedToRoster = (player: PlayerCardData) => {
    const heldRoles = rolesByPlayer.get(player.id) ?? [];
    if (heldRoles.length > 0) removePlayerRoles(player.id);
    setDepthChart(fromIdChart(removeFromChart(toIdChart(depthChart), player.id)));
    setRosterPlayers(prev => [...prev, player].sort(sortRosterPlayers));
    setOpenSlotPopover(null);
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
  const activePlaysCount = activePlays.filter(p => p !== null).length;
  const validActivePlays = activePlays.filter(p => p !== null) as Play[];
  const identity = calcRosterIdentity(depthChart);
  const shotDiet = calcRosterShotDiet(depthChart, validActivePlays);
  const allPlayers = Object.values(depthChart).flat();
  // Badge totals across the current depth chart (starters + bench), recomputed
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

  /** Plays-sidebar strip dot state (deckbuilder_ux artboard g): empty slot, needs
   *  more roles filled, or every role filled. */
  const playSlotDot = (slotIndex: number): 'ready' | 'warn' | 'empty' => {
    const play = activePlays[slotIndex];
    if (!play) return 'empty';
    const status = playStatusByCardId.get(play.id);
    if (!status) return 'empty';
    return status.roles.every(r => r.filled) ? 'ready' : 'warn';
  };

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

  const filteredRosterPlayers = rosterPlayers.filter(p => matchesPosFilter(effectivePosition(p.player.position, p.traits), posFilter));

  // The player whose placement the depth chart is currently previewing: a selected
  // bench row, or the card being dragged.
  const pendingPlayer: PlayerCardData | null =
    selectedRosterPlayer ??
    (draggedItem?.card.type === 'Player' ? (draggedItem.card as PlayerCardData) : null);

  /** Roster candidates eligible for a column — feeds an empty slot's AssignPopover. */
  const slotCandidates = (column: DepthColumn) =>
    rosterPlayers.filter(p => canPlaceAt(effectivePosition(p.player.position, p.traits), column));

  /** D19: "Save" lands on `/rosters`; "Save & play season" jumps straight into the
   *  season for this draft session (only offered when there IS a session). */
  const handleSaveRoster = async (destination: 'rosters' | 'season' = 'rosters') => {
    if (readOnly || isSavingRoster) return;
    try {
      setIsSavingRoster(true);
      setSaveError(null);

      const saveId = rosterId || generatedRosterId;
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

      if (embedOverride) {
        embedOverride.onSave(newRosterData);
        return;
      }

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
        if (isChallenge) {
          router.push(`/challenge/${encodeURIComponent(saveId)}`);
        } else {
          router.push(`/season?rosterId=${encodeURIComponent(saveId)}&sessionId=${encodeURIComponent(sessionId)}`);
        }
      } else {
        router.push('/rosters');
      }
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to save roster. Please try again.');
      }
    } finally {
      setIsSavingRoster(false);
    }
  };

  // ── Plays sidebar body: the three active-play slots (deckbuilder_ux artboard g).
  //    Shared between the docked panel and the compact-tier drawer. ──────────────
  const renderPlaySlots = () => (
    <>
      {[0, 1, 2].map(slotIndex => {
        const play = activePlays[slotIndex];
        const zoneId = `ActivePlay-${slotIndex}`;
        const roleStatus = play ? playStatusByCardId.get(play.id) : undefined;
        const selectedRoleId = play && assigning?.cardId === play.id ? assigning.roleId : undefined;
        if (!play || !roleStatus) {
          // No zoned play slots (any empty slot accepts either side) — the empty
          // tile's side hint points at whichever side still has budget room.
          const side: 'offense' | 'defense' =
            playbookStatus.offenseAllocation < playbookStatus.offenseBudget ? 'offense' : 'defense';
          return (
            <div key={slotIndex} onDragOver={handleDragOver} onDrop={(e) => handleDropOnZone(e, zoneId)}>
              <PlayTileEmptySlot
                side={side}
                className={draggedItem?.card.type === 'Play' ? 'border-info bg-info-soft' : undefined}
              />
            </div>
          );
        }
        return (
          <div
            key={slotIndex}
            className="relative w-full"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnZone(e, zoneId)}
            // A placed play's own clickable bits (role rows, the Remove X) stop
            // propagation, so a click that reaches here is a click on the tile
            // itself — open Remove/Swap (deckbuilder_ux D3) instead of guessing
            // which role the click meant.
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRosterPlayer(null);
              setAssigning(null);
              setOpenSlotPopover(null);
              setOpenPlaySlotPopover(prev => (prev === slotIndex ? null : slotIndex));
            }}
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
            {openPlaySlotPopover === slotIndex && (
              <PlaySwapPopover
                candidates={rosterPlays}
                onRemove={() => { handlePlayClick(play, zoneId); setOpenPlaySlotPopover(null); }}
                onSwap={(playId) => handlePlaySwap(slotIndex, playId)}
              />
            )}
          </div>
        );
      })}
    </>
  );

  const playsBudgetLine = `Off ${Math.round(playbookStatus.offenseAllocation * 100)}/${Math.round(playbookStatus.offenseBudget * 100)} · Def ${Math.round(playbookStatus.defenseAllocation * 100)}/${Math.round(playbookStatus.defenseBudget * 100)}`;

  // ── Roster sidebar header + body: bench Players/Plays lanes (deckbuilder_ux
  //    artboard e). Shared between the docked panel and the compact-tier drawer. ──
  const renderRosterHeader = (onCollapse: () => void, icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-2 min-h-control shrink-0">
      <h2 className="font-display text-2xl uppercase tracking-wide text-ink-strong shrink-0">Roster</h2>
      <span className="text-xs font-bold uppercase tracking-widest text-ink-subtle truncate">
        {rosterPlayers.length} players &middot; {rosterPlays.length} plays
      </span>
      <div className="flex-1" />
      <IconButton label={label} variant="ghost" onClick={(e) => { e.stopPropagation(); onCollapse(); }}>
        {icon}
      </IconButton>
    </div>
  );

  const renderRosterBody = () => (
    <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-0">
      {/* Players lane */}
      <div
        className={`border rounded-control overflow-hidden transition-colors ${draggedItem?.card.type === 'Player' ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised'}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDropOnZone(e, 'RosterPlayers')}
      >
        <Button
          variant="ghost"
          size="md"
          onClick={(e) => { e.stopPropagation(); setIsPlayersOpen(!isPlayersOpen); }}
          className="w-full h-auto min-h-control justify-between rounded-none bg-surface-sunken p-3 font-normal normal-case tracking-normal hover:bg-surface-muted"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Players ({rosterPlayers.length}) &middot; click to place</h3>
          {isPlayersOpen ? <ChevronDown className="w-4 h-4 text-ink-muted" /> : <ChevronRight className="w-4 h-4 text-ink-muted" />}
        </Button>

        <AnimatePresence>
          {isPlayersOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-3 pt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                {(['All', 'G', 'F', 'C'] as const).map(f => (
                  <Button
                    key={f}
                    variant={posFilter === f ? 'primary' : 'secondary'}
                    size="md"
                    onClick={() => setPosFilter(f)}
                    className={`h-auto min-h-control min-w-control px-2 py-0.5 text-xs ${posFilter === f ? 'bg-surface-inverse border-surface-inverse text-ink-inverse hover:bg-surface-inverse' : 'bg-surface-raised text-ink-muted border-line hover:border-line-strong'}`}
                  >
                    {f}
                  </Button>
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
                {filteredRosterPlayers.length === 0 && <div className="text-center text-xs text-ink-muted italic py-4 pointer-events-none">No players match this filter.</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Plays lane — PlayTile's 'list' variant (deckbuilder_ux D5), not PlayCard. */}
      <div
        className={`border rounded-control overflow-hidden transition-colors ${draggedItem?.card.type === 'Play' ? 'border-info bg-info-soft' : 'border-line bg-surface-raised'}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDropOnZone(e, 'RosterPlays')}
      >
        <Button
          variant="ghost"
          size="md"
          onClick={(e) => { e.stopPropagation(); setIsPlaysOpen(!isPlaysOpen); }}
          className="w-full h-auto min-h-control justify-between rounded-none bg-surface-sunken p-3 font-normal normal-case tracking-normal hover:bg-surface-muted"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Plays ({rosterPlays.length}) &middot; click to add</h3>
          {isPlaysOpen ? <ChevronDown className="w-4 h-4 text-ink-muted" /> : <ChevronRight className="w-4 h-4 text-ink-muted" />}
        </Button>

        <AnimatePresence>
          {isPlaysOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="p-3 flex flex-col gap-2 min-h-[80px]">
                {rosterPlays.map((play, idx) => (
                  <div
                    key={`${play.id}-${idx}`}
                    draggable
                    onDragStart={(e: React.DragEvent) => handleDragStart(e, play, 'RosterPlays')}
                    // Click lives on PlayTile, not here: its own Add button stops
                    // propagation before calling onClick, so a wrapper handler never
                    // sees it — and a row click would otherwise fire twice.
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab active:cursor-grabbing w-full"
                  >
                    <PlayTile variant="list" play={play as Play} onClick={() => handlePlayClick(play, 'RosterPlays')} />
                  </div>
                ))}
                {rosterPlays.length === 0 && <div className="text-center text-xs text-ink-muted italic py-4 pointer-events-none">No plays on bench.</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Basic Plays */}
      <div className="shrink-0 pt-2 border-t border-line">
        <h3 className="text-sm font-bold uppercase tracking-widest text-ink-muted mb-3">Basic Plays</h3>
        <div className="flex gap-2">
          <div
            role="button"
            tabIndex={0}
            aria-label="Add Basic Offense to the first open play slot"
            draggable
            onDragStart={(e) => {
              basicPlayDragRef.current = true;
              handleDragStart(e, { type: 'Play', id: `basic-offense-${Date.now()}`, name: 'Basic Offense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Offensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays');
            }}
            onDragEnd={() => { setTimeout(() => { basicPlayDragRef.current = false; }, 0); }}
            onClick={() => {
              if (basicPlayDragRef.current) return;
              handleBasicPlayClick('offense');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleBasicPlayClick('offense');
              }
            }}
            title="Adds a basic play card with no requirements"
            className="flex-1 min-h-control bg-surface-sunken border border-line hover:border-accent hover:bg-surface-muted transition-colors p-2.5 rounded-control flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
          >
            <span className="text-accent font-black pointer-events-none">+</span>
            <span className="text-ink-muted font-bold uppercase text-xs group-hover:text-ink pointer-events-none">Offense</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label="Add Basic Defense to the first open play slot"
            draggable
            onDragStart={(e) => {
              basicPlayDragRef.current = true;
              handleDragStart(e, { type: 'Play', id: `basic-defense-${Date.now()}`, name: 'Basic Defense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Defensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays');
            }}
            onDragEnd={() => { setTimeout(() => { basicPlayDragRef.current = false; }, 0); }}
            onClick={() => {
              if (basicPlayDragRef.current) return;
              handleBasicPlayClick('defense');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleBasicPlayClick('defense');
              }
            }}
            title="Adds a basic play card with no requirements"
            className="flex-1 min-h-control bg-surface-sunken border border-line hover:border-info hover:bg-surface-muted transition-colors p-2.5 rounded-control flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
          >
            <span className="text-info font-black pointer-events-none">+</span>
            <span className="text-ink-muted font-bold uppercase text-xs group-hover:text-ink pointer-events-none">Defense</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={shellRef} className="@container h-dvh-z text-ink flex flex-col overflow-hidden relative bg-surface" onClick={clearSelection}>
      <BackGuardSheet
        open={showBackGuard}
        message="Changes to this roster aren't saved automatically — leaving now loses them."
        onCancel={() => setShowBackGuard(false)}
        onLeave={goBack}
      />
      {/* Hidden bench-sized HTML5 drag image (D24) — see handleDragStart. */}
      <div
        ref={dragGhostRef}
        className="fixed -left-[999px] -top-[999px] w-[160px] h-9 bg-surface-raised border border-line-strong rounded-control shadow flex items-center overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div ref={dragGhostBarRef} className="h-full w-1.5 shrink-0" />
        <div className="w-8 h-8 shrink-0 mx-1 rounded-full overflow-hidden bg-surface-sunken">
          <img ref={dragGhostImgRef} alt="" className="w-full h-full object-cover object-top" />
        </div>
        <div ref={dragGhostNameRef} className="flex-1 min-w-0 px-1 text-xs font-bold uppercase truncate text-ink" />
      </div>
      <TopKPIBand
        identity={identity}
        shotDiet={shotDiet}
        bonuses={bonuses}
        depthChart={depthChart}
        average={podAverageIdentity}
        starterIds={starterIds}
        archetypes={archetypes}
        onArchetypesChange={setArchetypes}
        playsAssigned={activePlays.filter(Boolean).length}
        playsTarget={3}
        actions={{
          onClear: () => setShowClearConfirm(true),
          onSave: () => {
            // Embedded (front office, T7): no roster-naming step — commit straight
            // through to embedOverride.onSave, which snapshots rather than persists.
            if (embedOverride) { handleSaveRoster('rosters'); return; }
            setSaveDestination('rosters'); setShowSaveModal(true);
          },
          onSaveAndPlay: () => { setSaveDestination('season'); setShowSaveModal(true); },
          canSave: isComplete && !readOnly,
          canPlay: isComplete && !readOnly && !!sessionId,
          disabledReason: isComplete ? undefined : statusText,
          saveAndPlayLabel: isChallenge ? 'Save & start 82:0' : 'Save & play season',
          hideSaveAndPlay: !!embedOverride,
        }}
        challengeBadge={isChallenge}
      />
      {saveError && (
        <div className="bg-danger-soft border-b border-danger-line px-4 py-3">
          <p className="text-sm text-danger font-semibold">{saveError}</p>
        </div>
      )}
      {readOnly && (
        <div className="bg-info-soft border-b border-info px-4 py-3">
          <p className="text-sm text-info font-semibold">This season is complete — the roster is locked and view-only.</p>
        </div>
      )}
      {/* deckbuilder_ux D4: Plays and Roster are dockable sidebars, measured off the
          shell's own width (not viewport media queries) via the ResizeObserver above.
          compact (<960): both are overlay drawers, opened from the depth-chart title
          row. regular and wide (>= 960): each sidebar docks or collapses to its
          48px strip independently; both may be open at once. */}
      <div className={`flex-1 p-4 flex flex-col @min-[960px]:flex-row gap-3 overflow-hidden relative ${readOnly ? 'pointer-events-none opacity-75' : ''}`}>

        {/* PLAYS sidebar (artboard g) — docked panel or 48px strip; compact tier
            renders neither (it opens as a drawer, see below). */}
        {tier !== 'compact' && (playsDocked ? (
          <Panel variant="raised" padding="none" className="w-full @min-[960px]:w-[280px] shrink-0 flex flex-col gap-2 p-2 @min-[960px]:p-3 min-h-0">
            <div className="flex items-center gap-2 min-h-control shrink-0">
              <IconButton label="Collapse plays" variant="ghost" onClick={(e) => { e.stopPropagation(); dockPlays(false); }} className="-ml-2">
                <ChevronLeft className="w-4 h-4" />
              </IconButton>
              <h2 className="font-display text-2xl uppercase tracking-wide text-ink-strong shrink-0">Plays</h2>
              <span className="text-xs font-bold uppercase tracking-widest text-ink-subtle truncate">{playsBudgetLine}</span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto pr-0.5 pb-1 flex-1 min-h-0">
              {renderPlaySlots()}
            </div>
          </Panel>
        ) : (
          <Panel variant="raised" padding="none" className="w-12 shrink-0 flex flex-col items-center gap-3 py-3">
            <IconButton label="Expand plays" variant="ghost" onClick={(e) => { e.stopPropagation(); dockPlays(true); }}>
              <ChevronRight className="w-4 h-4" />
            </IconButton>
            <span className="text-xs font-bold italic uppercase tracking-wider text-ink-muted [writing-mode:vertical-rl]">Plays</span>
            <div className="flex-1" />
            <div className="flex flex-col gap-1.5 items-center">
              {[0, 1, 2].map(i => {
                const dot = playSlotDot(i);
                const play = activePlays[i];
                return (
                  <span
                    key={i}
                    title={play ? `${play.name} · ${dot === 'ready' ? 'ready' : 'needs roles'}` : `Slot ${i + 1} · empty`}
                    className={`w-3 h-3 rounded-full shrink-0 box-border ${
                      dot === 'ready' ? 'bg-positive' : dot === 'warn' ? 'bg-warn' : 'border-2 border-dashed border-ink-subtle'
                    }`}
                  />
                );
              })}
            </div>
            <span
              className="w-8 h-8 mt-1 rounded-full bg-surface-sunken border border-line flex items-center justify-center text-xs font-black text-ink-strong shrink-0"
              title={`${activePlaysCount} of 3 plays`}
            >
              {activePlaysCount}
            </span>
          </Panel>
        ))}

        {/* DEPTH CHART (artboard d) — no more validity row or actions, both live in
            the band now. */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-2">
          <div className="flex items-center gap-3 min-h-control shrink-0">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-2xl uppercase tracking-wide text-ink-strong">Depth chart</h2>
              <span className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Starters at top</span>
            </div>
            <div className="flex-1" />
            {/* Compact tier has no docked sidebars to click into — these two open
                the equivalent drawer instead (not in the signed artboards, which
                only show the >=960 tiers; a compact-only affordance is needed). */}
            {tier === 'compact' && (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <IconButton label={`Plays, ${activePlaysCount} of 3`} variant="raised" onClick={() => setPlaysDrawerOpen(true)}>
                  <span className="text-xs font-black">{activePlaysCount}</span>
                </IconButton>
                <IconButton label={`Roster, ${rosterPlayers.length} players`} variant="raised" onClick={() => setRosterDrawerOpen(true)}>
                  <span className="text-xs font-black">{rosterPlayers.length}</span>
                </IconButton>
              </div>
            )}
          </div>
          <div
            // One layout for every tier: columns share the width but never drop below
            // 148px — when both sidebars are docked and the chart is squeezed (53px
            // columns at 1024 in the owner's review) it snap-scrolls sideways instead.
            className="flex-1 min-h-0 flex gap-2 overflow-x-auto overflow-y-auto snap-x snap-mandatory pb-2"
          >
            {DEPTH_COLUMNS.map(col => (
              <DepthSlotColumn
                key={col}
                column={col}
                players={depthChart[col] ?? []}
                selectionActive={!!pendingPlayer}
                pendingFit={pendingPlayer ? positionFit(effectivePosition(pendingPlayer.player.position, pendingPlayer.traits), col) : undefined}
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
                className="flex-1 min-w-[148px] snap-start"
              />
            ))}
          </div>
        </div>

        {/* ROSTER sidebar (artboard e) — docked panel or 48px strip; compact tier
            renders neither (it opens as a drawer, see below). */}
        {tier !== 'compact' && (rosterDocked ? (
          <Panel variant="raised" padding="none" className="w-full @min-[960px]:w-[clamp(280px,24cqw,400px)] shrink-0 flex flex-col gap-3 p-3 min-h-0">
            {renderRosterHeader(() => dockRoster(false), <ChevronRight className="w-4 h-4" />, 'Collapse roster')}
            {renderRosterBody()}
          </Panel>
        ) : (
          <Panel variant="raised" padding="none" className="w-12 shrink-0 flex flex-col items-center gap-3 py-3">
            <IconButton label="Expand roster" variant="ghost" onClick={(e) => { e.stopPropagation(); dockRoster(true); }}>
              <ChevronLeft className="w-4 h-4" />
            </IconButton>
            <span className="text-xs font-bold italic uppercase tracking-wider text-ink-muted [writing-mode:vertical-rl]">Roster</span>
            <div className="flex-1" />
            <span className="w-8 h-8 rounded-full bg-surface-sunken border border-line flex items-center justify-center text-xs font-black text-ink-strong" title={`${rosterPlayers.length} players`}>
              {rosterPlayers.length}
            </span>
            <span className="w-8 h-8 rounded-full bg-surface-sunken border border-line flex items-center justify-center text-xs font-black text-ink-strong" title={`${rosterPlays.length} plays`}>
              {rosterPlays.length}
            </span>
          </Panel>
        ))}
      </div>

      {/* Compact-tier drawers (D4): fixed, right-anchored, scrim behind. The depth
          chart stays visible (and interactive) underneath. */}
      {tier === 'compact' && playsDrawerOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" onClick={(e) => { e.stopPropagation(); setPlaysDrawerOpen(false); }}>
          <div className="absolute inset-0 bg-surface-scrim" aria-hidden="true" />
          <Panel variant="raised" padding="none" className="relative w-80 max-w-[85vw] h-full flex flex-col gap-2 p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 min-h-control shrink-0">
              <h2 className="font-display text-2xl uppercase tracking-wide text-ink-strong flex-1">Plays</h2>
              <IconButton label="Close" variant="ghost" onClick={() => setPlaysDrawerOpen(false)}>
                <X className="w-4 h-4" />
              </IconButton>
            </div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-subtle shrink-0">{playsBudgetLine}</div>
            <div className="flex flex-col gap-2 overflow-y-auto pb-1 flex-1 min-h-0">
              {renderPlaySlots()}
            </div>
          </Panel>
        </div>
      )}
      {tier === 'compact' && rosterDrawerOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" onClick={(e) => { e.stopPropagation(); setRosterDrawerOpen(false); }}>
          <div className="absolute inset-0 bg-surface-scrim" aria-hidden="true" />
          <Panel variant="raised" padding="none" className="relative w-80 max-w-[85vw] h-full flex flex-col gap-3 p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {renderRosterHeader(() => setRosterDrawerOpen(false), <X className="w-4 h-4" />, 'Close')}
            {renderRosterBody()}
          </Panel>
        </div>
      )}

      {/* Save Modal */}
      <Overlay open={showSaveModal} onClose={() => setShowSaveModal(false)} labelledBy="save-roster-heading">
        <div className="p-6" onClick={(e) => e.stopPropagation()}>
          <h2 id="save-roster-heading" className="text-2xl font-bold uppercase text-ink-inverse mb-2">Save Roster</h2>
          <p className="text-ink-inverse-muted text-sm mb-6">Give your active roster a name. You can edit this later from the My Rosters menu.</p>

          <div className="mb-6">
            <label className="block text-xs font-bold uppercase tracking-widest text-ink-inverse-muted mb-2">Roster Name</label>
            <input
              type="text"
              value={rosterName}
              onChange={e => setRosterName(e.target.value)}
              className="w-full h-control bg-surface-inverse-deep border border-line-inverse rounded-control px-4 text-ink-inverse focus:outline-none focus:border-line-strong transition-colors"
              placeholder="e.g. 2025 Championship Run"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setShowSaveModal(false)}
              className="text-ink-inverse-muted hover:text-ink-inverse hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => handleSaveRoster(saveDestination)}
              disabled={!rosterName.trim() || isSavingRoster}
            >
              {saveDestination === 'season' ? (isChallenge ? 'Save & start 82:0' : 'Save & play season') : 'Save to Collection'}
            </Button>
          </div>
        </div>
      </Overlay>

      {/* Clear Confirmation Modal */}
      <Overlay open={showClearConfirm} onClose={() => setShowClearConfirm(false)} size="sm" labelledBy="clear-roster-heading">
        <div className="p-6" onClick={(e) => e.stopPropagation()}>
          <h2 id="clear-roster-heading" className="text-xl font-bold uppercase text-ink-inverse mb-2">Clear Roster?</h2>
          <p className="text-ink-inverse-muted text-sm mb-6">This sends every player and play back to the Roster and cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setShowClearConfirm(false)}
              className="text-ink-inverse-muted hover:text-ink-inverse hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={handleClearRoster}>
              Clear Roster
            </Button>
          </div>
        </div>
      </Overlay>
    </div>
  );
}
