'use client';

import { useState, useEffect, useRef } from 'react';
import { DraftCard, Play, PlayerCardData, getPosColors } from './PlayerCard';
import { useRouter } from 'next/navigation';
import { calcRosterIdentity, calcRosterShotDiet } from '../engine/rosterStats';
import type { RosterIdentity } from '../engine/rosterStats';
import type { PlayAssignment } from '../engine/playbook';
import type { ArchetypeSelection } from '../engine/archetypes';
import { TopKPIBand } from './TopKPIBand';
import { getGameStore } from '@/storage';
import { type SavedRoster } from '@/storage/types';
import { DEPTH_COLUMNS, canPlaceAt, positionFit, effectivePosition, type DepthColumn } from '@/engine/positions';
import { MAX_ROSTER, countPlayers } from '@/engine/depthChart';
import {
  type AssignPlayFailureReason,
  type BuilderState,
} from '@/engine/deckbuilder';
import { useRosterBuilder } from '@/hooks/useRosterBuilder';
import { useDockLayout } from '@/hooks/useDockLayout';
import { useBuilderPlaybook, toIdChart } from '@/hooks/useBuilderPlaybook';
import { useSaveRoster } from '@/hooks/useSaveRoster';
import { DepthSlotColumn } from './DepthSlotColumn';
import { RosterSidebarPanel, RosterSidebarDrawer, sortRosterPlayers, useRosterSidebarView, type RosterSidebarBodyProps } from './RosterSidebar';
import { PlaysSidebarPanel, PlaysSidebarDrawer, makeBasicPlay, type PlaySlotsProps } from './PlaysSidebar';
import { SaveRosterModal } from './SaveRosterModal';
import { ClearRosterModal } from './ClearRosterModal';
import { DragGhost } from './DragGhost';
import { placePlayerFailureMessage, moveFailureMessage, assignPlayFailureMessage } from '@/lib/deckBuilderMessages';
import { ToastProvider, useToast } from './Toast';
import { headshotThumb } from '@/lib/headshotThumb';
import { useAndroidBackGuard } from '@/hooks/useAndroidBackGuard';
import { BackGuardSheet } from './BackGuardSheet';
import { IconButton } from './ui/IconButton';

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

