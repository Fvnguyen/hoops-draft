'use client';

/**
 * season_lifecycle_notifications D5: the signed-in user's aggregate season record,
 * shared by the Roster overview and the profile menu blurb. Loads once storage is
 * ready and refetches on window focus so a season finished in another tab shows up
 * without a hard refresh.
 */
import { useEffect, useState } from 'react';
import { getGameStore } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';
import { computeUserSeasonStats, type UserSeasonStats } from '@/engine/season';
import { gradeForWins } from '@/engine/challenge';
import type { ChallengeRun } from '@/storage/types';

const EMPTY_STATS: UserSeasonStats = { seasonsPlayed: 0, wins: 0, losses: 0, avgWins: '0.0', avgLosses: '0.0' };

/** challenge_loose_ends D4: 82:0 summary, kept separate from season stats (different
 *  scale of games) but surfaced alongside them. `best` is the completed run with the
 *  highest win total; undefined when no run has finished. */
export interface UserChallengeStats {
  completed: number;
  best?: { wins: number; losses: number; grade: string };
}

const EMPTY_CHALLENGE_STATS: UserChallengeStats = { completed: 0 };

function computeUserChallengeStats(runs: ChallengeRun[]): UserChallengeStats {
  const done = runs.filter((r) => r.phase === 'done');
  if (done.length === 0) return EMPTY_CHALLENGE_STATS;

  let best: { wins: number; losses: number; grade: string } | undefined;
  for (const run of done) {
    const wins = (run.halves[0]?.wins ?? 0) + (run.halves[1]?.wins ?? 0);
    const losses = (run.halves[0]?.losses ?? 0) + (run.halves[1]?.losses ?? 0);
    if (!best || wins > best.wins) {
      best = { wins, losses, grade: gradeForWins(wins).grade };
    }
  }
  return { completed: done.length, best };
}

export function useUserSeasonStats(): UserSeasonStats & { challenge: UserChallengeStats } {
  const ready = useStorageReady();
  const [stats, setStats] = useState<UserSeasonStats>(EMPTY_STATS);
  const [challenge, setChallenge] = useState<UserChallengeStats>(EMPTY_CHALLENGE_STATS);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      const store = getGameStore();
      const [seasons, runs] = await Promise.all([store.listSeasons(), store.listChallengeRuns()]);
      if (cancelled) return;
      setStats(computeUserSeasonStats(seasons));
      setChallenge(computeUserChallengeStats(runs));
    }

    load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [ready]);

  return { ...stats, challenge };
}
