'use client';

/**
 * Candidate picker popover, extracted from `PlayPanel`'s `RoleRow` (plan
 * ui_draft_deckbuild_pack, T0) so the deck builder's empty depth-chart slots
 * (D14) can open the same popover a play role uses.
 */
import type { PlayerCardData } from './PlayerCard';
import { PositionIcon } from './PlayerCard';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

export interface AssignPopoverProps {
  candidates: PlayerCardData[];
  /** Badge/level shown to the right of a candidate row (play roles only). */
  levelFor?: (candidate: PlayerCardData) => number | undefined;
  emptyMessage?: string;
  onPick: (playerId: string) => void;
}

export function AssignPopover({ candidates, levelFor, emptyMessage, onPick }: AssignPopoverProps) {
  return (
    <Panel
      variant="raised"
      padding="none"
      className="absolute z-30 left-0 right-0 top-full mt-1 max-h-[220px] overflow-y-auto shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {candidates.length === 0 && (
        <div className="px-2 py-2 text-xs text-ink-muted italic text-center">
          {emptyMessage ?? 'No eligible players in the active roster.'}
        </div>
      )}
      {candidates.map(p => {
        const level = levelFor?.(p);
        return (
          <Button
            key={p.id}
            variant="ghost"
            size="md"
            onClick={(e) => { e.stopPropagation(); onPick(p.id); }}
            className="w-full justify-start gap-1.5 rounded-none border-b border-line px-2 text-left font-normal normal-case tracking-normal last:border-b-0"
          >
            <img
              src={`/headshots/${p.id}.png`}
              alt=""
              className="w-6 h-6 rounded-full object-cover object-top border border-line bg-surface-sunken shrink-0"
              onError={(e2) => { (e2.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            <span className="flex-1 min-w-0 text-xs font-bold text-ink truncate">{p.player.name}</span>
            <PositionIcon position={p.player.position} className="min-w-[22px] h-[15px] px-1 text-xs shrink-0" />
            {level !== undefined && <span className="text-xs font-bold text-ink-muted shrink-0">Lv {level}</span>}
          </Button>
        );
      })}
    </Panel>
  );
}
