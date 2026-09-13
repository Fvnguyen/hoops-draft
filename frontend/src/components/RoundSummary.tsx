'use client';

import { DraftCard } from './PlayerCard';
import { RosterDistribution } from './RosterDistribution';

type Zone = 'Roster' | 'GLeague';

export interface RoundSummaryProps {
  /** All cards the human has drafted so far. */
  drafted: DraftCard[];
  humanZones: Record<string, Zone>;
  /** Pack number that just finished (1 or 2 — pack 3 goes straight to the
   *  builder and never shows a summary, per D3). */
  completedPackNumber: number;
  /** Which way the next pack passes ('right' after pack 1 finishes and round 2
   *  starts, 'left' after pack 2 finishes and round 3 starts). */
  nextPassDirection: 'left' | 'right';
  /** Runs the next opener (calls the hook's `startNextRound`). */
  onStartNextRound: () => void;
}

/** D3 round-summary pause, shown after the last pick of packs 1 and 2 in
 *  Premier mode. Active roster and G-League side by side using the same
 *  `RosterDistribution` "mana curve" the sidebar uses, plus a button into the
 *  next pack's opener. */
export function RoundSummary({
  drafted,
  humanZones,
  completedPackNumber,
  nextPassDirection,
  onStartNextRound,
}: RoundSummaryProps) {
  const roster = drafted.filter(c => humanZones[c.id] !== 'GLeague');
  const gleague = drafted.filter(c => humanZones[c.id] === 'GLeague');
  const nextPackNumber = completedPackNumber + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#F5F0EA] px-6 py-10">
      <div className="flex w-full max-w-4xl flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-700/70">
            Round {completedPackNumber} complete
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-stone-800 sm:text-4xl">
            Pack {completedPackNumber} of 3 done
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Next pack passes {nextPassDirection}.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="px-4 pt-4 text-xs font-black uppercase tracking-widest text-stone-500">
              Active roster <span className="text-stone-400 font-bold">({roster.length})</span>
            </div>
            <RosterDistribution drafted={roster} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="px-4 pt-4 text-xs font-black uppercase tracking-widest text-stone-500">
              G-League <span className="text-stone-400 font-bold">({gleague.length})</span>
            </div>
            <RosterDistribution drafted={gleague} />
          </div>
        </div>

        <button
          type="button"
          onClick={onStartNextRound}
          className="rounded-full border-2 border-white/20 bg-gradient-to-r from-orange-500 to-red-600 px-16 py-4 text-xl font-black uppercase tracking-widest text-white shadow-[0_0_40px_rgba(249,115,22,0.4)] transition-all hover:scale-105 hover:from-orange-400 hover:to-red-500 active:scale-95"
        >
          Start round {nextPackNumber}
        </button>
      </div>
    </div>
  );
}
