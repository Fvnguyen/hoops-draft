import React from 'react';
import { TeamInfo } from '../engine/game';
import { calcRosterIdentity, calcRosterShotDiet, resolveDepthChart, LEAGUE_AVG_IDENTITY } from '../engine/rosterStats';
import { calcTeamBonuses } from '../engine/synergies';
import { PlayerCardData, Play, MiniPlayerCard } from './PlayerCard';
import { RadarChart } from './RadarChart';

export function FranchiseDashboard({ team }: { team: TeamInfo }) {
  const resolvedDepth = resolveDepthChart(team.players, team.depthChart);
  const identity = calcRosterIdentity(resolvedDepth);
  const shotDiet = calcRosterShotDiet(resolvedDepth, team.plays);
  
  // Group players for rendering
  const allPlayers = Object.values(resolvedDepth).flat() as PlayerCardData[];
  const bonuses = calcTeamBonuses(allPlayers, team.plays, new Map());

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

      {/* Center: Team identity radar + shot diet as a plain list */}
      <div className="shrink-0 flex gap-8">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Team Identity</h3>
          <RadarChart data={identity} average={LEAGUE_AVG_IDENTITY} size={150} />
        </div>

        <div className="flex flex-col gap-1 pl-8 border-l border-stone-200">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Shot Diet</h3>
          <div className="flex-1 flex flex-col justify-center gap-2">
            {[
              { label: 'RIM', value: shotDiet.rim, color: '#f43f5e' },
              { label: 'MID', value: shotDiet.mid, color: '#f59e0b' },
              { label: '3PT', value: shotDiet.per, color: '#0284c7' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                <span className="text-[11px] font-bold uppercase tracking-wide text-stone-600 w-9">{row.label}</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: row.color }}>{Math.round(row.value * 100)}%</span>
              </div>
            ))}
          </div>
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
