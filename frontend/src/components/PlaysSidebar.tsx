'use client';

import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DraftCard, Play, PlayerCardData } from './PlayerCard';
import type { PlaybookStatus, PlayStatus } from '../engine/playbook';
import { PlayPanel } from './PlayPanel';
import { PlayTileEmptySlot } from './PlayTile';
import { PlaySwapPopover } from './AssignPopover';
import { Panel } from './ui/Panel';
import { IconButton } from './ui/IconButton';

/**
 * A Basic Offense / Basic Defense play card. They are not drafted: the builder mints one
 * whenever a basic tile is tapped or dragged, and it vanishes again when removed. Module
 * level on purpose: the id needs a timestamp to stay unique inside a saved roster, and
 * reading the clock inside the component body trips the react-hooks purity rule.
 */
export function makeBasicPlay(kind: 'offense' | 'defense'): Play {
  return {
    type: 'Play',
    id: `basic-${kind}-${Date.now()}`,
    name: kind === 'offense' ? 'Basic Offense' : 'Basic Defense',
    rarity: 'Common',
    playCategory: 'basic',
    mechanicText: kind === 'offense' ? 'Minor boost to all Offensive Badges.' : 'Minor boost to all Defensive Badges.',
    badges: [],
    imageUrl: '',
  } as Play;
}

// Tailwind's JIT scanner needs every class name to appear verbatim as a string
// literal somewhere in the source — a per-kind config keeps both full class strings
// visible here instead of building them with template interpolation.
const BASIC_PLAY_TILE_CONFIG = {
  offense: {
    ariaLabel: 'Add Basic Offense to the first open play slot',
    label: 'Offense',
    className: 'flex-1 min-h-control bg-surface-sunken border border-line hover:border-accent hover:bg-surface-muted transition-colors p-2.5 rounded-control flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing',
    plusClassName: 'text-accent font-black pointer-events-none',
  },
  defense: {
    ariaLabel: 'Add Basic Defense to the first open play slot',
    label: 'Defense',
    className: 'flex-1 min-h-control bg-surface-sunken border border-line hover:border-info hover:bg-surface-muted transition-colors p-2.5 rounded-control flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing',
    plusClassName: 'text-info font-black pointer-events-none',
  },
} as const;

/** One Basic Offense / Basic Defense tile — draggable (pointer devices) and clickable
 *  (touch, keyboard). `dragRef` is shared by both tiles (same instance the caller owns):
 *  it guards the click handler from also firing right after a genuine drag+drop, exactly
 *  as the single ref this replaced did. */
export function BasicPlayTile({ kind, dragRef, onDragStart, onClick }: {
  kind: 'offense' | 'defense';
  dragRef: React.RefObject<boolean>;
  onDragStart: (e: React.DragEvent, card: DraftCard, sourceZone: string, sourceIndex?: number) => void;
  onClick: (kind: 'offense' | 'defense') => void;
}) {
  const cfg = BASIC_PLAY_TILE_CONFIG[kind];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={cfg.ariaLabel}
      draggable
      onDragStart={(e) => {
        dragRef.current = true;
        onDragStart(e, makeBasicPlay(kind), 'InfinitePlays');
      }}
      onDragEnd={() => { setTimeout(() => { dragRef.current = false; }, 0); }}
      onClick={() => {
        if (dragRef.current) return;
        onClick(kind);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(kind);
        }
      }}
      title="Adds a basic play card with no requirements"
      className={cfg.className}
    >
      <span className={cfg.plusClassName}>+</span>
      <span className="text-ink-muted font-bold uppercase text-xs group-hover:text-ink pointer-events-none">{cfg.label}</span>
    </div>
  );
}

export interface PlaySlotsProps {
  activePlays: (Play | null)[];
  playStatusByCardId: Map<string, PlayStatus>;
  assigning: { cardId: string; roleId: string } | null;
  playbookStatus: PlaybookStatus;
  /** Type of the card currently being dragged, if any — drives the empty-slot highlight. */
  draggedCardType?: 'Player' | 'Play';
  allPlayers: PlayerCardData[];
  draggingPlayerId?: string;
  pickerCandidates?: PlayerCardData[];
  rosterPlays: Play[];
  openPlaySlotPopover: number | null;
  onDragOver: (e: React.DragEvent) => void;
  onDropOnZone: (e: React.DragEvent, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, card: DraftCard, sourceZone: string, sourceIndex?: number) => void;
  onSlotTileClick: (slotIndex: number) => void;
  onRoleClick: (cardId: string, roleId: string) => void;
  onRoleClear: (cardId: string, roleId: string) => void;
  onRoleDrop: (cardId: string, roleId: string, droppedId: string) => void;
  isRoleEligible: (cardId: string, roleId: string, playerId: string) => boolean;
  onPlayClick: (play: Play, zoneId: string) => void;
  onPick: (playerId: string) => void;
  onPlaySwap: (slotIndex: number, playId: string) => void;
  onCloseSlotPopover: () => void;
}

/** The three active-play slots (deckbuilder_ux artboard g). Shared between the docked
 *  panel and the compact-tier drawer. */
