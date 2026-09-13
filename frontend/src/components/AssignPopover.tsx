'use client';

/**
 * Candidate picker popover, extracted from `PlayPanel`'s `RoleRow` (plan
 * ui_draft_deckbuild_pack, T0) so the deck builder's empty depth-chart slots
 * (D14) can open the same popover a play role uses.
 */
import type { PlayerCardData } from './PlayerCard';
import { PositionIcon } from './PlayerCard';

export interface AssignPopoverProps {
  candidates: PlayerCardData[];
  /** Badge/level shown to the right of a candidate row (play roles only). */
  levelFor?: (candidate: PlayerCardData) => number | undefined;
  emptyMessage?: string;
  onPick: (playerId: string) => void;
}

export function AssignPopover({ candidates, levelFor, emptyMessage, onPick }: AssignPopoverProps) {
  return (
    <div
      className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-stone-300 rounded-lg shadow-xl max-h-[220px] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {candidates.length === 0 && (
        <div className="px-2 py-2 text-[9px] text-stone-500 italic text-center">
          {emptyMessage ?? 'No eligible players in the active roster.'}
        </div>
      )}
      {candidates.map(p => {
        const level = levelFor?.(p);
        return (
          <button
            key={p.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onPick(p.id); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-emerald-50 text-left border-b border-stone-100 last:border-b-0"
          >
            <img
              src={`/headshots/${p.id}.png`}
              alt=""
              className="w-6 h-6 rounded-full object-cover object-top border border-stone-200 bg-stone-100 shrink-0"
              onError={(e2) => { (e2.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            <span className="flex-1 min-w-0 text-[10px] font-bold text-stone-800 truncate">{p.player.name}</span>
            <PositionIcon position={p.player.position} className="min-w-[22px] h-[15px] px-1 text-[8px] shrink-0" />
            {level !== undefined && <span className="text-[8px] font-bold text-stone-500 shrink-0">Lv {level}</span>}
          </button>
        );
      })}
    </div>
  );
}
