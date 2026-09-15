/**
 * plan_ui_foundation D1: game-data colours (position, rarity, team, badge, play
 * category). These are NOT theme — they identify game entities and must look the
 * same in `court` and `night`. This is the ONE product file the style gate
 * (`scripts/check-styles.mjs`) excludes entirely, so literal hex and Tailwind
 * palette classes are allowed here and ONLY here. Every other file imports these
 * constants/helpers and never writes a literal hex or palette class itself.
 */
import {
  Star, Flame, Target, Crosshair, Brain, Dumbbell, Shield, ShieldCheck, Crown,
  Trophy, Zap, TrendingUp, Bird, Thermometer, Swords, ClipboardList, Sparkles,
  Wand2, type LucideIcon,
} from 'lucide-react';
import type { Play } from '@/engine/types';

// ---- Badges -------------------------------------------------------------------

export const badgeConfig: Record<string, { icon: LucideIcon; color: string }> = {
  'Finisher':            { icon: Flame,         color: '#F97316' },
  'Mid-Range Maestro':   { icon: Target,        color: '#3B82F6' },
  'Sharpshooter':        { icon: Crosshair,     color: '#8B5CF6' },
  'Floor General':       { icon: Brain,          color: '#14B8A6' },
  'Glass Cleaner':       { icon: Dumbbell,       color: '#22C55E' },
  'Lockdown Defender':   { icon: Shield,         color: '#EF4444' },
  'Paint Protector':     { icon: ShieldCheck,    color: '#DC2626' },
  'Legend':              { icon: Crown,          color: '#F59E0B' },
  'League Leader':       { icon: Trophy,         color: '#F59E0B' },
  'Ironman':             { icon: Zap,            color: '#EAB308' },
  'Efficiency Savant':   { icon: TrendingUp,     color: '#06B6D4' },
  'Sniper':              { icon: Crosshair,      color: '#6366F1' },
  'Volume Scorer':       { icon: Flame,          color: '#F97316' },
  'Young Phenom':        { icon: Sparkles,       color: '#F59E0B' },
  'Veteran Presence':    { icon: Bird,           color: '#78716C' },
  'Microwave':           { icon: Thermometer,    color: '#EF4444' },
  'Two-Way Disruptor':   { icon: Swords,         color: '#8B5CF6' },
  'Stat Sheet Stuffer':  { icon: ClipboardList,  color: '#10B981' },
  'Playmaking Maestro':  { icon: Wand2,          color: '#14B8A6' },
};

export const defaultBadgeConfig = { icon: Star, color: '#9CA3AF' };

// ---- Position -------------------------------------------------------------------

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

// Conic-gradient stops for the ALL/STAR position pill.
export const positionConicGradient =
  'conic-gradient(#3B82F6 0 72deg, #8B5CF6 72deg 144deg, #10B981 144deg 216deg, #F59E0B 216deg 288deg, #EF4444 288deg 360deg)';

// ---- Rarity -----------------------------------------------------------------

export type GemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Mythic';

export const gemPalettes: Record<GemRarity, { base: string; light1: string; light2: string; dark1: string; dark2: string; stroke: string; glow?: string }> = {
  Common:   { base: '#57534e', light1: '#78716c', light2: '#6b6560', dark1: '#3f3b38', dark2: '#2f2c2a', stroke: '#292524' },
  Uncommon: { base: '#cbd5e1', light1: '#f8fafc', light2: '#e2e8f0', dark1: '#94a3b8', dark2: '#7d8ea3', stroke: '#94a3b8', glow: '0 0 3px rgba(203,213,225,0.65)' },
  Rare:     { base: '#eab308', light1: '#fde68a', light2: '#fbbf24', dark1: '#b45309', dark2: '#92400e', stroke: '#a16207', glow: '0 0 6px rgba(234,179,8,0.65)' },
  Mythic:   { base: '#f97316', light1: '#fed7aa', light2: '#fb923c', dark1: '#dc2626', dark2: '#991b1b', stroke: '#c2410c', glow: '0 0 8px rgba(249,115,22,0.8)' },
};

export const gemPixelSizes: Record<'sm' | 'md' | 'lg', number> = { sm: 12, md: 16, lg: 22 };

// Rarity-coloured text used on the card back header. Kept as literal Tailwind
// palette classes — this file is excluded from the style gate entirely.
export const rarityTextColor: Record<GemRarity, string> = {
  Common: 'text-stone-400',
  Uncommon: 'text-slate-300',
  Rare: 'text-amber-400',
  Mythic: 'text-orange-400',
};

// Top/bottom accent line shown on Rare/Mythic card fronts.
export const rarityAccentColor: Record<GemRarity, string> = {
  Common: gemPalettes.Common.base,
  Uncommon: gemPalettes.Uncommon.base,
  Rare: gemPalettes.Rare.base,
  Mythic: gemPalettes.Mythic.base,
};

// ---- Teams --------------------------------------------------------------------