function DeckBuilderBody({ draftedCards, existingRosterName, rosterId, initialDepthOrder, initialPlaysOrder, initialPlayAssignments, initialArchetypes, sessionId, gameMode, podAverageIdentity, readOnly = false, embedOverride }: DeckBuilderProps) {
  const router = useRouter();
  const toast = useToast();

  // plan_mobile_native_feel D3: nothing here saves until "Save" is pressed (and that
  // requires a complete roster — see `isComplete` below), so a back press can only warn.
  // Covers both entry points that mount this component: the standalone `/roster/[id]`
  // page and DraftRoom's post-draft deckbuilding phase. Off for read-only viewing and
  // the 82:0 front office's embedded editor (its own panel owns dismissal there).
  const [showBackGuard, setShowBackGuard] = useState(false);
  const { goBack, exitTo } = useAndroidBackGuard({
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

  // Seeded ONCE, at mount, from the props (every caller mounts the builder only after its
  // roster has loaded; remount with a `key` to load a different one) — `useRosterBuilder`
  // owns the five slices that must change TOGETHER (depthChart/rosterPlayers/activePlays/
  // rosterPlays/playAssignments) through one pure `applyBuilderAction` transition per user
  // action. They used to be five separate `useState`s changed by ~15 handlers, two of which
  // reached into another setter's updater (a StrictMode double-append bug) plus a sync
  // effect that raced seeding on mount — see `engine/deckbuilder.ts`.
  const { state: builderState, dispatch } = useRosterBuilder({
    draftedCards,
    depthOrder: initialDepthOrder,
    playsOrder: initialPlaysOrder,
    playAssignments: initialPlayAssignments,
    sortRosterPlayers,
  });
  const { depthChart, activePlays, rosterPlayers, rosterPlays, playAssignments } = builderState;
  const [draggedItem, setDraggedItem] = useState<{ card: DraftCard, sourceZone: string, sourceIndex?: number } | null>(null);
  // Hidden bench-sized drag image (D24): imperatively updated (not React state) so it's
  // already correct by the time handleDragStart calls setDragImage synchronously.
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const dragGhostBarRef = useRef<HTMLDivElement>(null);
  const dragGhostImgRef = useRef<HTMLImageElement>(null);
  const dragGhostNameRef = useRef<HTMLDivElement>(null);

  // Click-to-place selection state
  const [selectedRosterPlayer, setSelectedRosterPlayer] = useState<PlayerCardData | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Empty depth slot whose AssignPopover is open (D14). Cleared by any selection.
  const [openSlotPopover, setOpenSlotPopover] = useState<{ column: DepthColumn; slot: number } | null>(null);
  // Active-play slot (index) whose Remove/Swap popover is open (deckbuilder_ux D3).
  const [openPlaySlotPopover, setOpenPlaySlotPopover] = useState<number | null>(null);

  // Play-role assignment state (cardId -> assignment) lives in `builderState.playAssignments`
  // above — the reducer keeps it in sync with `activePlays` itself (invariant 2), so there's
  // no separate seed or sync effect here any more. `assigning` is the role currently being
  // filled (selected via a role row click); mutually exclusive with the player placement
  // selection above.
  // Chosen roster identity (offense/defense or gold). Selections that fall below Online
  // when the roster changes are dropped automatically (locked plans are never shown).
  const [archetypes, setArchetypes] = useState<ArchetypeSelection>(initialArchetypes ?? {});
  const [assigning, setAssigning] = useState<{ cardId: string; roleId: string } | null>(null);

  // ── deckbuilder_ux D4: container-query tiers (compact < 960, regular < 1440,
  // wide >= 1440) drive whether the Plays/Roster sidebars can dock side by side.
  // Measured via ResizeObserver (not viewport media queries) on the builder's own
  // `@container` shell so the tiers match whatever the shell is actually given. ──
  const {
    shellRef, tier, rosterDocked, playsDocked, dockRoster, dockPlays,
    rosterDrawerOpen, setRosterDrawerOpen, playsDrawerOpen, setPlaysDrawerOpen,
  } = useDockLayout();

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

  /** The move already happened — the toast just offers 5s of regret (D15). Kept only for
   *  the roster-clear bulk action (plan_mobile_native_feel D7): per-move place/swap/remove
   *  toasts were dropped since those are two-way drags the user can trivially reverse by
   *  dragging the card back, and on mobile the toast covered the roster/depth chart. */
  const toastUndo = (message: string, snap: BuilderState) => {
    toast.show(message, {
      actionLabel: 'Undo',
      durationMs: 5000,
      onAction: () => { dispatch({ type: 'undo', snapshot: snap }); clearSelection(); },
    });
  };

  /** Move a Roster (bench) player onto the chart. `slotIndex` defaults to the
   *  column's next open slot — the only slot `DepthSlotColumn` ever lets a click or
   *  drop target (plan deckbuilder_ux, D3/T2: the `place` action shares `placePlayerInSlot`
   *  with the drag path below so click and drag can never disagree). Engine refusals
   *  become error toasts. */
  const placeFromRoster = (player: PlayerCardData, column: DepthColumn, slotIndex?: number) => {
    const error = dispatch({ type: 'place', playerId: player.id, column, slotIndex });
    if (error) {
      toast.show(placePlayerFailureMessage(error), { tone: 'error' });
      return;
    }
    setSelectedRosterPlayer(null);
    setOpenSlotPopover(null);
  };

  /** Move a player already on the chart to another column / slot. */
  const moveOnChart = (player: PlayerCardData, column: DepthColumn, slotIndex?: number) => {
    const error = dispatch({ type: 'move', playerId: player.id, column, slotIndex });
    if (error) {
      toast.show(moveFailureMessage(error), { tone: 'error' });
      return;
    }
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
      dragGhostImgRef.current.src = headshotThumb(card.player.id, 96);
      dragGhostNameRef.current.textContent = card.player.name;
      e.dataTransfer.setDragImage(dragGhostRef.current, 12, 18);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  /** Drop onto a NON-depth-chart zone (play slots, Roster lanes). Depth-chart
   *  drops go through `handleDropOnSlot` so they share the engine's rules. */
  const handleDropOnZone = (e: React.DragEvent, targetZone: string) => {
    e.preventDefault();
    if (!draggedItem) return;

    const { card, sourceZone } = draggedItem;
    setDraggedItem(null);

    if (card.type === 'Play' && !targetZone.includes('Play')) return;
    if (card.type === 'Player' && targetZone.includes('Play')) return;
    if (targetZone === sourceZone) return;

    if (card.type === 'Player') {
      // The two guards above leave exactly one reachable case for a Player card:
      // depth chart -> Roster. The engine removes it and clears any role it held
      // with it (invariant 3).
      if (DEPTH_COLUMNS.includes(sourceZone as DepthColumn) && targetZone === 'RosterPlayers') {
        dispatch({ type: 'sendToRoster', playerId: card.id });
      }
      return;
    }

    // card.type === 'Play' from here.
    const play = card as Play;

    if (targetZone === 'RosterPlays') {
      // Same-zone drops are already excluded above; the only other Play-card source
      // that can land here is an active slot (dragging a placed play back to the bench).
      if (sourceZone.startsWith('ActivePlay')) {
        dispatch({ type: 'removePlay', slotIndex: parseInt(sourceZone.split('-')[1]) });
      }
      return;
    }

    if (targetZone.startsWith('ActivePlay')) {
      const error = play.id.startsWith('basic-')
        // A basic play is minted by the drag itself, so it is in neither list `swapPlay`
        // looks in: it goes through `activatePlay` WITH the slot it was dropped on, and
        // lands there like any other play drag (displacing the occupant), as it always did.
        ? dispatch({ type: 'activatePlay', play, slotIndex: parseInt(targetZone.split('-')[1]) })
        : dispatch({ type: 'swapPlay', slotIndex: parseInt(targetZone.split('-')[1]), playId: play.id });
      if (error && error !== 'not-found') {
        toast.show(assignPlayFailureMessage(play, error as AssignPlayFailureReason), { tone: 'error' });
      }
      return;
    }

    // targetZone === 'RosterPlayers' reached with a Play card: this is not expressible by
    // any of the ten actions (it would need an eleventh, nonsensical "put a Play card into
    // rosterPlayers" transition) and isn't reachable through the app's own drop zones —
    // the old code's type-confused `setRosterPlayers` push for this case isn't ported.
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

  /** Click handling for Play cards: click a filled slot opens Remove/Swap
   *  (deckbuilder_ux D3); click a Roster play fills the first open slot (the
   *  `activatePlay` action). */
  const handlePlayClick = (play: Play, currentZone: string) => {
    setAssigning(null);
    if (currentZone.startsWith('ActivePlay')) {
      dispatch({ type: 'removePlay', slotIndex: parseInt(currentZone.split('-')[1]) });
      return;
    }
    const error = dispatch({ type: 'activatePlay', play });
    if (error) toast.show(assignPlayFailureMessage(play, error as AssignPlayFailureReason), { tone: 'error' });
  };

  /** Tap/click path for the Basic Offense / Basic Defense tiles (no drag-and-drop
   *  on touch devices). Builds the same synthetic Play `handleDragStart` builds for
   *  these tiles, then goes through `activatePlay` — same first-open-slot placement
   *  and "slots full" toast as `handlePlayClick` uses for a Roster play. The engine
   *  treats the freshly minted id exactly like a roster play, except it vanishes
   *  instead of returning to the bench when removed/swapped/cleared. */
  const handleBasicPlayClick = (kind: 'offense' | 'defense') => {
    const play = makeBasicPlay(kind);
    const error = dispatch({ type: 'activatePlay', play });
    if (error) toast.show(assignPlayFailureMessage(play, error as AssignPlayFailureReason), { tone: 'error' });
  };

  /** Swap a bench play into an already-occupied active-play slot (the placed
   *  play's Remove/Swap popover, opened by clicking the slot). The displaced
   *  play returns to the Roster, same as a drag-swap onto that slot. */
  const handlePlaySwap = (slotIndex: number, playId: string) => {
    const error = dispatch({ type: 'swapPlay', slotIndex, playId });
    if (error === 'not-found') return;
    setOpenPlaySlotPopover(null);
  };

  /** Click on the placed-play tile (not one of its interactive children, which stop
   *  propagation): open its Remove/Swap popover, closing any other selection first
   *  (deckbuilder_ux D3). */
  const handlePlaySlotTileClick = (slotIndex: number) => {
    setSelectedRosterPlayer(null);
    setAssigning(null);
    setOpenSlotPopover(null);
    setOpenPlaySlotPopover(prev => (prev === slotIndex ? null : slotIndex));
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
    dispatch({ type: 'clearRole', cardId, roleId });
    setAssigning(null);
  };

  /** Attempt to place `player` into the role currently being assigned (`assigning`).
   *  No-ops silently when the player is ineligible or already holds a different role in
   *  the same play — those cards are dimmed/non-clickable in the UI, but this guards
   *  drag-and-drop and any other entry point too. Clears the pending assignment on
   *  success, or when the play it targeted is gone (`'not-found'`); leaves it set on an
   *  eligibility/conflict refusal so the user can try a different player. */
  const tryAssignRole = (player: PlayerCardData) => {
    if (!assigning) return;
    const { cardId, roleId } = assigning;
    const error = dispatch({ type: 'assignRole', cardId, roleId, playerId: player.id });
    if (!error || error === 'not-found') setAssigning(null);
  };

  /** Drop of a depth-chart card (dataTransfer text = card id) onto a play's role row. */
  const handleRoleDrop = (cardId: string, roleId: string, droppedId: string) => {
    const player = allPlayers.find(p => p.id === droppedId);
    if (player) dispatch({ type: 'assignRole', cardId, roleId, playerId: player.id });
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
    dispatch({ type: 'sendToRoster', playerId: player.id });
    setOpenSlotPopover(null);
  };

  const handleClearRoster = () => {
    const snap = builderState;
    dispatch({ type: 'clear' });
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
  const rosterFull = countPlayers(toIdChart(depthChart)) >= MAX_ROSTER;

  // Every derived "how does this roster's playbook/identity currently score" value —
  // `useBuilderPlaybook.ts` (plan render_and_engine_perf, D8/T10).
  const {
    starterIds, playbookAssignments, archetypeStatuses, validArchetypes, playbookStatus,
    playStatusByCardId, rolesByPlayer, checklist, isAssignEligible,
    isRoleEligible, pickerCandidates, playSlotDot,
  } = useBuilderPlaybook({
    depthChart, activePlays, playAssignments, rosterPlayers, rosterPlays, draftedCards,
    archetypes, assigning, allPlayers,
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

  // The player whose placement the depth chart is currently previewing: a selected
  // bench row, or the card being dragged.
  const pendingPlayer: PlayerCardData | null =
    selectedRosterPlayer ??
    (draggedItem?.card.type === 'Player' ? (draggedItem.card as PlayerCardData) : null);

  /** Roster candidates eligible for a column — feeds an empty slot's AssignPopover. */
  const slotCandidates = (column: DepthColumn) =>
    rosterPlayers.filter(p => canPlaceAt(effectivePosition(p.player.position, p.traits), column));

  // Save/persist state + `saveRoster` — `useSaveRoster.ts` (plan render_and_engine_perf,
  // D8/T10). "Save" lands on `/rosters`; "Save & play season" jumps straight into the
  // season for this draft session (only offered when there IS a session, D19).
  const {
    showSaveModal, saveDestination, defaultRosterName, isSavingRoster, saveError,
    openSaveModal, closeSaveModal, saveRoster,
  } = useSaveRoster({
    readOnly, rosterId, existingRosterName, sessionId, isChallenge, embedOverride,
    draftedCards, depthChart, activePlays, playbookAssignments, validArchetypes,
    rosterPlayers, rosterPlays, exitTo, replace: (url) => router.replace(url),
  });

  const playsBudgetLine = `Off ${Math.round(playbookStatus.offenseAllocation * 100)}/${Math.round(playbookStatus.offenseBudget * 100)} · Def ${Math.round(playbookStatus.defenseAllocation * 100)}/${Math.round(playbookStatus.defenseBudget * 100)}`;

  // Shared between the docked/strip Plays panel and the compact-tier drawer.
  const playSlotsProps: PlaySlotsProps = {
    activePlays,
    playStatusByCardId,
    assigning,
    playbookStatus,
    draggedCardType: draggedItem?.card.type,
    allPlayers,
    draggingPlayerId,
    pickerCandidates,
    rosterPlays,
    openPlaySlotPopover,
    onDragOver: handleDragOver,
    onDropOnZone: handleDropOnZone,
    onDragStart: handleDragStart,
    onSlotTileClick: handlePlaySlotTileClick,
    onRoleClick: handleRoleClick,
    onRoleClear: handleRoleClear,
    onRoleDrop: handleRoleDrop,
    isRoleEligible,
    onPlayClick: handlePlayClick,
    onPick: handlePick,
    onPlaySwap: handlePlaySwap,
    onCloseSlotPopover: () => setOpenPlaySlotPopover(null),
  };

  // Shared between the docked/strip Roster panel and the compact-tier drawer.
  const rosterView = useRosterSidebarView();
  const rosterSidebarProps: RosterSidebarBodyProps = {
    view: rosterView,
    rosterPlayers,
    rosterPlays,
    draggedCardType: draggedItem?.card.type,
    selectedPlayerId: selectedRosterPlayer?.id,
    onDragOver: handleDragOver,
    onDropOnZone: handleDropOnZone,
    onDragStart: handleDragStart,
    onRosterPlayerClick: handleRosterPlayerClick,
    onPlayClick: (play) => handlePlayClick(play, 'RosterPlays'),
    onBasicPlayClick: handleBasicPlayClick,
  };

  return (
    <div ref={shellRef} className="@container h-dvh-z text-ink flex flex-col overflow-hidden relative bg-surface" onClick={clearSelection}>
      <BackGuardSheet
        open={showBackGuard}
        message="Changes to this roster aren't saved automatically — leaving now loses them."
        onCancel={() => setShowBackGuard(false)}
        onLeave={goBack}
      />
      <DragGhost ghostRef={dragGhostRef} barRef={dragGhostBarRef} imgRef={dragGhostImgRef} nameRef={dragGhostNameRef} />
      <TopKPIBand
        identity={identity}
        shotDiet={shotDiet}
        depthChart={depthChart}
        average={podAverageIdentity}
        starterIds={starterIds}
        archetypes={archetypes}
        archetypeStatuses={archetypeStatuses}
        onArchetypesChange={setArchetypes}
        playsAssigned={activePlays.filter(Boolean).length}
        playsTarget={3}
        actions={{
          onClear: () => setShowClearConfirm(true),
          onSave: () => {
            // Embedded (front office, T7): no roster-naming step — commit straight
            // through to embedOverride.onSave, which snapshots rather than persists.
            if (embedOverride) { saveRoster(defaultRosterName, 'rosters'); return; }
            openSaveModal('rosters');
          },
          onSaveAndPlay: () => openSaveModal('season'),
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

        {tier !== 'compact' && (
          <PlaysSidebarPanel
            docked={playsDocked}
            onDockChange={dockPlays}
            playsBudgetLine={playsBudgetLine}
            activePlaysCount={activePlaysCount}
            playSlotDot={playSlotDot}
            {...playSlotsProps}
          />
        )}

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

        {tier !== 'compact' && (
          <RosterSidebarPanel docked={rosterDocked} onDockChange={dockRoster} {...rosterSidebarProps} />
        )}
      </div>

      {tier === 'compact' && (
        <PlaysSidebarDrawer
          open={playsDrawerOpen}
          onClose={() => setPlaysDrawerOpen(false)}
          playsBudgetLine={playsBudgetLine}
          {...playSlotsProps}
        />
      )}
      {tier === 'compact' && (
        <RosterSidebarDrawer open={rosterDrawerOpen} onClose={() => setRosterDrawerOpen(false)} {...rosterSidebarProps} />
      )}

      <SaveRosterModal
        open={showSaveModal}
        onClose={closeSaveModal}
        initialName={defaultRosterName}
        saveDestination={saveDestination}
        isChallenge={isChallenge}
        isSaving={isSavingRoster}
        onSave={(name, destination) => saveRoster(name, destination)}
      />

      <ClearRosterModal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} onConfirm={handleClearRoster} />
    </div>
  );
}
