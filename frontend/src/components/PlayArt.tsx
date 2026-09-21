'use client';

import type { Play } from '@/engine/types';
import { getPlayEffectId, getPlayRequirements } from '@/engine/synergies';
import { BadgeIcon } from './BadgeIcon';
import {
  playBoardAccent, playCategoryMotifStroke, playMotifByEffectId, type PlayMotif,
} from './cardColors';

// Category-generic tactical board visual — the pre-design_play_faces look. Kept only as
// the fallback face for Basic offense/defense, which have no badge requirement to draw a
// per-play motif from (see PlayBoardGraphic below).
function PlayBoardGraphicGeneric({ cat }: { cat: 'system' | 'special' | 'basic' }) {
  const accent = playBoardAccent[cat];
  if (cat === 'system') {
    // Clipboard / chalkboard diagram style
    return (
      <>
        <div className="w-20 h-14 border-2 border-white/25 rounded-md absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className={`absolute top-[20%] left-[25%] w-3 h-3 rounded-full border-2 ${accent.ring}`} />
        <div className={`absolute top-[20%] right-[25%] w-3 h-3 rounded-full border-2 ${accent.ring}`} />
        <div className={`absolute bottom-[25%] left-[30%] w-3 h-3 rounded-full ${accent.dot}`} />
        <div className={`absolute bottom-[25%] right-[30%] w-3 h-3 rounded-full ${accent.dot}`} />
        <div className={`absolute bottom-[15%] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full ${accent.dot}`} />
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
        <span className="text-white/40 font-bold tracking-[0.2em] text-xs mt-4">BASIC</span>
      </>
    );
  }
  // Special play — target / crosshair
  return (
    <>
      <div className={`w-14 h-14 border-2 ${accent.ring} rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`} />
      <div className={`w-8 h-8 border-2 ${accent.ring} rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`} />
      <div className={`w-[2px] h-10 ${accent.dot} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`} />
      <div className={`w-10 h-[2px] ${accent.dot} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`} />
      <div className={`w-2 h-2 ${accent.center} rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`} />
    </>
  );
}

