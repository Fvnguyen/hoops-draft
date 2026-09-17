'use client';

/**
 * challenge_mode D8/D9 — the All-Star break (boards 4 and 5), mounted by
 * `app/challenge/[rosterId]/page.tsx` in place of its `BreakPlaceholder` once `phase`
 * is `'break'`. See this file's bottom export for the exact mount contract.
 *
 * D11 in one sentence: every edit here (lineup, plays, identity, the trade) lands only
 * in this component's own `rosterDraft` state and the `ChallengeRun.rosterPost`
 * snapshot it persists — never `store.saveRoster`, never the draft session's
 * `builtRoster` — so the roster the user actually drafted is untouched no matter what
 * happens at the deadline.
 */

import { useMemo, useState } from 'react';
import { getGameStore } from '@/storage';
import type { ChallengeRun, ChallengeTrade, SavedRoster } from '@/storage/types';
import { buildTeamInfo } from '@/engine/game';
import { CHALLENGE_GAMES } from '@/engine/balance';
import { challengeAdvice, type ChallengeQuote, type ChallengeAction } from '@/engine/challengeAdvice';
import { seatFromRoster } from './rosterSeat';
import { TierLadder } from './TierLadder';
import { FlipClock } from './FlipClock';
import { Trade } from './Trade';
import { Button, Panel } from '@/components/ui';
import { DeckBuilder } from '@/components/DeckBuilder';

const SPEAKER_LABEL: Record<ChallengeQuote['speaker'], string> = {
  coach: 'Coach',
  owner: 'Owner',
  fans: 'Fans',
};

const ACTION_LABEL: Record<ChallengeAction, string> = {
  lineup: 'Lineup',
  plays: 'Plays',
  trade: 'Trade',
  hold: 'Hold',
};

function QuoteCard({ quote }: { quote: ChallengeQuote }) {
  const isHold = quote.action === 'hold';
  return (
    <Panel variant="raised" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-black uppercase tracking-widest text-accent">
          {SPEAKER_LABEL[quote.speaker]}
        </span>
        <div className="grow" />
        <span
          className={`flex h-6 items-center rounded-full px-2.5 text-xs font-black uppercase tracking-wide ${
            isHold ? 'bg-positive-soft text-positive' : 'bg-surface-sunken text-ink'
          }`}
        >
          {ACTION_LABEL[quote.action]}
        </span>
      </div>
      <p className="grow text-base font-medium leading-snug text-ink-strong">&ldquo;{quote.text}&rdquo;</p>
      <p className="text-xs leading-relaxed text-ink-muted">{quote.evidence}</p>
    </Panel>
  );
}

export interface FrontOfficeProps {
  run: ChallengeRun;
  /**
   * Fired once "Spin the second half" is pressed, AFTER this component has already
   * persisted `rosterPost`/`trade` to the store. Hands back the merged run so the
   * caller's own phase transition (`phase: 'break' -> 'second'`) can spread from THIS
   * object instead of its own possibly-stale `run` prop — spreading the stale prop would
   * silently drop whatever the front office just saved. See the T7 handover notes for
   * the one-line change `page.tsx`'s `startSecondHalf` needs to accept it.
   */
  onSpin: (updatedRun: ChallengeRun) => void;
}

