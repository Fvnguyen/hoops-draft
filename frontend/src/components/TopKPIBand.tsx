'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RosterIdentity, LEAGUE_AVG_IDENTITY } from '../engine/rosterStats';
import type { TeamBonuses } from '../engine/synergies';
import type { TeamShotProfile } from '../engine/game';
import type { PlayerCardData } from '../engine/types';
import {
  evaluateArchetypes,
  MONO_THRESHOLDS,
  TWO_COLOR_THRESHOLDS,
  GOLD_THRESHOLDS,
  type ArchetypeStatus,
  type ArchetypeSelection,
  type ArchetypeTier,
} from '../engine/archetypes';
import { DonutChart } from './DonutChart';
import { RadarChart } from './RadarChart';
import { ArchetypePicker } from './ArchetypePicker';

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'NONE', online: 'ONLINE', dedicated: 'DEDICATED' };
const TIER_CLASS: Record<ArchetypeTier, string> = {
  none: 'bg-stone-100 text-stone-400',
  online: 'bg-emerald-100 text-emerald-700',
  dedicated: 'bg-amber-100 text-amber-700',
};

/** "Sharpshooter" primary-colour carrier count against the next tier's threshold —
 *  used for both the identity chips and the "Next up" teaser text. */
function primaryCarrierFraction(status: ArchetypeStatus): { have: number; need: number } {
  const target = status.tier === 'none' ? 'online' : 'dedicated';
  const have = status.tally[status.def.colors.primary]?.carriers ?? 0;
  if (status.def.kind === 'mono') return { have, need: MONO_THRESHOLDS[target].carriers };
  if (status.def.kind === 'two') return { have, need: TWO_COLOR_THRESHOLDS[target].primary.carriers };
  return { have, need: GOLD_THRESHOLDS[target].primary.carriers };
}

const COLLAPSE_STORAGE_KEY = 'deckbuilder.reportCollapsed';

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // best-effort persistence only — localStorage may be unavailable (private mode, SSR, etc.)
  }
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 20 20"
      fill="none"
      className={direction === 'down' ? 'rotate-180' : undefined}
      aria-hidden="true"
    >
      <path d="M5 12l5-5 5 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Popover listing every catalog archetype with its currently-evaluated tier — replaces
 *  the old flat SYNERGIES list now that archetypes carry tiers instead of on/off state. */