// design_play_faces: the per-play background motif — a faint diagram echoing the play's
// real formation (a box for Box-and-One, four corners + one centre for Four Out One In,
// a kickout triangle for Point Forward, ...). Purely decorative, drawn behind the badge
// medallions in PlayBoardGraphic; the medallions (real icon/colour/level, same as
// everywhere else) carry the actual meaning so the face stays legible with the motif off.
function PlayMotifSvg({ motif, stroke }: { motif: PlayMotif; stroke: string }) {
  return (
    <svg viewBox="0 0 200 140" className="absolute inset-0 w-full h-full opacity-30" style={{ color: stroke }}>
      {motif === 'triangle' && (
        <>
          <polygon points="100,18 25,118 175,118" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="18" r="5" fill="currentColor" />
          <circle cx="25" cy="118" r="5" fill="currentColor" />
          <circle cx="175" cy="118" r="5" fill="currentColor" />
        </>
      )}
      {motif === 'speed' && (
        <>
          <line x1="20" y1="115" x2="80" y2="55" stroke="currentColor" strokeWidth="3" />
          <line x1="45" y1="125" x2="105" y2="65" stroke="currentColor" strokeWidth="3" />
          <line x1="70" y1="135" x2="130" y2="75" stroke="currentColor" strokeWidth="3" />
          <circle cx="150" cy="35" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="150" y1="35" x2="150" y2="24" stroke="currentColor" strokeWidth="3" />
          <line x1="150" y1="35" x2="159" y2="38" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      {motif === 'wall' && (
        <>
          <rect x="10" y="15" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="55" y="15" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="100" y="15" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="145" y="15" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="-12" y="35" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="33" y="35" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="78" y="35" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="123" y="35" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="168" y="35" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="10" y="55" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="55" y="55" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="100" y="55" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <rect x="145" y="55" width="45" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </>
      )}
      {motif === 'orbit' && (
        <>
          <path d="M50,90 A50,50 0 1 1 150,90" fill="none" stroke="currentColor" strokeWidth="3" />
          <polygon points="150,90 138,82 138,98" fill="currentColor" />
        </>
      )}
      {motif === 'screen' && (
        <>
          <rect x="90" y="30" width="14" height="60" fill="currentColor" />
          <path d="M60,110 C60,80 80,80 90,60" fill="none" stroke="currentColor" strokeWidth="3" />
          <polygon points="90,60 80,66 92,72" fill="currentColor" />
          <circle cx="60" cy="110" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      {motif === 'box' && (
        <>
          <rect x="45" y="25" width="110" height="90" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="70" r="9" fill="currentColor" />
        </>
      )}
      {motif === 'horns' && (
        <>
          <path d="M60,100 A40,40 0 0 1 140,100" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="60" cy="45" r="6" fill="currentColor" />
          <circle cx="140" cy="45" r="6" fill="currentColor" />
          <circle cx="100" cy="105" r="6" fill="none" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      {motif === 'court' && (
        <>
          <rect x="15" y="20" width="170" height="100" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="100" y1="20" x2="100" y2="120" stroke="currentColor" strokeWidth="2" />
          <polygon points="30,70 45,62 45,78" fill="currentColor" />
          <polygon points="170,70 155,62 155,78" fill="currentColor" />
        </>
      )}
      {motif === 'four' && (
        <>
          <circle cx="30" cy="30" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="170" cy="30" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="30" cy="110" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="170" cy="110" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="70" r="9" fill="currentColor" />
        </>
      )}
      {motif === 'pointForward' && (
        <>
          <circle cx="100" cy="25" r="8" fill="currentColor" />
          <circle cx="40" cy="115" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="160" cy="115" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="100" y1="25" x2="40" y2="115" stroke="currentColor" strokeWidth="2.5" />
          <line x1="100" y1="25" x2="160" y2="115" stroke="currentColor" strokeWidth="2.5" />
        </>
      )}
      {motif === 'switch' && (
        <>
          <circle cx="40" cy="40" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="160" cy="40" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="40" cy="100" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="160" cy="100" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="40" y1="40" x2="160" y2="100" stroke="currentColor" strokeWidth="2.5" />
          <line x1="160" y1="40" x2="40" y2="100" stroke="currentColor" strokeWidth="2.5" />
        </>
      )}
      {motif === 'drop' && (
        <>
          <rect x="70" y="90" width="60" height="35" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="40" r="8" fill="currentColor" />
          <line x1="100" y1="48" x2="100" y2="85" stroke="currentColor" strokeWidth="2.5" />
          <polygon points="100,85 92,73 108,73" fill="currentColor" />
        </>
      )}
      {motif === 'post' && (
        <>
          <circle cx="150" cy="105" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="60" cy="110" r="7" fill="currentColor" />
          <circle cx="90" cy="50" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="60" y1="110" x2="150" y2="105" stroke="currentColor" strokeWidth="2" />
          <line x1="90" y1="50" x2="150" y2="105" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {motif === 'kickout' && (
        <>
          <circle cx="100" cy="20" r="7" fill="currentColor" />
          <circle cx="100" cy="100" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="20" cy="120" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="180" cy="120" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="100" y1="20" x2="100" y2="95" stroke="currentColor" strokeWidth="2.5" />
          <line x1="100" y1="60" x2="20" y2="120" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
          <line x1="100" y1="60" x2="180" y2="120" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        </>
      )}
    </svg>
  );
}

// design_play_faces (2026-09-17, owner-approved): a play's face is now a background motif
// (its literal formation) plus a medallion for each badge the synergy engine actually
// requires (real icon/colour/level, via the same BadgeIcon everywhere else uses) — before
// this, every System play shared one amber clipboard diagram and every Special play
// shared one teal crosshair, so cards were indistinguishable without reading the name.
// Basic offense/defense have no requirement to draw a face from and keep the old generic
// look (PlayBoardGraphicGeneric).
export function PlayBoardGraphic({ play }: { play: Play }) {
  const cat = play.playCategory || 'special';
  const effectId = getPlayEffectId(play);
  const requirements = getPlayRequirements(effectId);
  const motif = playMotifByEffectId[effectId];

  if (!motif || requirements.length === 0) {
    return <PlayBoardGraphicGeneric cat={cat} />;
  }

  return (
    <>
      <PlayMotifSvg motif={motif} stroke={playCategoryMotifStroke[cat]} />
      <div className="relative z-10 flex items-center gap-1.5">
        {requirements.map((req, i) => (
          <BadgeIcon key={i} name={req.badge} level={req.levels} size="key" />
        ))}
      </div>
    </>
  );
}
