'use client';

import { DraftCard } from './PlayerCard';
import { RosterDistribution } from './RosterDistribution';
import { Button } from './ui';

export interface RoundSummaryProps {
  /** All cards the human has drafted so far. */
  drafted: DraftCard[];
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
 *  Premier mode. One unified Roster list using the same `RosterDistribution`
 *  "mana curve" the sidebar uses, plus a button into the next pack's opener. */
export function RoundSummary({
  drafted,
  completedPackNumber,
  nextPassDirection,
  onStartNextRound,
}: RoundSummaryProps) {
  const nextPackNumber = completedPackNumber + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-surface px-6 py-10">
      <div className="flex w-full max-w-4xl flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-accent/70">
            Round {completedPackNumber} complete
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-ink-strong sm:text-4xl">
            Pack {completedPackNumber} of 3 done
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Next pack passes {nextPassDirection}.
          </p>
        </div>

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-sm">
          <div className="px-4 pt-4 text-xs font-black uppercase tracking-widest text-ink-muted">
            Roster <span className="text-ink-subtle font-bold">({drafted.length})</span>
          </div>
          <RosterDistribution drafted={drafted} />
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={onStartNextRound}
          className="rounded-full border-2 border-white/20 bg-gradient-to-r from-brand-from to-brand-to px-16 text-lg text-white shadow-[0_0_40px_rgba(249,115,22,0.4)] transition-all hover:scale-105 active:scale-95"
        >
          Start round {nextPackNumber}
        </Button>
      </div>
    </div>
  );
}
