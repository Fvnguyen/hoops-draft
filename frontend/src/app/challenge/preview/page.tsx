'use client';

/**
 * challenge_mode T6 fixture page — same idea as `/theater-preview` and
 * `/pack-opener-preview`: the real `ChallengeReel` over a synthetic, deterministic half,
 * frozen at a chosen game, so boards 2/3/6 can be screenshotted and compared without
 * drafting a team or signing in. No storage, no engine simulation.
 *
 *   /challenge/preview?at=6    board 2  — game 7, crisp flaps, readable record
 *   /challenge/preview?at=28   board 3  — game 29, flaps blurred, 10-straight call-out
 *   /challenge/preview?at=79   board 6  — game 80, final stretch, tier ladder
 *   &play=1                    let it actually run from `at` instead of freezing
 *
 * The W/L string is hand-shaped to reproduce the boards' own states (5-1 after six games,
 * a ten-game streak landing on game 29), because the point of this page is a side-by-side
 * against the signed design, not a plausible season.
 */

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildChallengeSchedule, challengeGameSeed, halfRange, type ChallengeHalf } from '@/engine/challenge';
import { CHALLENGE_GAMES } from '@/engine/balance';
import { ChallengeReel } from '@/components/challenge/ChallengeReel';

const PREVIEW_SEED = 42;

/** 82 results: the boards' opening week, a ten-game streak ending on game 29, then a
 *  strong-but-not-perfect run so the ladder lands in Dynasty with Historic in reach. */
function previewResults(): string {
  const out: string[] = [];
  for (let i = 0; i < CHALLENGE_GAMES; i++) {
    if (i < 6) out.push('WWLWWW'[i]);                     // 5-1 after six (board 2)
    else if (i >= 18 && i <= 27) out.push('W');           // ten straight, called on game 29
    else if (i === 17) out.push('L');                     // ...and nothing before it
    else out.push(i % 7 === 3 ? 'L' : 'W');
  }
  return out.join('');
}

function syntheticHalf(half: 1 | 2, results: string): ChallengeHalf {
  const schedule = buildChallengeSchedule(PREVIEW_SEED);
  const { start, end } = halfRange(half);
  const games = schedule.slice(start, end).map((entry) => {
    const won = results[entry.index] === 'W';
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
  const slice = results.slice(start, end);
  const wins = [...slice].filter((r) => r === 'W').length;
  return {
    half,
    results: slice,
    games,
    wins,
    losses: slice.length - wins,
    playerTotals: [],
    opponentTotals: {
      points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
      threesMade: 0, threesAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0,
      turnovers: 0, assists: 0, offensiveRebounds: 0, defensiveRebounds: 0, steals: 0, blocks: 0,
    },
  };
}

function Preview() {
  const params = useSearchParams();
  const at = Math.max(0, Math.min(CHALLENGE_GAMES - 1, Number(params.get('at') ?? 6)));
  const paused = params.get('play') !== '1';

  const { half, prior, cursor } = useMemo(() => {
    const results = previewResults();
    const mid = halfRange(1).end;
    if (at < mid) {
      return { half: syntheticHalf(1, results), prior: null, cursor: at };
    }
    return { half: syntheticHalf(2, results), prior: syntheticHalf(1, results), cursor: at - mid };
  }, [at]);

  const priorStreak = prior ? (prior.results.match(/W*$/)?.[0].length ?? 0) : 0;

  return (
    <div data-theme="night" className="min-h-dvh-z bg-surface text-ink">
      <ChallengeReel
        key={`${at}-${paused}`}
        half={half}
        schedule={buildChallengeSchedule(PREVIEW_SEED)}
        priorWins={prior?.wins ?? 0}
        priorLosses={prior?.losses ?? 0}
        priorStreak={priorStreak}
        initialCursor={cursor}
        paused={paused}
        onComplete={() => {}}
      />
    </div>
  );
}

export default function ChallengePreviewPage() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
