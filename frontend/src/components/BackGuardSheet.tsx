'use client';

import { Overlay, Button } from '@/components/ui';

/**
 * plan_mobile_native_feel D3/D4: the sheet a `useAndroidBackGuard` back press opens on a
 * screen with no save target for its current state (a mid-draft pick order, an
 * incomplete depth chart) — leave-only, exactly two actions, no silent discard.
 */
export function BackGuardSheet({
  open,
  message,
  onCancel,
  onLeave,
}: {
  open: boolean;
  message: string;
  onCancel: () => void;
  onLeave: () => void;
}) {
  return (
    <Overlay open={open} onClose={onCancel} size="sm" labelledBy="back-guard-heading">
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="back-guard-heading" className="text-xl font-bold uppercase text-ink-inverse mb-2">
          Leave this screen?
        </h2>
        <p className="text-ink-inverse-muted text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={onCancel}
            className="text-ink-inverse-muted hover:text-ink-inverse hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
