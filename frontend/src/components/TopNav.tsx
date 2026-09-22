'use client';
import { useRouter, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BarChart3, Bell, Cloud, CloudOff, Home, LogOut, RefreshCw, Settings, ShieldCheck, Trophy, UserCircle, Wrench } from 'lucide-react';
import { useAuthStatus, useCurrentProfile, useRefreshAuth, type CurrentProfile } from './AuthProvider';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useNotices, type Notice } from '@/hooks/useNotices';
import { useUserSeasonStats } from '@/hooks/useUserSeasonStats';
import { SyncConflictPrompt } from './SyncConflictPrompt';
import { isBareRoute, isGameRoute } from '@/lib/routes';
import { cn } from '@/lib/cn';
import { Button, IconButton, Menu, MenuItem, MenuLabel, MenuPanel, MenuSection, MenuTrigger, Panel } from '@/components/ui';

const LEAVE_CONFIRM_MESSAGE = 'Are you sure you want to leave? Unsaved edits or ongoing drafts will be lost.';

/** accounts_cloud_saves D7: a small non-blocking pill next to the profile menu — never a
 *  spinner that blocks interaction. Conflicts are surfaced separately by
 *  SyncConflictPrompt, not folded into this label. `inverse` is for the dark home hero,
 *  which has no opaque bar behind it to provide contrast. */
function SyncIndicator({ inverse = false }: { inverse?: boolean }) {
  const status = useSyncStatus();
  const mutedClass = inverse ? 'text-ink-inverse-muted' : 'text-ink-muted';

  if (status.state === 'offline') {
    return (
      <span className={cn('flex items-center gap-1 text-xs font-bold uppercase tracking-wide', mutedClass)} title="No connection — changes will sync when you're back online">
        <CloudOff className="h-3.5 w-3.5" /> Offline{status.pending > 0 ? `, ${status.pending} pending` : ''}
      </span>
    );
  }
  if (status.conflicts.length > 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-warn" title="A roster changed on another device">
        <RefreshCw className="h-3.5 w-3.5" /> {status.conflicts.length} conflict{status.conflicts.length > 1 ? 's' : ''}
      </span>
    );
  }
  if (status.state === 'syncing') {
    return (
      <span className={cn('flex items-center gap-1 text-xs font-bold uppercase tracking-wide', mutedClass)}>
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing…
      </span>
    );
  }
  return (
    <span className={cn('flex items-center gap-1 text-xs font-bold uppercase tracking-wide', mutedClass)}>
      <Cloud className="h-3.5 w-3.5" /> Synced
    </span>
  );
}

/** season_lifecycle_notifications D8: the notice rows shared by the standalone
 *  NotificationBell dropdown and the game route's combined menu. */
