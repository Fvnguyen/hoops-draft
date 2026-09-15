'use client';

import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { Play, PlayerCardData } from './PlayerCard';
import { RarityGem, PositionIcon } from './PlayerCard';
import type { PlayStatus, PlayRole } from '../engine/playbook';
import { describeRoleRequirement } from '../engine/playbook';
import { AssignPopover } from './AssignPopover';
import { badgeConfig, defaultBadgeConfig, catColor } from './cardColors';
import { IconButton } from './ui/IconButton';

function initialsFor(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Small role-badge chip. Icon-only (D5): the level used to show as a tiny digit
 *  overlay, unreadable well under the 12px floor, so it's dropped for the tooltip
 *  to carry instead — same "icon only, no level digit" rule PlayerCard's own
 *  micro badge tiers follow. Colours/icons come from `cardColors.badgeConfig`
 *  (shared with PlayerCard) rather than a local copy. */
function RoleBadgeIcon({ role }: { role: PlayRole }) {
  const name = role.badge;
  const config = name ? badgeConfig[name] : undefined;
  const Icon = config?.icon ?? defaultBadgeConfig.icon;
  const color = config?.color ?? defaultBadgeConfig.color;
  const level = role.minLevel ?? 1;
  return (
    <div
      className="relative shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 border-line-strong"
      style={{ backgroundColor: color }}
      title={role.badge ? `${role.badge} (Lv.${level})` : 'Any player'}
      aria-label={role.badge ? `${role.badge}, level ${level}` : 'Any player'}
    >
      <Icon className="w-[10px] h-[10px] text-white" aria-hidden="true" />
      <span className="sr-only">{role.badge ? initialsFor(role.badge) : 'Any'}</span>
    </div>
  );
}

const categoryLabel: Record<Play['playCategory'], string> = { system: 'SYSTEM', special: 'SPECIAL', basic: 'BASIC' };

export interface PlayPanelProps {
  /** The roster card backing this slot — carries flavour text and category
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

  const rowBg = dragOverState === 'eligible' ? 'bg-positive-soft border-positive'
    : dragOverState === 'ineligible' ? 'bg-danger-soft border-danger'
    : filled ? 'bg-positive-soft border-positive'
    : 'bg-surface-raised border-line-strong border-dashed';

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 min-h-control rounded-md border transition-colors ${rowBg} ${filled ? 'border-l-4' : ''} ${isSelected ? 'ring-2 ring-positive animate-pulse' : ''} ${!filled ? 'cursor-pointer' : ''}`}
        // The whole row is the drop target (native drag) AND, when unfilled, the click
        // target that opens the AssignPopover below — no separate small "Assign" chip
        // (it read as a tiny drop zone rather than an obvious full-row control).
        onClick={!filled ? (e) => { e.stopPropagation(); onRoleClick(role.id); } : undefined}
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
          <div className="text-xs font-bold uppercase text-ink truncate leading-tight">{role.name}</div>
          <div className="text-xs text-ink-muted truncate leading-tight">{describeRoleRequirement(role)}</div>
        </div>

        {filled && playerFromRoster ? (
          // min-w-0 so the row can shrink below its children's natural width; the
          // player name is the only flexible child (flex-1 min-w-0 truncate) so it's
          // the one that gives way — the position pill (shrink-0) always stays fully
          // visible instead of being squeezed off (D18).
          <div className="flex items-center gap-1 shrink-0 min-w-0 max-w-[160px]">
            <img
              src={`/headshots/${playerFromRoster.id}.png`}
              alt=""
              className="w-[26px] h-[26px] rounded-full object-cover object-top border border-line-strong bg-surface-sunken shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            <span className="flex-1 min-w-0 text-xs font-bold text-ink truncate">{playerFromRoster.player.name}</span>
            <PositionIcon position={playerFromRoster.player.position} className="min-w-[22px] h-[15px] px-1 text-xs shrink-0" />
            <IconButton
              label="Clear role"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onRoleClear(role.id); }}
              className="shrink-0 bg-danger text-white hover:bg-danger hover:opacity-90 hover:text-white"
            >
              <X size={14} />
            </IconButton>
          </div>
        ) : (
          <span className="shrink-0 flex items-center gap-0.5 text-xs font-bold uppercase text-ink-muted">
            Assign
            <ChevronDown size={12} />
          </span>
        )}
      </div>

      {!filled && reason && (
        <div className="px-2 pt-0.5 text-xs font-semibold text-danger">{reason}</div>
      )}

      {isSelected && pickerCandidates && (
        <AssignPopover
          candidates={pickerCandidates}
          levelFor={role.badge ? (p) => Math.max(
            p.traits?.find(t => t.name === role.badge)?.level ?? 0,
            role.altBadge ? (p.traits?.find(t => t.name === role.altBadge)?.level ?? 0) : 0
          ) : undefined}
          onPick={(playerId) => onPick?.(playerId)}
        />
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
    <div className="w-full bg-surface-raised border border-line rounded-panel shadow-sm overflow-visible">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 min-h-control border-b border-line">
        <RarityGem rarity={play.rarity} size="md" />
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-xs font-bold uppercase text-ink truncate">{play.name}</div>
          <div className={`text-xs font-black uppercase tracking-wider ${catColor[play.playCategory]}`}>{categoryLabel[play.playCategory]}</div>
        </div>
        <span
          title={tooltip}
          className="shrink-0 w-5 h-5 rounded-full border border-line-strong text-ink-subtle text-xs font-bold flex items-center justify-center cursor-help select-none"
        >
          i
        </span>
        <div className="shrink-0 flex flex-col items-end leading-tight">
          <span className={`px-1.5 py-[1px] rounded text-xs font-black uppercase tracking-wider ${status.active ? 'bg-positive-strong text-white' : 'bg-surface-muted text-ink-muted'}`}>
            {status.active ? 'Active' : 'Inactive'}
          </span>
          <span className="text-xs text-ink-muted whitespace-nowrap">{allocationPct}% {allocationLabel}</span>
        </div>
        <IconButton
          label="Return to Roster"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 hover:text-danger hover:bg-danger-soft"
        >
          <X size={14} />
        </IconButton>
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
        <div className="px-2.5 py-1 border-t border-line text-xs font-semibold text-ink-muted">
          Inactive: {firstUnfilled.role.name} {(firstUnfilled.reason ?? 'unassigned').charAt(0).toLowerCase() + (firstUnfilled.reason ?? 'unassigned').slice(1)}
        </div>
      )}
    </div>
  );
}
