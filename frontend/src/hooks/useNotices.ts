'use client';

/**
 * season_lifecycle_notifications D6/D7: merges the static changelog feed with a synthetic
 * "season complete" notice per newly-finished season into one bell-icon feed. Read/
 * dismissed state is device-local (`GameStore.getMeta/setMeta`), not cloud-synced — see
 * D6 in the plan for why that's an acceptable tradeoff here.
 */
import { useCallback, useEffect, useState } from 'react';
import { getGameStore } from '@/storage';
import { useLocalStoreReady, useStorageReady } from '@/components/StorageProvider';
import { getSeasonPhase } from '@/engine/season';
import { WHATS_NEW, type ChangelogEntry } from '@/data/whatsnew';

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
  /** whats_new_splash: the most recent unseen release, for the full-screen splash. Null
   *  once the user has seen (or dismissed) the latest entry. */
  latestUnseenEntry: ChangelogEntry | null;
  markChangelogSeen: () => void;
  dismissNotice: (id: string) => void;
} {
  // Local readiness, not full: this feed is device-local (see the file header) and purely
  // informational, so it must not wait on the cloud pull — that delay is what made the
  // What's New splash land in the draft room instead of on the home page.
  const ready = useLocalStoreReady();
  // The season half of the feed is OWNED data, and the stores filter every read by owner
  // (sync_outbox D2): at local readiness no owner is applied yet, so those rows only show
  // up once full readiness flips — which it also does again after a login, a logout or an
  // account switch. Reloading then keeps the bell from showing the previous user's seasons.
  const ownerReady = useStorageReady();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestUnseenEntry, setLatestUnseenEntry] = useState<ChangelogEntry | null>(null);

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
      body: e.subtitle,
    }));

    const all = [...seasonNotices, ...changelogNotices].sort((a, b) => (a.date < b.date ? 1 : -1));
    setNotices(all);
    setUnreadCount(unseenChangelog.length + seasonNotices.length);
    setLatestUnseenEntry(unseenChangelog.length > 0 ? unseenChangelog[unseenChangelog.length - 1] : null);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Catch explicitly: `load()` fans out over three store reads, and an unhandled
    // rejection here used to leave the feed silently empty — no bell badge, no splash,
    // no error anywhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((err) => console.error('Failed to load notices:', err));
  }, [ready, ownerReady, load]);

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

  return { notices, unreadCount, latestUnseenEntry, markChangelogSeen, dismissNotice };
}