function NoticesList({ notices, dismissNotice }: { notices: Notice[]; dismissNotice: (id: string) => void }) {
  if (notices.length === 0) {
    return <p className="px-3 py-4 text-center text-sm text-ink-subtle">You&apos;re all caught up.</p>;
  }
  return (
    <>
      {notices.map((notice) => (
        <div key={notice.id} className="min-h-control px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-ink">{notice.title}</p>
            {notice.kind === 'season-complete' && (
              <Button
                variant="ghost"
                onClick={() => dismissNotice(notice.id)}
                // Keeps the 44px control height (D2); only the type is toned down.
                className="-my-2 shrink-0 px-2 text-xs font-bold normal-case tracking-normal text-ink-subtle hover:text-ink"
              >
                Dismiss
              </Button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{notice.body}</p>
          {/* pvp_match D4: Accept/Decline on a 'match-invite' notice. */}
          {notice.actions && notice.actions.length > 0 && (
            <div className="mt-2 flex gap-2">
              {notice.actions.map((action) => action.href ? (
                <Link
                  key={action.label}
                  href={action.href}
                  className="inline-flex min-h-control items-center rounded-md border border-line bg-surface-raised px-3 text-xs font-bold text-ink hover:bg-surface-sunken"
                >
                  {action.label}
                </Link>
              ) : (
                <Button
                  key={action.label}
                  variant={action.tone === 'danger' ? 'ghost' : 'secondary'}
                  onClick={() => void action.onClick?.()}
                  className={cn('px-2 py-1 text-xs normal-case tracking-normal', action.tone === 'danger' && 'text-danger hover:text-danger')}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** season_lifecycle_notifications D8: bell with its own dropdown, built on the Menu
 *  primitive. `inverse` for the home hero. */
function NotificationBell({ notices, unreadCount, markChangelogSeen, dismissNotice, inverse = false }: {
  notices: Notice[];
  unreadCount: number;
  markChangelogSeen: () => void;
  dismissNotice: (id: string) => void;
  inverse?: boolean;
}) {
  return (
    <Menu onOpen={markChangelogSeen}>
      <MenuTrigger label="Notifications" inverse={inverse} className="relative">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />}
      </MenuTrigger>
      <MenuPanel width="w-80">
        <NoticesList notices={notices} dismissNotice={dismissNotice} />
      </MenuPanel>
    </Menu>
  );
}

/** render_and_engine_perf D11: the name/email/season-record blurb shown both in the
 *  desktop `ProfileMenu` dropdown and in the game route's combined menu (`TopNav`'s
 *  `isGame` branch below) — identical markup in both places, previously duplicated by
 *  hand. Takes `stats` as a prop rather than calling `useUserSeasonStats()` itself: the
 *  two call sites are mutually exclusive branches of the same `TopNav` render (only one
 *  of `ProfileMenu`/the game menu ever mounts at once), so one hook call at the top of
 *  `TopNav` — already unconditional there — covers both instead of each one re-fetching
 *  the same storage read independently. */
function ProfileSummary({ profile, stats }: { profile: CurrentProfile; stats: ReturnType<typeof useUserSeasonStats> }) {
  return (
    <>
      <p className="px-3 py-2 font-bold text-ink">{profile.display_name}</p>
      <p className="truncate px-3 text-xs text-ink-subtle">{profile.email}</p>
      {stats.seasonsPlayed > 0 && (
        <p className="px-3 pb-2 pt-1 text-xs text-ink-muted">
          {stats.seasonsPlayed} season{stats.seasonsPlayed === 1 ? '' : 's'} · {stats.wins}-{stats.losses} · {stats.avgWins} W avg
        </p>
      )}
      {stats.challenge.completed > 0 && stats.challenge.best && (
        <p className="px-3 pb-2 pt-1 text-xs text-ink-muted">
          82:0 Challenges: {stats.challenge.completed} completed, best {stats.challenge.best.wins}-{stats.challenge.best.losses} ({stats.challenge.best.grade})
        </p>
      )}
    </>
  );
}

/** The dropdown itself — name/email, season record, admin tools when applicable, sign
 *  out. `inverse` swaps to light text for use over the home page's dark hero. */
function ProfileMenu({ profile, stats, onSignOut, inverse = false }: { profile: CurrentProfile; stats: ReturnType<typeof useUserSeasonStats>; onSignOut: () => void; inverse?: boolean }) {
  return (
    <Menu>
      <MenuTrigger label="Profile menu" inverse={inverse}>
        <UserCircle className="h-7 w-7" />
        <span className="hidden max-w-32 truncate text-xs font-bold uppercase tracking-wider sm:block">{profile.display_name}</span>
      </MenuTrigger>
      <MenuPanel>
        <MenuSection>
          <ProfileSummary profile={profile} stats={stats} />
        </MenuSection>
        <MenuSection>
          <MenuItem href="/playoffs" icon={<Trophy className="h-4 w-4" />}>Playoffs</MenuItem>
          <MenuItem href="/debug" icon={<Wrench className="h-4 w-4" />}>Debug export</MenuItem>
        </MenuSection>
        {profile.role === 'ADMIN' && (
          <MenuSection>
            <MenuLabel>Admin tools</MenuLabel>
            <MenuItem href="/admin/users" icon={<ShieldCheck className="h-4 w-4" />}>Account approvals</MenuItem>
            <MenuItem href="/admin/analytics" icon={<BarChart3 className="h-4 w-4" />}>Analytics</MenuItem>
            <MenuItem href="/data" icon={<Wrench className="h-4 w-4" />}>Data viewer</MenuItem>
            <MenuItem href="/deckbuilder-test" icon={<Wrench className="h-4 w-4" />}>Deckbuilder sandbox</MenuItem>
            <MenuItem href="/test-ui" icon={<Wrench className="h-4 w-4" />}>Test UI</MenuItem>
            <MenuItem href="/pack-opener-preview" icon={<Wrench className="h-4 w-4" />}>Pack opener preview</MenuItem>
          </MenuSection>
        )}
        <MenuItem tone="danger" onClick={onSignOut} icon={<LogOut className="h-4 w-4" />}>Sign out</MenuItem>
      </MenuPanel>
    </Menu>
  );
}

/** Fixed-width slot so the loading placeholder and the real control occupy exactly the
 *  same space — the point of D6 is that nothing shifts when the profile arrives. */
function ClusterSlot({ width, children }: { width: string; children: ReactNode }) {
  return <div className={cn('flex shrink-0 items-center justify-end', width)}>{children}</div>;
}

function ClusterPlaceholders({ inverse = false }: { inverse?: boolean }) {
  return (
    <div aria-hidden data-testid="top-nav-cluster" className="flex items-center gap-3">
      <ClusterSlot width="w-20">
        <Panel variant={inverse ? 'inverse' : 'sunken'} padding="none" className="h-4 w-full animate-pulse" />
      </ClusterSlot>
      <ClusterSlot width="w-11">
        <Panel variant={inverse ? 'inverse' : 'sunken'} padding="none" className="size-control animate-pulse rounded-full" />
      </ClusterSlot>
      <ClusterSlot width="w-11 sm:w-36">
        <Panel variant={inverse ? 'inverse' : 'sunken'} padding="none" className="size-control animate-pulse rounded-full" />
      </ClusterSlot>
    </div>
  );
}

/** The auth cluster region (D6): always the same shape regardless of auth status, so the
 *  bar never reflows once the `/api/auth/me` fetch settles. `loading` reserves the same
 *  space `signed-in` will use; `signed-out` renders nothing. */
function AuthCluster({ profile, status, notices, stats, onSignOut, inverse = false }: {
  profile: CurrentProfile | null;
  status: ReturnType<typeof useAuthStatus>;
  notices: ReturnType<typeof useNotices>;
  stats: ReturnType<typeof useUserSeasonStats>;
  onSignOut: () => void;
  inverse?: boolean;
}) {
  if (status === 'loading') return <ClusterPlaceholders inverse={inverse} />;
  if (status !== 'signed-in' || !profile) return null;
  return (
    <div data-testid="top-nav-cluster" className="flex items-center gap-3">
      <ClusterSlot width="w-20"><SyncIndicator inverse={inverse} /></ClusterSlot>
      <ClusterSlot width="w-11">
        <NotificationBell
          notices={notices.notices}
          unreadCount={notices.unreadCount}
          markChangelogSeen={notices.markChangelogSeen}
          dismissNotice={notices.dismissNotice}
          inverse={inverse}
        />
      </ClusterSlot>
      <ClusterSlot width="w-11 sm:w-36"><ProfileMenu profile={profile} stats={stats} onSignOut={onSignOut} inverse={inverse} /></ClusterSlot>
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useCurrentProfile();
  const status = useAuthStatus();
  const refreshAuth = useRefreshAuth();
  const syncStatus = useSyncStatus();
  const notices = useNotices();
  const seasonStats = useUserSeasonStats();
  const isGame = isGameRoute(pathname);

  function goHome() {
    if (isGame && !window.confirm(LEAVE_CONFIRM_MESSAGE)) return;
    router.push('/');
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // sync_outbox D1: soft navigation (push + refresh, no remount) — without this the
    // profile context keeps showing the old user until a hard reload.
    await refreshAuth({ identityChanged: true });
    router.push('/login');
    router.refresh();
  }

  const getPageTitle = () => {
    if (pathname.includes('/rosters')) return 'My Rosters';
    if (pathname.includes('/data')) return 'Database';
    return '';
  };

  // Login/signup/pending: AuthLayout's own dark shell, no room for a bar (unchanged).
  if (isBareRoute(pathname) && pathname !== '/') return null;

  if (isGame) {
    return (
      <>
        <Menu onOpen={notices.markChangelogSeen} className="fixed right-4 top-4 z-50">
          <MenuTrigger
            label="Game menu"
            className="rounded-full border border-line bg-surface-raised text-ink-muted shadow-sm hover:bg-surface-sunken hover:text-ink"
          >
            <Settings className="h-5 w-5" />
          </MenuTrigger>
          <MenuPanel align="right" width="w-80">
            <MenuSection>
              <MenuItem onClick={goHome} icon={<Home className="h-4 w-4" />}>Home</MenuItem>
            </MenuSection>
            <MenuSection>
              <div className="flex min-h-control items-center px-3"><SyncIndicator /></div>
            </MenuSection>
            <MenuSection>
              <MenuLabel>Notifications</MenuLabel>
              <NoticesList notices={notices.notices} dismissNotice={notices.dismissNotice} />
            </MenuSection>
            {status === 'signed-in' && profile && (
              <MenuSection>
                <ProfileSummary profile={profile} stats={seasonStats} />
                <MenuItem href="/playoffs" icon={<Trophy className="h-4 w-4" />}>Playoffs</MenuItem>
                <MenuItem href="/debug" icon={<Wrench className="h-4 w-4" />}>Debug export</MenuItem>
                {profile.role === 'ADMIN' && (
                  <>
                    <MenuLabel>Admin tools</MenuLabel>
                    <MenuItem href="/admin/users" icon={<ShieldCheck className="h-4 w-4" />}>Account approvals</MenuItem>
                    <MenuItem href="/admin/analytics" icon={<BarChart3 className="h-4 w-4" />}>Analytics</MenuItem>
                    <MenuItem href="/data" icon={<Wrench className="h-4 w-4" />}>Data viewer</MenuItem>
                  </>
                )}
              </MenuSection>
            )}
            {status === 'signed-in' && profile && (
              <MenuItem tone="danger" onClick={signOut} icon={<LogOut className="h-4 w-4" />}>Sign out</MenuItem>
            )}
          </MenuPanel>
        </Menu>
        {status === 'signed-in' && <SyncConflictPrompt conflicts={syncStatus.conflicts} />}
      </>
    );
  }

  if (pathname === '/') {
    return (
      <>
        <div className="fixed right-4 top-4 z-50">
          <AuthCluster profile={profile} status={status} notices={notices} stats={seasonStats} onSignOut={signOut} inverse />
        </div>
        {status === 'signed-in' && <SyncConflictPrompt conflicts={syncStatus.conflicts} />}
      </>
    );
  }

  return (
    <>
      <div data-testid="top-nav-bar" className="fixed left-0 top-0 z-50 flex h-nav w-full items-center border-b border-line bg-surface/90 px-4 shadow-sm backdrop-blur-md">
        <IconButton label="Back to Home" variant="raised" onClick={goHome}>
          <Home className="h-4 w-4" />
        </IconButton>
        <div className="ml-4 flex-1">
          <h1 className="font-display text-xl uppercase tracking-tight text-ink">{getPageTitle()}</h1>
        </div>
        <AuthCluster profile={profile} status={status} notices={notices} stats={seasonStats} onSignOut={signOut} />
      </div>
      {status === 'signed-in' && <SyncConflictPrompt conflicts={syncStatus.conflicts} />}
    </>
  );
}
