'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RosterIdentity, getBadgeTally } from '../engine/rosterStats';
import { SYNERGIES } from '../engine/synergies';
import type { TeamBonuses } from '../engine/synergies';
import type { TeamShotProfile } from '../engine/game';
import type { PlayerCardData } from '../engine/types';
import { DonutChart } from './DonutChart';
import { RadarChart } from './RadarChart';

// League-mean values for each identity axis, computed over the full card pool
// (see docs/ROADMAP.md P1-1). Used ONLY to draw the reference polygon on the
// identity radar — never rendered as a number (product rule: no ratings or OVR shown).
const LEAGUE_AVG_IDENTITY: Record<keyof RosterIdentity, number> = {
  finishing: 55.5,
  midRange: 49.0,
  perimeter: 57.5,
  playmaking: 35.3,
  rebounding: 41.1,
  perDef: 53.5,
  postDef: 46.4,
};

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

/** Some synergy descriptions read "<condition/name> (<effect>)" — keep just the
 *  parenthesized effect so chips stay short. Descriptions with no trailing
 *  parenthetical (the common case today) pass through untouched. */
function extractEffectText(description: string): string {
  const match = description.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : description;
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

function SynergyPopover({ activeNames, onClose }: { activeNames: Set<string>; onClose: () => void }) {
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
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 mb-1">All synergies</h4>
      <div className="flex flex-col gap-1">
        {SYNERGIES.map(syn => {
          const active = activeNames.has(syn.name);
          return (
            <div key={syn.id} className={`rounded px-2 py-1 ${active ? 'bg-emerald-50' : 'bg-stone-50'}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                {active && <span className="text-[9px] font-black text-emerald-600 shrink-0">✓</span>}
                <span className="text-[10px] font-bold text-stone-700 truncate">{syn.name}</span>
                <span className="text-[8px] font-bold uppercase tracking-wide text-stone-400 shrink-0 ml-auto">{syn.category}</span>
              </div>
              <p className="text-[9px] text-stone-500 leading-snug mt-0.5">{syn.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TopKPIBand({ identity, shotDiet, bonuses, depthChart, average }: {
  identity: RosterIdentity;
  shotDiet: TeamShotProfile;
  bonuses: TeamBonuses;
  depthChart: Record<string, PlayerCardData[]>;
  average?: RosterIdentity;
}) {
  // Default expanded on every render (including SSR); synced from localStorage
  // after mount so server and first client render always agree.
  const [collapsed, setCollapsed] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

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

  const { teasers } = getBadgeTally(depthChart);
  const activeNames = new Set(bonuses.activeSynergies.map(s => s.name));
  const topTeasers = [...teasers].sort((a, b) => b.progress - a.progress).slice(0, 3);

  const rimPct = Math.round(shotDiet.rim * 100);
  const midPct = Math.round(shotDiet.mid * 100);
  const perPct = Math.round(shotDiet.per * 100);
  const referenceIdentity = average ?? LEAGUE_AVG_IDENTITY;

  if (collapsed) {
    return (
      <div className="bg-white border-b border-stone-200 shrink-0 shadow-sm z-10 h-7 px-4 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 truncate">
          Team report · {bonuses.activeSynergies.length} synergies active · RIM {rimPct}% MID {midPct}% 3PT {perPct}%
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
      </div>
    );
  }

  const MAX_VISIBLE = 6;
  const visibleSynergies = bonuses.activeSynergies.slice(0, MAX_VISIBLE);
  const hiddenCount = bonuses.activeSynergies.length - visibleSynergies.length;

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

      {/* 3. Active synergies — at most 6 rows, then "+N more" (no clipped rows) */}
      <div className="min-w-0 flex-1 pl-8 border-l border-stone-200 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Active synergies</h3>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPopoverOpen(o => !o)}
              className="text-[9px] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-1.5 py-0.5"
            >
              All synergies
            </button>
            {popoverOpen && <SynergyPopover activeNames={activeNames} onClose={() => setPopoverOpen(false)} />}
          </div>
        </div>

        {bonuses.activeSynergies.length === 0 ? (
          <p className="text-[10px] text-stone-400 italic">No active synergies yet</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
            {visibleSynergies.map(s => (
              <div key={s.name} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100 min-w-0">
                <span className="text-emerald-500 text-[10px] mt-0.5 shrink-0">✦</span>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="font-bold text-[10px] text-stone-700 truncate">{s.name}</span>
                  <span className="text-stone-500 text-[9px] leading-snug">{extractEffectText(s.description)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setPopoverOpen(true)}
            className="self-start text-[9px] font-bold uppercase tracking-wide text-emerald-600 hover:text-emerald-700 mt-0.5"
          >
            +{hiddenCount} more active
          </button>
        )}
      </div>

      {/* 4. Next up — last in the row */}
      <div className="flex flex-col gap-1 pl-8 border-l border-stone-200 w-[250px] shrink-0 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Next up</h3>
          {collapseButton}
        </div>
        {topTeasers.length === 0 ? (
          <p className="text-[10px] text-stone-400 italic">Every stacking synergy is active.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {topTeasers.map(teaser => {
              const parts = teaser.text.split(' ');
              const fraction = parts.pop();
              const name = parts.join(' ');
              return (
                <div key={teaser.text} title={teaser.text} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100 min-w-0">
                  <span className="text-stone-300 text-[10px] mt-0.5 shrink-0">✦</span>
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="font-bold text-[10px] text-stone-600 truncate">{name}</span>
                    <span className="flex items-center gap-1.5 mt-1">
                      <span className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                        <span className="block h-full bg-emerald-400" style={{ width: `${teaser.progress * 100}%` }} />
                      </span>
                      <span className="text-[9px] font-bold text-stone-500 shrink-0">{fraction}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
