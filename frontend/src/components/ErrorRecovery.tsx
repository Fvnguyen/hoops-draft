'use client';

/**
 * Shared recovery screen rendered by both `app/error.tsx` (errors inside the
 * root layout) and `app/global-error.tsx` (errors that escape the root layout
 * itself, which is why the latter has to re-render its own <html>/<body>).
 */

import { useState } from 'react';
import { Button } from '@/components/ui';

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
    <div className="flex min-h-dvh-z flex-col items-center justify-center gap-6 bg-surface px-6 py-16 text-center text-ink">
      <div className="text-6xl">🏀</div>
      <h1 className="text-2xl font-black uppercase tracking-widest">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-muted">
        {error.message || 'An unexpected error stopped this page from rendering.'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button href="/" variant="secondary">
          Go home
        </Button>
        <Button type="button" variant="danger" onClick={handleResetData} disabled={clearing || cleared}>
          {cleared ? 'Local data cleared' : clearing ? 'Clearing…' : 'Reset local data'}
        </Button>
      </div>

      {cleared && (
        <p className="text-xs text-ink-subtle">Refresh or click &ldquo;Try again&rdquo; to start over.</p>
      )}
    </div>
  );
}
