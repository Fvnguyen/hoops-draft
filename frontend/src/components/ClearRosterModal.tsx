'use client';

import { Button } from './ui/Button';
import { Overlay } from './ui/Overlay';

export interface ClearRosterModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** The "Clear Roster?" confirmation (plan render_and_engine_perf, D8 layout half / T10) —
 *  every player and play back to the Roster, undoable via the toast `handleClearRoster`
 *  fires afterward. */
export function ClearRosterModal({ open, onClose, onConfirm }: ClearRosterModalProps) {
  return (
    <Overlay open={open} onClose={onClose} size="sm" labelledBy="clear-roster-heading">
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="clear-roster-heading" className="text-xl font-bold uppercase text-ink-inverse mb-2">Clear Roster?</h2>
        <p className="text-ink-inverse-muted text-sm mb-6">This sends every player and play back to the Roster and cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            className="text-ink-inverse-muted hover:text-ink-inverse hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm}>
            Clear Roster
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
