import React from 'react';
import { RosterIdentity } from '../engine/rosterStats';
import { DonutChart } from './DonutChart';

export function TopKPIBand({ identity, shotDiet, bonuses }: { identity: RosterIdentity, shotDiet: any, bonuses: any }) {
  const Bar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase text-stone-600 w-[55px] text-right leading-none">{label}</span>
      <div className="flex-1 h-2 bg-stone-100 rounded-full border border-stone-300 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, (value / 100) * 100)}%` }}></div>
      </div>
    </div>
  );

  return (
    <div className="bg-white border-b border-stone-200 px-4 py-3 shrink-0 flex items-stretch gap-6 shadow-sm z-10">
      
      {/* 1. Identity Radar */}
      <div className="flex-1 max-w-[450px] flex flex-col justify-center">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Team Identity</h3>
        <div className="grid grid-cols-3 gap-x-4">
          <div className="flex flex-col gap-1.5">
            <Bar label="Finishing" value={identity.finishing} color="bg-purple-500" />
            <Bar label="Mid-Range" value={identity.midRange} color="bg-purple-500" />
            <Bar label="3PT" value={identity.perimeter} color="bg-purple-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bar label="Perimeter D" value={identity.perDef} color="bg-teal-500" />
            <Bar label="Post Def" value={identity.postDef} color="bg-teal-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bar label="Playmaking" value={identity.playmaking} color="bg-pink-500" />
            <Bar label="Rebounding" value={identity.rebounding} color="bg-pink-500" />
          </div>
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

      {/* 3. Synergies & Badges */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Engine Tracker</h3>
        <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-[50px] pr-2 custom-scrollbar">
          {bonuses.activeSynergies.map((s: any) => (
            <div key={s.name} className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50">
              <span className="text-emerald-500 text-[10px] mt-0.5">✦</span> 
              <span className="text-[9px] font-bold text-stone-700 uppercase">{s.name}</span>
            </div>
          ))}
          {bonuses.activePlays.filter((p: any) => p.activated === 'full').map((p: any) => (
            <div key={p.name} className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-200 bg-amber-50">
              <span className="text-amber-500 text-[10px] mt-0.5">▶</span>
              <span className="text-[9px] font-bold text-stone-700 uppercase">{p.name}</span>
            </div>
          ))}
          
          {/* Unfulfilled plays as progress */}
          {bonuses.activePlays.filter((p: any) => p.activated !== 'full').map((p: any) => (
            <div key={p.name} className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-stone-200 bg-stone-50 opacity-60">
              <span className="text-stone-400 text-[9px] font-bold uppercase">{p.name}</span>
              <div className="w-8 h-1 bg-stone-200 rounded-full overflow-hidden ml-1">
                <div className="h-full bg-stone-400" style={{ width: `${(p.activated === 'partial' ? 0.5 : 0.1) * 100}%` }}></div>
              </div>
            </div>
          ))}
          
          {bonuses.activeSynergies.length === 0 && bonuses.activePlays.length === 0 && <span className="text-[10px] text-stone-400 italic">No synergies or plays.</span>}
        </div>
      </div>

    </div>
  );
}
