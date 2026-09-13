'use client';

/**
 * One depth-chart column as 4 FIXED slots (plan ui_draft_deckbuild_pack, D12):
 * slot 0 = Starter, slots 1-3 = Bench 1-3. Placement rules live in
 * `engine/depthChart.ts` — this component only renders slots and reports clicks,
 * drops and ▲/▼ presses back to `DeckBuilder`.
 *
 * An empty slot is a click target (D14): with a bench player selected it places
 * them; with nothing selected it opens the same `AssignPopover` an empty play
 * role uses. When the column is full there are no empty slots left; when the
 * ROSTER is full (12) the remaining empty slots render disabled ("Roster full").
 */
import { AssignPopover } from './AssignPopover';
import { PlayerCard, RoleTag, getPosColors, type PlayerCardData } from './PlayerCard';
import { SLOTS_PER_COLUMN } from '@/engine/depthChart';
import type { DepthColumn } from '@/engine/positions';
import type { PlaySide } from '@/engine/playbook';

export interface DepthSlotRoleTag {
  playName: string;
  roleName: string;
  side: PlaySide;
}

export interface DepthSlotColumnProps {
  column: DepthColumn;
  /** Occupants in slot order; index 0 is the starter. At most `SLOTS_PER_COLUMN`. */
  players: PlayerCardData[];
  /** True while a bench player is selected or a player card is being dragged. */
  selectionActive?: boolean;
  /** How the selected/dragged player fits THIS column (drives the tint). */
  pendingFit?: 'natural' | 'adjacent' | 'none';
  /** True when the depth chart already holds 12 players. */
  rosterFull?: boolean;
  /** Placed player whose ▲/▼/✕ control strip is open. */
  selectedPlayerId?: string;
  rolesByPlayer: Map<string, DepthSlotRoleTag[]>;
  /** Role-assign mode: cards that can't take the role are dimmed. */
  assigning?: boolean;
  isAssignEligible?: (player: PlayerCardData) => boolean;
  /** Slot index in THIS column whose AssignPopover is open, if any. */
  openPopoverSlot?: number;
  /** Candidates for that popover (already filtered to this column's eligibility). */
  popoverCandidates?: PlayerCardData[];
  onEmptySlotClick: (column: DepthColumn, slotIndex: number) => void;
  onPopoverPick: (column: DepthColumn, playerId: string) => void;
  onPlayerClick: (player: PlayerCardData, column: DepthColumn) => void;
  onPromote: (column: DepthColumn, index: number) => void;
  onDemote: (column: DepthColumn, index: number) => void;
  onRemove: (player: PlayerCardData, column: DepthColumn) => void;
  onDragStart: (e: React.DragEvent, player: PlayerCardData, column: DepthColumn, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, column: DepthColumn, slotIndex: number) => void;
}

const SLOT_LABELS = ['Starter', 'Bench 1', 'Bench 2', 'Bench 3'];

