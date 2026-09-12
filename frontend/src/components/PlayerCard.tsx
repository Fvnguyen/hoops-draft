'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, Star, Flame, Target, Crosshair, Brain, Dumbbell, Shield, ShieldCheck, Crown, Trophy, Zap, TrendingUp, Bird, Thermometer, Swords, ClipboardList, Sparkles, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { PlayerCard as DBPlayerCard } from '@/lib/engine';

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

function BadgeIcon({ name, level, size = 'normal' }: { name: string; level: number; size?: 'normal' | 'small' }) {
  const cfg = badgeConfig[name] || { icon: Star, color: '#9CA3AF', bg: 'bg-stone-500/20' };
  const Icon = cfg.icon;
  const iconSize = size === 'small' ? 12 : 16;
  const containerSize = size === 'small' ? 'w-6 h-6' : 'w-8 h-8';

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

export interface PlayerCardData extends DBPlayerCard {
  type: 'Player';
  imageUrl?: string;
}

export type Player = PlayerCardData;

export interface Play {
  type: 'Play';
  id: string;
  name: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Mythic';
  playCategory: 'system' | 'special' | 'basic';
  badges: string[];
  mechanicText: string;
  imageUrl?: string;
}

export type DraftCard = PlayerCardData | Play;

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

export function PositionIcon({ position, className = "w-5 h-5 text-[8px]", borderClass = "border border-white/40" }: { position: string, className?: string, borderClass?: string }) {
  const p = position.replace('-', '/');
  
  if (p === 'ALL' || p === 'STAR') {
    return (
      <div className={`relative rounded-full overflow-hidden shadow-sm ${borderClass} flex items-center justify-center shrink-0 ${className}`}>
        <div className="absolute inset-0" style={{ background: 'conic-gradient(#3B82F6 0 72deg, #8B5CF6 72deg 144deg, #10B981 144deg 216deg, #F59E0B 216deg 288deg, #EF4444 288deg 360deg)' }} />
        <Star size={10} className="relative z-10 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" fill="currentColor" />
      </div>
    );
  }

  const [c1, c2] = getPosColors(p);

  return (
    <div className={`relative rounded-full overflow-hidden shadow-sm ${borderClass} flex items-center justify-center shrink-0 ${className}`}>
      {c1 !== c2 ? (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` }} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: c1 }} />
      )}
      <span className="relative z-10 font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] leading-none" style={{ letterSpacing: '-0.5px', fontSize: p.length > 3 ? '0.7em' : '1em' }}>{p}</span>
    </div>
  );
}

// Small MtG-style rarity gem
function RarityGem({ rarity }: { rarity: PlayerCardData['rarity'] }) {
  const colors: Record<string, string> = {
    'Common': 'bg-stone-900 border-stone-700',
    'Uncommon': 'bg-stone-300 border-stone-100',
    'Rare': 'bg-yellow-500 border-yellow-300',
    'Mythic': 'bg-orange-500 border-orange-300'
  };
  return <div className={`w-3 h-3 rounded-full border shadow-inner ${colors[rarity] || colors['Common']}`} />;
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

export function MiniPlayerCard({ player, className = "", onClick }: { player: PlayerCardData, className?: string, onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const rarityBorders: Record<string, string> = {
    'Common': 'border-stone-700',
    'Uncommon': 'border-stone-400',
    'Rare': 'border-yellow-400',
    'Mythic': 'border-orange-500'
  };
  const rarityShadows: Record<string, string> = {
    'Common': 'shadow-stone-900/10',
    'Uncommon': 'shadow-stone-400/20',
    'Rare': 'shadow-yellow-400/30',
    'Mythic': 'shadow-orange-500/40 glow-orange'
  };
  
  const borderColor = rarityBorders[player.rarity] || 'border-stone-700';
  const shadowClass = rarityShadows[player.rarity] || 'shadow-sm';
  const tmColor = teamColors[player.player.team] || '#9ca3af';
  const headshotUrl = `/headshots/${player.player.id}.png`;
  
  return (
    <div 
      className={`relative rounded border-[1.5px] bg-white cursor-pointer transition-transform hover:-translate-y-1 ${borderColor} ${shadowClass} ${className}`}
      style={{ width: '40px', height: '56px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="absolute top-0 w-full h-1.5 opacity-80" style={{ backgroundColor: tmColor }} />
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

export function PlayerCard({ player, onClick, isSelected = false, compact = false, popupDirection = 'up' }: { player: PlayerCardData; onClick?: () => void; isSelected?: boolean; compact?: boolean; popupDirection?: 'up' | 'down' }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const [c1, c2] = getPosColors(player.player.position);
  const teamColor = teamColors[player.player.team] || '#374151';
  const teamId = teamIds[player.player.team];
  
  // NBA CDN headshot URL -> now served locally via the offline script!
  const headshotUrl = `/headshots/${player.player.id}.png`;
  const logoUrl = teamId ? `/logos/${teamId}.svg` : null;

  const rarityBorders: Record<string, string> = {
    'Common': 'border-stone-700',
    'Uncommon': 'border-stone-300',
    'Rare': 'border-yellow-500',
    'Mythic': 'border-orange-500'
  };
  const borderColor = rarityBorders[player.rarity] || 'border-stone-700';

  if (compact) {
    const popClasses = popupDirection === 'up' 
      ? "bottom-full left-1/2 -translate-x-1/2 mb-2 origin-bottom" 
      : popupDirection === 'down' 
      ? "top-full left-1/2 -translate-x-1/2 mt-2 origin-top"
      : "left-full top-1/2 -translate-y-1/2 ml-2 origin-left";

    return (
      <div 
        className={`group relative w-full h-[60px] bg-white border rounded-lg shadow-sm cursor-pointer overflow-visible flex items-center ${isSelected ? 'border-orange-500' : 'border-stone-200 hover:border-stone-300'}`}
        onClick={onClick}
      >
        {/* Left Color Bar */}
        <div className="h-full w-2 shrink-0 rounded-l-[7px]" style={{ background: `linear-gradient(to bottom, ${c1}, ${c2})` }} />
        
        {/* Headshot */}
        <div className="w-12 h-full bg-stone-100 shrink-0 overflow-hidden relative border-r border-stone-200">
          <img src={headshotUrl} alt="" className="w-full h-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        
        {/* Details */}
        <div className="flex-1 min-w-0 px-2 flex flex-col justify-center">
           <div className="flex items-center justify-between gap-1">
             <div className="font-bold text-[11px] uppercase truncate text-stone-800 leading-tight">
               {player.player.name}
             </div>
             <div className="text-[9px] font-bold text-stone-400 whitespace-nowrap">{player.player.position}</div>
           </div>
           
           <div className="flex items-center gap-1 mt-0.5">
             <RarityGem rarity={player.rarity} />
             {player.traits.slice(0, 3).map(t => (
               <BadgeIcon key={t.name} name={t.name} level={t.level} size="small" />
             ))}
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
      className={`w-full select-none ${onClick ? 'cursor-pointer' : ''}`}
      style={{ perspective: 1000, aspectRatio: '5 / 7' }}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* FRONT */}
        <div className={`absolute inset-0 bg-stone-100 rounded-xl overflow-hidden shadow-xl border border-stone-300 flex flex-col ${isSelected ? 'ring-2 ring-orange-500' : ''}`} style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: `linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 100%)` }}>
          {/* Top Bar */}
          <div className="flex justify-between items-center px-3 py-2 bg-white/50 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-1.5 min-w-0">
              <PositionIcon position={player.player.position} className="w-5 h-5 text-[8px]" borderClass={`border-[3px] ${borderColor}`} />
              <span className={`font-black tracking-tight text-stone-800 uppercase truncate ${player.player.name.length > 16 ? 'text-[12px]' : 'text-[15px]'}`}>{player.player.name}</span>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <div className="text-[12px] font-bold text-stone-500 leading-none">{player.player.team} {player.player.age}Y</div>
            </div>
          </div>
          
          {/* Main Visual */}
          <div className="flex-1 relative overflow-hidden bg-stone-200">
            {/* Team color stripe with Logo */}
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
            {/* Traits/Badges as Icons */}
            <div className="absolute bottom-2 w-full flex justify-center gap-2 px-2">
              {player.traits.slice(0, 4).map((trait, i) => (
                <BadgeIcon key={i} name={trait.name} level={trait.level} />
              ))}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-6 text-center bg-white border-t border-stone-200">
            <div className="py-1.5 border-r border-stone-100"><div className="text-[9px] text-stone-400 font-bold uppercase">PPG</div><div className="text-sm font-black text-stone-800 leading-none">{player.stats.pts.toFixed(1)}</div></div>
            <div className="py-1.5 border-r border-stone-100"><div className="text-[9px] text-stone-400 font-bold uppercase">RPG</div><div className="text-sm font-black text-stone-800 leading-none">{player.stats.trb.toFixed(1)}</div></div>
            <div className="py-1.5 border-r border-stone-100"><div className="text-[9px] text-stone-400 font-bold uppercase">APG</div><div className="text-sm font-black text-stone-800 leading-none">{player.stats.ast.toFixed(1)}</div></div>
            <div className="py-1.5 border-r border-stone-100"><div className="text-[9px] text-stone-400 font-bold uppercase">SPG</div><div className="text-sm font-black text-stone-800 leading-none">{player.stats.stl.toFixed(1)}</div></div>
            <div className="py-1.5 border-r border-stone-100"><div className="text-[9px] text-stone-400 font-bold uppercase">BPG</div><div className="text-sm font-black text-stone-800 leading-none">{player.stats.blk.toFixed(1)}</div></div>
            <div className="py-1.5"><div className="text-[9px] text-stone-400 font-bold uppercase">FG%</div><div className="text-sm font-black text-stone-800 leading-none">{(player.stats.fg_pct * 100).toFixed(0)}</div></div>
          </div>

          {/* Bottom accent bar */}
          <div className="h-1.5" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />
        </div>

        {/* ===== BACK ===== */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-stone-900 text-stone-100 border border-stone-700"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {/* Top accent bar (same as front) */}
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />

          {/* Header */}
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-stone-700 bg-stone-800/80 backdrop-blur">
            <div className="flex flex-col min-w-0">
              <div className="font-black uppercase tracking-tight text-[15px] truncate">
                {player.player.name}
              </div>
              <div className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{player.rarity}</div>
            </div>
            <PositionIcon position={player.player.position} className="w-[24px] h-[24px] text-[9px]" borderClass={`border-[2px] ${borderColor}`} />
          </div>

          {/* Detailed Averages */}
          <div className="px-3 pt-2 pb-1 flex-1 flex flex-col justify-center overflow-y-auto">
            <div className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mb-1.5 text-center">Season Averages</div>
              <div className="grid grid-cols-2 gap-1 mb-1.5">
                {[
                  ['GP', String(player.stats.gp)],
                  ['MPG', player.stats.mpg.toFixed(1)],
                  ['PTS', player.stats.pts.toFixed(1)],
                  ['FGA', (player.stats.fga || 0).toFixed(1)],
                  ['TRB', player.stats.trb.toFixed(1)],
                  ['FG%', (player.stats.fg_pct * 100).toFixed(1)],
                  ['AST', player.stats.ast.toFixed(1)],
                  ['2PA', ((player.stats as any).fg2a || 0).toFixed(1)],
                  ['STL', player.stats.stl.toFixed(1)],
                  ['2P%', ((player.stats.fg2_pct || 0) * 100).toFixed(1)],
                  ['BLK', player.stats.blk.toFixed(1)],
                  ['3PA', (player.stats.fg3a || 0).toFixed(1)],
                  ['FT%', ((player.stats.ft_pct || 0) * 100).toFixed(1)],
                  ['3P%', (player.stats.fg3_pct * 100).toFixed(1)],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center px-2 py-[3px] bg-stone-800 rounded border border-stone-700">
                    <span className="text-[9px] text-stone-400 font-bold uppercase">{label}</span>
                    <span className="text-[12px] font-black text-white">{val}</span>
                  </div>
                ))}
              </div>

            {/* Awards */}
            {player.awards && player.awards.length > 0 && (
              <div className="mt-1">
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

            {/* Badges */}
            {player.traits && player.traits.length > 0 && (
              <div className="mt-1">
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
            
            {/* Bio */}
            <div className="mt-2 text-center text-[8px] text-stone-500 font-bold tracking-widest uppercase">
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

export function PlayCard({ play, onClick, isSelected = false, compact = false, popupDirection = 'up' }: { play: Play; onClick?: () => void; isSelected?: boolean; compact?: boolean; popupDirection?: 'up' | 'down' | 'right' }) {
  const [isFlipped, setIsFlipped] = useState(false);

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

    return (
      <div 
        className={`group relative w-full h-[60px] bg-white border border-stone-200 rounded-lg shadow-sm cursor-pointer ${theme.hoverBorder} overflow-visible flex items-center`}
        onClick={onClick}
      >
        <div className={`h-full w-2 shrink-0 ${theme.barColor} rounded-l-[7px]`} />
        <div className="flex-1 min-w-0 px-2 flex flex-col justify-center">
           <div className="font-bold text-[10px] uppercase truncate text-stone-800 leading-tight" title={play.name}>
             {play.name}
           </div>
           <div className="flex items-center gap-1 mt-0.5">
             <span className={`text-[9px] font-bold ${theme.labelColor}`}>{theme.label}</span>
           </div>
        </div>
        <div className={`hidden group-hover:block absolute z-50 pointer-events-none scale-110 ${popClasses}`}>
           <div className="w-[180px] shadow-2xl">
             <PlayCard play={play} />
           </div>
        </div>
      </div>
    );
  }

  // Tactical board visual per category
  const BoardGraphic = () => {
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
  };

  return (
    <div
      className={`relative w-full aspect-[5/7] cursor-pointer transition-transform ${isSelected ? `ring-2 ${theme.ringColor} ring-offset-1 ring-offset-stone-900 rounded-lg scale-105` : `hover:scale-[1.03] ${theme.hoverShadow}`}`}
      style={{ perspective: 800 }}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onTouchStart={() => setIsFlipped(!isFlipped)}
    >
      <div className="absolute -top-1 -right-1 z-20 opacity-40 pointer-events-none">
        <RotateCw className="w-3 h-3 text-white" />
      </div>

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
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <div className={`h-1.5 w-full ${theme.accent}`} />

          <div className="px-2 py-1 bg-white flex items-center gap-1 border-b border-stone-200">
            <RarityGem rarity={play.rarity} />
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

          {/* Playboard Image Area */}
          <div className={`flex-1 relative overflow-hidden ${theme.board} flex items-center justify-center p-2`}>
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/basketball.png')]" />
            
            <div className="w-full h-full border-2 border-white/15 rounded-sm relative flex flex-col items-center justify-center">
                <BoardGraphic />
            </div>
          </div>

          {/* Badges Required / Granted */}
          {play.badges.length > 0 && (
            <div className="px-2 py-2 bg-white flex flex-col items-center gap-1 border-t border-stone-200 min-h-[40px] justify-center">
                <span className="text-[6px] text-stone-400 font-bold uppercase tracking-widest leading-none">Synergy Key</span>
                <div className="flex gap-1 flex-wrap justify-center">
                    {play.badges.map(badge => (
                        <span key={badge} className="px-1.5 py-0.5 text-[7px] bg-stone-800 text-stone-100 font-bold uppercase tracking-wider rounded-sm shadow-sm">
                        {badge}
                        </span>
                    ))}
                </div>
            </div>
          )}

          <div className={`h-1 ${theme.accent}`} />
        </div>

        {/* ===== BACK ===== */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-stone-900"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className={`h-1.5 w-full ${theme.accent}`} />

          <div className="px-2 py-1 bg-stone-800 flex items-center gap-1 border-b border-stone-700">
            <RarityGem rarity={play.rarity} />
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
          <div className="flex-1 p-3 flex flex-col items-center justify-center text-center bg-stone-800">
            <span className={`text-[8px] ${theme.mechLabel} font-bold uppercase tracking-widest mb-2 border-b ${theme.mechBorder} pb-1`}>Play Mechanic</span>
            <p className="text-white text-[10px] leading-relaxed font-medium">
              {play.mechanicText}
            </p>
          </div>

          <div className={`h-1 ${theme.accent}`} />
        </div>
      </motion.div>
    </div>
  );
}
