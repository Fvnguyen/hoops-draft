'use client';

/**
 * pvp_series D6 (T6): the series result screen. Shown once `match.status === 'done'`.
 *
 * Line (e.g. "4-2") from the viewer's side, per-game scores with home marks, a series MVP
 * by box score (points/rebounds/assists summed across `match.games[].box`, both sides —
 * season-average-style numbers only, NEVER OVR or the seven engine ratings, per AGENTS.md),
 * and a Rematch button for the loser only. The winner sees a note that the loser can call
 * a rematch instead.
 *
 * `onRematch` is supplied by the page: it sends the `match_invite` RPC and routes to
 * `/playoffs` once it resolves (see `storage/matchTypes.ts` D6 comment on the prop). This
 * component only renders the button and its local busy/error state around that call.
 */
import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { PlayerBoxScore } from '@/engine/gameTypes';
import { seriesState } from '@/engine/playoffs';
import type { MatchGame } from '@/storage/matchTypes';
import type { SeriesResultsProps } from './types';
import { Button, Panel } from '@/components/ui';
import { cn } from '@/lib/cn';

const one = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : '0.0');

/** A short display name — mirrors `engine/challengeAdvice.ts`'s `shortName` (first initial
 *  + last name) without importing a challenge-only module into the playoffs surface. */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

interface PlayerTotals {
  playerId: string;
  playerName: string;
  games: number;
  points: number;
  rebounds: number;
  assists: number;
}

/** Sums box scores for every player across every game, both sides — a series MVP can come
 *  from either team, same as a real Finals MVP usually (never assumed) does not have to. */
function seriesTotals(games: MatchGame[]): PlayerTotals[] {
  const byPlayer = new Map<string, PlayerTotals>();
  const add = (box: PlayerBoxScore[]) => {
    for (const b of box) {
      const existing = byPlayer.get(b.playerId) ?? {
        playerId: b.playerId,
        playerName: b.playerName,
        games: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
      };
      existing.games += 1;
      existing.points += b.points;
      existing.rebounds += b.offensiveRebounds + b.defensiveRebounds;
      existing.assists += b.assists;
      byPlayer.set(b.playerId, existing);
    }
  };
  for (const g of games) {
    add(g.box.host);
    add(g.box.guest);
  }
  return [...byPlayer.values()];
}

/** A simple composite box-score score: points weighted heaviest, boards and assists count
 *  too, so a stat-stuffing role player can edge out a volume scorer on an off night. */
function mvpScore(t: PlayerTotals): number {
  return t.points + 1.2 * t.rebounds + 1.5 * t.assists;
}

export function SeriesResults({ match, me, opponentName, onRematch }: SeriesResultsProps) {
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  const state = useMemo(() => seriesState(match.games, true), [match.games]);
  const myWins = me === 'host' ? state.hostWins : state.guestWins;
  const theirWins = me === 'host' ? state.guestWins : state.hostWins;

  const winnerSide = match.winner_id === match.host_id ? 'host' : match.winner_id === match.guest_id ? 'guest' : null;
  const iAmWinner = winnerSide !== null && winnerSide === me;
  const opponent = opponentName ?? 'your opponent';

  const mvp = useMemo(() => {
    const totals = seriesTotals(match.games);
    if (totals.length === 0) return null;
    return totals.reduce((best, t) => (mvpScore(t) > mvpScore(best) ? t : best), totals[0]);
  }, [match.games]);

  const games = [...match.games].sort((a, b) => a.game - b.game);

  async function handleRematch() {
    setRematching(true);
    setRematchError(null);
    try {
      await onRematch();
    } catch (err) {
      setRematchError(err instanceof Error ? err.message : 'Could not send a rematch invite.');
    } finally {
      setRematching(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav text-center">
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-ink-subtle">Playoffs — Final</p>
      <h1 className={cn('mb-1 font-display text-5xl uppercase tracking-tight', iAmWinner ? 'text-accent' : 'text-ink')}>
        {iAmWinner ? 'Series won' : 'Series lost'}
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        vs {opponent}
      </p>

      <Panel variant="raised" className="mb-6 flex flex-col items-center gap-1">
        <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">Final</span>
        <span className="font-display text-6xl leading-none text-ink-strong">{myWins}-{theirWins}</span>
        <span className="text-xs text-ink-muted">You {myWins}, {opponent} {theirWins}</span>
      </Panel>

      <Panel variant="sunken" padding="sm" className="mb-6 text-left">
        <p className="mb-2 px-1 text-xs font-black uppercase tracking-widest text-ink-subtle">Game by game</p>
        <div className="flex flex-col gap-1">
          {games.map((g) => {
            const myScore = me === 'host' ? g.score.host : g.score.guest;
            const theirScore = me === 'host' ? g.score.guest : g.score.host;
            const won = myScore > theirScore;
            const homeIsMe = g.home === me;
            return (
              <div key={g.game} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm">
                <span className="text-ink-subtle">Game {g.game}</span>
                <span className={cn('font-bold', won ? 'text-positive' : 'text-ink-muted')}>
                  {myScore}-{theirScore} {won ? 'W' : 'L'}
                </span>
                <span className="text-xs text-ink-subtle">
                  {homeIsMe ? 'Home' : 'Away'}
                  {g.overtimePeriods > 0 ? ` · ${g.overtimePeriods}OT` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {mvp && (
        <Panel variant="raised" className="mb-6 flex flex-col items-center gap-1">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-ink-subtle">
            <Trophy className="h-3.5 w-3.5" /> Series MVP
          </span>
          <span className="font-display truncate text-4xl leading-none text-ink-strong">{shortName(mvp.playerName)}</span>
          <span className="text-xs text-ink-muted">
            {one(mvp.points / mvp.games)} PPG, {one(mvp.rebounds / mvp.games)} RPG, {one(mvp.assists / mvp.games)} APG over {mvp.games} game{mvp.games === 1 ? '' : 's'}
          </span>
        </Panel>
      )}

      {iAmWinner ? (
        <p className="text-sm text-ink-muted">{opponent} can call a rematch — it&apos;ll show up in your invites.</p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Button variant="primary" size="lg" onClick={() => void handleRematch()} disabled={rematching}>
            {rematching ? 'Sending rematch…' : 'Rematch'}
          </Button>
          {rematchError && <p role="alert" className="text-xs text-danger">{rematchError}</p>}
        </div>
      )}
    </main>
  );
}
