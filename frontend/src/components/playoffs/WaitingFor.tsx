'use client';

/**
 * pvp_draft D2/D5: shown over the settled pack once the local seat has picked and the
 * opponent has not — "Waiting for <name>", the server clock, an online/offline indicator
 * off the opponent's heartbeat, and (D5) a "Finish the draft" button once the opponent has
 * been offline long enough that the present player may auto-pick the rest for them.
 */
import { Wifi, WifiOff } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import { PickTimerRing } from '@/components/PickTimerRing';

export interface WaitingForProps {
  /** Null while the directory lookup hasn't resolved yet. */
  name: string | null;
  pickDeadline: number | null;
  opponentOnline: boolean;
  canFinishForOpponent: boolean;
  finishingForOpponent: boolean;
  onFinishForOpponent: () => void;
}

export function WaitingFor({
  name, pickDeadline, opponentOnline, canFinishForOpponent, finishingForOpponent, onFinishForOpponent,
}: WaitingForProps) {
  const label = name ?? 'your opponent';
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-surface-scrim p-4 backdrop-blur-sm"
      data-waiting-for
    >
      <Panel role="status" padding="none" variant="inverse" className="relative w-full max-w-sm shadow-2xl">
        <div className="p-6 flex flex-col items-center gap-4 text-center">
          <PickTimerRing pickDeadline={pickDeadline} pickNumber={1} size={56} />
          <h2 className="text-xl font-bold uppercase text-ink-inverse">Waiting for {label}</h2>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {opponentOnline ? (
              <span className="flex items-center gap-1.5 text-ink-inverse-muted">
                <Wifi size={14} /> Online
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-warn">
                <WifiOff size={14} /> Offline
              </span>
            )}
          </div>
          {canFinishForOpponent && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-ink-inverse-muted text-xs max-w-xs">
                {label} has been offline a while. You can finish the draft for both of you — their
                remaining picks will be taken by the clock, one at a time.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={onFinishForOpponent}
                disabled={finishingForOpponent}
              >
                {finishingForOpponent ? 'Finishing the draft…' : 'Finish the draft'}
              </Button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
