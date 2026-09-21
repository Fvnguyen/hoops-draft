'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DraftCard, PlayerHoverPreview, CardListRow, Play, PlayerCardData } from './PlayerCard';
import { useHoverPreview } from './useHoverPreview';
import { useLongPressPreview } from '@/hooks/useLongPressPreview';
import { canPlaceAt, positionParts, effectivePosition } from '@/engine/positions';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Panel } from './ui/Panel';
import { PlayTile } from './PlayTile';
import { BasicPlayTile } from './PlaysSidebar';

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

export function positionSortKey(rawPos: string): number {
  if (rawPos === 'ALL' || rawPos === 'STAR') return 0;
  const parts = positionParts(rawPos);
  const known = parts.map(p => posOrder[p]).filter((v): v is number => v !== undefined);
  return known.length ? Math.min(...known) : 9;
}

/** Display sort for the bench Players list. `DeckBuilder.tsx` passes this straight into
 *  `useRosterBuilder` (invariant 4 in `engine/deckbuilder.ts`) — a display concern the
 *  engine doesn't own, so the caller supplies it; re-exported here since this is where
 *  the sort itself now lives. */
export const sortRosterPlayers = (a: PlayerCardData, b: PlayerCardData) => {
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
  // render_and_engine_perf D10/T14: touch has no hover, so a long-press gets the same
  // screen-centred preview (see `useLongPressPreview` — its `onClickCapture` swallows the
  // click that follows a press it opened, so a long-press never also places the player).
  const longPress = useLongPressPreview();
  return (
    <div
      ref={hoverRef}
      data-testid="roster-player-row"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={longPress.handlers.onTouchStart}
      onTouchMove={longPress.handlers.onTouchMove}
      onTouchCancel={longPress.handlers.onTouchCancel}
      onTouchEnd={longPress.handlers.onTouchEnd}
      onClickCapture={longPress.handlers.onClickCapture}
      onContextMenu={longPress.handlers.onContextMenu}
      className="relative cursor-grab active:cursor-grabbing w-full select-none [-webkit-touch-callout:none]"
    >
      <CardListRow card={player} selected={selected} />
      {/* Screen-centred + badge panel (D-hover) — a row near the bottom of this
          scrollable list has nowhere for an anchored popup to go. */}
      {(isHovered || longPress.open) && <PlayerHoverPreview player={player} />}
    </div>
  );
}

type PosFilter = 'All' | 'G' | 'F' | 'C';

/** Position filter chips (All / G / F / C) above the Roster list. Natural fit only. */
function matchesPosFilter(rawPos: string, filter: PosFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'G') return canPlaceAt(rawPos, 'PG', false) || canPlaceAt(rawPos, 'SG', false);
  if (filter === 'F') return canPlaceAt(rawPos, 'SF', false) || canPlaceAt(rawPos, 'PF', false);
  return canPlaceAt(rawPos, 'C', false);
}

/** The Roster sidebar's title row: player/play counts + the collapse/close button. Shared
 *  between the docked panel and the compact-tier drawer, which pass a different icon and
 *  label for that button (chevron + "Collapse roster" vs X + "Close"). */
