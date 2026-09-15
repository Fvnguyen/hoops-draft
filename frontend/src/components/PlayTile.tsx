'use client';

import type { Play, PlayerCardData } from './PlayerCard';
import type { PlayStatus, RoleStatus, PlayRole } from '../engine/playbook';
import { getPlayDef } from '../engine/playbook';
import type { PlayEvaluation } from '../engine/synergies';
import { playCategoryHex } from './cardColors';
import { Button } from './ui/Button';

/**
 * plan_deckbuilder_ux D5: the play tile that replaces the flip-on-hover 5:7 PlayCard
 * everywhere inside the deck builder — a play slot (`PlayPanel`) and a roster-list row
 * (`PlayCard`'s `compact` branch) both render this so the two never drift apart.
 * Matches `docs/design/deckbuilder_ux/PlayTiles.dc.html` (signed off, D1): fixed
 * heights, one status line, no hover-only information (the full mechanic text moves to
 * a `title`; `PlayHoverPreview` still exists for the draft room's full card).
 */

const categoryLabelUpper: Record<Play['playCategory'], string> = { system: 'SYSTEM', special: 'SPECIAL', basic: 'BASIC' };
const categoryLabelTitle: Record<Play['playCategory'], string> = { system: 'System', special: 'Special', basic: 'Basic' };
const sideLabel: Record<'offense' | 'defense', string> = { offense: 'OFF', defense: 'DEF' };

/** One requirement line: "System · Playmaker, Sharpshooter ×2" — badges deduped and
 *  counted across a play's roles, same grouping the old compact PlayCard used for its
 *  role-dot row, just rendered as text instead of icons. */
function summarizeRoles(roles: PlayRole[]): string {
  if (roles.length === 0) return 'Any player';
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const role of roles) {
    const label = role.badge ?? 'Any player';
    if (!counts.has(label)) { counts.set(label, 0); order.push(label); }
    counts.set(label, counts.get(label)! + 1);
  }
  return order.map(label => {
    const count = counts.get(label)!;
    return count > 1 ? `${label} ×${count}` : label;
  }).join(', ');
}

/** The tile's one status line: "Ready" once every role is filled, else "Needs <badge>
 *  ×N" for the first unfilled requirement — same reason the role rows already compute
 *  (`Needs ${describeRoleRequirement(role)}`), just collapsed to one line for the tile. */
function summarizeStatus(roles: RoleStatus[]): { text: string; ready: boolean } {
  const unfilled = roles.filter(r => !r.filled);
  if (unfilled.length === 0) return { text: 'Ready', ready: true };
  const label = unfilled[0].role.badge ?? unfilled[0].role.name;
  const count = unfilled.filter(r => (r.role.badge ?? r.role.name) === label).length;
  return { text: count > 1 ? `Needs ${label} ×${count}` : `Needs ${label}`, ready: false };
}

function CategoryBar({ category }: { category: Play['playCategory'] }) {
  return <div className="w-[6px] h-full shrink-0" style={{ backgroundColor: playCategoryHex[category].bar }} />;
}

function SideChip({ side }: { side: 'offense' | 'defense' }) {
  return (
    <span className={`shrink-0 px-1.5 py-[1px] rounded text-xs font-black text-white ${side === 'offense' ? 'bg-danger' : 'bg-info'}`}>
      {sideLabel[side]}
    </span>
  );
}

function CategoryChip({ category }: { category: Play['playCategory'] }) {
  return (
    <span
      className="shrink-0 px-1.5 py-[1px] rounded text-xs font-black text-white"
      style={{ backgroundColor: playCategoryHex[category].chipBg }}
    >
      {categoryLabelUpper[category]}
    </span>
  );
}

