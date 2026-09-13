'use client';

import { ChevronRight, ChevronLeft, Users, LayoutList, ArrowLeftRight } from 'lucide-react';
import { DraftCard, CardListRow, RarityGem } from './PlayerCard';
import { countBadges } from '../engine/synergies';
import type { PlayerCardData, Rarity } from './PlayerCard';
import { CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK } from '../engine/balance';
import {
  evaluateArchetypes,
  MONO_THRESHOLDS,
  TWO_COLOR_THRESHOLDS,
  GOLD_THRESHOLDS,
  type ArchetypeStatus,
} from '../engine/archetypes';

const TOTAL_PICKS = CUBE_PACKS * (CUBE_PLAYER_CARDS_PER_PACK + 1);

type Zone = 'Roster' | 'GLeague';

// ── "Mana curve" position summary ───────────────────────────────────────────
//
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

/** Primary-colour carrier count against the next tier's threshold (mirrors TopKPIBand's
 *  identical helper — kept local since these are separate, unrelated UI surfaces). */
function primaryCarrierFraction(status: ArchetypeStatus): { have: number; need: number } {
  const target = status.tier === 'none' ? 'online' : 'dedicated';
  const have = status.tally[status.def.colors.primary]?.carriers ?? 0;
  if (status.def.kind === 'mono') return { have, need: MONO_THRESHOLDS[target].carriers };
  if (status.def.kind === 'two') return { have, need: TWO_COLOR_THRESHOLDS[target].primary.carriers };
  return { have, need: GOLD_THRESHOLDS[target].primary.carriers };
}

/**
 * Top 3 archetypes by progress over the drafted PLAYER cards. Starters are not known
 * yet during the draft, so every plan is evaluated with an empty starter set — tiers
 * will only ever show as far as the non-starter thresholds allow; this is intentionally
 * a coarse teaser, not the full roster-lock evaluation (see ArchetypePicker for that).
 */
