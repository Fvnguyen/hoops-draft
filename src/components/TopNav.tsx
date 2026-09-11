'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home } from 'lucide-react';

export function TopNav() {
  const pathname = usePathname();
  
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
    if (pathname.includes('/rosters')) return 'My Rosters';
    if (pathname.includes('/data')) return 'Database';
    return '';
  };

  if (pathname === '/') return null;

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
    </div>
  );
}
