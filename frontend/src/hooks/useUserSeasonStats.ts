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

const EMPTY_STATS: UserSeasonStats = { seasonsPlayed: 0, wins: 0, losses: 0, avgWins: '0.0', avgLosses: '0.0' };

export function useUserSeasonStats(): UserSeasonStats {
  const ready = useStorageReady();
  const [stats, setStats] = useState<UserSeasonStats>(EMPTY_STATS);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      const store = getGameStore();
      const seasons = await store.listSeasons();
      if (!cancelled) setStats(computeUserSeasonStats(seasons));
    }

    load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [ready]);

  return stats;
}