function IdentityProgress({ drafted }: { drafted: DraftCard[] }) {
  const players = drafted.filter((c): c is PlayerCardData => c.type === 'Player');
  const statuses = evaluateArchetypes(players, new Set<string>());
  const topPlans = [...statuses]
    .filter(s => s.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  if (topPlans.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 pt-2 mt-1 border-t border-stone-200">
      <h4 className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Identity progress</h4>
      {topPlans.map(status => {
        const { have, need } = primaryCarrierFraction(status);
        return (
          <div key={status.def.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="font-bold text-stone-600 truncate">{status.def.name}</span>
              <span className="text-stone-400 font-bold shrink-0">{have}/{need} carriers</span>
            </div>
            <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400" style={{ width: `${Math.round(status.progress * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PositionBar({ label, value, max, tooltip }: { label: string; value: number; max: number; tooltip?: string }) {
  const pct = max > 0 ? Math.max(6, (value / max) * 100) : 6;
  return (
    <div className="flex-1 flex flex-col items-center gap-1" title={tooltip}>
      <div className="text-[11px] font-black text-stone-700 leading-none">{value}</div>
      <div className="w-full h-12 flex items-end bg-stone-100 rounded overflow-hidden">
        <div className="w-full bg-stone-700 rounded-t-sm transition-all" style={{ height: `${pct}%` }} />
      </div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-stone-400">{label}</div>
    </div>
  );
}

function DraftSummary({ drafted }: { drafted: DraftCard[] }) {
  const { positions, plays, rarity } = computeCounts(drafted);
  const max = Math.max(1, positions.G, positions.F, positions.C, plays);
  const badges = topBadges(drafted, 5);

  return (
    <div className="px-4 pt-4 pb-3 border-b border-stone-200 bg-stone-50/60 flex flex-col gap-3">
      <div className="flex gap-2">
        <PositionBar label="G" value={positions.G} max={max} tooltip="PG, SG, G" />
        <PositionBar label="F" value={positions.F} max={max} tooltip="SF, PF, F, and G/F (counted as F for simplicity)" />
        <PositionBar label="C" value={positions.C} max={max} tooltip="C, and F/C (counted as C for simplicity)" />
        <PositionBar label="Plays" value={plays} max={max} />
      </div>

      <div className="flex items-center justify-center gap-3 pt-1 border-t border-stone-200">
        {(['Common', 'Uncommon', 'Rare', 'Mythic'] as Rarity[]).map(r => (
          <div key={r} className="flex items-center gap-1" title={r}>
            <RarityGem rarity={r} size="sm" />
            <span className="text-[10px] font-bold text-stone-600">{rarity[r]}</span>
          </div>
        ))}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {badges.map(([name, level]) => (
            <span key={name} className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-bold uppercase tracking-wide rounded">
              {name} ×{level}
            </span>
          ))}
        </div>
      )}

      <IdentityProgress drafted={drafted} />
    </div>
  );
}

function ZoneToggleButton({ zone }: { zone: Zone }) {
  const target = zone === 'Roster' ? 'G-League' : 'Roster';
  return (
    <div className="p-1.5 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors" title={`Move to ${target}`}>
      <ArrowLeftRight size={13} />
    </div>
  );
}

function ZoneSection({
  title, icon, zone, cards, activeZone, setActiveZone, onDragOver, onDrop, onReassignZone,
}: {
  title: string;
  icon: React.ReactNode;
  zone: Zone;
  cards: DraftCard[];
  activeZone: Zone;
  setActiveZone: (z: Zone) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, zone: Zone) => void;
  onReassignZone: (cardId: string, zone: Zone) => void;
}) {
  return (
    <div
      onClick={() => setActiveZone(zone)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, zone)}
      className={`p-2 -m-2 rounded-lg transition-colors border-2 ${activeZone === zone ? 'bg-stone-50 border-stone-300' : 'border-transparent hover:border-stone-200'}`}
    >
      <div className="flex items-center justify-between mb-3 px-2">
        <h3 className={`font-bold uppercase tracking-widest text-sm flex items-center gap-2 ${activeZone === zone ? 'text-stone-800' : 'text-stone-500'}`}>
          {icon} {title}
        </h3>
        <span className="text-stone-400 text-xs font-bold">{cards.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 min-h-[50px]">
        {cards.length === 0 && <div className="text-stone-400 text-xs italic px-2">Drag cards here...</div>}
        {cards.map((c, idx) => (
          <CardListRow
            key={`${c.id}-${idx}`}
            card={c}
            trailing={
              <button onClick={(e) => { e.stopPropagation(); onReassignZone(c.id, zone === 'Roster' ? 'GLeague' : 'Roster'); }}>
                <ZoneToggleButton zone={zone} />
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}

export function DraftSidebar({
  drafted, humanZones, isOpen, toggle, activeZone, setActiveZone, onDropPick, onReassignZone,
}: {
  drafted: DraftCard[];
  humanZones: Record<string, Zone>;
  isOpen: boolean;
  toggle: () => void;
  activeZone: Zone;
  setActiveZone: (z: Zone) => void;
  /** Dropping a just-picked pack card onto a zone — also advances the draft. */
  onDropPick: (cardId: string, zone: Zone) => void;
  /** Moving an already-drafted card between Roster/G-League — zone only, no pick side-effects. */
  onReassignZone: (cardId: string, zone: Zone) => void;
}) {
  const roster = drafted.filter(c => humanZones[c.id] !== 'GLeague');
  const gleague = drafted.filter(c => humanZones[c.id] === 'GLeague');

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent, zone: Zone) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) onDropPick(cardId, zone);
  };

  return (
    <div className="relative h-full shrink-0 z-40 transition-all duration-300" style={{ width: isOpen ? 320 : 64 }}>
      {/*
        The sidebar uses absolute positioning so the inner 320px container never gets crushed.
        We just slide it horizontally.
      */}
      <div
        className="absolute top-0 right-0 h-full w-[320px] bg-white border-l border-stone-200 flex flex-col shadow-xl transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(256px)' }}
      >
        <button
          onClick={toggle}
          className="absolute top-4 -left-3 bg-white border border-stone-200 p-1 rounded-full text-stone-400 hover:text-stone-600 z-50 shadow-md"
        >
          {isOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Collapsed Strip Overlay (Always lives in the leftmost 64px) */}
        <div className={`absolute top-0 left-0 w-[64px] h-full flex flex-col items-center pt-16 gap-6 z-20 transition-opacity duration-200 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div
            className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer transition-colors ${activeZone === 'Roster' ? 'bg-stone-100 border-stone-800' : 'border-transparent hover:bg-stone-50'}`}
            onClick={() => { setActiveZone('Roster'); toggle(); }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'Roster')}
          >
             <Users size={18} className={activeZone === 'Roster' ? 'text-stone-800' : 'text-stone-400'} />
             <span className="text-[9px] font-bold uppercase tracking-wide text-stone-500 leading-none">Roster</span>
             <span className="text-[10px] font-black text-stone-700 leading-none">{roster.length}</span>
          </div>
          <div
            className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer transition-colors ${activeZone === 'GLeague' ? 'bg-stone-100 border-stone-800' : 'border-transparent hover:bg-stone-50'}`}
            onClick={() => { setActiveZone('GLeague'); toggle(); }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'GLeague')}
          >
             <LayoutList size={18} className={activeZone === 'GLeague' ? 'text-stone-800' : 'text-stone-400'} />
             <span className="text-[9px] font-bold uppercase tracking-wide text-stone-500 leading-none">G-League</span>
             <span className="text-[10px] font-black text-stone-700 leading-none">{gleague.length}</span>
          </div>
        </div>

        {/* Expanded UI */}
        <div className={`flex-1 flex flex-col w-full h-full z-10 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center gap-3">
            <div className="w-8 h-8 shrink-0 bg-white rounded-md flex items-center justify-center border border-stone-200 cursor-pointer hover:bg-stone-50" onClick={toggle}>
               <LayoutList className="text-stone-600" size={18} />
            </div>
            <div className="whitespace-nowrap">
              <h2 className="text-stone-800 font-bold uppercase tracking-wider text-lg leading-tight">My Team</h2>
              <div className="text-stone-400 text-xs font-medium uppercase tracking-widest">{drafted.length}/{TOTAL_PICKS} Drafted</div>
            </div>
          </div>

          <DraftSummary drafted={drafted} />

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
            <ZoneSection
              title="Roster" icon={<Users size={16} />} zone="Roster" cards={roster}
              activeZone={activeZone} setActiveZone={setActiveZone}
              onDragOver={handleDragOver} onDrop={handleDrop} onReassignZone={onReassignZone}
            />
            <ZoneSection
              title="G-League" icon={<LayoutList size={16} />} zone="GLeague" cards={gleague}
              activeZone={activeZone} setActiveZone={setActiveZone}
              onDragOver={handleDragOver} onDrop={handleDrop} onReassignZone={onReassignZone}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
