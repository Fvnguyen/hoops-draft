'use client';

import { Clock3, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

/** plan_challenge_mode D1: which game a draft picked from the start page is for.
 *  pvp_series D7: 'playoffs' is a third home entry, but it has no Premier/Quick
 *  picker of its own (a live two-player draft, not a solo one) — it routes straight to
 *  `/playoffs` from `app/page.tsx` instead of opening `HomeModePicker`. Included here so
 *  every caller of `HomeGame` accounts for it. */
export type HomeGame = 'tournament' | 'challenge' | 'playoffs';

interface ModeCardProps {
  game: HomeGame;
  draftMode: 'premier' | 'quick';
  testId: string;
}

/** One draft-style option card (boards 1b/1c): cream for the tournament picker,
 *  dark for the challenge picker; amber clock-ring motif for Premier, blue
 *  chevron motif for Quick. Navigates straight to `/draft?mode=&game=` — no
 *  post-draft mode choice (D1). */
function ModeCard({ game, draftMode, testId }: ModeCardProps) {
  const isPremier = draftMode === 'premier';
  const isChallenge = game === 'challenge';

  return (
    <div
      className={cn(
        'flex w-[260px] shrink-0 flex-col gap-3.5 rounded-panel border p-6 text-left shadow-xl sm:w-[280px]',
        isChallenge ? 'bg-surface-inverse' : 'bg-surface',
        isPremier
          ? cn('-rotate-2 -translate-y-2', isChallenge ? 'border-accent shadow-[0_0_60px_rgba(251,191,36,0.15)]' : 'border-line-strong ring-4 ring-accent/30')
          : cn('rotate-2', isChallenge ? 'border-info' : 'border-line-strong'),
      )}
    >
      <div
        className={cn(
          'flex h-20 items-center justify-center gap-4 rounded-control',
          isPremier ? 'bg-accent-soft' : 'bg-info-soft',
        )}
      >
        {isPremier ? (
          <Clock3 className="h-9 w-9 text-accent-hover" aria-hidden="true" />
        ) : (
          <ChevronsRight className="h-9 w-9 text-info" aria-hidden="true" />
        )}
      </div>
      <span className={cn('text-xs font-black uppercase tracking-widest', isPremier ? 'text-accent-hover' : 'text-info')}>
        {isPremier ? 'The full table' : 'Straight to the picks'}
      </span>
      <span className={cn('font-display text-4xl uppercase leading-none', isChallenge ? 'text-ink-inverse' : 'text-ink-strong')}>
        {isPremier ? 'Premier Draft' : 'Quick Draft'}
      </span>
      <p className={cn('text-sm leading-relaxed', isChallenge ? 'text-ink-inverse-muted' : 'text-ink-muted')}>
        {isPremier ? 'Timed picks and a summary after every round.' : 'No timer, quick animations.'}
      </p>
      <div className="flex-1" />
      <Button
        href={`/draft?mode=${draftMode}&game=${game}`}
        data-testid={testId}
        variant={isPremier ? 'primary' : 'secondary'}
        size="md"
        className="justify-center"
      >
        Start draft
      </Button>
    </div>
  );
}

/** The Premier-vs-Quick picker that opens when a home-page mode button is clicked
 *  (boards 1b cream / 1c dark). `onClose` is the "Back" action. */
export function HomeModePicker({ game, onClose }: { game: HomeGame; onClose: () => void }) {
  const isChallenge = game === 'challenge';

  return (
    <div
      data-testid="home-mode-picker"
      className={cn(
        'absolute inset-0 z-30 flex flex-col items-center justify-center gap-7 overflow-y-auto px-6 py-8 lg:left-[320px]',
        isChallenge ? 'bg-surface-inverse-deep/90' : 'bg-surface-inverse-deep/80',
      )}
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        {isChallenge ? (
          <span className="flex items-baseline gap-2">
            <span className="font-display text-2xl leading-none text-accent">82:0</span>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-accent">Challenge</span>
          </span>
        ) : (
          <span className="text-xs font-black uppercase tracking-[0.2em] text-warn">In-Season Tournament</span>
        )}
        <h2 className="font-display text-5xl uppercase text-ink-inverse">How do you want to draft?</h2>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-8">
        <ModeCard game={game} draftMode="premier" testId="pick-premier" />
        <ModeCard game={game} draftMode="quick" testId="pick-quick" />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="md" onClick={onClose} className="text-ink-inverse-muted hover:text-ink-inverse">
          Back
        </Button>
        {isChallenge && (
          <Button
            variant="inverse"
            size="md"
            disabled
            title="Seed entry lands with the 82:0 reveal build"
          >
            Enter a seed
          </Button>
        )}
      </div>
    </div>
  );
}