function RoleAvatar({ playerFromRoster }: { playerFromRoster?: PlayerCardData }) {
  if (playerFromRoster) {
    return (
      // A CSS background, not an <img>: a missing headshot then simply does not paint
      // and the positive-ringed disc stays neutral. An <img> shows the browser's broken
      // glyph here — its onError never fires on a server-rendered page (the 404 lands
      // before React hydrates) and Chromium ignores ::before on an alt="" image.
      <span
        role="img"
        aria-label={playerFromRoster.player?.name ?? 'Assigned player'}
        title={playerFromRoster.player?.name}
        className="w-7 h-7 rounded-full border-2 border-positive bg-surface-sunken bg-cover bg-top shrink-0 inline-block"
        style={{ backgroundImage: `url(/headshots/${playerFromRoster.id}.png)` }}
      />
    );
  }
  return <span className="w-7 h-7 rounded-full border-2 border-dashed border-ink-subtle shrink-0" />;
}

export interface PlayTileProps {
  play: Play;
  /** `slot`: the 72px tile in a play slot (needs `status` for role avatars + the status
   *  line). `list`: the 56px roster-list row (needs `evaluation` or nothing — a bench
   *  play has no per-role fill state yet). */
  variant: 'slot' | 'list';
  status?: PlayStatus;
  evaluation?: PlayEvaluation;
  players?: PlayerCardData[];
  /** List variant only: the play already occupies a slot — row reads muted with
   *  "Assigned" instead of the Add button. */
  assigned?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PlayTile({ play, variant, status, players = [], assigned = false, onClick, className = '' }: PlayTileProps) {
  const playDef = status?.def ?? getPlayDef(play);
  const category = play.playCategory || 'special';
  const side = playDef?.side ?? 'offense';
  const roles = playDef?.roles ?? [];
  const tooltip = playDef ? `${playDef.summary}\n\n${play.mechanicText}` : play.mechanicText;

  if (variant === 'list') {
    return (
      <div
        className={`h-[56px] box-border rounded-control border border-line flex items-center gap-2.5 pr-3 overflow-hidden ${assigned ? 'bg-surface-sunken opacity-70' : 'bg-surface-raised'} ${onClick && !assigned ? 'cursor-pointer' : ''} ${className}`}
        onClick={onClick}
        title={tooltip}
      >
        <CategoryBar category={category} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-black uppercase text-ink-strong truncate">{play.name}</span>
            <SideChip side={side} />
          </div>
          <span className="text-xs text-ink-muted truncate">{categoryLabelTitle[category]} &middot; {summarizeRoles(roles)}</span>
        </div>
        {assigned ? (
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-positive">Assigned</span>
        ) : (
          <Button variant="secondary" size="md" className="shrink-0" onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
            Add
          </Button>
        )}
      </div>
    );
  }

  // variant === 'slot'
  const roleStatuses = status?.roles ?? [];
  const { text: statusText, ready } = status ? summarizeStatus(roleStatuses) : { text: '', ready: false };

  return (
    <div
      className={`h-[72px] box-border rounded-panel border border-line bg-surface-raised shadow-sm overflow-hidden flex ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      title={tooltip}
    >
      <CategoryBar category={category} />
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 pl-3 pr-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-black uppercase tracking-tight text-ink-strong truncate">{play.name}</span>
          <SideChip side={side} />
          <CategoryChip category={category} />
        </div>
        <div className="flex items-center gap-2">
          {roleStatuses.length > 0 && (
            <div className="flex gap-1">
              {roleStatuses.map((roleStatus, i) => (
                <RoleAvatar key={roleStatus.role.id ?? i} playerFromRoster={players.find(p => p.id === roleStatus.playerId)} />
              ))}
            </div>
          )}
          {status && (
            <span className={`text-xs font-bold uppercase tracking-wide ${ready ? 'text-positive' : 'text-accent-hover'}`}>{statusText}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The empty play-slot state (D5): no play assigned yet. Clicking a play in the roster
 *  list fills the first open slot for its side (T2's `assignPlayToFirstOpenSlot`);
 *  drag still works. */
export function PlayTileEmptySlot({ side, onClick, className = '' }: { side: 'offense' | 'defense'; onClick?: () => void; className?: string }) {
  return (
    <div
      className={`h-[72px] box-border rounded-panel border-2 border-dashed border-line-strong bg-surface-raised flex items-center justify-center gap-2.5 text-ink-muted ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="text-xs font-black uppercase tracking-widest">{side === 'offense' ? 'Offense' : 'Defense'} slot &middot; click a play</span>
    </div>
  );
}
