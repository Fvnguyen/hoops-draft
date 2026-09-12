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
      <div className="min-h-screen pt-[70px] p-8 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🏀</div>
          <h2 className="text-lg font-bold text-stone-800 mb-2">Missing Parameters</h2>
          <p className="text-sm text-stone-500">
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
      <div className="min-h-screen pt-[70px] flex items-center justify-center">
        <div className="text-xl font-semibold text-stone-400 animate-pulse">Loading...</div>
      </div>
    }>
      <SeasonContent />
    </Suspense>
  );
}
