'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameView } from '@/components/GameView';
import { buildPreviewGame, PREVIEW_CONTEXT } from '@/lib/previewGame';

/**
 * game_theater fixture page (like /pack-opener-preview): a real, seeded game between two
 * bot-drafted rosters so the theater can be reviewed and screenshotted without a season.
 * Query: ?seed=N (draft + game seed) &poss=N (open at possession N) &tab=boxScore|playByPlay
 * &pop=1 (crunch pop-up). Seat 0 is "You" so the YOU chip and the summary hints show.
 */

function Preview() {
  const params = useSearchParams();
  const seed = Number(params.get('seed') ?? 42) >>> 0;
  const poss = params.get('poss');
  const tab = params.get('tab') as 'playByPlay' | 'boxScore' | 'matchup' | null;
  const pop = params.get('pop') === '1';
  const game = useMemo(() => buildPreviewGame(seed), [seed]);
  const initialState = poss !== null || tab || pop
    ? { possession: poss !== null ? Math.min(Number(poss), game.possessions.length - 1) : undefined, tab: tab ?? undefined, crunchPopup: pop }
    : undefined;
  return (
    <div className="min-h-dvh-z p-4 flex flex-col">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-subtle">Theater preview · seed {seed} · {game.possessions.length} possessions</div>
      <div className="flex-1 min-h-0">
        <GameView key={`${seed}-${poss}-${tab}-${pop}`} game={game} context={PREVIEW_CONTEXT} initialState={initialState} />
      </div>
    </div>
  );
}

export default function TheaterPreviewPage() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
