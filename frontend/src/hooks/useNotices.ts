'use client';

/**
 * season_lifecycle_notifications D6/D7: merges the static changelog feed with a synthetic
 * "season complete" notice per newly-finished season into one bell-icon feed. Read/
 * dismissed state is device-local (`GameStore.getMeta/setMeta`), not cloud-synced — see
 * D6 in the plan for why that's an acceptable tradeoff here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getGameStore } from '@/storage';
import { useLocalStoreReady, useStorageReady } from '@/components/StorageProvider';
import { getSeasonPhase } from '@/engine/season';
import { WHATS_NEW, type ChangelogEntry } from '@/data/whatsnew';
import { useCurrentProfile } from '@/components/AuthProvider';
import { useMatchList } from './useMatch';
import { loadMatchClient } from '@/lib/matchChannel';
import { TERMINAL_MATCH_STATUSES, matchHref, sideOf, type MatchSummary, type MatchSide } from '@/storage/matchTypes';

const LAST_SEEN_CHANGELOG_KEY = 'lastSeenChangelogId';
const DISMISSED_NOTICES_KEY = 'dismissedNoticeIds';

export interface NoticeAction {
  label: string;
  /** A navigation action (e.g. "Open" on a match notice) renders as a link instead. */
  href?: string;
  onClick?: () => void | Promise<void>;
  tone?: 'default' | 'danger';
}

export interface Notice {
  id: string;
  kind: 'changelog' | 'season-complete' | 'match-invite' | 'match-turn' | 'match-done';
  date: string;
  title: string;
  body: string;
  /** pvp_match D4: Accept/Decline on an invite notice. Only `match-invite` sets these
   *  today; every other kind keeps the plain Dismiss button TopNav already renders. */
  actions?: NoticeAction[];
}

/** pvp_match D4: which side I'm on for a match, or null if I'm not signed in / not a
 *  participant. Small wrapper so the notice builders below don't repeat the null check. */
function mySide(match: MatchSummary, userId: string | null): MatchSide | null {
  return sideOf(match, userId);
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
  const [localNotices, setLocalNotices] = useState<Notice[]>([]);
  const [unseenChangelogCount, setUnseenChangelogCount] = useState(0);
  const [latestUnseenEntry, setLatestUnseenEntry] = useState<ChangelogEntry | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const store = getGameStore();
    const [lastSeenChangelogId, dismissed, seasons] = await Promise.all([
      store.getMeta(LAST_SEEN_CHANGELOG_KEY),
      loadDismissedIds(),
      store.listSeasons(),
    ]);
    setDismissedIds(dismissed);

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

    setLocalNotices([...seasonNotices, ...changelogNotices]);
    setUnseenChangelogCount(unseenChangelog.length);
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

  // pvp_match D4: 'match-invite'/'match-turn'/'match-done', sourced from `useMatchList()`
  // (its own load on mount, plus `refetchMatches` after Accept/Decline below — no push).
  // `useMatchList` never throws (it catches internally and falls back to []), so a match
  // query failure never blocks the changelog/season half of the feed above.
  const profile = useCurrentProfile();
  const userId = profile?.id ?? null;
  const { matches, refetch: refetchMatches } = useMatchList();
  const router = useRouter();

  const respondToInvite = useCallback(async (match: MatchSummary, accept: boolean) => {
    try {
      const client = await loadMatchClient();
      // supabase-js reports RPC errors in the result rather than throwing.
      const { error } = await client.rpc('match_respond', { p_id: match.id, p_version: match.version, p_accept: accept });
      if (error) throw new Error(error.message);
      // Accepting starts the draft: go straight to the room.
      if (accept) router.push(`/playoffs/${match.id}/draft`);
    } catch (err) {
      console.error('Failed to respond to match invite:', err);
    } finally {
      void refetchMatches();
    }
  }, [refetchMatches, router]);

  const matchNotices = useMemo<Notice[]>(() => {
    if (!userId) return [];
    const built: Notice[] = [];
    for (const match of matches) {
      const side = mySide(match, userId);
      if (!side) continue;

      if (match.status === 'invited' && match.guest_id === userId) {
        built.push({
          id: `match-invite:${match.id}`,
          kind: 'match-invite',
          date: match.created_at,
          title: 'Playoffs invite',
          body: 'Someone challenged you to a head-to-head draft.',
          actions: [
            { label: 'Accept', onClick: () => respondToInvite(match, true) },
            { label: 'Decline', onClick: () => respondToInvite(match, false), tone: 'danger' },
          ],
        });
        continue;
      }

      if (TERMINAL_MATCH_STATUSES.includes(match.status)) {
        const doneId = `match-done:${match.id}`;
        if (match.status === 'done' && !dismissedIds.has(doneId)) {
          const won = match.winner_id === userId;
          built.push({
            id: doneId,
            kind: 'match-done',
            date: match.updated_at,
            title: won ? 'Series won' : 'Series complete',
            body: won ? 'You won the series. Check the results.' : 'Your playoffs series is over.',
            actions: [{ label: 'See results', href: matchHref(match) }],
          });
        }
        continue;
      }

      const myPicks = side === 'host' ? match.host_picks : match.guest_picks;
      const theirPicks = side === 'host' ? match.guest_picks : match.host_picks;
      const myLockedAt = side === 'host' ? match.host_locked_at : match.guest_locked_at;
      const mySeenGame = side === 'host' ? match.host_seen?.game ?? 0 : match.guest_seen?.game ?? 0;
      const myTurn =
        // Even counts are my turn too: both owe this pick (and at 0-0 it is how the host
        // learns the invite was accepted).
        (match.status === 'drafting' && myPicks.length <= theirPicks.length) ||
        (match.status === 'building' && !myLockedAt) ||
        ((match.status === 'series' || match.status === 'sideboard') && match.games.length > mySeenGame);
      if (myTurn) {
        built.push({
          id: `match-turn:${match.id}`,
          kind: 'match-turn',
          date: match.updated_at,
          title: 'Your move',
          body: match.status === 'drafting' && myPicks.length === theirPicks.length
            ? 'Your playoffs draft is live. Make your pick.'
            : match.status === 'series' || match.status === 'sideboard'
              ? 'A playoffs game is ready to watch.'
              : 'Your playoffs opponent is waiting on you.',
          actions: [{ label: 'Open', href: matchHref(match) }],
        });
      }
    }
    return built;
  }, [matches, userId, dismissedIds, respondToInvite]);

  const notices = useMemo(
    () => [...localNotices, ...matchNotices].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [localNotices, matchNotices],
  );
  const unreadCount = unseenChangelogCount + localNotices.filter((n) => n.kind === 'season-complete').length + matchNotices.length;

  return { notices, unreadCount, latestUnseenEntry, markChangelogSeen, dismissNotice };
}
