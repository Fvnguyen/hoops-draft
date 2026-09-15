'use client';

import React, { useEffect, useState } from 'react';
import { RosterIdentity, LEAGUE_AVG_IDENTITY } from '../engine/rosterStats';
import type { TeamBonuses } from '../engine/synergies';
import type { TeamShotProfile } from '../engine/game';
import type { PlayerCardData } from '../engine/types';
import {
  evaluateArchetypes,
  shortlistArchetypes,
  type ArchetypeStatus,
  type ArchetypeSelection,
  type ArchetypeTier,
} from '../engine/archetypes';
import { DonutChart } from './DonutChart';
import { RadarChart } from './RadarChart';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'LOCKED', online: 'ONLINE', dedicated: 'DEDICATED' };

const COLLAPSE_STORAGE_KEY = 'deckbuilder.reportCollapsed';

/** Defaults to collapsed on a first visit (D22); a user's own un-collapse persists. */
function readStoredCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // best-effort persistence only
  }
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg width={14} height={14} viewBox="0 0 20 20" fill="none" className={direction === 'down' ? 'rotate-180' : undefined} aria-hidden="true">
      <path d="M5 12l5-5 5 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Which philosophy slot a plan belongs to. */
type Slot = 'offense' | 'defense' | 'gold';
function slotOf(s: ArchetypeStatus): Slot {
  if (s.def.kind === 'gold') return 'gold';
  return s.def.side === 'defense' ? 'defense' : 'offense';
}

/** Toggle a plan in the selection. Gold replaces both slots; offense/defense clear gold. */
export function toggleArchetype(selection: ArchetypeSelection, slot: Slot, id: string): ArchetypeSelection {
  if (slot === 'gold') return selection.gold === id ? {} : { gold: id };
  const next: ArchetypeSelection = { offense: selection.offense, defense: selection.defense };
  next[slot] = next[slot] === id ? undefined : id;
  return next;
}

/**
 * Selected plan ids for a selection, honouring the product rule that only UNLOCKED plans
 * (tier online/dedicated) count: a plan that dropped below Online is treated as not selected.
 */
export function selectedUnlockedIds(selection: ArchetypeSelection, statuses: ArchetypeStatus[]): Set<string> {
  const unlocked = new Set(shortlistArchetypes(statuses).map(s => s.def.id));
  const ids = [selection.gold, selection.offense, selection.defense].filter((id): id is string => !!id && unlocked.has(id));
  return new Set(ids);
}

const SLOT_LABEL_COLOR: Record<Slot, string> = {
  offense: 'text-danger',
  defense: 'text-info',
  gold: 'text-accent',
};