function AllPlansPopover({ statuses, selectedIds, onClose }: { statuses: ArchetypeStatus[]; selectedIds: Set<string>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-80 max-h-80 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg z-50 p-2"
    >
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 mb-1">All plans</h4>
      <div className="flex flex-col gap-1">
        {statuses.map(status => {
          const selected = selectedIds.has(status.def.id);
          return (
            <div key={status.def.id} className={`rounded px-2 py-1 ${selected ? 'bg-emerald-50' : 'bg-stone-50'}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                {selected && <span className="text-[9px] font-black text-emerald-600 shrink-0">✓</span>}
                <span className="text-[10px] font-bold text-stone-700 truncate">{status.def.name}</span>
                <span className={`text-[8px] font-black uppercase tracking-wide shrink-0 ml-auto px-1 py-0.5 rounded ${TIER_CLASS[status.tier]}`}>
                  {TIER_LABEL[status.tier]}
                </span>
              </div>
              <p className="text-[9px] text-stone-500 leading-snug mt-0.5">{status.def.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TopKPIBand({ identity, shotDiet, bonuses, depthChart, average, starterIds, archetypes, onArchetypesChange }: {
  identity: RosterIdentity;
  shotDiet: TeamShotProfile;
  bonuses: TeamBonuses;
  depthChart: Record<string, PlayerCardData[]>;
  average?: RosterIdentity;
  /** Depth-chart index-0 players, used for archetype tier thresholds. Defaults to the
   *  index-0 player of each depth-chart column when omitted. */
  starterIds?: Set<string>;
  /** The user's chosen Offense/Defense Philosophy (or Gold plan). Omitted = no identity yet. */
  archetypes?: ArchetypeSelection;
  /** Present only when the band is editable — its absence makes the band read-only
   *  (no "Choose identity" button). */
  onArchetypesChange?: (sel: ArchetypeSelection) => void;
}) {
  // Default expanded on every render (including SSR); synced from localStorage
  // after mount so server and first client render always agree.
  const [collapsed, setCollapsed] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // One-time sync from localStorage after mount: keeps SSR and the first client
  // render identical (collapsed=false, no hydration mismatch) while still
  // restoring the user's remembered preference once we're on the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readStoredCollapsed());
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  }

  const activePlayers = Object.values(depthChart).flat();
  const defaultStarterIds = new Set<string>();
  for (const col of Object.values(depthChart)) if (col[0]) defaultStarterIds.add(col[0].id);
  const effectiveStarterIds = starterIds ?? defaultStarterIds;
  const selection = archetypes ?? {};
  const statuses = evaluateArchetypes(activePlayers, effectiveStarterIds, selection);
  const byId = new Map(statuses.map(s => [s.def.id, s]));

  const selectedStatuses: ArchetypeStatus[] = [];
  if (selection.gold) {
    const s = byId.get(selection.gold);
    if (s) selectedStatuses.push(s);
  } else {
    if (selection.offense) { const s = byId.get(selection.offense); if (s) selectedStatuses.push(s); }
    if (selection.defense) { const s = byId.get(selection.defense); if (s) selectedStatuses.push(s); }
  }
  const selectedIds = new Set(selectedStatuses.map(s => s.def.id));

  // "Next up" — plans not yet Online, closest first (progress is always measured
  // toward Online — see archetypes.ts's ArchetypeStatus.progress doc comment).
  const nextUp = statuses
    .filter(s => s.tier === 'none' && s.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  const rimPct = Math.round(shotDiet.rim * 100);
  const midPct = Math.round(shotDiet.mid * 100);
  const perPct = Math.round(shotDiet.per * 100);
  const referenceIdentity = average ?? LEAGUE_AVG_IDENTITY;

  const identityLabel = selectedStatuses.length > 0
    ? selectedStatuses.map(s => s.def.name).join(' + ')
    : 'No identity selected';

  const picker = pickerOpen && onArchetypesChange && (
    <ArchetypePicker
      statuses={statuses}
      selection={selection}
      onChange={onArchetypesChange}
      onClose={() => setPickerOpen(false)}
    />
  );

  if (collapsed) {
    return (
      <div className="bg-white border-b border-stone-200 shrink-0 shadow-sm z-10 h-7 px-4 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 truncate">
          Team report · {identityLabel} · RIM {rimPct}% MID {midPct}% 3PT {perPct}%
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand team report"
          title="Expand team report"
          className="shrink-0 text-stone-400 hover:text-stone-600"
        >
          <ChevronIcon direction="down" />
        </button>
        {picker}
      </div>
    );
  }

  const collapseButton = (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label="Collapse team report"
      title="Collapse team report"
      className="shrink-0 text-stone-400 hover:text-stone-600"
    >
      <ChevronIcon direction="up" />
    </button>
  );

  return (
    <div className="bg-white border-b border-stone-200 shrink-0 shadow-sm z-10 px-5 py-3 flex items-stretch gap-8">

      {/* 1. Team identity */}
      <div className="flex flex-col gap-1 shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Team identity</h3>
        <RadarChart data={identity} average={referenceIdentity} size={176} />
      </div>

      {/* 2. Shot diet */}
      <div className="flex flex-col gap-1 pl-8 border-l border-stone-200 shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Shot diet</h3>
        <div className="flex-1 flex items-center">
          <DonutChart
            size={124}
            strokeWidth={20}
            data={[
              { label: 'RIM', value: shotDiet.rim, color: '#f43f5e' },
              { label: 'MID', value: shotDiet.mid, color: '#f59e0b' },
              { label: '3PT', value: shotDiet.per, color: '#0284c7' },
            ]}
          />
        </div>
      </div>

      {/* 3. Identity — selected archetype(s), or a prompt to choose one */}
      <div className="min-w-0 flex-1 pl-8 border-l border-stone-200 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Identity</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {onArchetypesChange && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 hover:text-emerald-800 border border-emerald-200 bg-emerald-50 rounded px-1.5 py-0.5"
              >
                Choose identity
              </button>
            )}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPopoverOpen(o => !o)}
                className="text-[9px] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-1.5 py-0.5"
              >
                All plans
              </button>
              {popoverOpen && <AllPlansPopover statuses={statuses} selectedIds={selectedIds} onClose={() => setPopoverOpen(false)} />}
            </div>
          </div>
        </div>

        {selectedStatuses.length === 0 ? (
          <p className="text-[10px] text-stone-400 italic">No identity selected</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedStatuses.map(s => (
              <div key={s.def.id} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100 min-w-0">
                <span className="text-emerald-500 text-[10px] mt-0.5 shrink-0">✦</span>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="font-bold text-[10px] text-stone-700 truncate">{s.def.name}</span>
                  <span className={`text-[8px] font-black uppercase tracking-wide w-fit px-1 py-0.5 rounded mt-0.5 ${TIER_CLASS[s.tier]}`}>
                    {TIER_LABEL[s.tier]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Next up — last in the row */}
      <div className="flex flex-col gap-1 pl-8 border-l border-stone-200 w-[250px] shrink-0 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Next up</h3>
          {collapseButton}
        </div>
        {nextUp.length === 0 ? (
          <p className="text-[10px] text-stone-400 italic">No plans within reach yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {nextUp.map(status => {
              const { have, need } = primaryCarrierFraction(status);
              return (
                <div key={status.def.id} title={`${status.def.colors.primary} ${have}/${need} carriers`} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100 min-w-0">
                  <span className="text-stone-300 text-[10px] mt-0.5 shrink-0">✦</span>
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="font-bold text-[10px] text-stone-600 truncate">{status.def.name}</span>
                    <span className="flex items-center gap-1.5 mt-1">
                      <span className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                        <span className="block h-full bg-emerald-400" style={{ width: `${status.progress * 100}%` }} />
                      </span>
                      <span className="text-[9px] font-bold text-stone-500 shrink-0">{have}/{need} carriers</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {picker}
    </div>
  );
}
