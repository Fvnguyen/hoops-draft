import React from 'react';
import { TeamInfo } from '../engine/game';
import { calcRosterIdentity, calcRosterShotDiet, resolveDepthChart, LEAGUE_AVG_IDENTITY } from '../engine/rosterStats';
import { evaluateArchetypes, type ArchetypeStatus, type ArchetypeTier } from '../engine/archetypes';
import { evaluatePlaybook, type PlayStatus } from '../engine/playbook';
import { PlayerCardData, MiniPlayerCard } from './PlayerCard';
import { RadarChart } from './RadarChart';

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'NONE', online: 'ONLINE', dedicated: 'DEDICATED' };
const TIER_CLASS: Record<ArchetypeTier, string> = {
  none: 'bg-stone-100 text-stone-400',
  online: 'bg-emerald-100 text-emerald-700',
  dedicated: 'bg-amber-100 text-amber-700',
};

function playerName(players: PlayerCardData[], id?: string): string {
  if (!id) return 'Unassigned';
  return players.find(p => p.id === id)?.player.name ?? 'Unknown';
}

function playRoleSummary(status: PlayStatus, players: PlayerCardData[]): string {
  return status.roles.map(r => `${r.role.name}: ${playerName(players, r.playerId)}`).join(', ');
}

export function FranchiseDashboard({ team }: { team: TeamInfo }) {
  const resolvedDepth = resolveDepthChart(team.players, team.depthChart);
  const identity = calcRosterIdentity(resolvedDepth);
  const shotDiet = calcRosterShotDiet(resolvedDepth, team.plays, team.archetypes);

  const starterIds = new Set(team.starters);
  const archetypeStatuses = evaluateArchetypes(team.players, starterIds);
  const byId = new Map(archetypeStatuses.map(s => [s.def.id, s]));
  const selection = team.archetypes;
  const selectedArchetypes: ArchetypeStatus[] = [];
  if (selection?.gold) {
    const s = byId.get(selection.gold);
    if (s) selectedArchetypes.push(s);
  } else {
    if (selection?.offense) { const s = byId.get(selection.offense); if (s) selectedArchetypes.push(s); }
    if (selection?.defense) { const s = byId.get(selection.defense); if (s) selectedArchetypes.push(s); }
  }

  const playbookStatus = evaluatePlaybook(team.playAssignments ?? [], team.players);
  const activePlays = playbookStatus.plays.filter(p => p.active);

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

      {/* Right: Active Mechanics — selected archetype(s) + active plays with assigned players */}
      <div className="flex-1 min-w-[250px] max-w-[350px]">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Active Mechanics</h3>
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[100px] pr-2 custom-scrollbar">
          {selectedArchetypes.map(s => (
            <div key={s.def.id} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100">
              <span className="text-emerald-500 text-[10px] mt-0.5">✦</span>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-[10px] text-stone-700">{s.def.name}</span>
                <span className={`text-[8px] font-black uppercase tracking-wide w-fit px-1 py-0.5 rounded mt-0.5 ${TIER_CLASS[s.tier]}`}>
                  {TIER_LABEL[s.tier]}
                </span>
              </div>
            </div>
          ))}
          {activePlays.map(p => (
            <div key={p.assignment.cardId} className="flex items-start gap-1.5 bg-stone-50 rounded px-2 py-1 border border-stone-100">
              <span className="text-amber-500 text-[10px] mt-0.5">▶</span>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-[10px] text-stone-700">Play: {p.def.name}</span>
                <span className="text-stone-500 text-[9px]">{playRoleSummary(p, team.players)}</span>
              </div>
            </div>
          ))}
          {selectedArchetypes.length === 0 && activePlays.length === 0 && (
             <div className="text-stone-400 italic text-xs py-2">No identity or active plays yet.</div>
          )}
        </div>
      </div>

    </div>
  );
}
