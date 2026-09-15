import React from 'react';
import { TeamInfo } from '../engine/game';
import { calcRosterIdentity, calcRosterShotDiet, resolveDepthChart, LEAGUE_AVG_IDENTITY } from '../engine/rosterStats';
import { evaluateArchetypes, type ArchetypeStatus, type ArchetypeTier } from '../engine/archetypes';
import { evaluatePlaybook, type PlayStatus } from '../engine/playbook';
import { PlayerCardData, MiniPlayerCard } from './PlayerCard';
import { RadarChart } from './RadarChart';

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'NONE', online: 'ONLINE', dedicated: 'DEDICATED' };
const TIER_CLASS: Record<ArchetypeTier, string> = {
  none: 'bg-surface-muted text-ink-subtle',
  online: 'bg-positive-soft text-positive',
  dedicated: 'bg-warn-soft text-warn',
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
    // game_canvas T0: below lg the four blocks do not fit one row and the SeasonView
    // panel around this is overflow-hidden, so they wrap there; from lg the row is the
    // same single line as before (desktop snapshot unchanged).
    <div className="bg-surface-raised border-b border-line px-6 py-4 flex flex-wrap lg:flex-nowrap gap-x-8 gap-y-4 items-start shadow-sm w-full">

      {/* Left: Starters */}
      <div className="shrink-0 flex flex-col items-center">
        <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-2">Starting Five</h3>
        <div className="flex gap-2">
          {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => {
            const starter = resolvedDepth[pos]?.[0];
            if (!starter) return null;
            return (
              <div key={pos} className="flex flex-col items-center">
                <MiniPlayerCard player={starter} className="mb-1" />
                <span className="text-xs font-bold text-ink-subtle">{pos}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hidden w-px bg-line self-stretch lg:block" />

      {/* Center: Team identity radar + shot diet as a plain list */}
      <div className="flex flex-wrap gap-8 lg:flex-nowrap lg:shrink-0">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Team Identity</h3>
          <RadarChart data={identity} average={LEAGUE_AVG_IDENTITY} size={150} />
        </div>

        <div className="flex flex-col gap-1 pl-8 border-l border-line">
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">Shot Diet</h3>
          <div className="flex-1 flex flex-col justify-center gap-2">
            {[
              { label: 'RIM', value: shotDiet.rim, color: 'var(--danger)' },
              { label: 'MID', value: shotDiet.mid, color: 'var(--warn)' },
              { label: '3PT', value: shotDiet.per, color: 'var(--info)' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                <span className="text-xs font-bold uppercase tracking-wide text-ink-muted w-9">{row.label}</span>
                <span className="text-sm font-black tabular-nums" style={{ color: row.color }}>{Math.round(row.value * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden w-px bg-line self-stretch lg:block" />

      {/* Right: Active Mechanics — selected archetype(s) + active plays with assigned players */}
      <div className="flex-1 min-w-[250px] max-w-[350px] basis-[250px]">
        <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-2">Active Mechanics</h3>
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[100px] pr-2 custom-scrollbar">
          {selectedArchetypes.map(s => (
            <div key={s.def.id} className="flex items-start gap-1.5 bg-surface-sunken rounded px-2 py-1 border border-line">
              <span className="text-positive text-xs mt-0.5">✦</span>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-xs text-ink">{s.def.name}</span>
                <span className={`text-xs font-black uppercase tracking-wide w-fit px-1 py-0.5 rounded mt-0.5 ${TIER_CLASS[s.tier]}`}>
                  {TIER_LABEL[s.tier]}
                </span>
              </div>
            </div>
          ))}
          {activePlays.map(p => (
            <div key={p.assignment.cardId} className="flex items-start gap-1.5 bg-surface-sunken rounded px-2 py-1 border border-line">
              <span className="text-warn text-xs mt-0.5">▶</span>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-xs text-ink">Play: {p.def.name}</span>
                <span className="text-ink-muted text-xs">{playRoleSummary(p, team.players)}</span>
              </div>
            </div>
          ))}
          {selectedArchetypes.length === 0 && activePlays.length === 0 && (
             <div className="text-ink-subtle italic text-xs py-2">No identity or active plays yet.</div>
          )}
        </div>
      </div>

    </div>
  );
}
