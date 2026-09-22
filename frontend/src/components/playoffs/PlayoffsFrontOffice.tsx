'use client';

/**
 * pvp_series D4 (T5): the mid-series sideboard — the 82:0 front office (`FrontOffice`)
 * reused with the series' games so far in place of a 41-game half.
 *
 * `seriesAdviceHalf` (`engine/challengeAdvice.ts`) turns `match.games` into a
 * `ChallengeHalf`-shaped bag of stats for the viewer's side; `challengeAdvice` (unchanged)
 * then produces the same three quotes 82:0 would over that data. The pace band it also
 * computes is never shown here — D4 replaces it with the series score, which is fine to
 * show in full (it is the OPPONENT's score, not the 82:0 sealed record) via `paceDisplay`.
 *
 * Trade sourcing (D4): the offer pool excludes cards EITHER player drafted, not just the
 * viewer's — `match.host_roster`/`match.guest_roster` hold both sides' drafted pools
 * regardless of which one is currently sideboarding. The pack seed is
 * `mixSeed(match.seed, 'trade:<side>')`, its own stream per side so host and guest never
 * see the same five offers.
 *
 * Locking: `onLock` is the caller's `match_sideboard` RPC. This component never mutates
 * `roster` — `FrontOffice` already keeps every edit in its own local `rosterDraft` state
 * and hands back a brand-new `SavedRoster` snapshot only when the primary button is
 * pressed.
 */

import { useMemo } from 'react';
import type { PlayoffsFrontOfficeProps } from './types';
import type { SavedRoster, ChallengeTrade } from '@/storage/types';
import { seriesState } from '@/engine/playoffs';
import { seriesAdviceHalf } from '@/engine/challengeAdvice';
import { mixSeed } from '@/engine/rng';
import { FrontOffice } from '@/components/challenge/FrontOffice';

export function PlayoffsFrontOffice({ match, me, roster, onLock }: PlayoffsFrontOfficeProps) {
  const opponent = me === 'host' ? 'guest' : 'host';

  const half = useMemo(() => seriesAdviceHalf(match.games, me), [match.games, me]);
  const seed = useMemo(() => mixSeed(match.seed, `advice:${me}`), [match.seed, me]);
  const tradeSeed = useMemo(() => mixSeed(match.seed, `trade:${me}`), [match.seed, me]);

  const state = seriesState(match.games, !!(match.sideboard.host && match.sideboard.guest));
  const myWins = me === 'host' ? state.hostWins : state.guestWins;
  const oppWins = me === 'host' ? state.guestWins : state.hostWins;

  // D4: BOTH players' drafted cards are off the table, not just the sideboarding
  // player's — `roster` is always the viewer's own, `match.<side>_roster` covers the
  // opponent even if their roster prop was never handed to this component.
  const tradeOwnedIds = useMemo(() => {
    const opponentRoster = (opponent === 'host' ? match.host_roster : match.guest_roster) ?? roster;
    return new Set([
      ...roster.draftedCards.map((c) => c.id),
      ...opponentRoster.draftedCards.map((c) => c.id),
    ]);
  }, [match, opponent, roster]);

  const handlePrimary = async (finalRoster: SavedRoster, trade: ChallengeTrade | undefined) => {
    await onLock(finalRoster, trade);
  };

  return (
    <FrontOffice
      variant="inline"
      half={half}
      seed={seed}
      roster={roster}
      tradeOwnedIds={tradeOwnedIds}
      tradeSeed={tradeSeed}
      primaryLabel="Lock"
      primaryHint="Both are optional. The series resumes once both players have locked."
      header={
        <div>
          <span className="font-display text-2xl leading-none text-accent">Sideboard</span>
          <p className="mt-1 text-xs font-black uppercase tracking-widest text-ink-muted">
            Best of seven &middot; one trade &middot; both sides act blind
          </p>
        </div>
      }
      paceDisplay={
        <div className="flex w-full flex-col items-center gap-2 rounded-panel border border-line-strong bg-surface-raised py-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-ink-subtle">Series</p>
          <h1 className="font-display text-4xl leading-none text-ink-strong sm:text-5xl">
            {myWins}&ndash;{oppWins}
          </h1>
        </div>
      }
      onPrimary={handlePrimary}
    />
  );
}
