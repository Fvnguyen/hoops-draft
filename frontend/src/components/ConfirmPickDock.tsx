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
        // z-50: DraftRoom's sidebar is itself `z-40` (its own stacking context), so the
        // dock needs a higher value to stay clickable above it rather than losing DOM-order
        // stacking ties to whichever renders later.
        className="fixed z-50 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* Fixed width regardless of label: a longer player name must never shift the
         *  button's left edge (D7 "never moves"), so the name truncates instead. */}
        <Button
          ref={ref}
          variant="primary"
          size="lg"
          disabled={!cardName}
          onClick={onConfirm}
          className="w-64 justify-start"
        >
          <span className="min-w-0 flex-1 truncate text-center">
            {cardName ? `Take ${cardName}` : 'Select a card'}
          </span>
        </Button>
      </motion.div>
    );
  },
);
