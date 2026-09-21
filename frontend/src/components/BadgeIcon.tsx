'use client';

/**
 * The skill-badge icon and its tooltip copy. Its own module (plan render_and_engine_perf
 * D10) because both `PlayerCard.tsx` and `PlayArt.tsx` render it: importing it from
 * `PlayerCard.tsx` made those two files import each other.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { badgeConfig, defaultBadgeConfig, goldGradient, goldBorder, goldRing, goldInk } from './cardColors';

// Plain-English badge tooltip copy (MTG-style keyword reminder text) — what it boosts
// and, for the badges that gate a roster identity, which identity it unlocks. No exact
// percentages — matches the game's existing "never show exact ratings/formulas" rule.
// card_balance T3 (2026-09-16/17, owner-approved): the 9 cosmetic-only badges this
// comment used to list are gone (engine/ratings.ts no longer generates them), and so are
// Two-Way Disruptor/Playmaking Maestro/Sniper — those are gold-plan keystone combo
// conditions now (two skill-badge levels, archetypes.ts KEYSTONE_CONDITIONS), never
// their own card trait or icon, so they have no entry here; their "what unlocks what"
// explanation lives in the gold plan's own description/reachability text instead.
export const BADGE_DESCRIPTIONS: Record<string, string> = {
  'Finisher': "Boosts your team's rim scoring and unlocks the Rim Pressure identity.",
  'Mid-Range Maestro': "Boosts your team's mid-range scoring and unlocks the Midrange Clinic identity.",
  'Sharpshooter': "Boosts your team's perimeter shooting and unlocks the Shooting Gallery identity.",
  'Floor General': "Boosts your team's playmaking and unlocks The Beautiful Game identity.",
  'Glass Cleaner': "Boosts your team's rebounding and unlocks the Second-Chance Engine identity.",
  'Lockdown Defender': "Boosts your team's perimeter defense and unlocks the No-Fly Zone identity.",
  'Paint Protector': "Boosts your team's interior defense and unlocks the Paint Wall identity.",
  'Positionless': 'Slots into any lineup spot with no penalty.',
};

// D5 type floor: 'micro'/'xs'/'cqw' tiers are icon-only — no level digit, no text.
// Only 'small'/'normal' (24px+ circles) are big enough to hold a 12px (text-xs) digit.
export const ICON_ONLY_BADGE_SIZES = new Set(['micro', 'xs', 'cqw']);

/**
 * Container-query badge tiers: the box is a share of the CARD's width, so one tier covers
 * every screen — a badge grows on a wide desktop card and shrinks on a phone without a
 * breakpoint in sight. The icon is a percentage of the box rather than a fixed px size, or
 * it would stay tiny inside a box that grew.
 *
 * `cqw` is the original narrow-starter tier (D24). `card` and `key` were added 2026-09-18:
 * the draft-room badges were pinned at 32px and the play card's synergy key at 24px, which
 * on a 256px-wide desktop card left both far smaller than the space allowed.
 */
const CQ_BADGE_TIERS: Record<string, { box: string; icon: string }> = {
  cqw:  { box: 'clamp(14px, 13cqw, 22px)', icon: '58%' },
  // Floors are the sizes these used to be pinned at (32px / 24px), so a narrow card is
  // never WORSE than before and a wide one finally uses the room it has.
  card: { box: 'clamp(32px, 16cqw, 50px)', icon: '58%' },
  key:  { box: 'clamp(24px, 13cqw, 38px)', icon: '58%' },
};

export type BadgeSize = 'normal' | 'small' | 'xs' | 'cqw' | 'micro' | 'card' | 'key';

export function BadgeIcon({ name, level, size = 'normal' }: { name: string; level: number; size?: BadgeSize }) {
  const cfg = badgeConfig[name] ?? defaultBadgeConfig;
  const Icon = cfg.icon;
  const cq = CQ_BADGE_TIERS[size];
  const iconSize = size === 'micro' ? 7 : size === 'xs' ? 10 : size === 'small' ? 12 : 16;
  const containerSize = size === 'micro' ? 'w-[13px] h-[13px] border' : size === 'xs' ? 'w-[18px] h-[18px] border' : size === 'small' ? 'w-6 h-6' : cq ? 'border' : 'w-8 h-8';
  const containerStyle = cq ? { width: cq.box, height: cq.box } : undefined;
  const showLevel = level > 1 && !ICON_ONLY_BADGE_SIZES.has(size);
  // card_ratings_rebalance D7 (2026-09-18): level 4 is the gold tier — a rating whose
  // uncapped raw cleared 99 (see ratings.ts). Same icon, a gold ring/fill instead of the
  // ordinary dark badge so it reads as an overflow reward, not just another level.
  const isGold = level >= 4;

  // Tooltip is portalled to document.body (not a CSS group-hover child) — same reasoning
  // as PlayerHoverPreview below: BadgeIcon renders inside cards that are frequently
  // `overflow-hidden` (roster summaries, depth-chart slots), and an in-flow `absolute`
  // tooltip gets visually clipped by (and inflates the scrollHeight of) the nearest such
  // ancestor. Portalling escapes that entirely, positioned from the icon's own rect.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const showTooltip = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
  };
  const hideTooltip = () => setTooltipPos(null);

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      <div
        className={`${containerSize} rounded-full flex items-center justify-center relative shadow-md ${isGold ? 'border-2' : 'bg-surface-inverse border-line-inverse'}`}
        style={isGold ? { ...containerStyle, background: goldGradient, borderColor: goldBorder } : containerStyle}
      >
        <Icon
          size={cq ? undefined : iconSize}
          style={cq ? { color: isGold ? goldInk : cfg.color, width: cq.icon, height: cq.icon } : { color: isGold ? goldInk : cfg.color }}
          strokeWidth={2.5}
        />
        {showLevel && (
          <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs font-black leading-none ${isGold ? '' : 'bg-surface-inverse-deep border-line-inverse text-ink-inverse'}`} style={isGold ? { background: goldBorder, borderColor: goldRing, color: goldInk } : undefined}>
            {level}
          </span>
        )}
      </div>
      {/* Keyword-style tooltip (MTG reminder-text box): icon + name + level on top,
          a plain-English line underneath explaining what it does and, if it gates a
          roster identity, which one — not just the bare badge name. */}
      {tooltipPos && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[120] w-[168px] rounded-lg bg-surface-inverse-deep text-ink-inverse p-2 pointer-events-none border border-line-inverse shadow-xl"
          style={{ top: tooltipPos.top, left: tooltipPos.left, transform: 'translate(-50%, calc(-100% - 6px))' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={12} style={{ color: cfg.color }} strokeWidth={2.5} />
            <span className="text-xs font-black uppercase tracking-wider leading-none">{name}{level > 1 ? ` (Lv.${level})` : ''}</span>
          </div>
          <p className="text-xs leading-snug text-ink-inverse-muted normal-case">{BADGE_DESCRIPTIONS[name] ?? 'A player trait.'}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
