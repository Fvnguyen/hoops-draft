'use client';

/**
 * pvp_series D5 (T4): the once-per-viewer coin flip that opens a series — who wins the
 * flip gets home court in games 1, 2, 5 and 7 (`homeFor`, `engine/playoffs.ts`). Purely a
 * deterministic function of the match seed, so both viewers see the same result without
 * either of them writing anything: the caller stores "seen" client-side (`getGameStore`
 * meta key `coinflip:<matchId>`) and never renders this again for that match.
 */
import { useEffect, useState } from 'react';
import { Button, Panel } from '@/components/ui';
import { coinFlip } from '@/engine/playoffs';
import type { CoinFlipProps } from './types';

export function CoinFlip({ seed, me, opponentName, onDone }: CoinFlipProps) {
  const winner = coinFlip(seed);
  const iWon = winner === me;
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 900);
    return () => clearTimeout(t);
  }, []);

  const label = opponentName ?? 'your opponent';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-surface-scrim p-4 backdrop-blur-sm"
      data-coin-flip
    >
      <Panel variant="inverse" padding="lg" className="w-full max-w-sm text-center shadow-2xl">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-ink-inverse-muted">Coin flip</p>
        <div
          className={
            'mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border-4 border-line-inverse text-3xl font-black uppercase ' +
            (revealed ? 'bg-accent text-accent-ink' : 'animate-spin bg-white/10 text-ink-inverse-muted')
          }
          style={{ fontFamily: 'var(--font-bebas)' }}
        >
          {revealed ? (iWon ? 'You' : abbrevName(label)) : '?'}
        </div>
        <h2 className="mb-2 font-display text-2xl uppercase tracking-tight text-ink-inverse">
          {revealed ? (iWon ? 'You won the flip' : `${label} won the flip`) : 'Flipping…'}
        </h2>
        {revealed && (
          <p className="mb-6 text-sm text-ink-inverse-muted">
            {iWon ? 'You' : label} get{iWon ? '' : 's'} home court in games 1, 2, 5 and 7.
          </p>
        )}
        <Button variant="primary" size="md" onClick={onDone} disabled={!revealed}>
          Let&apos;s go
        </Button>
      </Panel>
    </div>
  );
}

function abbrevName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}
