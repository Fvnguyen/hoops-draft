'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SeasonView } from '../../components/SeasonView';

function SeasonContent() {
  const searchParams = useSearchParams();
  const rosterId = searchParams.get('rosterId');
  const sessionId = searchParams.get('sessionId');

  if (!rosterId || !sessionId) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-line bg-surface-raised p-8 text-center">
          <div className="mb-4 text-4xl">🏀</div>
          <h2 className="mb-2 text-lg font-bold text-ink">Missing Parameters</h2>
          <p className="text-sm text-ink-muted">
            Navigate here from a saved roster to start a season.
          </p>
        </div>
      </div>
    );
  }

  return <SeasonView rosterId={rosterId} sessionId={sessionId} />;
}

export default function SeasonPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse text-xl font-semibold text-ink-muted">Loading...</div>
      </div>
    }>
      <SeasonContent />
    </Suspense>
  );
}
