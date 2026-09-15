'use client';

import React, { useEffect, useRef, useState } from 'react';
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
import { Trash2, Save as SaveIcon, Play as PlayIcon } from 'lucide-react';
import { DonutChart } from './DonutChart';
import { RadarChart, peakValleyAxes } from './RadarChart';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

/** D2 wave 2 (plan_deckbuilder_ux T3b): the band's right-cluster actions, wired by the
 *  caller (DeckBuilder, T4). Fixed contract — names must match exactly. */
export interface KpiBandActions {
  onClear: () => void;
  onSave: () => void;
  onSaveAndPlay: () => void;
  /** Save enabled. */
  canSave: boolean;
  /** Save & play season enabled. */
  canPlay: boolean;
  /** e.g. "Need 5 starters" — shown as a tooltip on the disabled controls. */
  disabledReason?: string;
}

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'LOCKED', online: 'ONLINE', dedicated: 'DEDICATED' };

const COLLAPSE_STORAGE_KEY = 'deckbuilder.reportCollapsed';
const ROSTER_SIZE = 12;

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

/** Status dot state for a "n/target" chip: hollow = nothing yet, warn = in progress,
 *  positive = complete. */
type DotState = 'hollow' | 'warn' | 'positive';
function countDotState(current: number, target: number): DotState {
  if (current <= 0) return 'hollow';
  if (current >= target) return 'positive';
  return 'warn';
}

function StatusDot({ state }: { state: DotState }) {
  if (state === 'hollow') {
    return <span className="w-2 h-2 rounded-full border-2 border-ink-subtle box-border shrink-0" aria-hidden="true" />;
  }
  return <span className={`w-2 h-2 rounded-full shrink-0 ${state === 'positive' ? 'bg-positive' : 'bg-warn'}`} aria-hidden="true" />;
}

/** One 44px chip: dot + muted label + strong value. Doubles as the expand/collapse
 *  toggle (D2: clicking any chip is the same toggle as the chevron). */
