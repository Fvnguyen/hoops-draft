'use client';

/**
 * season_lifecycle_notifications D6/D7: merges the static changelog feed with a synthetic
 * "season complete" notice per newly-finished season into one bell-icon feed. Read/
 * dismissed state is device-local (`GameStore.getMeta/setMeta`), not cloud-synced — see
 * D6 in the plan for why that's an acceptable tradeoff here.
 */
import { useCallback, useEffect, useState } from 'react';
import { getGameStore } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';
import { getSeasonPhase } from '@/engine/season';
import { WHATS_NEW } from '@/data/whatsnew';

const LAST_SEEN_CHANGELOG_KEY = 'lastSeenChangelogId';
const DISMISSED_NOTICES_KEY = 'dismissedNoticeIds';

export interface Notice {
  id: string;
  kind: 'changelog' | 'season-complete';
  date: string;
  title: string;
  body: string;
}

async function loadDismissedIds(): Promise<Set<string>> {
  const raw = await getGameStore().getMeta(DISMISSED_NOTICES_KEY);
  if (!raw) return new Set();
  try {
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function useNotices(): {
  notices: Notice[];
  unreadCount: number;
  markChangelogSeen: () => void;
  dismissNotice: (id: string) => void;
} {
  const ready = useStorageReady();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    const store = getGameStore();
    const [lastSeenChangelogId, dismissed, seasons] = await Promise.all([
      store.getMeta(LAST_SEEN_CHANGELOG_KEY),
      loadDismissedIds(),
      store.listSeasons(),
    ]);

    const lastSeenIndex = lastSeenChangelogId ? WHATS_NEW.findIndex((e) => e.id === lastSeenChangelogId) : -1;
    const unseenChangelog = WHATS_NEW.slice(lastSeenIndex + 1);

    const seasonNotices: Notice[] = seasons
      .filter((s) => getSeasonPhase(s) === 'completed' && !dismissed.has(s.id))
      .map((s) => ({
        id: s.id,
        kind: 'season-complete' as const,
        date: s.timestamp,
        title: 'Season complete',
        body: `Your season finished — check the standings for the final record.`,
      }));

    const changelogNotices: Notice[] = unseenChangelog.map((e) => ({
      id: e.id,
      kind: 'changelog' as const,
      date: e.date,
      title: e.title,
      body: e.body,
    }));

    const all = [...seasonNotices, ...changelogNotices].sort((a, b) => (a.date < b.date ? 1 : -1));
    setNotices(all);
    setUnreadCount(unseenChangelog.length + seasonNotices.length);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [ready, load]);

  const markChangelogSeen = useCallback(() => {
    if (WHATS_NEW.length === 0) return;
    const latestId = WHATS_NEW[WHATS_NEW.length - 1].id;
    getGameStore().setMeta(LAST_SEEN_CHANGELOG_KEY, latestId).then(load);
  }, [load]);

  const dismissNotice = useCallback((id: string) => {
    loadDismissedIds().then((dismissed) => {
      dismissed.add(id);
      getGameStore().setMeta(DISMISSED_NOTICES_KEY, JSON.stringify([...dismissed])).then(load);
    });
  }, [load]);

  return { notices, unreadCount, markChangelogSeen, dismissNotice };
}
