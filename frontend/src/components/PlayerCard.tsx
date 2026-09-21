'use client';

import { useState, type ReactNode, type JSX } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useHoverPreview } from './useHoverPreview';
import { headshotThumb } from '@/lib/headshotThumb';
import { useLongPressPreview } from '@/hooks/useLongPressPreview';
import { useHasFinePointer } from '@/hooks/useHasFinePointer';
import { PlayBoardGraphic } from './PlayArt';
import { BadgeIcon, BADGE_DESCRIPTIONS, ICON_ONLY_BADGE_SIZES } from './BadgeIcon';

/** `sizes` for the card-front headshot. mobile_load D4: card fronts now point straight
 *  at the pre-generated `headshots/480/<id>.webp` (`headshotThumb`) marked `unoptimized`,
 *  so this no longer drives a Vercel re-transform — kept only because it's still a
 *  harmless `<Image>` prop and some other file may still import the constant. */
export const HEADSHOT_SIZES = '200px';

import { ClipboardList, MoreHorizontal } from 'lucide-react';

import type { PlayerCardData as EnginePlayerCardData, Player as EnginePlayer, Play as EnginePlay, DraftCard as EngineDraftCard, Trait } from '@/engine/types';
import { evaluatePlay, getPlayEffectId, getPlayRequirements, type PlayRequirement, type PlayRequirementStatus } from '@/engine/synergies';
import { positionParts } from '@/engine/positions';
import { getPlayDef, describeRoleRequirement } from '@/engine/playbook';
import { PlayTile } from './PlayTile';
import {
  badgeConfig, defaultBadgeConfig, basePosColors, getPosColors, goldGradient,
  type GemRarity, gemPalettes, gemPixelSizes, rarityTextColor, rarityAccentColor,
  teamColors, teamIds, catColor, playCategoryTheme, roleTagColor,
  defaultTeamColor, defaultTeamColorDark,
} from './cardColors';

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

// Game-data colours (position, rarity, team, badge, play category) live in
// `./cardColors` — re-exported here so nothing that already imports them from
// `@/components/PlayerCard` needs to change.
export { basePosColors, getPosColors, rarityTextColor };
export { BadgeIcon };