export const teamColors: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#000000', CHA: '#1D1160', CHI: '#CE1141',
  CLE: '#860038', DAL: '#00538C', DEN: '#0E2240', DET: '#C8102E', GSW: '#1D428A',
  HOU: '#CE1141', IND: '#002D62', LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9',
  MIA: '#98002E', MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#1D1160', POR: '#E03A3E',
  SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141', UTA: '#002B5C', WAS: '#002B5C',
};

// Fallback swatches for an unknown/missing team abbreviation.
export const defaultTeamColor = '#9ca3af';
export const defaultTeamColorDark = '#374151';

export const teamIds: Record<string, string> = {
  ATL: '1610612737', BOS: '1610612738', BKN: '1610612751', CHA: '1610612766', CHI: '1610612741',
  CLE: '1610612739', DAL: '1610612742', DEN: '1610612743', DET: '1610612765', GSW: '1610612744',
  HOU: '1610612745', IND: '1610612754', LAC: '1610612746', LAL: '1610612747', MEM: '1610612763',
  MIA: '1610612748', MIL: '1610612749', MIN: '1610612750', NOP: '1610612740', NYK: '1610612752',
  OKC: '1610612760', ORL: '1610612753', PHI: '1610612755', PHX: '1610612756', POR: '1610612757',
  SAC: '1610612758', SAS: '1610612759', TOR: '1610612761', UTA: '1610612762', WAS: '1610612764',
};

// ---- Play category --------------------------------------------------------------

export type PlayCategory = Play['playCategory'];

// List-row category label colour (CardListRow).
export const catColor: Record<PlayCategory, string> = {
  system: 'text-amber-600',
  special: 'text-teal-600',
  basic: 'text-slate-500',
};

// Full PlayCard/PlayCardFront theming per category.
export const playCategoryTheme: Record<PlayCategory, {
  accent: string; accentDark: string; board: string; label: string;
  labelColor: string; ringColor: string; hoverShadow: string; hoverBorder: string;
  barColor: string; mechLabel: string; mechBorder: string;
}> = {
  system: {
    accent: 'bg-amber-500', accentDark: 'bg-amber-600', board: 'bg-amber-900', label: 'SYSTEM',
    labelColor: 'text-amber-400', ringColor: 'ring-amber-400',
    hoverShadow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]', hoverBorder: 'hover:border-amber-500',
    barColor: 'bg-amber-500', mechLabel: 'text-amber-400', mechBorder: 'border-amber-500/30',
  },
  special: {
    accent: 'bg-teal-500', accentDark: 'bg-teal-600', board: 'bg-teal-900', label: 'SPECIAL',
    labelColor: 'text-teal-400', ringColor: 'ring-teal-400',
    hoverShadow: 'shadow-[0_0_10px_rgba(20,184,166,0.3)]', hoverBorder: 'hover:border-teal-500',
    barColor: 'bg-teal-500', mechLabel: 'text-teal-400', mechBorder: 'border-teal-500/30',
  },
  basic: {
    accent: 'bg-slate-500', accentDark: 'bg-slate-600', board: 'bg-slate-800', label: 'BASIC',
    labelColor: 'text-slate-400', ringColor: 'ring-slate-400',
    hoverShadow: 'shadow-[0_0_10px_rgba(100,116,139,0.3)]', hoverBorder: 'hover:border-slate-500',
    barColor: 'bg-slate-500', mechLabel: 'text-slate-400', mechBorder: 'border-slate-500/30',
  },
};

// RoleTag (offense/defense chip).
export const roleTagColor: Record<'offense' | 'defense', { bg: string; text: string }> = {
  offense: { bg: 'bg-amber-500', text: 'text-amber-50' },
  defense: { bg: 'bg-sky-500', text: 'text-sky-50' },
};

// plan_deckbuilder_ux D5: PlayTile's category bar + category chip, as hex. Applied only
// via inline `style` (never a raw palette class) since this is the one file the style
// gate (`scripts/check-styles.mjs`) excludes entirely. Mirrors the hues
// `playCategoryTheme` already uses elsewhere (amber/teal/slate) so old and new play UI
// read as one system.
export const playCategoryHex: Record<PlayCategory, { bar: string; chipBg: string }> = {
  system: { bar: '#f59e0b', chipBg: '#d97706' },
  special: { bar: '#14b8a6', chipBg: '#0d9488' },
  basic: { bar: '#64748b', chipBg: '#475569' },
};

// PlayBoardGraphic's per-category decorative accents (chalkboard dots, crosshair rings).
export const playBoardAccent: Record<PlayCategory, { ring: string; dot: string; center: string }> = {
  system: { ring: 'border-amber-300/60', dot: 'bg-amber-300/40', center: 'bg-amber-300/50' },
  special: { ring: 'border-teal-300/30', dot: 'bg-teal-300/25', center: 'bg-teal-300/50' },
  basic: { ring: 'border-white/30', dot: 'bg-white/20', center: 'bg-white/30' },
};
