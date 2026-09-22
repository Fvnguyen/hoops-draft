'use client';

/**
 * pvp_draft D2/D5: the local seat has picked and the opponent has not.
 *
 * A slim pill, not a modal (the caller positions it: the draft room floats it over the
 * settled pack, the build and series pages drop it in the flow): this is the NORMAL state for half of every pick
 * (whoever picks first waits for the other), bots pass instantly, and the opponent still
 * has their clock. A full-screen overlay on every pick made the room feel stuck (owner
 * feedback 2026-09-22). It shows who we are waiting for, the shared clock, their
 * online state, and (D5) "Finish the draft" once they have been offline long enough.
 */
import { Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui';
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
    <div className="flex justify-center px-4" data-waiting-for>
      <div
        role="status"
        className="flex min-h-control flex-wrap items-center justify-center gap-3 rounded-full border border-line bg-surface-raised/95 px-4 py-1.5 shadow-lg backdrop-blur-sm"
      >
        <PickTimerRing pickDeadline={pickDeadline} pickNumber={1} size={28} />
        <span className="text-sm font-bold uppercase tracking-wide text-ink">
          Waiting for {label}
        </span>
        {opponentOnline ? (
          <span className="flex items-center gap-1 text-xs font-medium text-ink-muted" title="Online">
            <Wifi size={14} aria-hidden="true" /> Online
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-warn" title="Offline">
            <WifiOff size={14} aria-hidden="true" /> Offline
          </span>
        )}
        {canFinishForOpponent && (
          <Button
            variant="primary"
            onClick={onFinishForOpponent}
            disabled={finishingForOpponent}
            className="px-3 py-1 text-xs"
            title={`${label} has been offline a while — their remaining picks will be taken by the clock, one at a time.`}
          >
            {finishingForOpponent ? 'Finishing…' : 'Finish the draft'}
          </Button>
        )}
      </div>
    </div>
  );
}
