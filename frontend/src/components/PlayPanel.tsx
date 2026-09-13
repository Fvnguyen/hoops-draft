'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Play, PlayerCardData } from './PlayerCard';
import { RarityGem, PositionIcon } from './PlayerCard';
import type { PlayStatus, PlayRole } from '../engine/playbook';
import { describeRoleRequirement } from '../engine/playbook';

// Small local badge-icon substitute — `BadgeIcon` in PlayerCard.tsx is not exported
// (and that file is owned by another workstream), so this renders a coloured
// initials circle instead. Colours are picked from a small fixed palette keyed by
// badge name so the same badge always reads the same colour across panels.
const ROLE_BADGE_COLORS: Record<string, string> = {
  'Finisher': '#F97316',
  'Mid-Range Maestro': '#3B82F6',
  'Sharpshooter': '#8B5CF6',
  'Floor General': '#14B8A6',
  'Glass Cleaner': '#22C55E',
  'Lockdown Defender': '#EF4444',
  'Paint Protector': '#DC2626',
};

function initialsFor(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function RoleBadgeIcon({ role }: { role: PlayRole }) {
  const name = role.badge ?? 'Any';
  const color = ROLE_BADGE_COLORS[name] ?? '#78716C';
  const level = role.minLevel ?? 1;
  return (
    <div className="relative shrink-0" title={role.badge ? `${role.badge} (Lv.${level})` : 'Any player'}>
      <div
        className="w-[18px] h-[18px] rounded-full border-2 border-stone-500/60 flex items-center justify-center text-[7px] font-black text-white leading-none"
        style={{ backgroundColor: color }}
      >
        {initialsFor(name)}
      </div>
      {role.badge && level > 1 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-stone-800 border border-white flex items-center justify-center text-[6px] font-black text-white leading-none">
          {level}
        </span>
      )}
    </div>
  );
}

const categoryLabel: Record<Play['playCategory'], string> = { system: 'SYSTEM', special: 'SPECIAL', basic: 'BASIC' };
const categoryColor: Record<Play['playCategory'], string> = { system: 'text-amber-600', special: 'text-teal-600', basic: 'text-slate-500' };

export interface PlayPanelProps {
  /** The G-League/roster card backing this slot — carries flavour text and category
   *  that PlayStatus/PlayDef don't (PlayDef.rarity may be 'Basic', which RarityGem
   *  doesn't render, so the card's own `rarity` is used for the gem too). */
  play: Play;
  status: PlayStatus;
  players: PlayerCardData[];
  selectedRoleId?: string;
  /** id of the player currently mid-drag anywhere in the roster, for best-effort
   *  eligibility highlighting of role rows while dragging over them. */
  draggingPlayerId?: string;
  isEligible: (roleId: string, playerId: string) => boolean;
  onRoleClick: (roleId: string) => void;
  onRoleClear: (roleId: string) => void;
  onRoleDrop: (roleId: string, cardId: string) => void;
  onRemove: () => void;
  /** Eligible active-roster candidates for whichever role is currently being
   *  assigned (selectedRoleId) — pass to show the assign popover under that row. */
  pickerCandidates?: PlayerCardData[];
  onPick?: (playerId: string) => void;
}

