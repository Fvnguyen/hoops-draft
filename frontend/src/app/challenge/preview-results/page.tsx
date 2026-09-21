'use client';

/**
 * challenge_mode T8 fixture page — same idea as `/challenge/preview` (T6, boards 2/3/6):
 * a synthetic, deterministic `ChallengeRun` frozen at `phase: 'done'`, so board 7 can be
 * screenshotted and compared against `docs/design/challenge_mode/Results.dc.html`
 * without a full 82-game playthrough. No storage, no engine simulation of real games.
 *
 *   /challenge/preview-results          the trade verdict tile, ghost line, everything
 *   /challenge/preview-results?trade=0  no front-office changes: no ghost line, no
 *                                       verdict tile (D10 — nothing to compare against)
 *
 * The win/loss pattern is hand-shaped (not simulated) so the longest-streak call-out
 * lands on a known window (13 straight, games 48-60) and the final record (72:10, A+
 * Historic) sits one grade below the ghost's would-have-been record (68:14, A Dynasty),
 * the same shape as the signed board.
 */

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildChallengeSchedule, challengeGameSeed, halfRange,
  type ChallengeGameResult, type ChallengeHalf, type ChallengePlayerTotals,
} from '@/engine/challenge';
import { getAllCards } from '@/engine/cards';
import type { ChallengeRun } from '@/storage/types';
import { ResultsScreen } from '@/components/challenge/Results';

const PREVIEW_SEED = 4242;

const EMPTY_TEAM_TOTALS = {
  points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
  threesMade: 0, threesAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0,
  turnovers: 0, assists: 0, offensiveRebounds: 0, defensiveRebounds: 0, steals: 0, blocks: 0,
};

/** `losses` are 0-based LOCAL indices into the half (0..40). Everything else is a win. */
function syntheticGames(half: 1 | 2, losses: number[]): ChallengeGameResult[] {
  const schedule = buildChallengeSchedule(PREVIEW_SEED);
  const { start, end } = halfRange(half);
  const lossSet = new Set(losses);
  return schedule.slice(start, end).map((entry, local) => {
    const won = !lossSet.has(local);
    return {
      index: entry.index,
      opponent: entry.opponent,
      isHome: entry.isHome,
      seed: challengeGameSeed(PREVIEW_SEED, entry.index),
      won,
      score: (won ? [112, 104] : [101, 110]) as [number, number],
      topPerformer: { playerId: '', playerName: '', points: 0, rebounds: 0, assists: 0 },
    };
  });
}

function halfFrom(half: 1 | 2, games: ChallengeGameResult[], playerTotals: ChallengePlayerTotals[]): ChallengeHalf {
  const wins = games.filter((g) => g.won).length;
  return {
    half,
    results: games.map((g) => (g.won ? 'W' : 'L')).join(''),
    games,
    wins,
    losses: games.length - wins,
    playerTotals,
    opponentTotals: EMPTY_TEAM_TOTALS,
  };
}

function totals(
  playerId: string, playerName: string,
  gamesPlayed: number, points: number, assists: number, rebounds: number, minutes: number, plusMinus: number,
): ChallengePlayerTotals {
  return {
    playerId, playerName, gamesPlayed, minutes, points, assists,
    offensiveRebounds: Math.round(rebounds * 0.4), defensiveRebounds: Math.round(rebounds * 0.6),
    possessions: 0, twoPointers: 0, threePointers: 0, andOnes: 0, turnovers: Math.round(gamesPlayed * 2.1),
    steals: Math.round(gamesPlayed * 1.1), blocks: Math.round(gamesPlayed * 0.5),
    fieldGoalsMade: 0, fieldGoalsAttempted: 0, threesMade: 0, threesAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0, plusMinus,
  };
}

/** Season MVP plus four rotation totals, split evenly across both halves so
 *  `mergePlayerTotals` reconstructs plausible season averages (24.6 PPG, 5.1 APG MVP). */
function seasonTotals(cards: ReturnType<typeof getAllCards>) {
  const names = cards.slice(0, 5).map((c) => ({ id: c.id, name: c.player.name }));
  const perHalf: [number, number, number, number, number][] = [
    // gp, points, assists, rebounds, minutes  (per half, x2 = season)
    [41, 1009, 209, 184, 1394],
    [41, 615, 123, 205, 1230],
    [41, 471, 82, 328, 1189],
    [41, 390, 287, 123, 1266],
    [41, 287, 61, 246, 902],
  ];
  return [1, 2].map((half) =>
    names.map(({ id, name }, i) => {
      const [gp, points, assists, rebounds, minutes] = perHalf[i];
      return totals(id, name, gp, points, assists, rebounds, minutes, half === 1 ? 123 : 123);
    }),
  ) as [ChallengePlayerTotals[], ChallengePlayerTotals[]];
}

function buildRun(withTrade: boolean): ChallengeRun {
  const cards = getAllCards();
  const [half1Totals, half2Totals] = seasonTotals(cards);

  // 41 games each: half 1 drops 4, half 2 (played) drops 6 — the 13-straight run sits at
  // local 6-18 of half 2, i.e. games 48-60.
  const half1Games = syntheticGames(1, [3, 10, 20, 30]);
  const half2Games = syntheticGames(2, [0, 5, 19, 25, 32, 38]);
  // Without the trade: 4 more losses late, none inside the streak window.
  const ghostGames = syntheticGames(2, [0, 5, 19, 25, 32, 33, 34, 35, 38]);

  const half1 = halfFrom(1, half1Games, half1Totals);
  const half2 = halfFrom(2, half2Games, half2Totals);
  const ghost = halfFrom(2, ghostGames, half2Totals);

  const rosterStub = {
    id: 'preview-roster', name: 'Preview roster', timestamp: new Date().toISOString(),
    draftedCards: cards.slice(0, 2), depthChartOrder: {}, activePlays: [], sessionId: null,
  };

  return {
    id: 'preview-run',
    sessionId: 'preview-session',
    rosterId: rosterStub.id,
    timestamp: rosterStub.timestamp,
    seed: PREVIEW_SEED,
    balanceVersion: 1,
    phase: 'done',
    rosterPre: rosterStub,
    rosterPost: withTrade ? { ...rosterStub, name: 'Preview roster (post-trade)' } : undefined,
    trade: withTrade ? { droppedCardId: cards[0].id, offeredCardIds: [cards[1].id], acquiredCardId: cards[1].id } : undefined,
    halves: [half1, half2],
    ghost: withTrade ? ghost : undefined,
  };
}

function Preview() {
  const params = useSearchParams();
  const withTrade = params.get('trade') !== '0';
  const run = useMemo(() => buildRun(withTrade), [withTrade]);

  return (
    <div data-theme="night" className="min-h-dvh-z bg-surface text-ink">
      <ResultsScreen run={run} />
    </div>
  );
}

export default function ChallengeResultsPreviewPage() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
