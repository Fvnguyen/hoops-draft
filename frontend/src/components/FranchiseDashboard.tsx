import React from 'react';
import { TeamInfo } from '../engine/game';
import { calcRosterIdentity, calcRosterShotDiet, resolveDepthChart } from '../engine/rosterStats';
import { calcTeamBonuses } from '../engine/synergies';
import { PlayerCardData, Play, MiniPlayerCard } from './PlayerCard';
import { DonutChart } from './DonutChart';

export function FranchiseDashboard({ team }: { team: TeamInfo }) {
  const resolvedDepth = resolveDepthChart(team.players, team.depthChart);
  const identity = calcRosterIdentity(resolvedDepth);
  const shotDiet = calcRosterShotDiet(resolvedDepth, team.plays);
  
  // Group players for rendering
  const allPlayers = Object.values(resolvedDepth).flat() as PlayerCardData[];
  const bonuses = calcTeamBonuses(allPlayers, team.plays, new Map());

  const Bar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase text-stone-600 w-[55px] text-right leading-none">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full border border-stone-300 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, (value / 100) * 100)}%` }}></div>
      </div>
    </div>
  );

  return (
    <div className="bg-white border-b border-stone-200 px-6 py-4 flex gap-8 items-start shadow-sm w-full">
      
      {/* Left: Starters */}
      <div className="shrink-0 flex flex-col items-center">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Starting Five</h3>
        <div className="flex gap-2">
          {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => {
            const starter = resolvedDepth[pos]?.[0];
            if (!starter) return null;
            return (
              <div key={pos} className="flex flex-col items-center">
                <MiniPlayerCard player={starter} className="mb-1" />
                <span className="text-[9px] font-bold text-stone-400">{pos}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-px bg-stone-200 self-stretch" />

      {/* Center: Team Identity & Shot Diet */}
      <div className="flex-1 flex gap-8">
        <div className="flex-1 flex flex-col justify-center">
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
        
        <div className="shrink-0 flex flex-col items-center justify-center">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Shot Diet</h3>
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

      <div className="w-px bg-stone-200 self-stretch" />

      {/* Right: Active Mechanics */}
      <div className="flex-1 min-w-[250px] max-w-[350px]">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Active Mechanics</h3>
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[100px] pr-2 custom-scrollbar">
          {bonuses.activeSynergies.map(s => (
            <div key={s.name} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100">
              <span className="text-emerald-500 text-[10px] mt-0.5">✦</span> 
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-[10px] text-stone-700">{s.name}</span>
                <span className="text-stone-500 text-[9px]">{s.description}</span>
              </div>
            </div>
          ))}
          {bonuses.activePlays.filter(p => p.activated === 'full').map(p => (
            <div key={p.name} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100">
              <span className="text-amber-500 text-[10px] mt-0.5">▶</span>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-[10px] text-stone-700">{p.name}</span>
                <span className="text-stone-500 text-[9px]">{p.description}</span>
              </div>
            </div>
          ))}
          {bonuses.activeSynergies.length === 0 && bonuses.activePlays.filter(p => p.activated === 'full').length === 0 && (
             <div className="text-stone-400 italic text-xs py-2">No fully active synergies or plays.</div>
          )}
        </div>
      </div>

    </div>
  );
}