export function PlaySlots({
  activePlays, playStatusByCardId, assigning, playbookStatus, draggedCardType, allPlayers,
  draggingPlayerId, pickerCandidates, rosterPlays, openPlaySlotPopover,
  onDragOver, onDropOnZone, onDragStart, onSlotTileClick, onRoleClick, onRoleClear, onRoleDrop,
  isRoleEligible, onPlayClick, onPick, onPlaySwap, onCloseSlotPopover,
}: PlaySlotsProps) {
  return (
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
            <div key={slotIndex} onDragOver={onDragOver} onDrop={(e) => onDropOnZone(e, zoneId)}>
              <PlayTileEmptySlot
                side={side}
                className={draggedCardType === 'Play' ? 'border-info bg-info-soft' : undefined}
              />
            </div>
          );
        }
        return (
          <div
            key={slotIndex}
            className="relative w-full"
            onDragOver={onDragOver}
            onDrop={(e) => onDropOnZone(e, zoneId)}
            // A placed play's own clickable bits (role rows, the Remove X) stop
            // propagation, so a click that reaches here is a click on the tile
            // itself — open Remove/Swap (deckbuilder_ux D3) instead of guessing
            // which role the click meant.
            onClick={(e) => {
              e.stopPropagation();
              onSlotTileClick(slotIndex);
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
              onDragStart={(e: any) => onDragStart(e, play, zoneId)}
            >
              <PlayPanel
                play={play}
                status={roleStatus}
                players={allPlayers}
                selectedRoleId={selectedRoleId}
                draggingPlayerId={draggingPlayerId}
                isEligible={(roleId, playerId) => isRoleEligible(play.id, roleId, playerId)}
                onRoleClick={(roleId) => { onRoleClick(play.id, roleId); }}
                onRoleClear={(roleId) => { onRoleClear(play.id, roleId); }}
                onRoleDrop={(roleId, droppedId) => { onRoleDrop(play.id, roleId, droppedId); }}
                onRemove={() => onPlayClick(play, zoneId)}
                pickerCandidates={selectedRoleId ? pickerCandidates : undefined}
                onPick={onPick}
              />
            </motion.div>
            {openPlaySlotPopover === slotIndex && (
              <PlaySwapPopover
                candidates={rosterPlays}
                onRemove={() => { onPlayClick(play, zoneId); onCloseSlotPopover(); }}
                onSwap={(playId) => onPlaySwap(slotIndex, playId)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/** The docked Plays panel (artboard g): title row + budget line + the three slots.
 *  Collapses to a 48px strip and expands as a compact-tier drawer elsewhere —
 *  `DeckBuilder.tsx` owns those two variants since they're tied to `useDockLayout`'s
 *  tier/drawer state, not to the slots' own content. */
export function PlaysDockedPanel({
  playsBudgetLine,
  onCollapse,
  ...slotsProps
}: PlaySlotsProps & { playsBudgetLine: string; onCollapse: () => void }) {
  return (
    <Panel variant="raised" padding="none" className="w-full @min-[960px]:w-[280px] shrink-0 flex flex-col gap-2 p-2 @min-[960px]:p-3 min-h-0">
      <div className="flex items-center gap-2 min-h-control shrink-0">
        <IconButton label="Collapse plays" variant="ghost" onClick={(e) => { e.stopPropagation(); onCollapse(); }} className="-ml-2">
          <ChevronLeft className="w-4 h-4" />
        </IconButton>
        <h2 className="font-display text-2xl uppercase tracking-wide text-ink-strong shrink-0">Plays</h2>
        <span className="text-xs font-bold uppercase tracking-widest text-ink-subtle truncate">{playsBudgetLine}</span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto pr-0.5 pb-1 flex-1 min-h-0">
        <PlaySlots {...slotsProps} />
      </div>
    </Panel>
  );
}

export interface PlaysSidebarPanelProps extends PlaySlotsProps {
  docked: boolean;
  onDockChange: (next: boolean) => void;
  playsBudgetLine: string;
  activePlaysCount: number;
  playSlotDot: (slotIndex: number) => 'ready' | 'warn' | 'empty';
}

/** PLAYS sidebar (artboard g) — docked panel or 48px strip; compact tier renders
 *  neither (`PlaysSidebarDrawer` covers it instead). */
export function PlaysSidebarPanel({
  docked, onDockChange, playsBudgetLine, activePlaysCount, playSlotDot, ...slotsProps
}: PlaysSidebarPanelProps) {
  if (!docked) {
    return (
      <Panel variant="raised" padding="none" className="w-12 shrink-0 flex flex-col items-center gap-3 py-3">
        <IconButton label="Expand plays" variant="ghost" onClick={(e) => { e.stopPropagation(); onDockChange(true); }}>
          <ChevronRight className="w-4 h-4" />
        </IconButton>
        <span className="text-xs font-bold italic uppercase tracking-wider text-ink-muted [writing-mode:vertical-rl]">Plays</span>
        <div className="flex-1" />
        <div className="flex flex-col gap-1.5 items-center">
          {[0, 1, 2].map(i => {
            const dot = playSlotDot(i);
            const play = slotsProps.activePlays[i];
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
    );
  }
  return <PlaysDockedPanel playsBudgetLine={playsBudgetLine} onCollapse={() => onDockChange(false)} {...slotsProps} />;
}

export interface PlaysSidebarDrawerProps extends PlaySlotsProps {
  open: boolean;
  onClose: () => void;
  playsBudgetLine: string;
}

/** Compact-tier overlay drawer (D4): fixed, right-anchored, scrim behind. */
export function PlaysSidebarDrawer({ open, onClose, playsBudgetLine, ...slotsProps }: PlaysSidebarDrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="absolute inset-0 bg-surface-scrim" aria-hidden="true" />
      <Panel variant="raised" padding="none" className="relative w-80 max-w-[85vw] h-full flex flex-col gap-2 p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-h-control shrink-0">
          <h2 className="font-display text-2xl uppercase tracking-wide text-ink-strong flex-1">Plays</h2>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-ink-subtle shrink-0">{playsBudgetLine}</div>
        <div className="flex flex-col gap-2 overflow-y-auto pb-1 flex-1 min-h-0">
          <PlaySlots {...slotsProps} />
        </div>
      </Panel>
    </div>
  );
}
