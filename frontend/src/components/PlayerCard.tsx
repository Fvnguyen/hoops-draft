'use client';

import { useState, type ReactNode, type JSX } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Flame, Target, Crosshair, Brain, Dumbbell, Shield, ShieldCheck, Crown, Trophy, Zap, TrendingUp, Bird, Thermometer, Swords, ClipboardList, Sparkles, Wand2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { PlayerCardData as EnginePlayerCardData, Player as EnginePlayer, Play as EnginePlay, DraftCard as EngineDraftCard } from '@/engine/types';
import { evaluatePlay, getPlayEffectId, getPlayRequirements, type PlayEvaluation, type PlayRequirement, type PlayRequirementStatus } from '@/engine/synergies';
import type { PlayStatus } from '@/engine/playbook';
import { getPlayDef, describeRoleRequirement } from '@/engine/playbook';

// Re-exported so existing `from '@/components/PlayerCard'` type-only imports
// elsewhere in the app keep working — the canonical definitions live in
// `@/engine/types` (pure TypeScript, no React/Next/fs/sqlite).
// NOTE: the engine's `PlayerCard` type is intentionally NOT re-exported under
// that name — it would collide with the `PlayerCard` component function
// defined below in this same file.
export type { PlayerBio, SeasonStat, ComputedRatings, Trait, Rarity, AwardRow, RatingsInput } from '@/engine/types';
export type PlayerCardData = EnginePlayerCardData;
export type Player = EnginePlayer;
export type Play = EnginePlay;
export type DraftCard = EngineDraftCard;

// Badge icon + color mapping
const badgeConfig: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  'Finisher':            { icon: Flame,         color: '#F97316', bg: 'bg-orange-500/20' },
  'Mid-Range Maestro':   { icon: Target,        color: '#3B82F6', bg: 'bg-blue-500/20' },
  'Sharpshooter':        { icon: Crosshair,     color: '#8B5CF6', bg: 'bg-purple-500/20' },
  'Floor General':       { icon: Brain,          color: '#14B8A6', bg: 'bg-teal-500/20' },
  'Glass Cleaner':       { icon: Dumbbell,       color: '#22C55E', bg: 'bg-green-500/20' },
  'Lockdown Defender':   { icon: Shield,         color: '#EF4444', bg: 'bg-red-500/20' },
  'Paint Protector':     { icon: ShieldCheck,    color: '#DC2626', bg: 'bg-red-600/20' },
  'Legend':              { icon: Crown,          color: '#F59E0B', bg: 'bg-amber-500/20' },
  'League Leader':       { icon: Trophy,         color: '#F59E0B', bg: 'bg-amber-500/20' },
  'Ironman':             { icon: Zap,            color: '#EAB308', bg: 'bg-yellow-500/20' },
  'Efficiency Savant':   { icon: TrendingUp,     color: '#06B6D4', bg: 'bg-cyan-500/20' },
  'Sniper':              { icon: Crosshair,      color: '#6366F1', bg: 'bg-indigo-500/20' },
  'Volume Scorer':       { icon: Flame,          color: '#F97316', bg: 'bg-orange-500/20' },
  'Young Phenom':        { icon: Sparkles,       color: '#F59E0B', bg: 'bg-amber-500/20' },
  'Veteran Presence':    { icon: Bird,           color: '#78716C', bg: 'bg-stone-500/20' },
  'Microwave':           { icon: Thermometer,    color: '#EF4444', bg: 'bg-red-500/20' },
  'Two-Way Disruptor':   { icon: Swords,         color: '#8B5CF6', bg: 'bg-violet-500/20' },
  'Stat Sheet Stuffer':  { icon: ClipboardList,  color: '#10B981', bg: 'bg-emerald-500/20' },
  'Playmaking Maestro':  { icon: Wand2,          color: '#14B8A6', bg: 'bg-teal-500/20' },
};

function BadgeIcon({ name, level, size = 'normal' }: { name: string; level: number; size?: 'normal' | 'small' | 'xs' }) {
  const cfg = badgeConfig[name] || { icon: Star, color: '#9CA3AF', bg: 'bg-stone-500/20' };
  const Icon = cfg.icon;
  const iconSize = size === 'xs' ? 10 : size === 'small' ? 12 : 16;
  const containerSize = size === 'xs' ? 'w-[18px] h-[18px] border' : size === 'small' ? 'w-6 h-6' : 'w-8 h-8';

  return (
    <div className="group/badge relative" title={`${name} (Lv.${level})`}>
      <div className={`${containerSize} rounded-full bg-stone-800 border-2 border-stone-500/60 flex items-center justify-center relative shadow-md`}>
        <Icon size={iconSize} style={{ color: cfg.color }} strokeWidth={2.5} />
        {level > 1 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-stone-800 border-2 border-white/40 flex items-center justify-center text-[8px] font-black text-white leading-none">
            {level}
          </span>
        )}
      </div>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-stone-900 text-white text-[8px] font-bold uppercase tracking-wider rounded whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-30 border border-white/10">
        {name}
      </div>
    </div>
  );
}

// Overflow indicator for a badge row that had to cap how many BadgeIcons it shows
// (D18: readability — small cards show 2 + "+N", list rows show 3 + "+N"). `names`
// carries the hidden badges' names for the tooltip.
function BadgeOverflowIndicator({ count, names, size = 'small' }: { count: number; names: string[]; size?: 'normal' | 'small' | 'xs' }) {
  if (count <= 0) return null;
  const containerSize = size === 'xs' ? 'w-[18px] h-[18px] text-[7px]' : size === 'small' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[10px]';
  return (
    <div
      className={`${containerSize} shrink-0 rounded-full bg-stone-700 border-2 border-stone-500/60 flex items-center justify-center font-black text-stone-200`}
      title={names.join(', ')}
    >
      +{count}
    </div>
  );
}

// A play's requirement can be shown "neutral" (plain PlayRequirement — no roster to
// compare against, e.g. draft room / home page) or "evaluated" against a roster's
// badge totals (PlayRequirementStatus — carries `have`/`met`). This tells the two apart.
function isRequirementStatus(r: PlayRequirement | PlayRequirementStatus): r is PlayRequirementStatus {
  return 'have' in r && 'met' in r;
}

/**
 * Requirement icons for a play's Synergy Key. Exported so DeckBuilder can render the
 * same icons outside a full PlayCard. Pass plain `PlayRequirement[]` (from
 * `getPlayRequirements`) for a neutral state, or `PlayRequirementStatus[]` (from a
 * `PlayEvaluation`) to show met/unmet state.
 */