function Chip({ dot, label, value, valueClassName, onClick }: {
  dot: DotState;
  label: string;
  value: string;
  valueClassName?: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={onClick}
      className="h-control px-3 gap-2 text-xs font-black uppercase tracking-widest text-ink-muted"
    >
      <StatusDot state={dot} />
      <span>{label}</span>
      <span className={valueClassName ?? 'text-ink-strong'}>{value}</span>
    </Button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-line shrink-0" aria-hidden="true" />;
}

export function TopKPIBand({
  identity,
  shotDiet,
  depthChart,
  average,
  starterIds,
  archetypes,
  onArchetypesChange,
  playsAssigned,
  playsTarget = 3,
  defaultExpanded,
  actions,
}: {
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
  /** Plays assigned so far. Optional — the Plays chip hides when this is undefined
   *  (DeckBuilder does not wire this yet; see plan_deckbuilder_ux T3 report). */
  playsAssigned?: number;
  /** Total play slots to fill. Defaults to 3 (D2 artboard). */
  playsTarget?: number;
  /** Test-only override of the initial expanded state, bypassing localStorage (used by
   *  /test-ui to snapshot both the collapsed and expanded band). Leave unset in product code. */
  defaultExpanded?: boolean;
  /** D2 wave 2: the band's right-cluster actions (Clear / Save / Save & play season).
   *  Renders in both the collapsed row and the expanded band's header row; absent = the
   *  cluster renders nothing (existing callers keep working). */
  actions?: KpiBandActions;
}) {
  const [collapsed, setCollapsed] = useState(() => (defaultExpanded === undefined ? true : !defaultExpanded));
  // The open report is an overlay: Escape closes it, and so does any pointer-down
  // outside the band (owner: clicking the depth chart must just work, not first
  // dismiss the report) — same pattern as ui/Menu.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (collapsed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleCollapsed(); };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) toggleCollapsed();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);
  useEffect(() => {
    if (defaultExpanded === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(readStoredCollapsed());
    }
  }, [defaultExpanded]);
  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      if (defaultExpanded === undefined) writeStoredCollapsed(next);
      return next;
    });
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

  const identityValueLabel = selectedIds.size > 0
    ? statuses.filter(s => selectedIds.has(s.def.id)).map(s => s.def.name).join(' + ')
    : 'none';

  const rimPct = Math.round(shotDiet.rim * 100);
  const midPct = Math.round(shotDiet.mid * 100);
  const perPct = Math.round(shotDiet.per * 100);
  const referenceIdentity = average ?? LEAGUE_AVG_IDENTITY;
  const { peak, valley } = peakValleyAxes(identity, referenceIdentity);

  const playersDot = countDotState(activePlayers.length, ROSTER_SIZE);
  const playsDot = playsAssigned !== undefined ? countDotState(playsAssigned, playsTarget) : 'hollow';
  const identityDot: DotState = selectedIds.size > 0 ? 'positive' : 'hollow';

  const chipRow = (
    <div className="h-nav shrink-0 flex items-center gap-2 pl-4 pr-16 box-border">
      <div className="flex items-center gap-1">
        <Chip dot={playersDot} label="Players" value={`${activePlayers.length}/${ROSTER_SIZE}`} onClick={toggleCollapsed} />
        {playsAssigned !== undefined && (
          <Chip dot={playsDot} label="Plays" value={`${playsAssigned}/${playsTarget}`} onClick={toggleCollapsed} />
        )}
        <Chip
          dot={identityDot}
          label="Identity"
          value={identityValueLabel}
          valueClassName={identityValueLabel === 'none' ? 'text-ink-subtle font-bold normal-case tracking-normal' : 'text-ink-strong font-bold normal-case tracking-normal'}
          onClick={toggleCollapsed}
        />
      </div>

      <Divider />

      {/* game_canvas T0: below an 1100px container the row cannot hold the chips, this
          pair and the three actions — the pair lives in the expanded report too. */}
      <div className="hidden @min-[1100px]:flex items-center gap-4 px-2 text-xs font-black uppercase tracking-wide">
        <span className="inline-flex items-center gap-1.5 text-positive">▲ {peak}</span>
        <span className="inline-flex items-center gap-1.5 text-danger">▼ {valley}</span>
      </div>

      {/* D2: the shot-diet mini renders only from a 1440px container — below that it
          lives in the expanded band's detail row instead. */}
      <div className="hidden @min-[1440px]:flex items-center shrink-0">
        <Divider />
        <div className="flex items-center gap-3.5 px-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger shrink-0" aria-hidden="true" />Rim <strong className="text-ink-strong font-black">{rimPct}</strong></span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn shrink-0" aria-hidden="true" />Mid <strong className="text-ink-strong font-black">{midPct}</strong></span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-info shrink-0" aria-hidden="true" />3PT <strong className="text-ink-strong font-black">{perPct}</strong></span>
        </div>
      </div>

      <div className="flex-1" />

      {actions && (
        <>
          <IconButton
            label="Clear roster"
            variant="ghost"
            onClick={actions.onClear}
            className="shrink-0"
          >
            <Trash2 size={20} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={actions.canSave ? 'Save' : `Save — ${actions.disabledReason}`}
            variant="raised"
            disabled={!actions.canSave}
            onClick={actions.onSave}
            className="shrink-0"
          >
            <SaveIcon size={20} aria-hidden="true" />
          </IconButton>
          <Button
            variant="primary"
            size="md"
            className="whitespace-nowrap shrink-0"
            disabled={!actions.canPlay}
            title={!actions.canPlay ? actions.disabledReason : undefined}
            onClick={actions.onSaveAndPlay}
          >
            <PlayIcon size={18} aria-hidden="true" className="@min-[1100px]:hidden" />
            <span className="hidden @min-[1100px]:inline">Save &amp; play season</span>
            <span className="sr-only @min-[1100px]:hidden">Save &amp; play season</span>
          </Button>
        </>
      )}

      <IconButton
        label={collapsed ? 'Expand team report' : 'Collapse team report'}
        variant="ghost"
        onClick={toggleCollapsed}
        className="shrink-0"
      >
        <ChevronIcon direction={collapsed ? 'down' : 'up'} />
      </IconButton>
    </div>
  );

  if (collapsed) {
    return (
      <div className="bg-surface-raised border-b border-line shrink-0 shadow-sm z-10">
        {chipRow}
      </div>
    );
  }

  return (
    // Owner review: the expanded report must never push the workspace down (the depth
    // chart is sized to the space it has) — so the band stays 56px in flow and the
    // detail row drops OVER the workspace like a menu. Escape or the chevron closes it.
    <div ref={rootRef} className="relative bg-surface-raised border-b border-line shrink-0 shadow-sm z-30">
      {chipRow}

      {/* detail row: radar | shot diet | identity lanes — an overlay below the chip row */}
      <div className="absolute left-0 right-0 top-full z-30 flex items-stretch gap-6 px-5 pr-16 py-3 bg-surface-raised border-b border-line shadow-lg">

        {/* 1. Team identity radar, natural size (168 base -> 368x192 rendered). */}
        <div className="flex flex-col gap-1 shrink-0">
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Team identity</h3>
          <RadarChart data={identity} average={referenceIdentity} size={144} />
        </div>

        {/* 2. Shot diet. */}
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
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Identity</h3>

          <div className="flex flex-col gap-1.5">
              {groups.map(group => (
                <div key={group.slot} className={`flex items-center gap-2 flex-wrap min-w-0 min-h-control rounded-control border px-2 py-1.5 ${group.plans.length > 0 ? 'border-line bg-surface-sunken/60' : 'border-dashed border-line'}`}>
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
    </div>
  );
}
