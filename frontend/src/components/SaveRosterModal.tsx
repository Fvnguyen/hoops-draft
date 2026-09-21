'use client';

import { useState } from 'react';
import { Button } from './ui/Button';
import { Overlay } from './ui/Overlay';

export interface SaveRosterModalProps {
  open: boolean;
  onClose: () => void;
  /** Seeds the name field once, on mount — never re-applied on a later prop change
   *  (matches the field's original semantics as a plain `useState` initializer, just
   *  moved down into the component that actually owns the keystrokes now). */
  initialName: string;
  saveDestination: 'rosters' | 'season';
  isChallenge: boolean;
  isSaving: boolean;
  onSave: (name: string, destination: 'rosters' | 'season') => void;
}

/**
 * The "Save Roster" naming modal (plan render_and_engine_perf, D8 layout half / T10).
 * Owns the roster-name text field: it used to live in `DeckBuilder.tsx` as a top-level
 * `useState`, so every keystroke re-rendered the whole builder. Moved here, only this
 * modal re-renders while typing.
 */
export function SaveRosterModal({ open, onClose, initialName, saveDestination, isChallenge, isSaving, onSave }: SaveRosterModalProps) {
  const [rosterName, setRosterName] = useState(initialName);

  return (
    <Overlay open={open} onClose={onClose} labelledBy="save-roster-heading">
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="save-roster-heading" className="text-2xl font-bold uppercase text-ink-inverse mb-2">Save Roster</h2>
        <p className="text-ink-inverse-muted text-sm mb-6">Give your active roster a name. You can edit this later from the My Rosters menu.</p>

        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-widest text-ink-inverse-muted mb-2">Roster Name</label>
          <input
            type="text"
            value={rosterName}
            onChange={e => setRosterName(e.target.value)}
            className="w-full h-control bg-surface-inverse-deep border border-line-inverse rounded-control px-4 text-ink-inverse focus:outline-none focus:border-line-strong transition-colors"
            placeholder="e.g. 2025 Championship Run"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            className="text-ink-inverse-muted hover:text-ink-inverse hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => onSave(rosterName, saveDestination)}
            disabled={!rosterName.trim() || isSaving}
          >
            {saveDestination === 'season' ? (isChallenge ? 'Save & start 82:0' : 'Save & play season') : 'Save to Collection'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