export function FrontOffice({ run, onSpin }: FrontOfficeProps) {
  const [rosterDraft, setRosterDraft] = useState<SavedRoster>(run.rosterPost ?? run.rosterPre);
  const [trade, setTrade] = useState<ChallengeTrade | undefined>(run.trade);
  const [showEditor, setShowEditor] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const half = run.halves[0];

  const team = useMemo(
    () => buildTeamInfo(seatFromRoster(rosterDraft), true, rosterDraft.name || 'Your team'),
    [rosterDraft],
  );
  const advice = useMemo(
    () => (half ? challengeAdvice({ team, half, seed: run.seed }) : null),
    [team, half, run.seed],
  );

  // The page never mounts this before half 1 is committed (see the mount contract at
  // the bottom of this file) — this is only a defensive fallback.
  if (!half || !advice) return null;

  const persist = async (patch: Partial<Pick<ChallengeRun, 'rosterPost' | 'trade' | 'phase'>>) => {
    const next: ChallengeRun = { ...run, rosterPost: rosterDraft, trade, ...patch };
    await getGameStore().saveChallengeRun(next);
    return next;
  };

  const handleSpin = async () => {
    setSpinning(true);
    try {
      const next = await persist({});
      onSpin(next);
    } catch (err) {
      console.error('Failed to save the front office before spinning the second half:', err);
      setSpinning(false);
    }
  };

  const handleEditorSave = (saved: SavedRoster) => {
    setRosterDraft(saved);
    setShowEditor(false);
    void getGameStore().saveChallengeRun({ ...run, rosterPost: saved, trade }).catch((err) => {
      console.error('Failed to save the front office lineup edit:', err);
    });
  };

  const handleTradeConfirm = (updatedRoster: SavedRoster, madeTrade: ChallengeTrade) => {
    setRosterDraft(updatedRoster);
    setTrade(madeTrade);
    setShowTrade(false);
    void getGameStore().saveChallengeRun({ ...run, rosterPost: updatedRoster, trade: madeTrade }).catch((err) => {
      console.error('Failed to save the front office trade:', err);
    });
  };

  const band = advice.band;
  const tradeUsed = !!trade;

  return (
    <div className="flex h-dvh-z flex-col">
      <header className="flex h-nav shrink-0 items-center gap-4 border-b border-line px-6">
        <span className="font-display text-3xl leading-none text-accent">82:0</span>
        <span className="text-xs font-black uppercase tracking-widest text-ink-muted">
          All-Star break &middot; {CHALLENGE_GAMES / 2} games played &middot; trade deadline
        </span>
        <div className="grow" />
        {/* D8: the record stays sealed until game 82 — these are decorative placeholder
            flaps, never `half.wins`/`half.losses`, so even a reduced-motion viewer (whose
            flaps never blur) can't read a real result off them. */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-subtle">Record sealed</span>
          <FlipClock wins={0} losses={0} blur={0.55} size="sm" />
        </div>
      </header>

      <div className="flex grow flex-col items-center justify-center gap-7 overflow-y-auto px-8 py-6">
        <div className="flex w-full max-w-4xl flex-col items-center gap-3">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-ink-subtle">On pace for</p>
          <h1 className="font-display text-5xl leading-none text-ink-strong sm:text-6xl">{band.label}</h1>
          <TierLadder band={[band.low, band.high]} className="w-full" />
        </div>

        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {advice.quotes.map((quote, i) => (
            <QuoteCard key={i} quote={quote} />
          ))}
        </div>
      </div>

      <footer className="flex h-20 shrink-0 items-center gap-3 border-t border-line px-6 sm:px-10">
        <Button variant="secondary" size="lg" onClick={() => setShowEditor(true)}>
          Adjust lineup and plays
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setShowTrade(true)}
          disabled={tradeUsed}
          className="border-accent text-accent hover:bg-accent-soft/20"
        >
          Make a trade
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
            {tradeUsed ? '0 left' : '1 left'}
          </span>
        </Button>
        <div className="grow" />
        <p className="hidden text-xs text-ink-subtle lg:block">
          Both are optional. Changes apply to games 42 to 82.
        </p>
        <Button size="lg" onClick={handleSpin} disabled={spinning}>
          {spinning ? 'Saving…' : 'Spin the second half'}
        </Button>
      </footer>

      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-surface">
          <DeckBuilder
            draftedCards={rosterDraft.draftedCards}
            rosterId={rosterDraft.id}
            existingRosterName={rosterDraft.name}
            initialDepthOrder={rosterDraft.depthChartOrder}
            initialPlaysOrder={rosterDraft.activePlays}
            initialPlayAssignments={rosterDraft.playAssignments}
            initialArchetypes={rosterDraft.archetypes}
            sessionId={run.sessionId || undefined}
            gameMode="challenge"
            embedOverride={{ onSave: handleEditorSave }}
          />
          <Button
            variant="secondary"
            size="md"
            className="fixed bottom-4 left-4 z-[110] shadow-lg"
            onClick={() => setShowEditor(false)}
          >
            Close without saving
          </Button>
        </div>
      )}

      {showTrade && (
        <Trade
          run={run}
          roster={rosterDraft}
          advice={advice}
          onCancel={() => setShowTrade(false)}
          onConfirm={handleTradeConfirm}
        />
      )}
    </div>
  );
}

/*
 * MOUNT CONTRACT for `app/challenge/[rosterId]/page.tsx` (T6, not edited here):
 *
 *   } else if (run.phase === 'break') {
 *     body = <FrontOffice run={run} onSpin={startSecondHalf} />;
 *
 * `startSecondHalf` currently reads `(r) => ({ ...r, phase: 'second' })` off the page's
 * OWN closure state, which this component never updates (it writes straight to the
 * store). Change its signature to accept the run FrontOffice hands back:
 *
 *   const startSecondHalf = useCallback((updated: ChallengeRun) => {
 *     void commit({ ...updated, phase: 'second' });
 *   }, [commit]);
 *
 * Both call sites already thread `run`/`onSpin` as props with matching names, so the
 * only other change is deleting `BreakPlaceholder` and its now-unused import of
 * `TierLadder`/`CHALLENGE_GAMES` (still used elsewhere in the file — check before
 * removing the import line itself).
 */
