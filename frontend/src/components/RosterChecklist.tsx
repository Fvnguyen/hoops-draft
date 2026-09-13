'use client';

/**
 * Visible "Roster ready" checklist (plan ui_draft_deckbuild_pack, D15) — replaces
 * the old tooltip-only Save blocker. Presentation only: every rule lives in the
 * pure `lib/rosterChecklist.ts` helper, this just renders its result.
 */
import { Check, Circle } from 'lucide-react';
import type { ChecklistResult } from '@/lib/rosterChecklist';

export interface RosterChecklistProps {
  result: ChecklistResult;
  /** `row` (default) for the builder header, `column` for a narrow panel. */
  direction?: 'row' | 'column';
  className?: string;
}

export function RosterChecklist({ result, direction = 'row', className = '' }: RosterChecklistProps) {
  return (
    <ul
      data-testid="roster-checklist"
      className={`flex ${direction === 'row' ? 'flex-row flex-wrap items-center gap-x-3 gap-y-1' : 'flex-col gap-1'} ${className}`}
    >
      {result.items.map(item => {
        const tone = item.met
          ? 'text-emerald-600'
          : item.optional
            ? 'text-stone-400'
            : 'text-amber-600';
        return (
          <li
            key={item.id}
            data-testid={`checklist-${item.id}`}
            data-met={item.met}
            className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${tone}`}
            title={item.detail}
          >
            {item.met ? <Check className="w-3 h-3 shrink-0" /> : <Circle className="w-3 h-3 shrink-0" />}
            <span>{item.label}</span>
            {!item.met && item.detail && (
              <span className="font-semibold normal-case tracking-normal text-stone-500 truncate max-w-[200px]">
                — {item.detail}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
