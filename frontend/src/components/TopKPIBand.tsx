import React from 'react';
import { RosterIdentity, getBadgeTally } from '../engine/rosterStats';
import { SYNERGIES } from '../engine/synergies';
import type { TeamBonuses } from '../engine/synergies';
import type { TeamShotProfile } from '../engine/game';
import type { PlayerCardData } from '../engine/types';
import { DonutChart } from './DonutChart';

// League-mean values for each identity axis, computed over the full card pool
// (see docs/ROADMAP.md P1-1). Used ONLY to draw a reference tick on the identity
// bars — never rendered as a number (product rule: no ratings or OVR shown).
const LEAGUE_AVG_IDENTITY: Record<keyof RosterIdentity, number> = {
  finishing: 55.5,
  midRange: 49.0,
  perimeter: 57.5,
  playmaking: 35.3,
  rebounding: 41.1,
  perDef: 53.5,
  postDef: 46.4,
};

// Synergy ids whose "stacking" badge teaser (from getBadgeTally) can be shown on an
// inactive chip, mapped to the badge-name prefix used in that teaser's text.
const STACKING_TEASER_PREFIX: Record<string, string> = {
  'shooting-gallery': 'Sharpshooter',
  'paint-dominance': 'Finisher',
  'lockdown-squad': 'Lockdown Def',
  'boards-brigade': 'Glass Cleaner',
  'court-vision': 'Floor General',
  'midrange-money': 'Mid-Range Maestro',
};

const IDENTITY_ROWS: Array<{ key: keyof RosterIdentity; label: string; color: string }> = [
  { key: 'finishing', label: 'Finishing', color: 'bg-purple-500' },
  { key: 'midRange', label: 'Mid-Range', color: 'bg-purple-500' },
  { key: 'perimeter', label: '3PT', color: 'bg-purple-500' },
  { key: 'playmaking', label: 'Playmaking', color: 'bg-pink-500' },
  { key: 'rebounding', label: 'Rebounding', color: 'bg-pink-500' },
  { key: 'perDef', label: 'Perimeter D', color: 'bg-teal-500' },
  { key: 'postDef', label: 'Post D', color: 'bg-teal-500' },
];

function IdentityBar({ label, value, avg, color }: { label: string; value: number; avg: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const avgPct = Math.min(100, Math.max(0, avg));
  return (
    <div className="flex items-center gap-2 h-[14px]">
      <span className="w-[76px] shrink-0 text-[9px] font-bold uppercase tracking-wide text-stone-500 text-right leading-none whitespace-nowrap">{label}</span>
      <div className="relative flex-1 h-2 rounded-full bg-stone-100 border border-stone-200">
        <div className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        {/* League-average tick: a thin dark line, no number */}
        <div className="absolute -top-[2px] h-[12px] w-px bg-stone-700/70" style={{ left: `${avgPct}%` }} title="League average" />
      </div>
    </div>
  );
}

export function TopKPIBand({ identity, shotDiet, bonuses, depthChart }: {
  identity: RosterIdentity;
  shotDiet: TeamShotProfile;
  bonuses: TeamBonuses;
  depthChart: Record<string, PlayerCardData[]>;
}) {
  const { teasers } = getBadgeTally(depthChart);
  const activeSynergyNames = new Set(bonuses.activeSynergies.map(s => s.name));

  const synergyChips = SYNERGIES.map(syn => {
    const active = activeSynergyNames.has(syn.name);
    const activeData = bonuses.activeSynergies.find(a => a.name === syn.name);
    const teaserPrefix = STACKING_TEASER_PREFIX[syn.id];
    const teaser = !active && teaserPrefix ? teasers.find(t => t.text.startsWith(teaserPrefix)) : undefined;
    // Teaser text is "<Badge> 3/4" — keep only the fraction for the chip.
    const fraction = teaser ? teaser.text.split(' ').pop() : undefined;
    return { id: syn.id, name: syn.name, description: activeData?.description ?? syn.description, active, progress: teaser?.progress, fraction };
  }).sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <div className="bg-white border-b border-stone-200 px-4 py-2.5 shrink-0 shadow-sm z-10 grid gap-x-6 gap-y-2 items-start grid-cols-1 lg:grid-cols-[minmax(280px,3fr)_auto_minmax(340px,5fr)]">

      {/* 1. Team identity — one column of seven rows, labels never wrap */}
      <div className="min-w-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Team Identity</h3>
        <div className="flex flex-col gap-[3px]">
          {IDENTITY_ROWS.map(r => (
            <IdentityBar key={r.key} label={r.label} value={identity[r.key]} avg={LEAGUE_AVG_IDENTITY[r.key]} color={r.color} />
          ))}
        </div>
        <div className="text-[8px] text-stone-400 mt-1 pl-[84px]">| league avg</div>
      </div>

      {/* 2. Expected shot diet */}
      <div className="min-w-0 lg:px-4 lg:border-x lg:border-stone-200">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Shot Diet</h3>
        <DonutChart
          size={64}
          strokeWidth={13}
          data={[
            { label: 'RIM', value: shotDiet.rim, color: '#ef4444' },
            { label: 'MID', value: shotDiet.mid, color: '#f59e0b' },
            { label: '3PT', value: shotDiet.per, color: '#3b82f6' },
          ]}
        />
      </div>

      {/* 3. Engine tracker — one line per chip, all chips visible, nothing cut mid-word */}
      <div className="min-w-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Engine Tracker</h3>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-1">
          {synergyChips.map(chip => chip.active ? (
            <div key={chip.id} title={chip.description} className="flex items-center gap-1 h-5 px-2 rounded bg-emerald-500 text-white min-w-0">
              <span className="text-[9px] font-black leading-none shrink-0">✓</span>
              <span className="text-[9px] font-bold uppercase truncate">{chip.name}</span>
            </div>
          ) : (
            <div key={chip.id} title={chip.fraction ? `${chip.name}: ${chip.fraction} — ${chip.description}` : chip.description} className="flex items-center gap-1.5 h-5 px-2 rounded border border-stone-200 bg-stone-50 text-stone-400 min-w-0">
              <span className="text-[9px] font-bold uppercase truncate flex-1 min-w-0">{chip.name}</span>
              {chip.progress !== undefined && (
                <>
                  <span className="w-5 h-1 bg-stone-200 rounded-full overflow-hidden shrink-0">
                    <span className="block h-full bg-stone-400" style={{ width: `${chip.progress * 100}%` }} />
                  </span>
                  <span className="text-[8px] font-bold shrink-0">{chip.fraction}</span>
                </>
              )}
            </div>
          ))}
        </div>

        {bonuses.activePlays.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 min-w-0">
            <span className="text-[8px] font-bold uppercase tracking-widest text-stone-400 shrink-0 mr-1">Plays</span>
            {bonuses.activePlays.map((p, i) => (
              <div
                key={`${p.name}-${i}`}
                title={p.description}
                className={`flex items-center gap-1 h-5 px-2 rounded min-w-0 ${
                  p.activated === 'full' ? 'bg-amber-500 text-white' :
                  p.activated === 'partial' ? 'bg-amber-50 border border-amber-300 text-amber-700' :
                  'bg-stone-50 border border-stone-200 text-stone-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.activated === 'full' ? 'bg-white' : p.activated === 'partial' ? 'bg-amber-400' : 'bg-stone-300'}`} />
                <span className="text-[9px] font-bold uppercase truncate">{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