// Overflow indicator for a badge row that had to cap how many BadgeIcons it shows
// (D18: readability — small cards show 2 + "+N", list rows show 3 + "+N"). `names`
// carries the hidden badges' names for the tooltip. D5: 'micro'/'xs'/'cqw' tiers can't
// fit a 12px "+N" in their small circles, so they go icon-only and the count moves
// entirely into the `title`.
function BadgeOverflowIndicator({ count, names, size = 'small' }: { count: number; names: string[]; size?: 'normal' | 'small' | 'xs' | 'cqw' | 'micro' }) {
  if (count <= 0) return null;
  const title = `+${count} more: ${names.join(', ')}`;
  const containerSize = size === 'micro' ? 'w-[13px] h-[13px]' : size === 'xs' ? 'w-[18px] h-[18px]' : size === 'small' ? 'w-6 h-6 text-xs' : size === 'cqw' ? '' : 'w-8 h-8 text-xs';
  const containerStyle = size === 'cqw' ? { width: 'clamp(14px, 13cqw, 22px)', height: 'clamp(14px, 13cqw, 22px)' } : undefined;

  if (ICON_ONLY_BADGE_SIZES.has(size)) {
    return (
      <div
        className={`${containerSize} shrink-0 rounded-full bg-surface-inverse border border-line-inverse flex items-center justify-center text-ink-inverse-muted`}
        style={containerStyle}
        title={title}
      >
        <MoreHorizontal size={size === 'micro' ? 7 : 9} />
      </div>
    );
  }

  return (
    <div
      className={`${containerSize} shrink-0 rounded-full bg-surface-inverse border-2 border-line-inverse flex items-center justify-center font-black text-ink-inverse-muted`}
      title={title}
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
 * `PlayEvaluation`) to show met/unmet state. D5: the 'xs' tier's BadgeIcon is icon-only,
 * so the have/met overlay text only renders at 'small' (24px, room for text-xs); the
 * full status is always available via the container's `title`.
 */
export function PlayRequirementIcons({ requirements, size = 'small' }: { requirements: PlayRequirementStatus[] | PlayRequirement[]; size?: 'xs' | 'small' | 'key' }) {
  // 'xs' is icon-only; every larger tier has room for the have/met and xN labels.
  const withLabels = size !== 'xs';
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
          <div key={i} className={`relative ${status ? (status.met ? 'ring-2 ring-positive rounded-full' : 'opacity-40 grayscale') : ''}`}>
            <BadgeIcon name={req.badge} level={1} size={size} />
            {status?.met && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-positive-strong border border-surface-inverse-deep flex items-center justify-center text-ink-inverse leading-none" />
            )}
            {withLabels && status && !status.met && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs font-black text-ink-inverse bg-surface-inverse-deep px-0.5 rounded-sm leading-none whitespace-nowrap">
                {status.have}/{status.levels}
              </span>
            )}
            {withLabels && !status && (
              <span className="absolute -bottom-1 -right-1.5 text-xs font-black text-ink-inverse bg-surface-inverse-deep px-0.5 rounded-sm leading-none">
                ×{req.levels}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Position circle. Kept the historical name/props (`position`, `className`,
// `borderClass`) since DraftRoom/DeckBuilder/rosters call this directly —
// `borderClass` is accepted for compatibility but is no longer tied to
// rarity (rarity communication moved to RarityGem; see UI brief).
//
// D10 follow-up (2026-09-19, owner-approved mockup): a raw 3+-position string (e.g.
// 'SG/SF/PF', now common once bref bio pages made real multi-way eligibility routine)
// can't read as letters in a small badge — `getPosColors` only ever mixed the first two
// tokens, silently dropping the rest, and the text overflowed anyway. 3+ eligible
// positions (and the existing Positionless 'ALL'/'STAR' case, same treatment, unified)
// now render as a solid gold circle with a white star instead of trying to cram text in.
// This is display only — `positions.ts`'s `canPlaceAt`/`naturalPositions` and every
// deckbuilder slot menu still read the full raw position string directly, never this
// component, so eligibility is completely unaffected by what badge is shown.
export function PositionIcon({ position, className = "w-[24px] h-[24px] text-xs", borderClass = "border border-white/40" }: { position: string, className?: string, borderClass?: string }) {
  const p = position.replace('-', '/');
  const isGold = p === 'ALL' || p === 'STAR' || positionParts(p).length >= 3;

  if (isGold) {
    return (
      <div className={`relative rounded-full shadow-sm ${borderClass} flex items-center justify-center shrink-0 ${className}`} style={{ background: goldGradient }}>
        <Star2 />
      </div>
    );
  }

  const [c1, c2] = getPosColors(p);

  return (
    <div className={`relative rounded-full shadow-sm ${borderClass} flex items-center justify-center shrink-0 ${className}`}>
      {c1 !== c2 ? (
        <div className="absolute inset-0 rounded-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` }} />
      ) : (
        <div className="absolute inset-0 rounded-full overflow-hidden" style={{ backgroundColor: c1 }} />
      )}
      <span className="relative z-10 font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] leading-none whitespace-nowrap" style={{ letterSpacing: '-0.3px' }}>{p}</span>
    </div>
  );
}

// Star glyph for the gold position circle (3+ eligible positions, or Positionless) — a
// tiny local component so PositionIcon doesn't need to pull in the whole lucide Star
// import just for this one glyph. Sized as a percentage of its own circle (same pattern
// as BadgeIcon's `cq.icon`) so it scales with whatever diameter the caller passes.
function Star2() {
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" className="relative z-10 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" fill="currentColor">
      <path d="M12 2l2.9 6.4 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.7 7.1-.7z" />
    </svg>
  );
}

export function RarityGem({ rarity, size = 'md' }: { rarity: GemRarity; size?: 'sm' | 'md' | 'lg' }) {
  const palette = gemPalettes[rarity] || gemPalettes.Common;
  const px = gemPixelSizes[size];
  const isMythic = rarity === 'Mythic';

  return (
    <span
      className={`inline-block shrink-0 align-middle ${isMythic ? 'gem-mythic-shimmer' : ''}`}
      style={{ width: px, height: px, filter: !isMythic && palette.glow ? `drop-shadow(${palette.glow})` : undefined }}
      title={rarity}
    >
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
  const rowClasses = `@container flex items-center gap-1.5 h-11 px-2 rounded-lg border transition-colors bg-surface-raised ${selected ? 'border-accent ring-1 ring-accent bg-accent-soft/40' : 'border-line hover:border-line-strong hover:bg-surface-sunken'} ${onClick ? 'cursor-pointer' : ''} ${className}`;

  if (card.type === 'Player') {
    const headshotUrl = headshotThumb(card.player.id, 96);
    return (
      <div className={rowClasses} onClick={onClick}>
        <RarityGem rarity={card.rarity} size="sm" />
        <PositionIcon position={card.player.position} />
        <Image
          src={headshotUrl}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="w-7 h-7 rounded-full object-cover object-top border border-line shrink-0 bg-surface-sunken"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
        />
        <span className="flex-1 min-w-[56px] font-bold text-xs text-ink-strong uppercase truncate">{card.player.name}</span>
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

  return (
    <div className={rowClasses} onClick={onClick}>
      <RarityGem rarity={card.rarity} size="sm" />
      <PositionIcon position="STAR" />
      <div className="w-7 h-7 rounded-full bg-surface-sunken border border-line flex items-center justify-center shrink-0">
        <ClipboardList size={14} className="text-ink-muted" />
      </div>
      <span className="flex-1 min-w-0 font-bold text-xs text-ink-strong uppercase truncate">{card.name}</span>
      <span className={`text-xs font-black uppercase shrink-0 ${catColor[card.playCategory]}`}>{catLabel[card.playCategory]}</span>
      {trailing && <div className="shrink-0 ml-1">{trailing}</div>}
    </div>
  );
}

// One cell of the front card's stats row.
function StatCell({ label, value, border = true, className = '' }: { label: string; value: string; border?: boolean; className?: string }) {
  return (
    <div className={`py-1.5 ${border ? 'border-r border-line' : ''} ${className}`}>
      <div className="text-xs text-ink-subtle font-bold uppercase">{label}</div>
      <div className="text-sm font-black text-ink-strong leading-none">{value}</div>
    </div>
  );
}

// D5: MiniPlayerCard shows position icon, rarity gem and team stripe only — no name (at
// 48px wide a name is "IMM…", which is exactly the unreadable flavour D5 says to remove;
// the hover preview carries it), no stat strip, no badge text.
export function MiniPlayerCard({ player, className = "", onClick }: { player: PlayerCardData, className?: string, onClick?: () => void }) {
  const { ref: hoverRef, isHovered, onMouseEnter: onHoverEnter, onMouseLeave: onHoverLeave } = useHoverPreview<HTMLDivElement>();
  const tmColor = teamColors[player.player.team] || defaultTeamColor;
  const headshotUrl = headshotThumb(player.player.id, 96);

  return (
    <div
      ref={hoverRef}
      className={`relative rounded border border-line bg-surface-raised cursor-pointer transition-transform hover:-translate-y-1 shadow-sm overflow-visible ${className}`}
      style={{ width: '48px', height: '60px' }}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onClick={onClick}
    >
      <div className="absolute top-0 w-full h-1.5 opacity-80 rounded-t" style={{ backgroundColor: tmColor }} />
      <div className="absolute top-1.5 left-0.5 z-10">
        <PositionIcon position={player.player.position} className="w-4 h-4 text-xs" />
      </div>
      <div className="absolute top-1.5 right-0.5 z-10">
        <RarityGem rarity={player.rarity} size="sm" />
      </div>
      <div className="w-full h-full p-[2px] pt-5 flex flex-col items-center justify-start overflow-hidden rounded bg-surface-sunken">
        <Image
          src={headshotUrl}
          alt={player.player.name}
          width={36}
          height={36}
          unoptimized
          className="w-[36px] h-[36px] object-cover object-top rounded-sm border border-line bg-surface-raised"
          onError={(e) => {
            // Guard with a dataset flag, not a `target.src !== ...` string compare: once
            // reassigned, `target.src` reads back as a resolved ABSOLUTE URL, so it would
            // never again equal the relative `headshotThumb(...)` string and this could
            // reassign (and error) forever if the placeholder itself ever failed to load.
            const target = e.target as HTMLImageElement;
            if (target.dataset.fallback) return;
            target.dataset.fallback = '1';
            target.src = headshotThumb('_missing', 96);
            target.className = "w-[36px] h-[36px] object-cover object-center opacity-20 rounded-sm border border-line bg-surface-sunken";
          }}
        />
      </div>

      {/* Screen-centred (D-hover) — was a fixed-offset popup below the card, which had
          the same "invisible near the edge of the screen" problem the depth chart's
          bench cards had; centring + the shared badge panel fixes both at once. */}
      {isHovered && <PlayerHoverPreview player={player} />}
    </div>
  );
}

export function PlayerCardFront({ player, isSelected = false, size = 'md', wide = false }: { player: PlayerCardData; isSelected?: boolean; size?: 'sm' | 'md'; wide?: boolean }) {
  const [c1, c2] = getPosColors(player.player.position);
  const teamColor = teamColors[player.player.team] || defaultTeamColorDark;
  const teamId = teamIds[player.player.team];
  const headshotUrl = headshotThumb(player.player.id, 480);
  const logoUrl = teamId ? `/logos/${teamId}.svg` : null;
  const isRareOrMythic = player.rarity === 'Rare' || player.rarity === 'Mythic';
  const accentColor = rarityAccentColor[player.rarity];

  return (
    <div className={`absolute inset-0 bg-surface-sunken rounded-xl overflow-hidden shadow-xl border border-line-strong flex flex-col ${isSelected ? 'ring-2 ring-accent' : ''}`} style={{ background: 'linear-gradient(135deg, var(--surface-sunken) 0%, var(--surface-muted) 100%)' }}>
      {isRareOrMythic && <div className="h-[2px] w-full shrink-0" style={{ backgroundColor: accentColor }} />}

      {/* mobile_load T8/D8: `backdrop-blur-sm` used to sit here, but this header is in
          normal flow directly on top of the card's own OPAQUE gradient background
          (see the outer div's `style` above) — nothing ever renders behind it, so the
          blur cost a compositing layer per card for zero visible effect. Removed. */}
      <div className="flex items-center gap-2 px-2.5 py-2 bg-surface-raised/50 shadow-sm">
        <RarityGem rarity={player.rarity} size="lg" />
        <div className="flex-1 min-w-0 flex flex-col leading-tight">
          {/* game_canvas (owner): on a narrow card the name wraps to two lines at the
              12px floor instead of truncating to two letters; wide cards keep one line. */}
          <span className={`font-bold tracking-tight text-ink-strong uppercase truncate @max-[200px]:text-xs @max-[200px]:whitespace-normal @max-[200px]:line-clamp-2 @max-[200px]:leading-tight ${player.player.name.length > 18 ? 'text-xs' : 'text-sm'}`}>{player.player.name}</span>
          <span className="text-xs font-semibold text-ink-muted truncate">{player.player.team} · {player.player.age}Y</span>
        </div>
        <PositionIcon position={player.player.position} />
      </div>

      <div className="flex-1 relative overflow-hidden bg-surface-muted">
        <div className="absolute top-0 right-0 w-9 h-full opacity-90 flex flex-col items-center pt-2" style={{ backgroundColor: teamColor }}>
          {logoUrl && (
            <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center shadow-md border border-line z-10">
              <img src={logoUrl} alt={player.player.team} className="w-6 h-6 object-contain" />
            </div>
          )}
        </div>

        <Image
          src={headshotUrl}
          alt={player.player.name}
          fill
          unoptimized
          sizes={HEADSHOT_SIZES}
          className={`object-cover object-top ${wide ? 'pointer-coarse:max-lg:object-[center_20%]!' : ''}`}
          onError={(e) => {
            // Dataset guard, not a `target.src !== ...` compare — see the identical note
            // on MiniPlayerCard's onError above.
            const target = e.target as HTMLImageElement;
            if (target.dataset.fallback) return;
            target.dataset.fallback = '1';
            target.src = headshotThumb('_missing', 480);
            target.className = "w-full h-full object-cover object-center opacity-10";
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
        <div className={`absolute bottom-2 w-full flex justify-center px-2 ${size === 'sm' ? 'gap-1' : 'gap-2'} ${wide ? 'pointer-coarse:max-lg:gap-1.5!' : ''}`}>
          {/* 'cqw' badges (D24) scale with the card's own width instead of a fixed px
              size, so a narrow "sm" starter card (5-across depth chart) never overflows
              regardless of how narrow the column gets. Capped to 3 + overflow here too,
              matching the compact/list variants (D18). */}
          {player.traits.slice(0, size === 'sm' ? 3 : 4).map((trait, i) => (
            <BadgeIcon key={i} name={trait.name} level={trait.level} size={size === 'sm' ? 'cqw' : 'card'} />
          ))}
          {size === 'sm' && player.traits.length > 3 && (
            <BadgeOverflowIndicator count={player.traits.length - 3} names={player.traits.slice(3).map(t => t.name)} size="cqw" />
          )}
        </div>
      </div>

      {/* Starter cards drop the stats grid entirely (D24) — a 5-across depth chart has
          no room for it and it was the biggest source of visual clutter on the starter
          row; the full stat grid stays on the "md" card everywhere else (bench,
          G-League, hover popups). */}
      {size !== 'sm' && (
        <div className="grid text-center bg-surface-raised border-t border-line grid-cols-4 @[180px]:grid-cols-6">
          <StatCell label="PPG" value={player.stats.pts.toFixed(1)} />
          <StatCell label="RPG" value={player.stats.trb.toFixed(1)} />
          <StatCell label="APG" value={player.stats.ast.toFixed(1)} />
          <StatCell label="SPG" value={player.stats.stl.toFixed(1)} className="hidden @[180px]:block" />
          <StatCell label="BPG" value={player.stats.blk.toFixed(1)} className="hidden @[180px]:block" />
          <StatCell label="FG%" value={(player.stats.fg_pct * 100).toFixed(0)} border={false} />
        </div>
      )}

      <div className="h-1.5" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />
    </div>
  );
}

// MTG-style keyword panel: every one of a player's badges, icon + name + level +
// plain-English description, all visible at once — no need to hover a specific tiny
// badge icon (which is what BadgeIcon's own tooltip required, and which never worked
// reliably here: hovering a badge on a card that ALSO flips or pops up on hover just
// triggers that instead). Sits beside the enlarged card in PlayerHoverPreview.
function BadgePanel({ traits }: { traits: Trait[] }) {
  if (!traits || traits.length === 0) return null;
  return (
    <div className="w-[190px] max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl bg-surface-inverse-deep border border-line-inverse shadow-2xl p-3 flex flex-col gap-2.5">
      {traits.map((trait, i) => {
        const cfg = badgeConfig[trait.name] ?? defaultBadgeConfig;
        const Icon = cfg.icon;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="w-7 h-7 shrink-0 rounded-full bg-surface-inverse border-2 border-line-inverse flex items-center justify-center">
              <Icon size={14} style={{ color: cfg.color }} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wide text-ink-inverse leading-tight">
                {trait.name}{trait.level > 1 ? ` (Lv.${trait.level})` : ''}
              </div>
              <p className="text-xs leading-snug text-ink-inverse-muted mt-0.5">{BADGE_DESCRIPTIONS[trait.name] ?? 'A player trait.'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Screen-centred hover preview (D-hover): the enlarged card (static front, never
 * flips — flipping is what caused this whole problem, see the badge-panel comment
 * above) plus its full badge panel, both appearing together the instant the trigger
 * is hovered.
 *
 * Portalled straight to `document.body` — NOT just `fixed inset-0` in place. A plain
 * `position: fixed` element is only fixed to the true viewport if every ancestor is
 * free of `transform`/`filter`/`perspective`; any one of those (e.g. DraftSidebar's
 * slide animation, `style={{ transform: 'translateX(...)' }}`) makes that ancestor
 * the fixed element's containing block instead, trapping the "centred" popup inside
 * whatever box the ancestor occupies — which is how this shipped broken inside the
 * draft sidebar. The portal sidesteps the whole CSS containing-block problem, so this
 * can render inside any component tree, animated or not, and still land dead centre
 * on the real viewport. The caller owns the hover state and controls mounting
 * (`{isHovered && <PlayerHoverPreview .../>}`) — a portaled node is no longer a DOM
 * descendant of a `.group` wrapper, so CSS `group-hover` can no longer reach it.
 */
/**
 * The card's back face: badges, accolades, season averages, bio. Lives inside
 * `PlayerCard`'s flip (`flipped`, rotated 180° with its backface hidden) and, un-rotated,
 * in `PlayerHoverPreview` — on a phone there is no hover-flip, so the long-press
 * preview is the only way to read these stats (game_canvas, owner).
 */
export function PlayerCardBack({ player, flipped = true }: { player: PlayerCardData; flipped?: boolean }) {
  const [c1, c2] = getPosColors(player.player.position);
  return (
    <div
      className="absolute inset-0 flex flex-col rounded-lg shadow-lg group-hover:shadow-2xl transition-shadow overflow-hidden bg-surface-inverse text-ink-inverse border border-line-inverse"
      style={flipped ? { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', isolation: 'isolate' } : { isolation: 'isolate' }}
    >
      {/* Top accent bar (same as front) */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />

      {/* Header: gem + rarity text + position pill + flip control */}
      {/* mobile_load T8/D8: same reasoning as the front header — `bg-surface-inverse`
          on the outer div is opaque and this sits in normal flow, so the removed
          `backdrop-blur` had nothing to blur. */}
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-line-inverse bg-surface-inverse/80">
        <RarityGem rarity={player.rarity} size="lg" />
        <span className={`text-xs font-black uppercase tracking-widest ${rarityTextColor[player.rarity]}`}>{player.rarity}</span>
        <div className="flex-1" />
        <PositionIcon position={player.player.position} />
      </div>

      {/* Back body: badges first (game-relevant), then accolades, then season averages.
          D10: a scroll region, not a clipped box — small cards (bench/G-League) have
          more content than height, so the back scrolls instead of hiding badges. */}
      <div className="px-2.5 pt-1.5 pb-1 flex-1 flex flex-col overflow-y-auto overscroll-contain min-h-0">
        {player.traits && player.traits.length > 0 && (
          <div className="mb-1.5">
            <div className="text-xs text-ink-inverse-muted font-bold uppercase tracking-widest mb-1 text-center">Badges</div>
            <div className="flex flex-wrap justify-center gap-1">
              {player.traits.map((trait, i) => {
                const cfg = badgeConfig[trait.name];
                const color = cfg?.color ?? defaultBadgeConfig.color;
                return (
                  <span key={i} className="px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded border border-line-inverse flex items-center gap-0.5" style={{ color, backgroundColor: `${color}26` }}>
                    {trait.level > 1 && <span className="text-xs opacity-70">{trait.level}×</span>}
                    {trait.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {player.awards && player.awards.length > 0 && (
          <div className="mb-1.5">
            <div className="text-xs text-ink-inverse-muted font-bold uppercase tracking-widest mb-1 text-center">Accolades</div>
            <div className="flex flex-wrap justify-center gap-1">
              {player.awards.map((award, i) => (
                <span key={i} className="px-2 py-0.5 bg-accent-soft/20 text-accent text-xs font-black uppercase tracking-widest rounded border border-accent/50">
                  {award}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-ink-inverse-muted font-bold uppercase tracking-widest mb-1 text-center">Season Averages</div>
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
            <div key={label} className="flex justify-between items-center px-1.5 py-[2px] bg-surface-inverse-deep rounded border border-line-inverse">
              <span className="text-xs text-ink-inverse-muted font-bold uppercase">{label}</span>
              <span className="text-xs font-black text-ink-inverse">{val}</span>
            </div>
          ))}
        </div>

        {/* Bio — only when there is room */}
        <div className="mt-auto pt-1 text-center text-xs text-ink-inverse-muted font-bold tracking-widest uppercase hidden @[200px]:block">
            {player.player.height} • {player.player.weight} LBS • {player.player.age}Y
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className="h-1.5" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }} />
    </div>
  );
}

export function PlayerHoverPreview({ player }: { player: PlayerCardData }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center gap-3 pointer-events-none bg-black/60">
      <BadgePanel traits={player.traits} />
      <div className="relative w-[280px] rounded-xl ring-4 ring-white/15 drop-shadow-2xl" style={{ aspectRatio: '5 / 7' }}>
        <PlayerCardFront player={player} />
      </div>
      {/* The back face, un-rotated: season averages, badge levels, accolades, bio. */}
      <div className="@container relative w-[280px] rounded-xl ring-4 ring-white/15 drop-shadow-2xl" style={{ aspectRatio: '5 / 7' }}>
        <PlayerCardBack player={player} flipped={false} />
      </div>
    </div>,
    document.body,
  );
}

export function PlayerCard({ player, onClick, isSelected = false, compact = false, size = 'md', wide = false }: { player: PlayerCardData; onClick?: () => void; isSelected?: boolean; compact?: boolean; size?: 'sm' | 'md'; wide?: boolean }) {
  const longPress = useLongPressPreview();
  const [isFlipped, setIsFlipped] = useState(false);
  // T8/D8: the back face only needs to exist once the card is actually flipped (mouse
  // hover, `onMouseEnter` below) or on a device that CAN hover — a phone never sets
  // `isFlipped` through this path (no hover events), so this keeps the back face out of
  // the DOM there entirely; the long-press preview still gets its own back face via
  // `PlayerHoverPreview` regardless of this flag.
  const hasFinePointer = useHasFinePointer();
  // Portalled hover preview needs real hover state, not CSS `group-hover` — a portal
  // renders outside this element's DOM subtree so the CSS selector can't reach it.
  const { ref: hoverRef, isHovered, onMouseEnter: onHoverEnter, onMouseLeave: onHoverLeave } = useHoverPreview<HTMLDivElement>();

  const [c1, c2] = getPosColors(player.player.position);

  // NBA CDN headshot URL -> now served locally via the offline script!
  const headshotUrl = headshotThumb(player.player.id, 96);

  if (compact) {
    return (
      <div
        ref={hoverRef}
        className={`relative w-full h-11 bg-surface-raised border rounded-lg shadow-sm cursor-pointer overflow-visible flex items-center ${isSelected ? 'border-accent' : 'border-line hover:border-line-strong'}`}
        onClick={onClick}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
      >
        {/* Left Color Bar */}
        <div className="h-full w-1.5 shrink-0 rounded-l-[7px]" style={{ background: `linear-gradient(to bottom, ${c1}, ${c2})` }} />

        {/* Headshot */}
        <div className="w-9 h-full bg-surface-sunken shrink-0 overflow-hidden relative border-r border-line">
          <Image src={headshotUrl} alt="" fill unoptimized sizes="36px" className="object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>

        {/* Details — two-line header: name + position pill, then gem + badges */}
        <div className="flex-1 min-w-0 px-1.5 flex flex-col justify-center gap-0.5">
           <div className="flex items-center justify-between gap-1">
             <div className="font-bold text-xs uppercase truncate text-ink-strong leading-tight">
               {player.player.name}
             </div>
             <PositionIcon position={player.player.position} className="w-5 h-5 text-xs shrink-0" />
           </div>

           <div className="flex items-center gap-1">
             <RarityGem rarity={player.rarity} size="sm" />
             {/* D18: small card variant caps at 2 badges + "+N" overflow; 'micro' (even
                 smaller than 'xs') keeps them from dominating a 44px-tall bench row. */}
             {player.traits.slice(0, 2).map(t => (
               <BadgeIcon key={t.name} name={t.name} level={t.level} size="micro" />
             ))}
             <BadgeOverflowIndicator count={Math.max(0, player.traits.length - 2)} names={player.traits.slice(2).map(t => t.name)} size="micro" />
           </div>
        </div>

        {/* Hover Pop-Up (D-hover) — screen-centred, not anchored to the row: an anchored
            popup below a Bench 3 row (near the bottom of the depth chart) had nowhere to
            go and was invisible; centring always keeps it fully on-screen and static
            (never flips) so its badge panel is always readable, not a moving target. */}
        {isHovered && <PlayerHoverPreview player={player} />}
      </div>
    );
  }

  return (
    <div
      className={`group @container w-full select-none [-webkit-touch-callout:none] transition-transform duration-200 hover:-translate-y-1 aspect-[5/7] ${wide ? 'pointer-coarse:max-lg:aspect-[1.15/1]!' : ''} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ perspective: 1000 }}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onTouchStart={longPress.handlers.onTouchStart}
      onTouchMove={longPress.handlers.onTouchMove}
      onTouchCancel={longPress.handlers.onTouchCancel}
      onTouchEnd={longPress.handlers.onTouchEnd}
      onClickCapture={longPress.handlers.onClickCapture}
      onContextMenu={longPress.handlers.onContextMenu}
    >
      {longPress.open && <PlayerHoverPreview player={player} />}
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* FRONT */}
        <PlayerCardFront player={player} isSelected={isSelected} size={size} wide={wide} />

        {/* ===== BACK ===== (T8/D8: only mounted once flipped or on a fine pointer) */}
        {(isFlipped || hasFinePointer) && <PlayerCardBack player={player} />}
      </motion.div>
    </div>
  );
}

export function PlayCardFront({ play, wide = false }: { play: Play; wide?: boolean }) {
  const cat = play.playCategory || 'special';
  const theme = playCategoryTheme[cat];
  const requirements = getPlayRequirements(getPlayEffectId(play));

  return (
    <div className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-surface-sunken">
      <div className={`h-1.5 w-full ${theme.accent}`} />
      <div className="px-2 py-1 bg-surface-raised flex items-center gap-1 border-b border-line">
        <RarityGem rarity={play.rarity} size="sm" />
        <div className="flex-1 min-w-0 ml-1">
          <div className="font-black uppercase leading-none tracking-tight text-ink-strong text-xs">
            {play.name}
          </div>
          <div className="text-xs text-ink-muted font-bold uppercase tracking-wider leading-tight mt-0.5">PLAY</div>
        </div>
        <div className={`text-xs font-black text-white px-1.5 py-0.5 rounded-sm shrink-0 ${theme.accentDark}`}>{theme.label}</div>
      </div>
      <div className={`flex-1 relative overflow-hidden ${theme.board} flex items-center justify-center p-2`}>
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/basketball.png')]" />
        <div className="w-full h-full border-2 border-white/15 rounded-sm relative flex flex-col items-center justify-center">
          <PlayBoardGraphic play={play} />
        </div>
      </div>
      {requirements.length > 0 && (
        <div className={`px-2 py-2 bg-surface-raised flex flex-col items-center gap-1 border-t border-line min-h-[40px] justify-center ${wide ? 'pointer-coarse:max-lg:gap-1.5!' : ''}`}>
          <span className="text-xs text-ink-subtle font-bold uppercase tracking-widest leading-none">Synergy Key</span>
          <PlayRequirementIcons requirements={requirements} size="key" />
        </div>
      )}
      <div className={`h-1 ${theme.accent}`} />
    </div>
  );
}

/** Screen-centred hover preview for Play cards — same reasoning as PlayerHoverPreview,
 *  static front only (never flips). No badge panel: a play's requirements already show
 *  on its own face via PlayRequirementIcons. */
export function PlayHoverPreview({ play }: { play: Play }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/60">
      <div className="relative w-[280px] rounded-xl ring-4 ring-white/15 drop-shadow-2xl" style={{ aspectRatio: '5 / 7' }}>
        <PlayCardFront play={play} />
      </div>
    </div>,
    document.body,
  );
}

export function RoleTag({ playName, roleName, side }: { playName: string; roleName: string; side: 'offense' | 'defense' }): JSX.Element {
  const colors = roleTagColor[side];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 leading-none rounded-full text-xs font-bold uppercase ${colors.bg} ${colors.text} shrink-0`}
      title={`${playName} — ${roleName}`}
    >
      {roleName}
    </span>
  );
}

export function PlayCard({ play, onClick, isSelected = false, compact = false, wide = false }: { play: Play; onClick?: () => void; isSelected?: boolean; compact?: boolean; wide?: boolean }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const longPress = useLongPressPreview();

  // Requirements come from the synergy engine, never from the legacy `play.badges`
  // flavour text — always rendered neutral (no caller passes have/met roster state).
  const requirements: PlayRequirement[] = getPlayRequirements(getPlayEffectId(play));
  const effectSummary = evaluatePlay(play, {}).summary;

  // Category-driven theming
  const cat = play.playCategory || 'special';
  const theme = playCategoryTheme[cat];

  if (compact) {
    // plan_deckbuilder_ux D5: the roster-list row is a PlayTile (list variant), shared
    // with PlayPanel's slot tile so the two never drift apart. No hover-only info here
    // any more — the full mechanic text moves to PlayTile's `title`, and the rich
    // flip-card hover popup this used to show is gone (that WAS the hard-to-read
    // "hover to actually see it" problem D5 fixes).
    return (
      <PlayTile
        variant="list"
        play={play}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      className={`group @container relative w-full aspect-[5/7] ${wide ? 'pointer-coarse:max-lg:aspect-[1.15/1]!' : ''} cursor-pointer select-none [-webkit-touch-callout:none] transition-transform hover:-translate-y-1 ${isSelected ? `ring-2 ${theme.ringColor} ring-offset-1 ring-offset-surface-inverse rounded-lg scale-105` : `hover:scale-[1.02] ${theme.hoverShadow}`}`}
      style={{ perspective: 800 }}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onTouchStart={longPress.handlers.onTouchStart}
      onTouchMove={longPress.handlers.onTouchMove}
      onTouchCancel={longPress.handlers.onTouchCancel}
      onTouchEnd={longPress.handlers.onTouchEnd}
      onClickCapture={longPress.handlers.onClickCapture}
      onContextMenu={longPress.handlers.onContextMenu}
    >
      {longPress.open && <PlayHoverPreview play={play} />}

      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* ===== FRONT ===== */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-surface-sunken"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', isolation: 'isolate' }}
        >
          <div className={`h-1.5 w-full ${theme.accent}`} />

          <div className="px-2 py-1 bg-surface-raised flex items-center gap-1 border-b border-line">
            <RarityGem rarity={play.rarity} size="sm" />
            <div className="flex-1 min-w-0 ml-1">
              <div className="font-black uppercase leading-none tracking-tight text-ink-strong text-xs">
                {play.name}
              </div>
              <div className="text-xs text-ink-muted font-bold uppercase tracking-wider leading-tight mt-0.5">
                PLAY
              </div>
            </div>
            <div className={`text-xs font-black text-white px-1.5 py-0.5 rounded-sm shrink-0 ${theme.accentDark}`}>
              {theme.label}
            </div>
          </div>

          {/* Playboard Image Area */}
          <div className={`flex-1 relative overflow-hidden ${theme.board} flex items-center justify-center p-2`}>
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/basketball.png')]" />

            <div className="w-full h-full border-2 border-white/15 rounded-sm relative flex flex-col items-center justify-center">
                <PlayBoardGraphic play={play} />
            </div>
          </div>

          {/* Requirement icons */}
          {requirements.length > 0 && (
            <div className={`px-2 py-2 bg-surface-raised flex flex-col items-center gap-1 border-t border-line min-h-[40px] justify-center ${wide ? 'pointer-coarse:max-lg:gap-1.5!' : ''}`}>
                <span className="text-xs text-ink-subtle font-bold uppercase tracking-widest leading-none">Synergy Key</span>
                <PlayRequirementIcons requirements={requirements} size="small" />
            </div>
          )}

          {/* Neutral role list — when no requirements but getPlayDef exists */}
          {!requirements.length && (
            (() => {
              const playDef = getPlayDef(play);
              return playDef && playDef.roles.length > 0 ? (
                <div className="px-2 py-2 bg-surface-raised flex flex-col gap-1 border-t border-line">
                  {playDef.roles.map((role, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <BadgeIcon name={role.badge ?? ''} level={role.minLevel ?? 1} size="xs" />
                      <div className="flex-1">
                        <div className="font-bold text-ink-strong uppercase">{role.name}</div>
                        <div className="text-ink-muted">{describeRoleRequirement(role)}</div>
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
          className="absolute inset-0 flex flex-col rounded-lg shadow-lg overflow-hidden bg-surface-inverse"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', isolation: 'isolate' }}
        >
          <div className={`h-1.5 w-full ${theme.accent}`} />

          <div className="px-2 py-1 bg-surface-inverse flex items-center gap-1 border-b border-line-inverse">
            <RarityGem rarity={play.rarity} size="sm" />
            <div className="flex-1 min-w-0 ml-1">
              <div className="font-black uppercase leading-none tracking-tight text-ink-inverse text-xs">
                {play.name}
              </div>
              <div className="text-xs text-ink-inverse-muted font-bold uppercase tracking-wider leading-tight mt-0.5">
                PLAY
              </div>
            </div>
            <div className={`text-xs font-black text-white px-1.5 py-0.5 rounded-sm shrink-0 ${theme.accentDark}`}>
              {theme.label}
            </div>
          </div>

          {/* Mechanic Explanation */}
          <div className="flex-1 p-3 flex flex-col items-center justify-center text-center bg-surface-inverse gap-2 overflow-y-auto overscroll-contain">
            <div>
              <span className={`text-xs ${theme.mechLabel} font-bold uppercase tracking-widest mb-2 border-b ${theme.mechBorder} pb-1 block`}>Play Mechanic</span>
              <p className="text-ink-inverse text-xs leading-relaxed font-medium">
                {play.mechanicText}
              </p>
            </div>

            {effectSummary && (
              <div className="w-full px-2 py-1 rounded bg-positive-soft/10 border border-positive/30">
                <span className="text-xs text-positive font-black uppercase tracking-widest block mb-0.5">Effect</span>
                <span className="text-positive text-xs font-bold leading-snug block">{effectSummary}</span>
              </div>
            )}

            {requirements.length > 0 && (
              <div className="w-full flex flex-col gap-0.5">
                {requirements.map((req, i) => {
                  const reqStatus = isRequirementStatus(req) ? req : null;
                  return (
                    <div key={i} className="flex items-center justify-between gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-inverse-deep/60 border border-line-inverse">
                      <span className="font-bold text-ink-inverse-muted uppercase truncate">{req.badge}</span>
                      <span className={`font-black shrink-0 ${reqStatus ? (reqStatus.met ? 'text-positive' : 'text-danger') : 'text-ink-inverse-muted'}`}>
                        {reqStatus ? `${reqStatus.have}/${reqStatus.levels} ${reqStatus.met ? '✓' : '✗'}` : `×${req.levels}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={`h-1 ${theme.accent}`} />
        </div>
      </motion.div>
    </div>
  );
}
