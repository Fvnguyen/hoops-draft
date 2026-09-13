'use client';

import { ChevronRight, ChevronLeft, Users, LayoutList } from 'lucide-react';
import { DraftCard, CardListRow, PlayerHoverPreview, PlayHoverPreview } from './PlayerCard';
import { useHoverPreview } from './useHoverPreview';
import { RosterDistribution } from './RosterDistribution';
import { CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK } from '../engine/balance';

const TOTAL_PICKS = CUBE_PACKS * (CUBE_PLAYER_CARDS_PER_PACK + 1);

/** One roster row + its own hover-preview state (D-hover) — a hook call per row needs
 *  its own component instance, can't be called from inside a `.map()` directly. */
function RosterCardRow({ card }: { card: DraftCard }) {
  // Destructured (not `const hover = ...; hover.ref`) — eslint-plugin-react-hooks'
  // `refs` rule conservatively taints every property read off an object that also
  // carries a ref, so `hover.isHovered` gets misflagged as a ref access otherwise.
  const { ref: hoverRef, isHovered, onMouseEnter, onMouseLeave } = useHoverPreview<HTMLDivElement>();
  return (
    <div ref={hoverRef} className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <CardListRow card={card} />
      {/* Screen-centred + badge panel (D-hover) — CardListRow itself has no hover
          preview at all; a row in this scrollable roster list otherwise has
          nowhere for an anchored popup to go. */}
      {isHovered && (card.type === 'Player' ? <PlayerHoverPreview player={card} /> : <PlayHoverPreview play={card} />)}
    </div>
  );
}

export function DraftSidebar({
  drafted, isOpen, toggle, onDropPick,
}: {
  drafted: DraftCard[];
  isOpen: boolean;
  toggle: () => void;
  /** Dropping a just-picked pack card onto the roster list — also advances the draft. */
  onDropPick: (cardId: string) => void;
}) {
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) onDropPick(cardId);
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
            className="p-2.5 rounded-xl border-2 border-transparent flex flex-col items-center gap-1 cursor-pointer transition-colors hover:bg-stone-50"
            onClick={toggle}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
             <Users size={18} className="text-stone-800" />
             <span className="text-[9px] font-bold uppercase tracking-wide text-stone-500 leading-none">Roster</span>
             <span className="text-[10px] font-black text-stone-700 leading-none">{drafted.length}</span>
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

          <RosterDistribution drafted={drafted} />

          <div
            className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5 custom-scrollbar"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between mb-1 px-2">
              <h3 className="font-bold uppercase tracking-widest text-sm flex items-center gap-2 text-stone-800">
                <Users size={16} /> Roster
              </h3>
              <span className="text-stone-400 text-xs font-bold">{drafted.length}</span>
            </div>
            {drafted.length === 0 && <div className="text-stone-400 text-xs italic px-2">Drag cards here...</div>}
            {drafted.map((c, idx) => (
              <RosterCardRow key={`${c.id}-${idx}`} card={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
