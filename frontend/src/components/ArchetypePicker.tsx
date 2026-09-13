'use client';

/**
 * ArchetypePicker — the full-screen "choose your identity" panel (plan §2, §8).
 *
 * Shows every catalog archetype (archetypes.ts) grouped into the three Philosophy
 * slots (Offense / Defense / Gold) as plan cards: kind, per-colour tallies against
 * the next tier's thresholds, a tier pill, a progress bar, and the missing
 * conditions for the next tier. Only Online/Dedicated plans are selectable —
 * everything else is shown greyed so the drafting player can see what they're
 * building toward (plan §8: "the drafting player... must be able to understand
 * what they are building toward").
 *
 * Pure display + selection logic — no data fetching, no engine math beyond what
 * archetypes.ts already computed into `statuses`.
 */

import { useEffect, useRef } from 'react';
import {
  selectionIsValid,
  MONO_THRESHOLDS,
  TWO_COLOR_THRESHOLDS,
  GOLD_THRESHOLDS,
  type ArchetypeStatus,
  type ArchetypeSelection,
  type ArchetypeTier,
  type Color,
} from '@/engine/archetypes';

const COLOR_DOT: Record<Color, string> = {
  'Finisher': '#F97316',
  'Mid-Range Maestro': '#3B82F6',
  'Sharpshooter': '#8B5CF6',
  'Floor General': '#14B8A6',
  'Glass Cleaner': '#22C55E',
  'Lockdown Defender': '#EF4444',
  'Paint Protector': '#DC2626',
};

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'NONE', online: 'ONLINE', dedicated: 'DEDICATED' };
const TIER_CLASS: Record<ArchetypeTier, string> = {
  none: 'bg-stone-100 text-stone-400',
  online: 'bg-emerald-100 text-emerald-700',
  dedicated: 'bg-amber-100 text-amber-700',
};
const KIND_LABEL = { mono: 'Mono', two: 'Two-Colour', gold: 'Gold' } as const;

/** Which tier's thresholds to display: the next tier to reach, or Dedicated when maxed. */
function targetTier(status: ArchetypeStatus): 'online' | 'dedicated' {
  return status.tier === 'none' ? 'online' : 'dedicated';
}

interface ColorLine {
  color: Color;
  carriers: [number, number];
  points: [number, number];
  starters?: [number, number];
}

/** Per-colour "have/need" lines for a plan's tally chips, against the next tier's thresholds. */
function colorLines(status: ArchetypeStatus): ColorLine[] {
  const { def, tally } = status;
  const target = targetTier(status);

  if (def.kind === 'mono') {
    const th = MONO_THRESHOLDS[target];
    const t = tally[def.colors.primary]!;
    return [{
      color: def.colors.primary,
      carriers: [t.carriers, th.carriers],
      points: [t.points, th.points],
      starters: [t.starters, th.starters],
    }];
  }

  if (def.kind === 'two') {
    const th = TWO_COLOR_THRESHOLDS[target];
    const pt = tally[def.colors.primary]!;
    const st = tally[def.colors.support!]!;
    return [
      {
        color: def.colors.primary,
        carriers: [pt.carriers, th.primary.carriers],
        points: [pt.points, th.primary.points],
        starters: [pt.starters, th.primaryStarters],
      },
      {
        color: def.colors.support!,
        carriers: [st.carriers, th.support.carriers],
        points: [st.points, th.support.points],
      },
    ];
  }

  const th = GOLD_THRESHOLDS[target];
  const pt = tally[def.colors.primary]!;
  const st = tally[def.colors.support!]!;
  const tt = tally[def.colors.tertiary!]!;
  return [
    { color: def.colors.primary, carriers: [pt.carriers, th.primary.carriers], points: [pt.points, th.primary.points] },
    { color: def.colors.support!, carriers: [st.carriers, th.secondary.carriers], points: [st.points, th.secondary.points] },
    { color: def.colors.tertiary!, carriers: [tt.carriers, th.tertiary.carriers], points: [tt.points, th.tertiary.points] },
  ];
}

function ColorRow({ line }: { line: ColorLine }) {
  return (
    <div className="flex items-start gap-1.5 text-[10px] text-stone-600 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: COLOR_DOT[line.color] }} />
      <span className="min-w-0">
        <span className="font-bold text-stone-700">{line.color}</span>{' '}
        <span className="text-stone-400">
          {line.carriers[0]}/{line.carriers[1]} carriers &middot; {line.points[0]}/{line.points[1]} pts
          {line.starters ? <> &middot; {line.starters[0]}/{line.starters[1]} starters</> : null}
        </span>
      </span>
    </div>
  );
}

