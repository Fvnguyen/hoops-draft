'use client';

/**
 * pvp_series D5 (T4): the best-of-seven scoreboard strip on `/playoffs/[id]`. Seven slots,
 * home marks off `homeFor`, scores for played games with a "Watch" link to
 * `/playoffs/[id]/game/[n]`, and "Waiting for <name>" / "Sideboard open" for what's next.
 * Never renders anything about the opponent's roster — only the shared, already-public
 * facts every `MatchGame` carries (scores, who was home).
 */
import Link from 'next/link';
import { Play, Hourglass } from 'lucide-react';
import { coinFlip, homeFor, seriesState, SERIES_MAX_GAMES } from '@/engine/playoffs';
import type { MatchGame } from '@/storage/matchTypes';
import { Panel } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SeriesStripProps } from './types';

export function SeriesStrip({ match, me, opponentName }: SeriesStripProps) {
  const flipWinner = coinFlip(match.seed);
  const sideboardHappened = Boolean(match.sideboard.host && match.sideboard.guest);
  const state = seriesState(match.games, sideboardHappened);
  const myWins = me === 'host' ? state.hostWins : state.guestWins;
  const oppWins = me === 'host' ? state.guestWins : state.hostWins;
  const opponentLabel = opponentName ?? 'your opponent';
  const gamesById = new Map<number, MatchGame>(match.games.map((g) => [g.game, g]));

  const nextGameNumber = state.nextGame;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <span className="font-display text-4xl uppercase tracking-tight text-ink">{myWins}</span>
        <span className="text-sm font-bold uppercase tracking-widest text-ink-subtle">You — {opponentLabel}</span>
        <span className="font-display text-4xl uppercase tracking-tight text-ink">{oppWins}</span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: SERIES_MAX_GAMES }, (_, i) => i + 1).map((n) => {
          const game = gamesById.get(n);
          const homeSide = homeFor(n, flipWinner);
          const homeIsMe = homeSide === me;
          const isNext = n === nextGameNumber;
          const past = state.over ? n > match.games.length : false;

          return (
            <Panel
              key={n}
              variant={game ? 'raised' : 'sunken'}
              padding="sm"
              className={cn(
                'flex flex-col items-center gap-1 text-center',
                isNext && !game && 'border-accent/60',
              )}
              data-game-slot={n}
            >
              <div className="text-xs font-black uppercase tracking-widest text-ink-subtle">G{n}</div>
              <div className="text-xs font-bold uppercase text-ink-subtle">
                {homeIsMe ? 'Home' : 'Away'}
              </div>
              {game ? (
                <Link
                  href={`/playoffs/${match.id}/game/${n}`}
                  className="flex min-h-control w-full flex-col items-center justify-center gap-0.5 text-xs font-bold text-ink hover:text-accent"
                >
                  <span className="font-mono">
                    {me === 'host' ? game.score.host : game.score.guest}
                    {'–'}
                    {me === 'host' ? game.score.guest : game.score.host}
                  </span>
                  <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-accent">
                    <Play size={10} /> Watch
                  </span>
                </Link>
              ) : past || state.over ? (
                <span className="text-xs text-ink-subtle">—</span>
              ) : isNext && match.status === 'sideboard' ? (
                <span className="flex flex-col items-center gap-0.5 text-xs font-bold uppercase text-warn">
                  <Hourglass size={10} /> Sideboard open
                </span>
              ) : isNext ? (
                <span className="flex flex-col items-center gap-0.5 text-xs text-ink-subtle">
                  <Hourglass size={10} /> Waiting for {opponentLabel}
                </span>
              ) : (
                <span className="text-xs text-ink-subtle">—</span>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
