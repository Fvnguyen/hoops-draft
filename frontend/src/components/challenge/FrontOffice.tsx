'use client';

/**
 * challenge_mode D8/D9 — the All-Star break (boards 4 and 5), mounted by
 * `app/challenge/[rosterId]/page.tsx` in place of its `BreakPlaceholder` once `phase`
 * is `'break'`. See this file's bottom export for the exact mount contract.
 *
 * pvp_series D4: reused by `components/playoffs/PlayoffsFrontOffice.tsx` for the
 * mid-series sideboard — this component takes PROPS ONLY (no `ChallengeRun`), so a
 * second caller can feed it a series' 2-3 games instead of a 41-game half without this
 * file knowing which one it is. The two slots that read differently per caller — the
 * header bar and the "On pace for.../TierLadder" block (a series shows the score
 * instead of a season pace band) — are `ReactNode` props; everything else (the quote
 * cards, the lineup editor, the trade flow) is identical for both callers by
 * construction. `onDraftChange`/`onPrimary` replace the direct `getGameStore()` writes
 * this component used to make, so persistence (a `ChallengeRun` here, a `match_sideboard`
 * RPC there) is entirely the caller's business.
 *
 * D11 in one sentence: every edit here (lineup, plays, identity, the trade) lands only
 * in this component's own `rosterDraft` state and whatever the caller does with
 * `onDraftChange`/`onPrimary` — never `store.saveRoster` directly, never a draft
 * session's `builtRoster` — so the roster the user actually drafted is untouched no
 * matter what happens at the deadline.
 */

import { useMemo, useState, type ReactNode } from 'react';
import type { ChallengeTrade, SavedRoster } from '@/storage/types';
import { buildTeamInfo } from '@/engine/game';
import type { ChallengeHalf } from '@/engine/challenge';
import { challengeAdvice, type ChallengeQuote, type ChallengeAction } from '@/engine/challengeAdvice';
import { seatFromRoster } from './rosterSeat';
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
  /** The season stats this break's advice is drawn from: games 1-41 for 82:0, the
   *  series' games so far for pvp_series (`engine/challengeAdvice.ts`'s
   *  `seriesAdviceHalf`). Only `.games`/`.wins`/`.playerTotals`/`.opponentTotals` are
   *  ever read — `.half` itself is not. */
  half: ChallengeHalf;
  /** Quote-variant stream (`challengeAdvice`'s `seed`). */
  seed: number;
  /** The roster this break starts from (already reflects any earlier save this session). */
  roster: SavedRoster;
  trade?: ChallengeTrade;
  /** `DeckBuilder`'s session id, when one exists (82:0 only — a series roster was never
   *  drafted through a live session by the time it reaches the sideboard). */
  sessionId?: string;
  /** The sticky top bar. A full slot because pvp_series' opponent/score strip has
   *  nothing in common with 82:0's "All-Star break" bar + sealed-record `FlipClock`. */
  header: ReactNode;
  /** Replaces the "On pace for / <label> / TierLadder" block wholesale — pvp_series
   *  shows the series score instead of a full-season pace band (D4: no record is
   *  hidden here, since it is the OPPONENT's score, not the sealed 82:0 record). */
  paceDisplay: ReactNode;
  /** Trade sourcing (D4/D9): which cards can never be offered, and the RNG seed the
   *  pack draws from. 82:0 excludes only the roster's own cards, seeded off its own
   *  run; pvp_series excludes BOTH players' drafted cards, seeded off
   *  `mixSeed(match.seed, 'trade:<side>')`. */
  tradeOwnedIds: Set<string>;
  tradeSeed: number;
  /** Fired after every local edit (a lineup save, a trade confirm) so the caller can
   *  persist an in-progress snapshot. Optional: pvp_series has nothing worth persisting
   *  before the primary action locks it in. */
  onDraftChange?: (roster: SavedRoster, trade: ChallengeTrade | undefined) => void;
  /** The footer's primary button label — "Spin the second half" for 82:0, "Lock" for
   *  pvp_series. */
  primaryLabel: string;
  /** The footer's small print next to the primary button, when there is any. */
  primaryHint?: ReactNode;
  /** The footer's primary action: 82:0 persists `rosterPost`/`trade` and starts half 2;
   *  pvp_series calls `match_sideboard` (`onLock`). Thrown errors are caught here and
   *  logged — the button just stops spinning, exactly as before this refactor. */
  onPrimary: (roster: SavedRoster, trade: ChallengeTrade | undefined) => Promise<void>;
  /**
   * The outer shell. `'fullscreen'` (default, unchanged) is 82:0's own game-route chrome
   * — `h-dvh-z`, a sticky header, a scrolling middle, a docked footer — built for a route
   * `isGameRoute` hides the ordinary nav bar on. `'inline'` is a plain top-to-bottom flow
   * (no fixed viewport height, no docked footer) for pvp_series' `PlayoffsFrontOffice`,
   * which sits mid-page inside the series page's own `<main>` under the ordinary TopNav —
   * `/playoffs/[id]` is NOT a game route (`src/lib/routes.ts`), so a full-viewport shell
   * there would run its own header straight under the fixed nav bar.
   */
  variant?: 'fullscreen' | 'inline';
}