function RoleRow({
  role, playerFromRoster, filled, reason, isSelected, draggingPlayerId, isEligible,
  onRoleClick, onRoleClear, onRoleDrop, pickerCandidates, onPick,
}: {
  role: PlayRole;
  playerFromRoster?: PlayerCardData;
  filled: boolean;
  reason?: string;
  isSelected: boolean;
  draggingPlayerId?: string;
  isEligible: (roleId: string, playerId: string) => boolean;
  onRoleClick: (roleId: string) => void;
  onRoleClear: (roleId: string) => void;
  onRoleDrop: (roleId: string, cardId: string) => void;
  pickerCandidates?: PlayerCardData[];
  onPick?: (playerId: string) => void;
}) {
  const [dragOverState, setDragOverState] = useState<'none' | 'eligible' | 'ineligible'>('none');

  const rowBg = dragOverState === 'eligible' ? 'bg-emerald-100 border-emerald-500'
    : dragOverState === 'ineligible' ? 'bg-red-50 border-red-400'
    : filled ? 'bg-emerald-50 border-emerald-500'
    : 'bg-white border-stone-300 border-dashed';

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 min-h-[40px] rounded-md border transition-colors ${rowBg} ${filled ? 'border-l-4' : ''} ${isSelected ? 'ring-2 ring-emerald-400 animate-pulse' : ''}`}
        onDragOver={(e) => { e.preventDefault(); }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (draggingPlayerId) setDragOverState(isEligible(role.id, draggingPlayerId) ? 'eligible' : 'ineligible');
          else setDragOverState('eligible');
        }}
        onDragLeave={() => setDragOverState('none')}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverState('none');
          const droppedId = e.dataTransfer.getData('text/plain');
          if (droppedId) onRoleDrop(role.id, droppedId);
        }}
      >
        <RoleBadgeIcon role={role} />

        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase text-stone-800 truncate leading-tight">{role.name}</div>
          <div className="text-[8px] text-stone-500 truncate leading-tight">{describeRoleRequirement(role)}</div>
        </div>

        {filled && playerFromRoster ? (
          <div className="flex items-center gap-1 shrink-0 max-w-[130px]">
            <img
              src={`/headshots/${playerFromRoster.id}.png`}
              alt=""
              className="w-[26px] h-[26px] rounded-full object-cover object-top border border-stone-300 bg-stone-100 shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            <span className="text-[10px] font-bold text-stone-800 truncate">{playerFromRoster.player.name}</span>
            <PositionIcon position={playerFromRoster.player.position} className="min-w-[22px] h-[15px] px-1 text-[8px] shrink-0" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRoleClear(role.id); }}
              title="Clear role"
              className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRoleClick(role.id); }}
            className="shrink-0 px-2 py-1 rounded border border-dashed border-stone-400 text-[9px] font-bold uppercase text-stone-500 hover:border-emerald-500 hover:text-emerald-600"
          >
            Assign
          </button>
        )}
      </div>

      {!filled && reason && (
        <div className="px-2 pt-0.5 text-[8px] font-semibold text-red-500">{reason}</div>
      )}

      {isSelected && pickerCandidates && (
        <div
          className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-stone-300 rounded-lg shadow-xl max-h-[220px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {pickerCandidates.length === 0 && (
            <div className="px-2 py-2 text-[9px] text-stone-500 italic text-center">No eligible players in the active roster.</div>
          )}
          {pickerCandidates.map(p => {
            const level = role.badge
              ? Math.max(
                  p.traits?.find(t => t.name === role.badge)?.level ?? 0,
                  role.altBadge ? (p.traits?.find(t => t.name === role.altBadge)?.level ?? 0) : 0
                )
              : 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onPick?.(p.id); }}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-emerald-50 text-left border-b border-stone-100 last:border-b-0"
              >
                <img
                  src={`/headshots/${p.id}.png`}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover object-top border border-stone-200 bg-stone-100 shrink-0"
                  onError={(e2) => { (e2.target as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <span className="flex-1 min-w-0 text-[10px] font-bold text-stone-800 truncate">{p.player.name}</span>
                <PositionIcon position={p.player.position} className="min-w-[22px] h-[15px] px-1 text-[8px] shrink-0" />
                {role.badge && <span className="text-[8px] font-bold text-stone-500 shrink-0">Lv {level}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Presentational play panel — replaces the flip-on-hover 5:7 PlayCard in the
 * Active Roster "Plays" column. Nothing here animates or flips on hover; every
 * assignment path (click "Assign" → popover, click a depth-chart card while a
 * role is selected, or drag a depth-chart card onto a role row) stays readable
 * at rest.
 */
export function PlayPanel({
  play, status, players, selectedRoleId, draggingPlayerId, isEligible,
  onRoleClick, onRoleClear, onRoleDrop, onRemove, pickerCandidates, onPick,
}: PlayPanelProps) {
  const firstUnfilled = status.roles.find(r => !r.filled);
  const allocationPct = Math.round(status.def.allocation * 100);
  const allocationLabel = status.def.side === 'offense' ? 'of possessions' : 'of opp. possessions';
  const tooltip = `${status.def.summary}\n\n${play.mechanicText}`;

  return (
    <div className="w-full bg-white border border-stone-200 rounded-xl shadow-sm overflow-visible">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 h-10 border-b border-stone-200">
        <RarityGem rarity={play.rarity} size="md" />
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-xs font-bold uppercase text-stone-800 truncate">{play.name}</div>
          <div className={`text-[9px] font-black uppercase tracking-wider ${categoryColor[play.playCategory]}`}>{categoryLabel[play.playCategory]}</div>
        </div>
        <span
          title={tooltip}
          className="shrink-0 w-4 h-4 rounded-full border border-stone-300 text-stone-400 text-[10px] font-bold flex items-center justify-center cursor-help select-none"
        >
          i
        </span>
        <div className="shrink-0 flex flex-col items-end leading-tight">
          <span className={`px-1.5 py-[1px] rounded text-[8px] font-black uppercase tracking-wider ${status.active ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-500'}`}>
            {status.active ? 'Active' : 'Inactive'}
          </span>
          <span className="text-[8px] text-stone-500 whitespace-nowrap">{allocationPct}% {allocationLabel}</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Return to G-League"
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-stone-400 hover:text-red-600 hover:bg-red-50"
        >
          <X size={13} />
        </button>
      </div>

      {/* Role rows */}
      <div className="flex flex-col gap-1.5 p-1.5">
        {status.roles.map(roleStatus => {
          const playerFromRoster = players.find(p => p.id === roleStatus.playerId);
          const isSelected = selectedRoleId === roleStatus.role.id;
          return (
            <RoleRow
              key={roleStatus.role.id}
              role={roleStatus.role}
              playerFromRoster={playerFromRoster}
              filled={roleStatus.filled}
              reason={!roleStatus.filled ? roleStatus.reason : undefined}
              isSelected={isSelected}
              draggingPlayerId={draggingPlayerId}
              isEligible={isEligible}
              onRoleClick={onRoleClick}
              onRoleClear={onRoleClear}
              onRoleDrop={onRoleDrop}
              pickerCandidates={isSelected ? pickerCandidates : undefined}
              onPick={onPick}
            />
          );
        })}
      </div>

      {/* Footer — only when inactive */}
      {!status.active && firstUnfilled && (
        <div className="px-2.5 py-1 border-t border-stone-200 text-[8px] font-semibold text-stone-500">
          Inactive: {firstUnfilled.role.name} {(firstUnfilled.reason ?? 'unassigned').charAt(0).toLowerCase() + (firstUnfilled.reason ?? 'unassigned').slice(1)}
        </div>
      )}
    </div>
  );
}
