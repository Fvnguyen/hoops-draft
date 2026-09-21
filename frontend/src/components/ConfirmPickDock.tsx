'use client';

import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from './ui/Button';

/**
 * plan_ui_foundation D7: the one confirm control shared by `DraftRoom`'s pick
 * spread and `PackOpener`'s picking phase. Docked bottom-right, safe-area
 * aware, and never repositions itself — it only fades/scales in once on
 * mount so the owner's thumb always finds it in the same place.
 */
export interface ConfirmPickDockProps {
  /** Display name of the currently-selected card, or null when nothing is
   *  selected yet (renders the disabled "Select a card" state). */
  cardName: string | null;
  onConfirm: () => void;
}

export const ConfirmPickDock = forwardRef<HTMLButtonElement, ConfirmPickDockProps>(
  function ConfirmPickDock({ cardName, onConfirm }, ref) {
    const reducedMotion = useReducedMotion();

    return (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        // `absolute`, not `fixed`: it docks inside the draft's main column (a `relative`
        // flex child beside the sidebar column), so it can never sit over the sidebar.
        // mobile_load T9/D9: `--safe-bottom` (globals.css) is the true inset in the
        // zoomed coordinate space — a raw `env()` here would land too close to the
        // gesture bar once the phone `zoom` shrinks it visually.
        className="absolute z-40 right-4 bottom-[max(1rem,var(--safe-bottom))]"
      >
        {/* Constant label (owner call after live review): the player's name made the
         *  control wide and loud; the selected card is already highlighted in the spread. */}
        <Button ref={ref} variant="primary" size="md" disabled={!cardName} onClick={onConfirm}>
          {cardName ? 'Confirm pick' : 'Select a card'}
        </Button>
      </motion.div>
    );
  },
);
