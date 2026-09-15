'use client';

/**
 * "Mana curve" position/rarity/badge summary, extracted from `DraftSidebar`
 * (plan ui_draft_deckbuild_pack, T0) so the round-summary screen (D3) can show
 * it for both Active roster and G-League side by side.
 */
import { DraftCard, RarityGem } from './PlayerCard';
import { countBadges } from '../engine/synergies';
import type { PlayerCardData, Rarity } from './PlayerCard';

// Product call: G/F counts as F and F/C counts as C (not split 0.5/0.5) — kept
// simple on purpose, explained in the column's tooltip rather than in the math.
function classifyPosition(rawPos: string): 'G' | 'F' | 'C' {
  const p = rawPos.replace('-', '/');
  if (p === 'C' || p === 'F/C') return 'C';
  if (p === 'PG' || p === 'SG' || p === 'G') return 'G';
  return 'F'; // SF, PF, F, G/F
}

function computeCounts(drafted: DraftCard[]) {
  const positions = { G: 0, F: 0, C: 0 };
  let plays = 0;
  const rarity: Record<Rarity, number> = { Common: 0, Uncommon: 0, Rare: 0, Mythic: 0 };

  for (const c of drafted) {
    rarity[c.rarity] = (rarity[c.rarity] || 0) + 1;
    if (c.type === 'Play') {
      plays++;
    } else {
      positions[classifyPosition(c.player.position)]++;
    }
  }

  return { positions, plays, rarity };
}

function topBadges(drafted: DraftCard[], count: number) {
  const players = drafted.filter((c): c is PlayerCardData => c.type === 'Player');
  const totals = countBadges(players);
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);
}

function PositionBar({ label, value, max, tooltip }: { label: string; value: number; max: number; tooltip?: string }) {
  const pct = max > 0 ? Math.max(6, (value / max) * 100) : 6;
  return (
    <div className="flex-1 flex flex-col items-center gap-1" title={tooltip}>
      <div className="text-xs font-black text-ink leading-none">{value}</div>
      <div className="w-full h-12 flex items-end bg-surface-sunken rounded overflow-hidden">
        <div className="w-full bg-ink-muted rounded-t-sm transition-all" style={{ height: `${pct}%` }} />
      </div>
      <div className="text-xs font-bold uppercase tracking-widest text-ink-subtle">{label}</div>
    </div>
  );
}

export function RosterDistribution({ drafted }: { drafted: DraftCard[] }) {
  const { positions, plays, rarity } = computeCounts(drafted);
  const max = Math.max(1, positions.G, positions.F, positions.C, plays);
  const badges = topBadges(drafted, 5);

  return (
    <div className="px-4 pt-4 pb-3 border-b border-line bg-surface-sunken/60 flex flex-col gap-3">
      <div className="flex gap-2">
        <PositionBar label="G" value={positions.G} max={max} tooltip="PG, SG, G" />
        <PositionBar label="F" value={positions.F} max={max} tooltip="SF, PF, F, and G/F (counted as F for simplicity)" />
        <PositionBar label="C" value={positions.C} max={max} tooltip="C, and F/C (counted as C for simplicity)" />
        <PositionBar label="Plays" value={plays} max={max} />
      </div>

      <div className="flex items-center justify-center gap-3 pt-1 border-t border-line">
        {(['Common', 'Uncommon', 'Rare', 'Mythic'] as Rarity[]).map(r => (
          <div key={r} className="flex items-center gap-1" title={r}>
            <RarityGem rarity={r} size="sm" />
            <span className="text-xs font-bold text-ink-muted">{rarity[r]}</span>
          </div>
        ))}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {badges.map(([name, level]) => (
            <span key={name} className="px-1.5 py-0.5 bg-surface-muted text-ink-muted text-xs font-bold uppercase tracking-wide rounded">
              {name} ×{level}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
