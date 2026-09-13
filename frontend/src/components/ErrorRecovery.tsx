'use client';

/**
 * Shared recovery screen rendered by both `app/error.tsx` (errors inside the
 * root layout) and `app/global-error.tsx` (errors that escape the root layout
 * itself, which is why the latter has to re-render its own <html>/<body>).
 */

import { useState } from 'react';
import Link from 'next/link';

export function ErrorRecovery({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const handleResetData = async () => {
    if (!confirm('This deletes every saved draft, roster, and season on this device. Continue?')) return;
    setClearing(true);
    try {
      const { getGameStore } = await import('@/storage');
      await getGameStore().clearAll();
      setCleared(true);
    } catch (err) {
      console.error('Failed to reset local data:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#F5F0EA] px-6 py-16 text-center text-stone-800">
      <div className="text-6xl">🏀</div>
      <h1 className="text-2xl font-black uppercase tracking-widest">Something went wrong</h1>
      <p className="max-w-md text-sm text-stone-500">
        {error.message || 'An unexpected error stopped this page from rendering.'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-stone-800 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-stone-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-stone-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-stone-600 transition-colors hover:border-stone-400"
        >
          Go home
        </Link>
        <button
          type="button"
          onClick={handleResetData}
          disabled={clearing || cleared}
          className="rounded-lg border border-red-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-red-600 transition-colors hover:border-red-400 disabled:opacity-50"
        >
          {cleared ? 'Local data cleared' : clearing ? 'Clearing…' : 'Reset local data'}
        </button>
      </div>

      {cleared && (
        <p className="text-xs text-stone-400">Refresh or click &ldquo;Try again&rdquo; to start over.</p>
      )}
    </div>
  );
}