function PlanCard({
  status, selected, onSelect,
}: {
  status: ArchetypeStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const eligible = status.tier !== 'none';
  const base = 'rounded-lg border p-3 flex flex-col gap-2 text-left transition-colors w-full';
  const stateClass = selected
    ? 'border-emerald-500 bg-emerald-50'
    : eligible
      ? 'border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50 cursor-pointer'
      : 'border-stone-100 bg-stone-50 opacity-70 cursor-not-allowed';

  return (
    <button type="button" disabled={!eligible} onClick={onSelect} className={`${base} ${stateClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm text-stone-800 truncate">{status.def.name}</span>
        <span className={`shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${TIER_CLASS[status.tier]}`}>
          {TIER_LABEL[status.tier]}
        </span>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">{KIND_LABEL[status.def.kind]}</span>

      <div className="flex flex-col gap-1">
        {colorLines(status).map(line => <ColorRow key={line.color} line={line} />)}
      </div>

      <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-400" style={{ width: `${Math.round(status.progress * 100)}%` }} />
      </div>

      {status.missing.length > 0 && (
        <ul className="text-[9px] text-stone-400 leading-snug list-disc list-inside">
          {status.missing.map(m => <li key={m}>{m}</li>)}
        </ul>
      )}

      {selected && <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wide">Selected</span>}
    </button>
  );
}

const TIER_RANK: Record<ArchetypeTier, number> = { dedicated: 2, online: 1, none: 0 };
function sortPlans(a: ArchetypeStatus, b: ArchetypeStatus): number {
  return TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.progress - a.progress;
}

function SlotColumn({
  title, plans, selectedId, onSelect, onClear,
}: {
  title: string;
  plans: ArchetypeStatus[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">{title}</h3>
        {selectedId && (
          <button type="button" onClick={onClear} className="text-[9px] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-1.5 py-0.5">
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[52vh] pr-1 custom-scrollbar">
        {plans.map(status => (
          <PlanCard
            key={status.def.id}
            status={status}
            selected={selectedId === status.def.id}
            onSelect={() => onSelect(status.def.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function ArchetypePicker({
  statuses, selection, onChange, onClose,
}: {
  statuses: ArchetypeStatus[];
  selection: ArchetypeSelection;
  onChange: (sel: ArchetypeSelection) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
  }

  const offensePlans = statuses.filter(s => s.def.kind !== 'gold' && s.def.side === 'offense').sort(sortPlans);
  const defensePlans = statuses.filter(s => s.def.kind !== 'gold' && s.def.side === 'defense').sort(sortPlans);
  const goldPlans = statuses.filter(s => s.def.kind === 'gold').sort(sortPlans);

  const validation = selectionIsValid(selection, statuses);

  function selectOffense(id: string) {
    onChange({ offense: id, defense: selection.defense, gold: undefined });
  }
  function selectDefense(id: string) {
    onChange({ offense: selection.offense, defense: id, gold: undefined });
  }
  function selectGold(id: string) {
    onChange({ gold: id });
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-stone-900/40 flex items-center justify-center p-6"
      onMouseDown={handleBackdropClick}
    >
      <div ref={panelRef} className="w-full max-w-5xl max-h-[85vh] bg-white rounded-xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Choose your identity</h2>
            <p className="text-[10px] text-stone-400 mt-0.5">One Offensive + one Defensive plan, or a single Gold plan spanning both.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-stone-400 hover:text-stone-600 border border-stone-200 rounded-full w-7 h-7 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {!validation.ok && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-700 shrink-0">
            {validation.reason}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 flex gap-5 min-h-0">
          <SlotColumn
            title="Offensive Philosophy"
            plans={offensePlans}
            selectedId={selection.offense}
            onSelect={selectOffense}
            onClear={() => onChange({ ...selection, offense: undefined })}
          />
          <div className="w-px bg-stone-200 shrink-0" />
          <SlotColumn
            title="Defensive Philosophy"
            plans={defensePlans}
            selectedId={selection.defense}
            onSelect={selectDefense}
            onClear={() => onChange({ ...selection, defense: undefined })}
          />
          <div className="w-px bg-stone-200 shrink-0" />
          <SlotColumn
            title="Gold Philosophy"
            plans={goldPlans}
            selectedId={selection.gold}
            onSelect={selectGold}
            onClear={() => onChange({ ...selection, gold: undefined })}
          />
        </div>
      </div>
    </div>
  );
}