export function FrontOffice({
  half, seed, roster, trade: tradeInitial, sessionId, header, paceDisplay,
  tradeOwnedIds, tradeSeed, onDraftChange, primaryLabel, primaryHint, onPrimary,
  variant = 'fullscreen',
}: FrontOfficeProps) {
  const [rosterDraft, setRosterDraft] = useState<SavedRoster>(roster);
  const [trade, setTrade] = useState<ChallengeTrade | undefined>(tradeInitial);
  const [showEditor, setShowEditor] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const team = useMemo(
    () => buildTeamInfo(seatFromRoster(rosterDraft), true, rosterDraft.name || 'Your team'),
    [rosterDraft],
  );
  const advice = useMemo(() => challengeAdvice({ team, half, seed }), [team, half, seed]);

  const handlePrimary = async () => {
    setSpinning(true);
    try {
      await onPrimary(rosterDraft, trade);
    } catch (err) {
      console.error('Failed to complete the front office action:', err);
      setSpinning(false);
    }
  };

  const handleEditorSave = (saved: SavedRoster) => {
    setRosterDraft(saved);
    setShowEditor(false);
    onDraftChange?.(saved, trade);
  };

  /**
   * The acquired card lands on the BENCH (D9), so a trade always leaves the depth chart a
   * man short. Go straight into the lineup editor instead of back to the quotes: otherwise
   * the natural path — trade, then spin/lock — silently plays (or locks) with eleven.
   */
  const handleTradeConfirm = (updatedRoster: SavedRoster, madeTrade: ChallengeTrade) => {
    setRosterDraft(updatedRoster);
    setTrade(madeTrade);
    setShowTrade(false);
    setShowEditor(true);
    onDraftChange?.(updatedRoster, madeTrade);
  };

  const tradeUsed = !!trade;

  const quotesGrid = (
    <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
      {advice.quotes.map((quote, i) => (
        <QuoteCard key={i} quote={quote} />
      ))}
    </div>
  );

  const adjustButton = (
    <Button variant="secondary" size="lg" onClick={() => setShowEditor(true)}>
      Adjust lineup and plays
    </Button>
  );
  const tradeButton = (
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
  );
  const primaryButton = (
    <Button size="lg" onClick={handlePrimary} disabled={spinning}>
      {spinning ? 'Saving…' : primaryLabel}
    </Button>
  );

  const overlays = (
    <>
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
            sessionId={sessionId}
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
          half={half}
          roster={rosterDraft}
          ownedIds={tradeOwnedIds}
          rngSeed={tradeSeed}
          onCancel={() => setShowTrade(false)}
          onConfirm={handleTradeConfirm}
        />
      )}
    </>
  );

  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {paceDisplay}
        {quotesGrid}
        <div className="flex flex-wrap items-center gap-3">
          {adjustButton}
          {tradeButton}
          <div className="grow" />
          {primaryHint && <p className="text-xs text-ink-subtle">{primaryHint}</p>}
          {primaryButton}
        </div>
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-dvh-z flex-col">
      {header}

      <div className="flex grow flex-col items-center justify-center gap-7 overflow-y-auto px-8 py-6">
        {paceDisplay}
        {quotesGrid}
      </div>

      <footer className="flex h-20 shrink-0 items-center gap-3 border-t border-line px-6 sm:px-10">
        {adjustButton}
        {tradeButton}
        <div className="grow" />
        {primaryHint && <p className="hidden text-xs text-ink-subtle lg:block">{primaryHint}</p>}
        {primaryButton}
      </footer>

      {overlays}
    </div>
  );
}