export function RosterSidebarHeader({ rosterPlayers, rosterPlays, onCollapse, icon, label }: {
  rosterPlayers: PlayerCardData[];
  rosterPlays: Play[];
  onCollapse: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
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
}

/** Lane open/closed + position filter. Held by `DeckBuilder` (via this hook), NOT by the
 *  body: the body unmounts whenever the compact drawer closes or the panel undocks, and a
 *  filter that resets each time the drawer reopens is a regression on a phone. */
export function useRosterSidebarView() {
  const [isPlaysOpen, setIsPlaysOpen] = useState(true);
  const [isPlayersOpen, setIsPlayersOpen] = useState(true);
  const [posFilter, setPosFilter] = useState<PosFilter>('All');
  return { isPlaysOpen, setIsPlaysOpen, isPlayersOpen, setIsPlayersOpen, posFilter, setPosFilter };
}

export interface RosterSidebarBodyProps {
  view: ReturnType<typeof useRosterSidebarView>;
  rosterPlayers: PlayerCardData[];
  rosterPlays: Play[];
  /** Type of the card currently being dragged, if any — drives the Players/Plays lane
   *  drop-target highlight. */
  draggedCardType?: 'Player' | 'Play';
  selectedPlayerId?: string;
  onDragOver: (e: React.DragEvent) => void;
  onDropOnZone: (e: React.DragEvent, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, card: DraftCard, sourceZone: string, sourceIndex?: number) => void;
  onRosterPlayerClick: (player: PlayerCardData) => void;
  onPlayClick: (play: Play) => void;
  /** Mints and activates a basic offense/defense play (Basic Plays tiles, at the bottom
   *  of this sidebar). */
  onBasicPlayClick: (kind: 'offense' | 'defense') => void;
}

/** The Roster sidebar's body: bench Players/Plays lanes + the Basic Plays tiles
 *  (deckbuilder_ux artboard e). Shared between the docked panel and the compact-tier
 *  drawer; its view state comes in as `view` (see `useRosterSidebarView`). */
export function RosterSidebarBody({
  view,
  rosterPlayers,
  rosterPlays,
  draggedCardType,
  selectedPlayerId,
  onDragOver,
  onDropOnZone,
  onDragStart,
  onRosterPlayerClick,
  onPlayClick,
  onBasicPlayClick,
}: RosterSidebarBodyProps) {
  const { isPlaysOpen, setIsPlaysOpen, isPlayersOpen, setIsPlayersOpen, posFilter, setPosFilter } = view;
  // Basic-play tiles are draggable (pointer devices) AND clickable (touch, keyboard);
  // this guards the click path from also firing right after a genuine drag+drop.
  const basicPlayDragRef = useRef(false);

  const filteredRosterPlayers = rosterPlayers.filter(p => matchesPosFilter(effectivePosition(p.player.position, p.traits), posFilter));

  return (
    <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-0">
      {/* Players lane */}
      <div
        className={`border rounded-control overflow-hidden transition-colors ${draggedCardType === 'Player' ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised'}`}
        onDragOver={onDragOver}
        onDrop={(e) => onDropOnZone(e, 'RosterPlayers')}
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
                    selected={selectedPlayerId === player.id}
                    onDragStart={(e) => onDragStart(e, player, 'RosterPlayers')}
                    onClick={(e) => { e.stopPropagation(); onRosterPlayerClick(player); }}
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
        className={`border rounded-control overflow-hidden transition-colors ${draggedCardType === 'Play' ? 'border-info bg-info-soft' : 'border-line bg-surface-raised'}`}
        onDragOver={onDragOver}
        onDrop={(e) => onDropOnZone(e, 'RosterPlays')}
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
                    onDragStart={(e: React.DragEvent) => onDragStart(e, play, 'RosterPlays')}
                    // Click lives on PlayTile, not here: its own Add button stops
                    // propagation before calling onClick, so a wrapper handler never
                    // sees it — and a row click would otherwise fire twice.
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab active:cursor-grabbing w-full"
                  >
                    <PlayTile variant="list" play={play as Play} onClick={() => onPlayClick(play)} />
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
          <BasicPlayTile kind="offense" dragRef={basicPlayDragRef} onDragStart={onDragStart} onClick={onBasicPlayClick} />
          <BasicPlayTile kind="defense" dragRef={basicPlayDragRef} onDragStart={onDragStart} onClick={onBasicPlayClick} />
        </div>
      </div>
    </div>
  );
}

export interface RosterSidebarPanelProps extends RosterSidebarBodyProps {
  docked: boolean;
  onDockChange: (next: boolean) => void;
}

/** ROSTER sidebar (artboard e) — docked panel or 48px strip; compact tier renders
 *  neither (`RosterSidebarDrawer` covers it instead). */
export function RosterSidebarPanel({ docked, onDockChange, rosterPlayers, rosterPlays, ...bodyProps }: RosterSidebarPanelProps) {
  if (!docked) {
    return (
      <Panel variant="raised" padding="none" className="w-12 shrink-0 flex flex-col items-center gap-3 py-3">
        <IconButton label="Expand roster" variant="ghost" onClick={(e) => { e.stopPropagation(); onDockChange(true); }}>
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
    );
  }
  return (
    <Panel variant="raised" padding="none" className="w-full @min-[960px]:w-[clamp(280px,24cqw,400px)] shrink-0 flex flex-col gap-3 p-3 min-h-0">
      <RosterSidebarHeader
        rosterPlayers={rosterPlayers}
        rosterPlays={rosterPlays}
        onCollapse={() => onDockChange(false)}
        icon={<ChevronRight className="w-4 h-4" />}
        label="Collapse roster"
      />
      <RosterSidebarBody rosterPlayers={rosterPlayers} rosterPlays={rosterPlays} {...bodyProps} />
    </Panel>
  );
}

export interface RosterSidebarDrawerProps extends RosterSidebarBodyProps {
  open: boolean;
  onClose: () => void;
}

/** Compact-tier overlay drawer (D4): fixed, right-anchored, scrim behind. */
export function RosterSidebarDrawer({ open, onClose, rosterPlayers, rosterPlays, ...bodyProps }: RosterSidebarDrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="absolute inset-0 bg-surface-scrim" aria-hidden="true" />
      <Panel variant="raised" padding="none" className="relative w-80 max-w-[85vw] h-full flex flex-col gap-3 p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <RosterSidebarHeader
          rosterPlayers={rosterPlayers}
          rosterPlays={rosterPlays}
          onCollapse={onClose}
          icon={<X className="w-4 h-4" />}
          label="Close"
        />
        <RosterSidebarBody rosterPlayers={rosterPlayers} rosterPlays={rosterPlays} {...bodyProps} />
      </Panel>
    </div>
  );
}