export function PlayRequirementIcons({ requirements, size = 'small' }: { requirements: PlayRequirementStatus[] | PlayRequirement[]; size?: 'xs' | 'small' }) {
  if (requirements.length === 0) return null;

  const title = requirements
    .map(req => isRequirementStatus(req)
      ? `${req.badge}: ${req.have} of ${req.levels} ${req.met ? '✓' : '✗'}`
      : `${req.badge}: need ${req.levels}`)
    .join('\n');

  return (
    <div className="flex gap-1 flex-wrap justify-center" title={title}>
      {requirements.map((req, i) => {
        const status = isRequirementStatus(req) ? req : null;
        return (
          <div key={i} className={`relative ${status ? (status.met ? 'ring-2 ring-emerald-400 rounded-full' : 'opacity-40 grayscale') : ''}`}>
            <BadgeIcon name={req.badge} level={1} size={size} />
            {status?.met && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-stone-900 flex items-center justify-center text-[6px] text-white leading-none">✓</span>
            )}
            {status && !status.met && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-stone-100 bg-stone-900 px-0.5 rounded-sm leading-none whitespace-nowrap">
                {status.have}/{status.levels}
              </span>
            )}
            {!status && (
              <span className="absolute -bottom-1 -right-1.5 text-[8px] font-black text-stone-100 bg-stone-900 px-0.5 rounded-sm leading-none">
                ×{req.levels}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const basePosColors = {
  PG: '#3B82F6', // Blue
  SG: '#8B5CF6', // Purple
  SF: '#10B981', // Green
  PF: '#F59E0B', // Orange
  C:  '#EF4444', // Red
};

export function getPosColors(position: string): [string, string] {
  const p = position.replace('-', '/');
  
  if (p === 'G') return [basePosColors.PG, basePosColors.SG];
  if (p === 'F') return [basePosColors.SF, basePosColors.PF];
  
  if (p.includes('/')) {
    const [p1, p2] = p.split('/');
    const c1 = basePosColors[p1 as keyof typeof basePosColors] || '#6B7280';
    const c2 = basePosColors[p2 as keyof typeof basePosColors] || '#6B7280';
    return [c1, c2];
  }

  if (basePosColors[p as keyof typeof basePosColors]) {
    const c = basePosColors[p as keyof typeof basePosColors];
    return [c, c];
  }
  return ['#6B7280', '#6B7280']; // Fallback
}

// Position pill. Kept the historical name/props (`position`, `className`,
// `borderClass`) since DraftRoom/DeckBuilder/rosters call this directly —
// `borderClass` is accepted for compatibility but is no longer tied to
// rarity (rarity communication moved to RarityGem; see UI brief).
export function PositionIcon({ position, className = "min-w-[26px] h-[18px] px-1 text-[10px]", borderClass = "border border-white/40" }: { position: string, className?: string, borderClass?: string }) {
  const p = position.replace('-', '/');

  if (p === 'ALL' || p === 'STAR') {
    return (
      <div className={`relative rounded-md overflow-hidden shadow-sm ${borderClass} flex items-center justify-center shrink-0 ${className}`}>
        <div className="absolute inset-0" style={{ background: 'conic-gradient(#3B82F6 0 72deg, #8B5CF6 72deg 144deg, #10B981 144deg 216deg, #F59E0B 216deg 288deg, #EF4444 288deg 360deg)' }} />
        <Star size={10} className="relative z-10 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" fill="currentColor" />
      </div>
    );
  }

  const [c1, c2] = getPosColors(p);

  return (
    <div className={`relative rounded-md overflow-hidden shadow-sm ${borderClass} flex items-center justify-center shrink-0 ${className}`}>
      {c1 !== c2 ? (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` }} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: c1 }} />
      )}
      <span className="relative z-10 font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] leading-none whitespace-nowrap" style={{ letterSpacing: '-0.3px', fontSize: p.length > 3 ? '9px' : '10px' }}>{p}</span>
    </div>
  );
}

// MtG-inspired rarity gem: a faceted diamond, not a coloured frame/border.
// Rarity reads from this + the (Rare/Mythic-only) top accent line / foil
// overlay on the card, deliberately kept separate from position colour and
// team stripe — see UI brief section 1.
type GemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Mythic';

const gemPalettes: Record<GemRarity, { base: string; light1: string; light2: string; dark1: string; dark2: string; stroke: string; glow?: string }> = {
  Common:   { base: '#57534e', light1: '#78716c', light2: '#6b6560', dark1: '#3f3b38', dark2: '#2f2c2a', stroke: '#292524' },
  Uncommon: { base: '#cbd5e1', light1: '#f8fafc', light2: '#e2e8f0', dark1: '#94a3b8', dark2: '#7d8ea3', stroke: '#94a3b8', glow: '0 0 3px rgba(203,213,225,0.65)' },
  Rare:     { base: '#eab308', light1: '#fde68a', light2: '#fbbf24', dark1: '#b45309', dark2: '#92400e', stroke: '#a16207', glow: '0 0 6px rgba(234,179,8,0.65)' },
  Mythic:   { base: '#f97316', light1: '#fed7aa', light2: '#fb923c', dark1: '#dc2626', dark2: '#991b1b', stroke: '#c2410c', glow: '0 0 8px rgba(249,115,22,0.8)' },
};

const gemPixelSizes: Record<'sm' | 'md' | 'lg', number> = { sm: 12, md: 16, lg: 22 };

// Rarity-coloured text used on the card back header.
export const rarityTextColor: Record<GemRarity, string> = {
  Common: 'text-stone-400',
  Uncommon: 'text-slate-300',
  Rare: 'text-amber-400',
  Mythic: 'text-orange-400',
};

export function RarityGem({ rarity, size = 'md' }: { rarity: 'Common' | 'Uncommon' | 'Rare' | 'Mythic'; size?: 'sm' | 'md' | 'lg' }) {
  const palette = gemPalettes[rarity] || gemPalettes.Common;
  const px = gemPixelSizes[size];
  const isMythic = rarity === 'Mythic';

  return (
    <span
      className={`inline-block shrink-0 align-middle ${isMythic ? 'gem-mythic-shimmer' : ''}`}
      style={{ width: px, height: px, filter: !isMythic && palette.glow ? `drop-shadow(${palette.glow})` : undefined }}
      title={rarity}
    >
      {isMythic && (
        <style>{`
          @keyframes gemMythicShimmer {
            0%, 100% { filter: drop-shadow(0 0 5px rgba(249,115,22,0.6)) brightness(1); }
            50% { filter: drop-shadow(0 0 12px rgba(249,115,22,1)) brightness(1.3); }
          }
          .gem-mythic-shimmer { animation: gemMythicShimmer 3s ease-in-out infinite; }
        `}</style>
      )}
      <svg viewBox="0 0 24 24" width={px} height={px}>
        <polygon points="12,1 21,9 12,23 3,9" fill={palette.base} stroke={palette.stroke} strokeWidth="1" />
        <polygon points="12,1 21,9 12,9" fill={palette.light1} opacity="0.65" />
        <polygon points="12,1 3,9 12,9" fill={palette.light2} opacity="0.35" />
        <polygon points="3,9 12,23 12,9" fill={palette.dark1} opacity="0.3" />
        <polygon points="21,9 12,23 12,9" fill={palette.dark2} opacity="0.18" />
      </svg>
    </span>
  );
}

// Compact one-line row (~44px) for the draft sidebar / deck builder lists.
// [gem sm] [position pill] [headshot or play icon] [name] [badges or play
// category] [trailing slot].
export function CardListRow({ card, onClick, selected = false, trailing, className = '' }: { card: DraftCard; onClick?: () => void; selected?: boolean; trailing?: ReactNode; className?: string }) {
  const rowClasses = `@container flex items-center gap-1.5 h-11 px-2 rounded-lg border transition-colors bg-white ${selected ? 'border-orange-500 ring-1 ring-orange-500 bg-orange-50/40' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'} ${onClick ? 'cursor-pointer' : ''} ${className}`;

  if (card.type === 'Player') {
    const headshotUrl = `/headshots/${card.player.id}.png`;
    return (
      <div className={rowClasses} onClick={onClick}>
        <RarityGem rarity={card.rarity} size="sm" />
        <PositionIcon position={card.player.position} />
        <img
          src={headshotUrl}
          alt=""
          className="w-7 h-7 rounded-full object-cover object-top border border-stone-200 shrink-0 bg-stone-100"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
        />
        <span className="flex-1 min-w-[56px] font-bold text-[12px] text-stone-800 uppercase truncate">{card.player.name}</span>
        {/* Badges only when the row is wide enough for the name to stay readable.
            D18: list-row variant caps at 3 badges + "+N" overflow. */}
        <div className="hidden @[230px]:flex items-center gap-0.5 shrink-0">
          {card.traits.slice(0, 3).map((t, i) => (
            <BadgeIcon key={i} name={t.name} level={t.level} size="xs" />
          ))}
          <BadgeOverflowIndicator count={Math.max(0, card.traits.length - 3)} names={card.traits.slice(3).map(t => t.name)} size="xs" />
        </div>
        {trailing && <div className="shrink-0 ml-1">{trailing}</div>}
      </div>
    );
  }

  const catLabel: Record<Play['playCategory'], string> = { system: 'SYSTEM', special: 'SPECIAL', basic: 'BASIC' };
  const catColor: Record<Play['playCategory'], string> = { system: 'text-amber-600', special: 'text-teal-600', basic: 'text-slate-500' };

  return (
    <div className={rowClasses} onClick={onClick}>
      <RarityGem rarity={card.rarity} size="sm" />
      <PositionIcon position="STAR" />
      <div className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
        <ClipboardList size={14} className="text-stone-500" />
      </div>
      <span className="flex-1 min-w-0 font-bold text-[12px] text-stone-800 uppercase truncate">{card.name}</span>
      <span className={`text-[9px] font-black uppercase shrink-0 ${catColor[card.playCategory]}`}>{catLabel[card.playCategory]}</span>
      {trailing && <div className="shrink-0 ml-1">{trailing}</div>}
    </div>
  );
}

// NBA team abbreviation to simple color mapping for team stripe
const teamColors: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#000000', CHA: '#1D1160', CHI: '#CE1141',
  CLE: '#860038', DAL: '#00538C', DEN: '#0E2240', DET: '#C8102E', GSW: '#1D428A',
  HOU: '#CE1141', IND: '#002D62', LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9',
  MIA: '#98002E', MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#1D1160', POR: '#E03A3E',
  SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141', UTA: '#002B5C', WAS: '#002B5C',
};

const teamIds: Record<string, string> = {
  ATL: '1610612737', BOS: '1610612738', BKN: '1610612751', CHA: '1610612766', CHI: '1610612741',
  CLE: '1610612739', DAL: '1610612742', DEN: '1610612743', DET: '1610612765', GSW: '1610612744',
  HOU: '1610612745', IND: '1610612754', LAC: '1610612746', LAL: '1610612747', MEM: '1610612763',
  MIA: '1610612748', MIL: '1610612749', MIN: '1610612750', NOP: '1610612740', NYK: '1610612752',
  OKC: '1610612760', ORL: '1610612753', PHI: '1610612755', PHX: '1610612756', POR: '1610612757',
  SAC: '1610612758', SAS: '1610612759', TOR: '1610612761', UTA: '1610612762', WAS: '1610612764',
};

// One cell of the front card's stats row.
function StatCell({ label, value, border = true, className = '' }: { label: string; value: string; border?: boolean; className?: string }) {
  return (
    <div className={`py-1.5 ${border ? 'border-r border-stone-100' : ''} ${className}`}>
      <div className="text-[9px] text-stone-400 font-bold uppercase">{label}</div>
      <div className="text-sm font-black text-stone-800 leading-none">{value}</div>
    </div>
  );
}

export function MiniPlayerCard({ player, className = "", onClick }: { player: PlayerCardData, className?: string, onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const tmColor = teamColors[player.player.team] || '#9ca3af';
  const headshotUrl = `/headshots/${player.player.id}.png`;

  return (
    <div
      className={`relative rounded border border-stone-300 bg-white cursor-pointer transition-transform hover:-translate-y-1 shadow-sm ${className}`}
      style={{ width: '40px', height: '56px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="absolute top-0 w-full h-1.5 opacity-80" style={{ backgroundColor: tmColor }} />
      <div className="absolute top-0.5 right-0.5 z-10">
        <RarityGem rarity={player.rarity} size="sm" />
      </div>
      <div className="w-full h-full p-[2px] pt-2 flex flex-col items-center justify-start overflow-hidden bg-stone-50">
        <img 
          src={headshotUrl} 
          alt={player.player.name} 
          className="w-[34px] h-[34px] object-cover object-top rounded-sm border border-stone-200 bg-white" 
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== 'https://www.transparenttextures.com/patterns/black-mamba.png') {
                target.src = 'https://www.transparenttextures.com/patterns/black-mamba.png';
                target.className = "w-[34px] h-[34px] object-cover object-center opacity-20 rounded-sm border border-stone-200 bg-stone-100";
            }
          }} 
        />
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute z-50 pointer-events-none"
            style={{ top: '64px', left: '50%', translateX: '-50%' }}
          >
            <div className="scale-[0.8] origin-top">
              <PlayerCard player={player} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PlayerCardFront({ player, isSelected = false, size = 'md' }: { player: PlayerCardData; isSelected?: boolean; size?: 'sm' | 'md' }) {
  const [c1, c2] = getPosColors(player.player.position);
  const teamColor = teamColors[player.player.team] || '#374151';
  const teamId = teamIds[player.player.team];
  const headshotUrl = `/headshots/${player.player.id}.png`;
  const logoUrl = teamId ? `/logos/${teamId}.svg` : null;
  const isRareOrMythic = player.rarity === 'Rare' || player.rarity === 'Mythic';
  const rarityAccentColor = player.rarity === 'Mythic' ? '#f97316' : '#eab308';

  return (
    <div className={`absolute inset-0 bg-stone-100 rounded-xl overflow-hidden shadow-xl border border-stone-300 flex flex-col ${isSelected ? 'ring-2 ring-orange-500' : ''}`} style={{ background: `linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 100%)` }}>
      {isRareOrMythic && <div className="h-[2px] w-full shrink-0" style={{ backgroundColor: rarityAccentColor }} />}

      <div className="flex items-center gap-2 px-2.5 py-2 bg-white/50 backdrop-blur-sm shadow-sm">
        <RarityGem rarity={player.rarity} size="lg" />
        <div className="flex-1 min-w-0 flex flex-col leading-tight">
          <span className={`font-bold tracking-tight text-stone-800 uppercase truncate ${player.player.name.length > 18 ? 'text-[11px]' : 'text-[13px]'}`}>{player.player.name}</span>
          <span className="text-[10px] font-semibold text-stone-500 truncate">{player.player.team} · {player.player.age}Y</span>
        </div>
        <PositionIcon position={player.player.position} />
      </div>

      <div className="flex-1 relative overflow-hidden bg-stone-200">
        <div className="absolute top-0 right-0 w-9 h-full opacity-90 flex flex-col items-center pt-2" style={{ backgroundColor: teamColor }}>
          {logoUrl && (
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md border border-stone-200 z-10">
              <img src={logoUrl} alt={player.player.team} className="w-6 h-6 object-contain" />
            </div>
          )}
        </div>

        <img
          src={headshotUrl}
          alt={player.player.name}
          className="w-full h-full object-cover object-top"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== 'https://www.transparenttextures.com/patterns/black-mamba.png') {
              target.src = 'https://www.transparenttextures.com/patterns/black-mamba.png';
              target.className = "w-full h-full object-cover object-center opacity-10";
            }
          }}
        />
        {player.rarity === 'Mythic' && (
          <div
            // No mix-blend-mode here: a blended layer is composited separately and ignores
            // backface-visibility, so a Mythic front bled through the card back on flips.
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.22) 100%)' }}
          />
        )}
        <div className={`absolute bottom-2 w-full flex justify-center px-2 ${size === 'sm' ? 'gap-1' : 'gap-2'}`}>
          {/* BadgeIcon has no width of its own that shrinks with the card — a
              narrow "sm" starter card (5-across depth chart) needs the small
              variant or 4 fixed 32px icons overflow the card. Capped to 3 +
              overflow here too, matching the compact/list variants (D18). */}
          {player.traits.slice(0, size === 'sm' ? 3 : 4).map((trait, i) => (
            <BadgeIcon key={i} name={trait.name} level={trait.level} size={size === 'sm' ? 'small' : 'normal'} />
          ))}
          {size === 'sm' && player.traits.length > 3 && (
            <BadgeOverflowIndicator count={player.traits.length - 3} names={player.traits.slice(3).map(t => t.name)} size="small" />
          )}
        </div>
      </div>

      <div className={`grid text-center bg-white border-t border-stone-200 ${size === 'sm' ? 'grid-cols-4' : 'grid-cols-4 @[180px]:grid-cols-6'}`}>
        <StatCell label="PPG" value={player.stats.pts.toFixed(1)} />
        <StatCell label="RPG" value={player.stats.trb.toFixed(1)} />
        <StatCell label="APG" value={player.stats.ast.toFixed(1)} />
        <StatCell label="SPG" value={player.stats.stl.toFixed(1)} className={size === 'sm' ? 'hidden' : 'hidden @[180px]:block'} />
        <StatCell label="BPG" value={player.stats.blk.toFixed(1)} className={size === 'sm' ? 'hidden' : 'hidden @[180px]:block'} />
        <StatCell label="FG%" value={(player.stats.fg_pct * 100).toFixed(0)} border={false} />
      </div>

      <div className="h-1.5" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />
    </div>
  );
}

export function PlayerCard({ player, onClick, isSelected = false, compact = false, popupDirection = 'up', size = 'md' }: { player: PlayerCardData; onClick?: () => void; isSelected?: boolean; compact?: boolean; popupDirection?: 'up' | 'down'; size?: 'sm' | 'md' }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const [c1, c2] = getPosColors(player.player.position);

  // NBA CDN headshot URL -> now served locally via the offline script!
  const headshotUrl = `/headshots/${player.player.id}.png`;

  if (compact) {
    const popClasses = popupDirection === 'up'
      ? "bottom-full left-1/2 -translate-x-1/2 mb-2 origin-bottom"
      : popupDirection === 'down'
      ? "top-full left-1/2 -translate-x-1/2 mt-2 origin-top"
      : "left-full top-1/2 -translate-y-1/2 ml-2 origin-left";

    return (
      <div
        className={`group relative w-full h-[46px] bg-white border rounded-lg shadow-sm cursor-pointer overflow-visible flex items-center ${isSelected ? 'border-orange-500' : 'border-stone-200 hover:border-stone-300'}`}
        onClick={onClick}
      >
        {/* Left Color Bar */}
        <div className="h-full w-1.5 shrink-0 rounded-l-[7px]" style={{ background: `linear-gradient(to bottom, ${c1}, ${c2})` }} />

        {/* Headshot */}
        <div className="w-9 h-full bg-stone-100 shrink-0 overflow-hidden relative border-r border-stone-200">
          <img src={headshotUrl} alt="" className="w-full h-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>

        {/* Details — two-line header: name + position pill, then gem + badges */}
        <div className="flex-1 min-w-0 px-1.5 flex flex-col justify-center gap-0.5">
           <div className="flex items-center justify-between gap-1">
             <div className="font-bold text-[10px] uppercase truncate text-stone-800 leading-tight">
               {player.player.name}
             </div>
             <PositionIcon position={player.player.position} className="min-w-[20px] h-[13px] px-1 text-[8px] shrink-0" />
           </div>

           <div className="flex items-center gap-1">
             <RarityGem rarity={player.rarity} size="sm" />
             {/* D18: small card variant caps at 2 badges + "+N" overflow */}
             {player.traits.slice(0, 2).map(t => (
               <BadgeIcon key={t.name} name={t.name} level={t.level} size="xs" />
             ))}
             <BadgeOverflowIndicator count={Math.max(0, player.traits.length - 2)} names={player.traits.slice(2).map(t => t.name)} size="xs" />
           </div>
        </div>

        {/* Hover Pop-Up (Full Card) */}
        <div className={`hidden group-hover:block absolute z-50 pointer-events-none scale-110 ${popClasses}`}>
          <div className="w-[180px]">
            <PlayerCard player={player} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group @container w-full select-none transition-transform duration-200 hover:-translate-y-1 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ perspective: 1000, aspectRatio: '5 / 7' }}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onTouchStart={() => setIsFlipped(f => !f)}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* FRONT */}
        <PlayerCardFront player={player} isSelected={isSelected} size={size} />

        {/* ===== BACK ===== */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg group-hover:shadow-2xl transition-shadow overflow-hidden bg-stone-900 text-stone-100 border border-stone-700"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', isolation: 'isolate' }}
        >
          {/* Top accent bar (same as front) */}
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />

          {/* Header: gem + rarity text + position pill + flip control */}
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-stone-700 bg-stone-800/80 backdrop-blur">
            <RarityGem rarity={player.rarity} size="lg" />
            <span className={`text-[11px] font-black uppercase tracking-widest ${rarityTextColor[player.rarity]}`}>{player.rarity}</span>
            <div className="flex-1" />
            <PositionIcon position={player.player.position} />
          </div>

          {/* Back body: badges first (game-relevant), then accolades, then season averages.
              No justify-center: centred flex content overflows at BOTH ends and hides the
              badges on small cards; top-aligned content only ever clips at the bottom. */}
          <div className="px-2.5 pt-1.5 pb-1 flex-1 flex flex-col overflow-hidden min-h-0">
            {player.traits && player.traits.length > 0 && (
              <div className="mb-1.5">
                <div className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mb-1 text-center">Badges</div>
                <div className="flex flex-wrap justify-center gap-1">
                  {player.traits.map((trait, i) => {
                    const cfg = badgeConfig[trait.name];
                    return (
                      <span key={i} className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border border-white/10 flex items-center gap-0.5" style={{ color: cfg?.color || '#9CA3AF', backgroundColor: `${cfg?.color || '#9CA3AF'}15` }}>
                        {trait.level > 1 && <span className="text-[8px] opacity-60">{trait.level}×</span>}
                        {trait.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {player.awards && player.awards.length > 0 && (
              <div className="mb-1.5">
                <div className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mb-1 text-center">Accolades</div>
                <div className="flex flex-wrap justify-center gap-1">
                  {player.awards.map((award, i) => (
                    <span key={i} className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[9px] font-black uppercase tracking-widest rounded border border-yellow-500/50">
                      {award}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mb-1 text-center">Season Averages</div>
            <div className="grid grid-cols-2 gap-x-1 gap-y-[2px]">
              {[
                ['GP', String(player.stats.gp)],
                ['MPG', player.stats.mpg.toFixed(1)],
                ['PTS', player.stats.pts.toFixed(1)],
                ['FGA', (player.stats.fga || 0).toFixed(1)],
                ['TRB', player.stats.trb.toFixed(1)],
                ['FG%', (player.stats.fg_pct * 100).toFixed(1)],
                ['AST', player.stats.ast.toFixed(1)],
                ['2PA', Math.max(0, (player.stats.fga || 0) - (player.stats.fg3a || 0)).toFixed(1)],
                ['STL', player.stats.stl.toFixed(1)],
                ['2P%', ((player.stats.fg2_pct || 0) * 100).toFixed(1)],
                ['BLK', player.stats.blk.toFixed(1)],
                ['3PA', (player.stats.fg3a || 0).toFixed(1)],
                ['FT%', ((player.stats.ft_pct || 0) * 100).toFixed(1)],
                ['3P%', (player.stats.fg3_pct * 100).toFixed(1)],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between items-center px-1.5 py-[2px] bg-stone-800 rounded border border-stone-700">
                  <span className="text-[8px] text-stone-400 font-bold uppercase">{label}</span>
                  <span className="text-[11px] font-black text-white">{val}</span>
                </div>
              ))}
            </div>

            {/* Bio — only when there is room */}
            <div className="mt-auto pt-1 text-center text-[8px] text-stone-500 font-bold tracking-widest uppercase hidden @[200px]:block">
                {player.player.height} • {player.player.weight} LBS • {player.player.age}Y
            </div>
          </div>

          {/* Bottom accent bar */}
          <div className="h-1.5" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />
        </div>
      </motion.div>
    </div>
  );
}

// Tactical board visual per play category. Module-level (not defined inside
// PlayCard's render) so it isn't recreated as a new component identity every
// render.
function PlayBoardGraphic({ cat }: { cat: 'system' | 'special' | 'basic' }) {
  if (cat === 'system') {
    // Clipboard / chalkboard diagram style
    return (
      <>
        <div className="w-20 h-14 border-2 border-white/25 rounded-md absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-[20%] left-[25%] w-3 h-3 rounded-full border-2 border-amber-300/60" />
        <div className="absolute top-[20%] right-[25%] w-3 h-3 rounded-full border-2 border-amber-300/60" />
        <div className="absolute bottom-[25%] left-[30%] w-3 h-3 rounded-full bg-amber-300/40" />
        <div className="absolute bottom-[25%] right-[30%] w-3 h-3 rounded-full bg-amber-300/40" />
        <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-300/40" />
        <span className="text-white/50 font-black italic tracking-[0.3em] text-xs drop-shadow-md">SYSTEM</span>
      </>
    );
  }
  if (cat === 'basic') {
    // Simple arrows / minimal
    return (
      <>
        <div className="w-12 h-[2px] bg-white/30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="w-0 h-0 border-l-[6px] border-l-white/30 border-y-[4px] border-y-transparent absolute top-1/2 right-[30%] -translate-y-1/2" />
        <div className="w-8 h-[2px] bg-white/20 absolute top-[35%] left-[35%] rotate-[30deg]" />
        <div className="w-8 h-[2px] bg-white/20 absolute bottom-[35%] left-[35%] -rotate-[30deg]" />
        <span className="text-white/40 font-bold tracking-[0.2em] text-[10px] mt-4">BASIC</span>
      </>
    );
  }
  // Special play — target / crosshair
  return (
    <>
      <div className="w-14 h-14 border-2 border-teal-300/30 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="w-8 h-8 border-2 border-teal-300/30 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="w-[2px] h-10 bg-teal-300/25 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="w-10 h-[2px] bg-teal-300/25 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="w-2 h-2 bg-teal-300/50 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
    </>
  );
}

export function PlayCardFront({ play }: { play: Play }) {
  const cat = play.playCategory || 'special';
  const theme = {
    system: { accent: 'bg-amber-500', accentDark: 'bg-amber-600', board: 'bg-amber-900', label: 'SYSTEM' },
    special: { accent: 'bg-teal-500', accentDark: 'bg-teal-600', board: 'bg-teal-900', label: 'SPECIAL' },
    basic: { accent: 'bg-slate-500', accentDark: 'bg-slate-600', board: 'bg-slate-800', label: 'BASIC' },
  }[cat];
  const requirements = getPlayRequirements(getPlayEffectId(play));

  return (
    <div className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-stone-100">
      <div className={`h-1.5 w-full ${theme.accent}`} />
      <div className="px-2 py-1 bg-white flex items-center gap-1 border-b border-stone-200">
        <RarityGem rarity={play.rarity} size="sm" />
        <div className="flex-1 min-w-0 ml-1">
          <div className={`font-black uppercase leading-none tracking-tight text-stone-900 ${play.name.length > 16 ? 'text-[9px]' : play.name.length > 12 ? 'text-[10px]' : 'text-xs'}`}>
            {play.name}
          </div>
          <div className="text-[7px] text-stone-500 font-bold uppercase tracking-wider leading-tight mt-0.5">PLAY</div>
        </div>
        <div className={`text-[9px] font-black text-white px-1.5 py-0.5 rounded-sm shrink-0 ${theme.accentDark}`}>{theme.label}</div>
      </div>
      <div className={`flex-1 relative overflow-hidden ${theme.board} flex items-center justify-center p-2`}>
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/basketball.png')]" />
        <div className="w-full h-full border-2 border-white/15 rounded-sm relative flex flex-col items-center justify-center">
          <PlayBoardGraphic cat={cat} />
        </div>
      </div>
      {requirements.length > 0 && (
        <div className="px-2 py-2 bg-white flex flex-col items-center gap-1 border-t border-stone-200 min-h-[40px] justify-center">
          <span className="text-[6px] text-stone-400 font-bold uppercase tracking-widest leading-none">Synergy Key</span>
          <PlayRequirementIcons requirements={requirements} size="small" />
        </div>
      )}
      <div className={`h-1 ${theme.accent}`} />
    </div>
  );
}

export function RoleTag({ playName, roleName, side }: { playName: string; roleName: string; side: 'offense' | 'defense' }): JSX.Element {
  const bgColor = side === 'offense' ? 'bg-amber-500' : 'bg-sky-500';
  const textColor = side === 'offense' ? 'text-amber-50' : 'text-sky-50';

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-[8px] font-bold uppercase ${bgColor} ${textColor} shrink-0 h-[18px]`}
      title={`${playName} — ${roleName}`}
    >
      {roleName}
    </span>
  );
}

export function PlayCard({ play, onClick, isSelected = false, compact = false, popupDirection = 'up', evaluation, status, players, selectedRoleId, onRoleClick, onRoleClear, onRoleDrop }: { play: Play; onClick?: () => void; isSelected?: boolean; compact?: boolean; popupDirection?: 'up' | 'down' | 'right'; evaluation?: PlayEvaluation; status?: PlayStatus; players?: PlayerCardData[]; selectedRoleId?: string; onRoleClick?: (roleId: string) => void; onRoleClear?: (roleId: string) => void; onRoleDrop?: (roleId: string, cardId: string) => void }) {
  const [isFlipped, setIsFlipped] = useState(false);

  // Requirements come from the synergy engine, never from the legacy `play.badges`
  // flavour text. Without an `evaluation` (draft room, home page) they render neutral;
  // with one (in-game / roster context) each requirement carries have/met state.
  const requirements: PlayRequirementStatus[] | PlayRequirement[] = evaluation
    ? evaluation.requirements
    : getPlayRequirements(getPlayEffectId(play));
  const effectSummary = evaluation?.summary ?? evaluatePlay(play, {}).summary;
  const stateLabel = !evaluation ? null
    : evaluation.activation === 'full' ? { text: 'ACTIVE', color: 'text-emerald-400' }
    : evaluation.activation === 'partial' ? { text: `PARTIAL ${evaluation.metCount}/${evaluation.total}`, color: 'text-amber-400' }
    : { text: 'INACTIVE', color: 'text-stone-400' };

  // Category-driven theming
  const cat = play.playCategory || 'special';
  const theme = {
    system:  { accent: 'bg-amber-500',   accentDark: 'bg-amber-600',   board: 'bg-amber-900',  label: 'SYSTEM',  labelColor: 'text-amber-400',  ringColor: 'ring-amber-400',  hoverShadow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]', hoverBorder: 'hover:border-amber-500', barColor: 'bg-amber-500', mechLabel: 'text-amber-400', mechBorder: 'border-amber-500/30' },
    special: { accent: 'bg-teal-500',    accentDark: 'bg-teal-600',    board: 'bg-teal-900',   label: 'SPECIAL', labelColor: 'text-teal-400',   ringColor: 'ring-teal-400',   hoverShadow: 'shadow-[0_0_10px_rgba(20,184,166,0.3)]',  hoverBorder: 'hover:border-teal-500',  barColor: 'bg-teal-500',  mechLabel: 'text-teal-400',  mechBorder: 'border-teal-500/30'  },
    basic:   { accent: 'bg-slate-500',   accentDark: 'bg-slate-600',   board: 'bg-slate-800',  label: 'BASIC',   labelColor: 'text-slate-400',  ringColor: 'ring-slate-400',  hoverShadow: 'shadow-[0_0_10px_rgba(100,116,139,0.3)]', hoverBorder: 'hover:border-slate-500', barColor: 'bg-slate-500', mechLabel: 'text-slate-400', mechBorder: 'border-slate-500/30' },
  }[cat];

  if (compact) {
    const popClasses = popupDirection === 'up'
      ? "bottom-full left-1/2 -translate-x-1/2 mb-2 origin-bottom"
      : popupDirection === 'down'
      ? "top-full left-1/2 -translate-x-1/2 mt-2 origin-top"
      : "left-full top-1/2 -translate-y-1/2 ml-2 origin-left";

    // Determine which roles to show: from status or from play definition
    const playDef = status?.def || getPlayDef(play);
    const roles = status?.roles || (playDef?.roles ?? []);
    const showRoleDots = status !== undefined;

    return (
      <div
        className={`group relative w-full h-[60px] bg-white border border-stone-200 rounded-lg shadow-sm cursor-pointer ${theme.hoverBorder} overflow-visible flex items-center`}
        onClick={onClick}
      >
        <div className={`h-full w-2 shrink-0 ${theme.barColor} rounded-l-[7px]`} />
        <div className="flex-1 min-w-0 px-2 flex flex-col justify-center gap-0.5 overflow-hidden">
           <div className="font-bold text-[10px] uppercase truncate text-stone-800 leading-tight" title={play.name}>
             {play.name}
           </div>
           <div className="flex items-center gap-1.5 overflow-hidden">
             <span className={`text-[9px] font-bold shrink-0 ${theme.labelColor}`}>{theme.label}</span>
             {roles && roles.length > 0 && (
               <div className="flex items-center gap-0.5 shrink-0">
                 {roles.map((roleOrStatus, i) => {
                   const filled = 'filled' in roleOrStatus ? roleOrStatus.filled : false;
                   const badge = ('role' in roleOrStatus ? roleOrStatus.role : roleOrStatus)?.badge;
                   const badgeName = badge || 'Veteran Presence';
                   return (
                     <div key={i} className="relative">
                       <BadgeIcon name={badgeName} level={1} size="xs" />
                       {showRoleDots && (
                         <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-stone-900 ${filled ? 'bg-emerald-400' : 'bg-stone-300'}`} />
                       )}
                     </div>
                   );
                 })}
               </div>
             )}
           </div>
        </div>
        <div className={`hidden group-hover:block absolute z-50 pointer-events-none scale-110 ${popClasses}`}>
           <div className="w-[180px] shadow-2xl">
             <PlayCard play={play} evaluation={evaluation} status={status} players={players} />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative w-full aspect-[5/7] cursor-pointer transition-transform hover:-translate-y-1 ${isSelected ? `ring-2 ${theme.ringColor} ring-offset-1 ring-offset-stone-900 rounded-lg scale-105` : `hover:scale-[1.02] ${theme.hoverShadow}`}`}
      style={{ perspective: 800 }}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onTouchStart={() => setIsFlipped(f => !f)}
    >

      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* ===== FRONT ===== */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-stone-100"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', isolation: 'isolate' }}
        >
          <div className={`h-1.5 w-full ${theme.accent}`} />

          <div className="px-2 py-1 bg-white flex items-center gap-1 border-b border-stone-200">
            <RarityGem rarity={play.rarity} size="sm" />
            <div className="flex-1 min-w-0 ml-1">
              <div className={`font-black uppercase leading-none tracking-tight text-stone-900 ${play.name.length > 16 ? 'text-[9px]' : play.name.length > 12 ? 'text-[10px]' : 'text-xs'}`}>
                {play.name}
              </div>
              <div className="text-[7px] text-stone-500 font-bold uppercase tracking-wider leading-tight mt-0.5">
                PLAY
              </div>
            </div>
            <div className={`text-[9px] font-black text-white px-1.5 py-0.5 rounded-sm shrink-0 ${theme.accentDark}`}>
              {theme.label}
            </div>
          </div>

          {/* Playboard Image Area OR Role List (when status is present) */}
          {status ? (
            // NEW: Role list view
            <div className="flex-1 flex flex-col overflow-hidden px-2 py-1.5 bg-white/50">
              <div className="flex-1 overflow-y-auto space-y-1 mb-1">
                {status.roles.map((roleStatus, i) => {
                  const playerFromRoster = players?.find(p => p.id === roleStatus.playerId);
                  const isSelected = selectedRoleId === roleStatus.role.id;
                  const isFilled = roleStatus.filled;
                  const headshotUrl = playerFromRoster ? `/headshots/${playerFromRoster.id}.png` : undefined;

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-1 p-1 rounded border transition-all ${
                        isFilled
                          ? 'border-l-4 border-l-emerald-500 border-r border-r-stone-200 border-t border-t-stone-200 border-b border-b-stone-200 bg-emerald-50/30'
                          : 'border border-stone-200 bg-stone-50/30'
                      } ${isSelected ? 'ring-2 ring-amber-400' : ''}`}
                      style={isSelected ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRoleClick?.(roleStatus.role.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('bg-amber-100/50');
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('bg-amber-100/50');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('bg-amber-100/50');
                        e.stopPropagation();
                        const cardId = e.dataTransfer.getData('text/plain') || '';
                        if (cardId) {
                          onRoleDrop?.(roleStatus.role.id, cardId);
                        }
                      }}
                    >
                      {/* Badge + Level */}
                      <div className="flex-shrink-0 pt-0.5">
                        <BadgeIcon name={roleStatus.role.badge || 'Veteran Presence'} level={roleStatus.role.minLevel ?? 1} size="xs" />
                      </div>

                      {/* Role name + player assignment */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-bold uppercase text-stone-800 leading-none truncate">
                          {roleStatus.role.name}
                        </div>
                        {playerFromRoster && headshotUrl ? (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <img
                              src={headshotUrl}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover object-top border border-stone-300 flex-shrink-0 bg-stone-100"
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                            <span className="text-[8px] text-stone-700 font-semibold truncate">
                              {playerFromRoster.player.name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5 mt-0.5 px-1 py-0.5 border border-dashed border-stone-300 rounded text-[8px] text-stone-500 font-semibold">
                            Assign
                          </div>
                        )}
                        {!isFilled && roleStatus.reason && (
                          <div className="text-[8px] text-red-600 font-semibold leading-none mt-0.5">
                            {roleStatus.reason}
                          </div>
                        )}
                      </div>

                      {/* Clear button */}
                      {playerFromRoster && (
                        <button
                          className="flex-shrink-0 p-0.5 hover:bg-red-100 rounded transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRoleClear?.(roleStatus.role.id);
                          }}
                        >
                          <X size={12} className="text-red-600" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Status line */}
              <div className="flex items-center justify-between gap-1 px-1 py-1 border-t border-stone-200 bg-white/60">
                <span className={`text-[8px] font-black uppercase tracking-wider ${status.active ? 'text-emerald-600' : 'text-stone-500'}`}>
                  {status.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
                <span className="text-[8px] text-stone-600 font-semibold">
                  {Math.round(status.allocation * 100)}% of {status.def.side === 'offense' ? 'possessions' : 'opp. possessions'}
                </span>
              </div>
            </div>
          ) : (
            // ORIGINAL: Playboard Image Area
            <div className={`flex-1 relative overflow-hidden ${theme.board} flex items-center justify-center p-2`}>
              <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/basketball.png')]" />

              <div className="w-full h-full border-2 border-white/15 rounded-sm relative flex flex-col items-center justify-center">
                  <PlayBoardGraphic cat={cat} />
              </div>
            </div>
          )}

          {/* Requirement icons — only when there's no status (legacy) */}
          {!status && requirements.length > 0 && (
            <div className="px-2 py-2 bg-white flex flex-col items-center gap-1 border-t border-stone-200 min-h-[40px] justify-center">
                <span className="text-[6px] text-stone-400 font-bold uppercase tracking-widest leading-none">Synergy Key</span>
                <PlayRequirementIcons requirements={requirements} size="small" />
                {stateLabel && (
                  <span className={`text-[8px] font-black uppercase tracking-widest ${stateLabel.color}`}>{stateLabel.text}</span>
                )}
            </div>
          )}

          {/* Neutral role list — when no status but getPlayDef exists */}
          {!status && !requirements.length && (
            (() => {
              const playDef = getPlayDef(play);
              return playDef && playDef.roles.length > 0 ? (
                <div className="px-2 py-2 bg-white flex flex-col gap-1 border-t border-stone-200">
                  {playDef.roles.map((role, i) => (
                    <div key={i} className="flex items-center gap-1 text-[8px]">
                      <BadgeIcon name={role.badge || 'Veteran Presence'} level={role.minLevel ?? 1} size="xs" />
                      <div className="flex-1">
                        <div className="font-bold text-stone-800 uppercase">{role.name}</div>
                        <div className="text-stone-600">{describeRoleRequirement(role)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null;
            })()
          )}

          <div className={`h-1 ${theme.accent}`} />
        </div>

        {/* ===== BACK ===== */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-stone-900"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', isolation: 'isolate' }}
        >
          <div className={`h-1.5 w-full ${theme.accent}`} />

          <div className="px-2 py-1 bg-stone-800 flex items-center gap-1 border-b border-stone-700">
            <RarityGem rarity={play.rarity} size="sm" />
            <div className="flex-1 min-w-0 ml-1">
              <div className={`font-black uppercase leading-none tracking-tight text-white ${play.name.length > 16 ? 'text-[9px]' : play.name.length > 12 ? 'text-[10px]' : 'text-xs'}`}>
                {play.name}
              </div>
              <div className="text-[7px] text-stone-400 font-bold uppercase tracking-wider leading-tight mt-0.5">
                PLAY
              </div>
            </div>
            <div className={`text-[9px] font-black text-white px-1.5 py-0.5 rounded-sm shrink-0 ${theme.accentDark}`}>
              {theme.label}
            </div>
          </div>

          {/* Mechanic Explanation */}
          <div className="flex-1 p-3 flex flex-col items-center justify-center text-center bg-stone-800 gap-2 overflow-hidden">
            <div>
              <span className={`text-[8px] ${theme.mechLabel} font-bold uppercase tracking-widest mb-2 border-b ${theme.mechBorder} pb-1 block`}>Play Mechanic</span>
              <p className="text-white text-[10px] leading-relaxed font-medium">
                {play.mechanicText}
              </p>
            </div>

            {(status?.def.summary || effectSummary) && (
              <div className="w-full px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-[7px] text-emerald-400 font-black uppercase tracking-widest block mb-0.5">Effect</span>
                <span className="text-emerald-200 text-[9px] font-bold leading-snug block">{status?.def.summary || effectSummary}</span>
              </div>
            )}

            {/* Show role requirements when status is present */}
            {status ? (
              <div className="w-full flex flex-col gap-0.5">
                {status.def.roles.map((role, i) => (
                  <div key={i} className="flex items-center justify-between gap-1 text-[8px] px-1.5 py-0.5 rounded bg-stone-900/60 border border-stone-700">
                    <span className="font-bold text-stone-300 uppercase truncate">{role.name}</span>
                    <span className="text-stone-400 text-[7px]">{describeRoleRequirement(role)}</span>
                  </div>
                ))}
              </div>
            ) : (
              /* Legacy requirement display */
              requirements.length > 0 && (
                <div className="w-full flex flex-col gap-0.5">
                  {requirements.map((req, i) => {
                    const reqStatus = isRequirementStatus(req) ? req : null;
                    return (
                      <div key={i} className="flex items-center justify-between gap-1 text-[8px] px-1.5 py-0.5 rounded bg-stone-900/60 border border-stone-700">
                        <span className="font-bold text-stone-300 uppercase truncate">{req.badge}</span>
                        <span className={`font-black shrink-0 ${reqStatus ? (reqStatus.met ? 'text-emerald-400' : 'text-red-400') : 'text-stone-400'}`}>
                          {reqStatus ? `${reqStatus.have}/${reqStatus.levels} ${reqStatus.met ? '✓' : '✗'}` : `×${req.levels}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          <div className={`h-1 ${theme.accent}`} />
        </div>
      </motion.div>
    </div>
  );
}