export function DepthSlotColumn({
  column,
  players,
  selectionActive = false,
  pendingFit,
  rosterFull = false,
  selectedPlayerId,
  rolesByPlayer,
  assigning = false,
  isAssignEligible,
  openPopoverSlot,
  popoverCandidates,
  onEmptySlotClick,
  onPopoverPick,
  onPlayerClick,
  onPromote,
  onDemote,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: DepthSlotColumnProps) {
  const [posC1, posC2] = getPosColors(column);
  const columnFull = players.length >= SLOTS_PER_COLUMN;

  const tint =
    selectionActive && pendingFit === 'adjacent' && !columnFull
      ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300'
      : selectionActive && pendingFit === 'natural' && !columnFull
        ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300'
        : selectionActive && (pendingFit === 'none' || columnFull)
          ? 'bg-red-50 border-red-300'
          : 'bg-stone-50 border-stone-200';

  return (
    <div
      data-testid={`depth-column-${column}`}
      className={`flex flex-col gap-1.5 rounded-lg p-1.5 border transition-colors min-h-[300px] min-w-0 ${tint}`}
    >
      {/* 3px position-colour accent + column header */}
      <div
        className="h-[3px] w-full rounded-full shrink-0 pointer-events-none"
        style={{ background: `linear-gradient(to right, ${posC1}, ${posC2})` }}
      />
      <div className="text-center font-black text-stone-600 text-sm pb-1 pointer-events-none shrink-0">
        {column}
      </div>

      {Array.from({ length: SLOTS_PER_COLUMN }, (_, slotIndex) => {
        const player = players[slotIndex];

        // ── Empty slot ────────────────────────────────────────────────────
        if (!player) {
          // Slots after the first free one are only reachable once the ones
          // above are filled, so the first free slot is the live target.
          const isNextFree = slotIndex === players.length;
          // A 13th-player attempt stays CLICKABLE on purpose (D12): the engine
          // refuses it and `DeckBuilder` surfaces the reason as a toast.
          const blockedReason = rosterFull ? 'Roster full (12)' : undefined;
          const disabled = !isNextFree;
          const popoverOpen = openPopoverSlot === slotIndex;

          return (
            <div key={`empty-${slotIndex}`} className="relative shrink-0">
              <div className="text-center text-[9px] font-bold uppercase tracking-widest text-stone-300 mb-1 pointer-events-none">
                {SLOT_LABELS[slotIndex]}
              </div>
              <button
                type="button"
                data-testid={`depth-slot-${column}-${slotIndex}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onEmptySlotClick(column, slotIndex);
                }}
                onDragOver={disabled ? undefined : onDragOver}
                onDrop={(e) => {
                  e.stopPropagation();
                  if (!disabled) onDrop(e, column, slotIndex);
                }}
                className={`w-full min-h-[62px] rounded-lg border-2 border-dashed p-2 text-center text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  disabled
                    ? 'border-stone-200 text-stone-300 cursor-not-allowed'
                    : blockedReason
                      ? 'border-stone-300 text-stone-400 hover:border-red-300 hover:text-red-500 cursor-pointer'
                      : 'border-stone-300 text-stone-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 cursor-pointer'
                }`}
              >
                {blockedReason ?? (selectionActive ? `Place in ${column}` : `Add ${column}`)}
              </button>
              {popoverOpen && (
                <AssignPopover
                  candidates={popoverCandidates ?? []}
                  emptyMessage={`No G-League player is eligible at ${column}.`}
                  onPick={(playerId) => onPopoverPick(column, playerId)}
                />
              )}
            </div>
          );
        }

        // ── Occupied slot ─────────────────────────────────────────────────
        const isStarter = slotIndex === 0;
        const isSelected = selectedPlayerId === player.id;
        const roleTags = rolesByPlayer.get(player.id) ?? [];
        const dimmed = assigning && !(isAssignEligible?.(player) ?? false);

        return (
          <div
            key={player.id}
            className="relative shrink-0 w-full"
            draggable
            onDragStart={(e) => onDragStart(e, player, column, slotIndex)}
            onDragOver={onDragOver}
            onDrop={(e) => {
              e.stopPropagation();
              onDrop(e, column, slotIndex);
            }}
          >
            {/* Starter keeps its own label line (there's only one, and it's the
                card readers look for first); bench slots fold theirs into a
                tiny corner tag on the card instead — a separate 9px line
                above each of the 3 bench rows added up fast. */}
            {isStarter && (
              <div className="text-center text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-1 pointer-events-none">
                {SLOT_LABELS[slotIndex]}
              </div>
            )}
            <div
              className={`group relative w-full cursor-pointer transition-opacity ${
                assigning ? (dimmed ? 'opacity-30 grayscale' : 'ring-2 ring-emerald-400 rounded-lg') : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onPlayerClick(player, column);
              }}
            >
              {!isStarter && (
                <span
                  className="absolute -top-1 -right-1 z-20 w-4 h-4 flex items-center justify-center rounded-full bg-stone-700 text-white text-[8px] font-black leading-none pointer-events-none"
                  title={SLOT_LABELS[slotIndex]}
                >
                  {slotIndex + 1}
                </span>
              )}
              {roleTags.length > 0 && (
                <div className="absolute top-1 left-1 z-20 flex flex-col gap-0.5 pointer-events-none">
                  {roleTags.slice(0, 2).map((r, i) => (
                    <RoleTag key={i} playName={r.playName} roleName={r.roleName} side={r.side} />
                  ))}
                  {roleTags.length > 2 && (
                    <span className="text-[8px] font-black bg-stone-900 text-white rounded px-1 py-0.5 w-fit leading-none">
                      +{roleTags.length - 2}
                    </span>
                  )}
                </div>
              )}
              {isStarter ? (
                // size="sm" pins the stat footer to 4 columns (PPG/RPG/APG/FG%) —
                // a 5-across depth chart never gives the starter card enough width
                // for the container-query 6-stat variant to stay legible.
                <PlayerCard player={player} isSelected={isSelected} size="sm" />
              ) : (
                <PlayerCard player={player} compact popupDirection="down" isSelected={isSelected} />
              )}
            </div>

            {isSelected && (
              <div className="flex items-center justify-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  disabled={slotIndex === 0}
                  onClick={() => onPromote(column, slotIndex)}
                  title="Promote"
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-stone-800 border border-white text-white text-[11px] leading-none disabled:opacity-30 hover:bg-stone-700 shadow"
                >▲</button>
                <button
                  type="button"
                  disabled={slotIndex >= players.length - 1}
                  onClick={() => onDemote(column, slotIndex)}
                  title="Demote"
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-stone-800 border border-white text-white text-[11px] leading-none disabled:opacity-30 hover:bg-stone-700 shadow"
                >▼</button>
                <button
                  type="button"
                  onClick={() => onRemove(player, column)}
                  title="Send to G-League"
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-red-600 border border-white text-white text-[11px] leading-none hover:bg-red-500 shadow"
                >✕</button>
              </div>
            )}
          </div>
        );
      })}

      {columnFull && (
        <div className="text-center text-[9px] font-bold uppercase tracking-widest text-stone-400 pointer-events-none pt-1">
          Column full
        </div>
      )}
    </div>
  );
}