export function TopKPIBand({ identity, shotDiet, depthChart, average, starterIds, archetypes, onArchetypesChange }: {
  identity: RosterIdentity;
  shotDiet: TeamShotProfile;
  /** Kept for API compatibility with callers; the band derives everything from depthChart. */
  bonuses?: TeamBonuses;
  depthChart: Record<string, PlayerCardData[]>;
  average?: RosterIdentity;
  /** Depth-chart index-0 players, used for archetype tier thresholds. Defaults to each column's first player. */
  starterIds?: Set<string>;
  /** The user's chosen Offense/Defense plan (or Gold plan). */
  archetypes?: ArchetypeSelection;
  /** Present only when the band is editable; absent = read-only. */
  onArchetypesChange?: (sel: ArchetypeSelection) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readStoredCollapsed());
  }, []);
  function toggleCollapsed() {
    setCollapsed(prev => { const next = !prev; writeStoredCollapsed(next); return next; });
  }

  const activePlayers = Object.values(depthChart).flat();
  const defaultStarterIds = new Set<string>();
  for (const col of Object.values(depthChart)) if (col[0]) defaultStarterIds.add(col[0].id);
  const effectiveStarterIds = starterIds ?? defaultStarterIds;
  const selection = archetypes ?? {};
  const statuses = evaluateArchetypes(activePlayers, effectiveStarterIds, selection);

  // Product rule: a roster is offered at most 4 unlocked plans (shortlistArchetypes
  // keeps the best plan of each lane first). Lanes always render. A locked plan is
  // never selectable, but the single highest-progress locked plan per lane gets a
  // muted "why locked" hint below the unlocked plans (amends the old "locked plans
  // hidden" rule — see AGENTS.md).
  const unlocked = shortlistArchetypes(statuses);
  const selectedIds = selectedUnlockedIds(selection, statuses);
  function bestLockedHint(slot: Slot): ArchetypeStatus | undefined {
    const locked = statuses.filter(s => s.tier === 'none' && slotOf(s) === slot);
    if (locked.length === 0) return undefined;
    return locked.reduce((best, s) => (s.progress > best.progress ? s : best));
  }
  const groups: Array<{ slot: Slot; label: string; plans: ArchetypeStatus[]; lockedHint?: ArchetypeStatus }> = [
    { slot: 'offense' as Slot, label: 'Offense', plans: unlocked.filter(s => slotOf(s) === 'offense'), lockedHint: bestLockedHint('offense') },
    { slot: 'defense' as Slot, label: 'Defense', plans: unlocked.filter(s => slotOf(s) === 'defense'), lockedHint: bestLockedHint('defense') },
    { slot: 'gold' as Slot, label: 'Gold', plans: unlocked.filter(s => slotOf(s) === 'gold'), lockedHint: bestLockedHint('gold') },
  ];

  const identityLabel = selectedIds.size > 0
    ? statuses.filter(s => selectedIds.has(s.def.id)).map(s => s.def.name).join(' + ')
    : 'No identity selected';

  const rimPct = Math.round(shotDiet.rim * 100);
  const midPct = Math.round(shotDiet.mid * 100);
  const perPct = Math.round(shotDiet.per * 100);
  const referenceIdentity = average ?? LEAGUE_AVG_IDENTITY;

  if (collapsed) {
    return (
      <div className="bg-surface-raised border-b border-line shrink-0 shadow-sm z-10 min-h-control pl-4 pr-16 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-ink-subtle truncate">
          Team report · {identityLabel} · RIM {rimPct}% MID {midPct}% 3PT {perPct}%
        </span>
        <IconButton
          label="Expand team report"
          variant="ghost"
          onClick={toggleCollapsed}
          className="shrink-0"
        >
          <ChevronIcon direction="down" />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border-b border-line shrink-0 shadow-sm z-10 pl-5 pr-16 py-2 flex items-stretch gap-6">

      {/* 1. Team identity radar — scaled up from 120px (D4, plan ui_polish_small_fixes):
           120px read as cramped once the badge/plan panel next to it filled out. */}
      <div className="flex flex-col gap-1 shrink-0">
        <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Team identity</h3>
        <RadarChart data={identity} average={referenceIdentity} size={168} />
      </div>

      {/* 2. Shot diet — sized down from 124px/20px (D22), same reasoning as the radar. */}
      <div className="flex flex-col gap-1 pl-6 border-l border-line shrink-0">
        <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Shot diet</h3>
        <div className="flex-1 flex items-center">
          <DonutChart
            size={90}
            strokeWidth={14}
            data={[
              { label: 'RIM', value: shotDiet.rim, color: 'var(--danger)' },
              { label: 'MID', value: shotDiet.mid, color: 'var(--warn)' },
              { label: '3PT', value: shotDiet.per, color: 'var(--info)' },
            ]}
          />
        </div>
      </div>

      {/* 3. Identity — only UNLOCKED plans are shown; the selected one is highlighted and
             any other unlocked plan can be selected with a click. Locked plans stay hidden. */}
      <div className="min-w-0 flex-1 pl-6 border-l border-line flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Identity</h3>
          <IconButton
            label="Collapse team report"
            variant="ghost"
            onClick={toggleCollapsed}
            className="shrink-0"
          >
            <ChevronIcon direction="up" />
          </IconButton>
        </div>

        <div className="flex flex-col gap-1.5">
            {groups.map(group => (
              <div key={group.slot} className={`flex items-center gap-2 flex-wrap min-w-0 rounded-md border px-2 py-1.5 ${group.plans.length > 0 ? 'border-line bg-surface-sunken/60' : 'border-dashed border-line'}`}>
                <span className={`text-xs font-black uppercase tracking-widest w-14 shrink-0 ${SLOT_LABEL_COLOR[group.slot]}`}>{group.label}</span>
                {group.plans.length === 0 && (
                  <span className="text-xs text-ink-subtle italic">No plan unlocked</span>
                )}
                {group.plans.map(s => {
                  const selected = selectedIds.has(s.def.id);
                  const editable = !!onArchetypesChange;
                  return (
                    <Button
                      key={s.def.id}
                      variant={selected ? 'primary' : 'secondary'}
                      size="md"
                      disabled={!editable}
                      onClick={() => onArchetypesChange?.(toggleArchetype(selection, group.slot, s.def.id))}
                      title={`${s.def.name} — ${s.def.description}`}
                      className={`h-auto min-h-control gap-1.5 px-2 py-1 text-xs font-bold normal-case tracking-wide min-w-0 ${
                        selected
                          ? 'bg-positive-strong border-positive-strong text-white hover:bg-positive-strong'
                          : editable
                            ? 'bg-surface-raised border-line-strong text-ink-muted hover:border-positive hover:text-positive'
                            : 'bg-surface-sunken border-line text-ink-muted'
                      }`}
                    >
                      {selected && <span className="text-xs leading-none">✓</span>}
                      <span className="truncate">{s.def.name}</span>
                      <span className={`text-xs font-black rounded px-1 ${selected ? 'bg-white/20' : s.tier === 'dedicated' ? 'bg-warn-soft text-warn' : 'bg-positive-soft text-positive'}`}>
                        {TIER_LABEL[s.tier]}
                      </span>
                    </Button>
                  );
                })}
                {group.lockedHint && (
                  <span
                    title={`${group.lockedHint.def.name} — locked`}
                    className="text-xs text-ink-subtle italic truncate min-w-0"
                  >
                    {group.lockedHint.def.name} locked
                    {group.lockedHint.missing.length > 0 && (
                      <> — {group.lockedHint.missing.slice(0, 2).join('; ')}</>
                    )}
                  </span>
                )}
              </div>
            ))}
            {onArchetypesChange && selectedIds.size === 0 && unlocked.length > 0 && (
              <p className="text-xs text-ink-subtle">Click a plan to make it your team&apos;s identity. A Gold plan takes both slots.</p>
            )}
        </div>
      </div>
    </div>
  );
}
