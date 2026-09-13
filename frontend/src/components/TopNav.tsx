'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut, ShieldCheck, UserCircle, Wrench } from 'lucide-react';
import { useCurrentProfile } from './AuthProvider';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useCurrentProfile();
  
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

  return (
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
      {profile && <details className="relative group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1.5 text-stone-600 hover:bg-white" title="Profile menu">
          <UserCircle className="h-7 w-7" />
          <span className="hidden max-w-32 truncate text-xs font-bold uppercase tracking-wider sm:block">{profile.display_name}</span>
        </summary>
        <div className="absolute right-0 top-12 w-64 border border-stone-200 bg-white p-2 text-stone-700 shadow-xl">
          <div className="border-b border-stone-100 px-3 py-2"><p className="font-bold">{profile.display_name}</p><p className="truncate text-xs text-stone-400">{profile.email}</p></div>
          {profile.role === 'ADMIN' && <div className="mt-1 border-b border-stone-100 pb-1"><p className="px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-600"><ShieldCheck className="mr-1 inline h-3 w-3" /> Admin tools</p><Link href="/admin/users" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><ShieldCheck className="h-4 w-4" /> Account approvals</Link><Link href="/debug" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Debug export</Link><Link href="/data" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-100"><Wrench className="h-4 w-4" /> Data viewer</Link></div>}
          <button onClick={signOut} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </details>}
    </div>
  );
}
