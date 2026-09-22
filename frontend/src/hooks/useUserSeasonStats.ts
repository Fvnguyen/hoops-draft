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
import { useCurrentProfile } from '@/components/AuthProvider';
import { computeUserSeasonStats, type UserSeasonStats } from '@/engine/season';
import { gradeForWins } from '@/engine/challenge';
import { useMatchList } from '@/hooks/useMatch';
import type { ChallengeRun } from '@/storage/types';

const EMPTY_STATS: UserSeasonStats = { seasonsPlayed: 0, wins: 0, losses: 0, avgWins: '0.0', avgLosses: '0.0' };

/** pvp_series D6: the signed-in user's Playoffs (PvP best-of-seven) record, from their
 *  `done` matches only (`winner_id` set). Forfeits, voids and declines don't count as a
 *  played series. */
export interface UserPlayoffsStats {
  series: number;
  wins: number;
  losses: number;
}

const EMPTY_PLAYOFFS_STATS: UserPlayoffsStats = { series: 0, wins: 0, losses: 0 };

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

export function useUserSeasonStats(): UserSeasonStats & { challenge: UserChallengeStats; playoffs: UserPlayoffsStats } {
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

  // pvp_series D6: `useMatchList` is the one shared list per page (see hooks/useMatch.ts) —
  // TopNav's own call here piggybacks on whatever load `/playoffs`/the bell already kicked
  // off rather than starting a second `match_expire` + select.
  const profile = useCurrentProfile();
  const userId = profile?.id ?? null;
  const { matches } = useMatchList();
  const playoffs: UserPlayoffsStats = userId ? computeUserPlayoffsStats(matches, userId) : EMPTY_PLAYOFFS_STATS;

  return { ...stats, challenge, playoffs };
}

/** Exported for `tests/unit/user-playoffs-stats.test.ts` — the pure aggregation, no hooks. */
export function computeUserPlayoffsStats(matches: { status: string; winner_id: string | null }[], userId: string): UserPlayoffsStats {
  const done = matches.filter((m) => m.status === 'done');
  if (done.length === 0) return EMPTY_PLAYOFFS_STATS;
  const wins = done.filter((m) => m.winner_id === userId).length;
  return { series: done.length, wins, losses: done.length - wins };
}
