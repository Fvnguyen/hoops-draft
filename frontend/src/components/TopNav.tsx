'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Cloud, CloudOff, Home, LogOut, RefreshCw, ShieldCheck, UserCircle, Wrench } from 'lucide-react';
import { useCurrentProfile, type CurrentProfile } from './AuthProvider';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { SyncConflictPrompt } from './SyncConflictPrompt';

/** accounts_cloud_saves D7: a small non-blocking pill next to the profile menu — never a
 *  spinner that blocks interaction. Conflicts are surfaced separately by
 *  SyncConflictPrompt, not folded into this label. */
function SyncIndicator({ dark = false }: { dark?: boolean }) {
  const status = useSyncStatus();
  const textClass = dark ? 'text-white/70' : 'text-stone-500';

  if (status.state === 'offline') {
    return (
      <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${textClass}`} title="No connection — changes will sync when you're back online">
        <CloudOff className="h-3.5 w-3.5" /> Offline{status.pending > 0 ? `, ${status.pending} pending` : ''}
      </span>
    );
  }
  if (status.conflicts.length > 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-500" title="A roster changed on another device">
        <RefreshCw className="h-3.5 w-3.5" /> {status.conflicts.length} conflict{status.conflicts.length > 1 ? 's' : ''}
      </span>
    );
  }
  if (status.state === 'syncing') {
    return (
      <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${textClass}`}>
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing…
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${textClass}`}>
      <Cloud className="h-3.5 w-3.5" /> Synced
    </span>
  );
}

/** The dropdown itself — name/email, admin tools when applicable, sign out.
 *  `dark` swaps to light text for use over the home page's dark hero, where
 *  there's no opaque bar behind it to provide contrast. */
function ProfileMenu({ profile, onSignOut, dark = false }: { profile: CurrentProfile; onSignOut: () => void; dark?: boolean }) {
  return (
    <details className="relative group">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-full p-1.5 hover:bg-white/10 ${dark ? 'text-white' : 'text-stone-600 hover:bg-white'}`}
        title="Profile menu"
      >
        <UserCircle className="h-7 w-7" />
        <span className="hidden max-w-32 truncate text-xs font-bold uppercase tracking-wider sm:block">{profile.display_name}</span>
      </summary>
      <div className="absolute right-0 top-12 w-64 border border-stone-200 bg-white p-2 text-stone-700 shadow-xl">
        <div className="border-b border-stone-100 px-3 py-2"><p className="font-bold">{profile.display_name}</p><p className="truncate text-xs text-stone-400">{profile.email}</p></div>
        <div className="mt-1 border-b border-stone-100 pb-1"><Link href="/debug" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Debug export</Link></div>
        {profile.role === 'ADMIN' && <div className="mt-1 border-b border-stone-100 pb-1"><p className="px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-600"><ShieldCheck className="mr-1 inline h-3 w-3" /> Admin tools</p><Link href="/admin/users" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><ShieldCheck className="h-4 w-4" /> Account approvals</Link><Link href="/admin/analytics" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><BarChart3 className="h-4 w-4" /> Analytics</Link><Link href="/data" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Data viewer</Link><Link href="/deckbuilder-test" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Deckbuilder sandbox</Link><Link href="/test-ui" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Test UI</Link><Link href="/pack-opener-preview" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Pack opener preview</Link></div>}
        <button onClick={onSignOut} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
      </div>
    </details>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useCurrentProfile();
  const syncStatus = useSyncStatus();
  // Full-bleed dark layouts with their own "HOOPS DRAFT" home link and no room
  // for an opaque bar: the home hero and every (auth) page (login/signup/pending
  // share AuthLayout's bg-stone-950 shell). The standard cream bar left a hard
  // seam against these and duplicated the in-page home link.
  const isBareLayout = pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/pending';

  const handleHomeClick = (e: React.MouseEvent) => {
    if (pathname.includes('/draft') || pathname.includes('/deckbuilder')) {
      const isConfirmed = window.confirm('Are you sure you want to leave? Unsaved edits or ongoing drafts will be lost.');
      if (!isConfirmed) {
        e.preventDefault();
      }
    }
  };

  const getPageTitle = () => {
    if (pathname.includes('/draft')) return 'Draft Room';
    if (pathname.includes('/deckbuilder')) return 'Deck Builder';
    if (pathname.includes('/season')) return 'Season';
    if (pathname.includes('/rosters')) return 'My Rosters';
    if (pathname.includes('/data')) return 'Database';
    return '';
  };

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  if (isBareLayout) {
    if (!profile) return null;
    return (
      <>
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
          <SyncIndicator dark />
          <ProfileMenu profile={profile} onSignOut={signOut} dark />
        </div>
        <SyncConflictPrompt conflicts={syncStatus.conflicts} />
      </>
    );
  }

  return (
    <>
      <div className="fixed top-0 left-0 w-full h-14 bg-[#F5F0EA]/90 backdrop-blur-md border-b border-stone-200 z-50 flex items-center px-4 shadow-sm">
        <Link
          href="/"
          onClick={handleHomeClick}
          className="p-2 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 hover:border-stone-300 transition-colors flex items-center justify-center group shrink-0"
          title="Back to Home"
        >
          <Home className="w-4 h-4 text-stone-400 group-hover:text-stone-600 transition-colors" />
        </Link>
        <div className="ml-4 flex-1">
          <h1 className="text-xl tracking-tight text-stone-800 uppercase" style={{ fontFamily: 'var(--font-bebas)' }}>
            {getPageTitle()}
          </h1>
        </div>
        {profile && (
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <ProfileMenu profile={profile} onSignOut={signOut} />
          </div>
        )}
      </div>
      {profile && <SyncConflictPrompt conflicts={syncStatus.conflicts} />}
    </>
  );
}
