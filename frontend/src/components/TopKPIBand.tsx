import React from 'react';
import { RosterIdentity, getBadgeTally } from '../engine/rosterStats';
import { SYNERGIES } from '../engine/synergies';
import type { TeamBonuses } from '../engine/synergies';
import type { TeamShotProfile } from '../engine/game';
import type { PlayerCardData } from '../engine/types';
import { DonutChart } from './DonutChart';

// League-mean values for each identity axis, computed over the full card pool
// (see data/game_logs/analysis_report.md). Used ONLY to draw a reference tick
// on the identity bars — never rendered as a number (product rule: no ratings
// or OVR shown to the player).
const LEAGUE_AVG_IDENTITY: Record<keyof RosterIdentity, number> = {
  finishing: 55.5,
  midRange: 49.0,
  perimeter: 57.5,
  playmaking: 35.3,
  rebounding: 41.1,
  perDef: 53.5,
  postDef: 46.4,
};

// Synergy ids whose "stacking" badge teaser (from getBadgeTally) can be shown
// on an inactive chip, mapped to the badge-name prefix used in that teaser's
// text (e.g. "Sharpshooter 3/4") — see getBadgeTally in engine/rosterStats.ts.
const STACKING_TEASER_PREFIX: Record<string, string> = {
  'shooting-gallery': 'Sharpshooter',
  'paint-dominance': 'Finisher',
  'lockdown-squad': 'Lockdown Def',
  'boards-brigade': 'Glass Cleaner',
  'court-vision': 'Floor General',
  'midrange-money': 'Mid-Range Maestro',
};

function Bar({ label, value, avg, color }: { label: string; value: number; avg: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const avgPct = Math.min(100, Math.max(0, avg));
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase text-stone-600 w-[55px] text-right leading-none">{label}</span>
      <div className="relative flex-1 h-2 bg-stone-100 rounded-full border border-stone-300 overflow-visible">
        <div className="h-full rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute -top-[3px] text-stone-500 text-[6px] leading-none -translate-x-1/2 pointer-events-none"
          style={{ left: `${avgPct}%` }}
          title={`League average`}
        >
          ▼
        </div>
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
    return {
      id: syn.id,
      name: syn.name,
      description: activeData?.description ?? syn.description,
      active,
      teaser,
    };
  }).sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <div className="bg-white border-b border-stone-200 px-4 py-3 shrink-0 flex items-stretch gap-6 shadow-sm z-10">

      {/* 1. Identity Radar */}
      <div className="flex-1 max-w-[450px] flex flex-col justify-center">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Team Identity</h3>
        <div className="grid grid-cols-3 gap-x-4">
          <div className="flex flex-col gap-1.5">
            <Bar label="Finishing" value={identity.finishing} avg={LEAGUE_AVG_IDENTITY.finishing} color="bg-purple-500" />
            <Bar label="Mid-Range" value={identity.midRange} avg={LEAGUE_AVG_IDENTITY.midRange} color="bg-purple-500" />
            <Bar label="3PT" value={identity.perimeter} avg={LEAGUE_AVG_IDENTITY.perimeter} color="bg-purple-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bar label="Perimeter D" value={identity.perDef} avg={LEAGUE_AVG_IDENTITY.perDef} color="bg-teal-500" />
            <Bar label="Post Def" value={identity.postDef} avg={LEAGUE_AVG_IDENTITY.postDef} color="bg-teal-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bar label="Playmaking" value={identity.playmaking} avg={LEAGUE_AVG_IDENTITY.playmaking} color="bg-pink-500" />
            <Bar label="Rebounding" value={identity.rebounding} avg={LEAGUE_AVG_IDENTITY.rebounding} color="bg-pink-500" />
          </div>
        </div>
        <div className="text-[8px] text-stone-400 mt-1.5 flex items-center gap-1">
          <span>▼</span><span>league avg</span>
        </div>
      </div>

      <div className="w-px bg-stone-200 my-1" />

      {/* 2. Expected Shot Diet */}
      <div className="flex-1 max-w-[220px] flex flex-col justify-center items-center">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 w-full">Expected Shot Diet</h3>
        <div className="flex-1 flex items-center justify-center -mt-2">
          <DonutChart
            size={70}
            strokeWidth={14}
            data={[
              { label: 'RIM', value: shotDiet.rim, color: '#ef4444' },
              { label: 'MID', value: shotDiet.mid, color: '#f59e0b' },
              { label: '3PT', value: shotDiet.per, color: '#3b82f6' }
            ]}
          />
        </div>
      </div>

      <div className="w-px bg-stone-200 my-1" />

      {/* 3. Synergies & Plays (Engine Tracker) */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Engine Tracker</h3>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[64px] pr-2 custom-scrollbar">
          <div className="flex flex-wrap gap-1.5">
            {synergyChips.map(chip => chip.active ? (
              <div key={chip.id} title={chip.description} className="flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-500 bg-emerald-500 shadow-sm">
                <span className="text-white text-[9px] font-black leading-none">✓</span>
                <span className="text-[9px] font-bold text-white uppercase">{chip.name}</span>
              </div>
            ) : (
              <div key={chip.id} title={chip.teaser ? `${chip.teaser.text} — ${chip.description}` : chip.description} className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-stone-200 bg-stone-50 opacity-70">
                <span className="text-[9px] font-bold text-stone-400 uppercase">{chip.name}</span>
                {chip.teaser && (
                  <>
                    <span className="text-[8px] font-bold text-stone-400 whitespace-nowrap">{chip.teaser.text}</span>
                    <span className="w-6 h-1 bg-stone-200 rounded-full overflow-hidden shrink-0">
                      <span className="block h-full bg-stone-400" style={{ width: `${chip.teaser.progress * 100}%` }} />
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>

          {bonuses.activePlays.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {bonuses.activePlays.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  title={p.description}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${
                    p.activated === 'full' ? 'border-amber-500 bg-amber-500' :
                    p.activated === 'partial' ? 'border-amber-300 bg-amber-50' :
                    'border-stone-200 bg-stone-50 opacity-60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    p.activated === 'full' ? 'bg-white' : p.activated === 'partial' ? 'bg-amber-400' : 'bg-stone-400'
                  }`} />
                  <span className={`text-[9px] font-bold uppercase ${p.activated === 'full' ? 'text-white' : 'text-stone-500'}`}>{p.name}</span>
                </div>
              ))}
            </div>
          )}

          {synergyChips.every(c => !c.active) && bonuses.activePlays.length === 0 && (
            <span className="text-[10px] text-stone-400 italic">No synergies or plays.</span>
          )}
        </div>
      </div>

    </div>
  );
}
