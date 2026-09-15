'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const EXIT_MS = 280;
const ENTER_MS = 280;
const EXIT_DISTANCE = 140;

export interface PackPassStageProps {
  /** Bumped once per pass by `useDraftEngine` — used as the animation key so
   *  this fires reliably even when two packs' contents coincidentally look
   *  the same (D10). */
  passSeq: number;
  /** Which way the pack is passing this round ('right' for pack 2, 'left' for
   *  packs 1 and 3) — the outgoing pack exits toward this side, the
   *  incoming one enters from the other. */
  direction: 'left' | 'right';
  /** The pack grid to animate — always the CURRENT (already-updated) pack. */
  children: React.ReactNode;
}

/**
 * plan_ui_foundation D8: two elements, no timers. The live pack is a single
 * `motion.div` keyed by `passSeq` (`data-pass-node`) that animates in from
 * the opposite side and then KEEPS THE SAME KEY forever for that pass — no
 * "settled" remount once the enter animation finishes. The outgoing pack is
 * an absolutely positioned ghost snapshot that animates out and unmounts on
 * its own `onAnimationComplete`. A click or keydown mid-pass collapses both
 * animations to duration 0 instead of skipping ahead with a timer.
 */
export function PackPassStage({ passSeq, direction, children }: PackPassStageProps) {
  const reducedMotion = useReducedMotion();
  // Refs only ever get written from an effect (after commit), never during
  // render — they just carry "what was showing last" across passSeq bumps.
  const prevChildrenRef = useRef<React.ReactNode>(children);
  const prevSeqRef = useRef(passSeq);
  // The outgoing snapshot, or null once its exit animation has finished (or
  // there is nothing to animate out yet).
  const [ghost, setGhost] = useState<{ seq: number; node: React.ReactNode } | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (passSeq !== prevSeqRef.current) {
      setGhost({ seq: prevSeqRef.current, node: prevChildrenRef.current });
      setFinished(false);
      prevSeqRef.current = passSeq;
    }
    prevChildrenRef.current = children;
  }, [passSeq, children]);

  const exitX = direction === 'left' ? -EXIT_DISTANCE : EXIT_DISTANCE;
  const enterX = -exitX;

  const finishNow = () => setFinished(true);

  // A keypress anywhere finishes the pass instantly, mirroring the click
  // handler on the stage itself — no timer, just a state flip that collapses
  // both in-flight transitions to duration 0.
  useEffect(() => {
    if (!ghost) return;
    window.addEventListener('keydown', finishNow);
    return () => window.removeEventListener('keydown', finishNow);
  }, [ghost]);

  const enterTransition = reducedMotion || finished
    ? { duration: 0 }
    : { duration: ENTER_MS / 1000, ease: 'easeOut' as const };
  const exitTransition = reducedMotion || finished
    ? { duration: 0 }
    : { duration: EXIT_MS / 1000, ease: 'easeIn' as const };

  return (
    <div
      className="relative w-full"
      onClick={ghost ? finishNow : undefined}
      onKeyDown={ghost ? finishNow : undefined}
    >
      {ghost && (
        <motion.div
          key={`ghost-${ghost.seq}`}
          className="absolute inset-0 pointer-events-none"
          initial={{ x: 0, opacity: 1 }}
          animate={{ x: exitX, opacity: 0 }}
          transition={exitTransition}
          onAnimationComplete={() => setGhost(current => (current?.seq === ghost.seq ? null : current))}
        >
          {ghost.node}
        </motion.div>
      )}
      <motion.div
        key={`pass-${passSeq}`}
        data-pass-node
        initial={reducedMotion ? false : { x: enterX, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={enterTransition}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Per-item stagger delay (ms) for bot avatars pulsing and ticker rows
 *  animating in, in passing order (D10): 40ms per step. */
export function passStaggerDelayMs(index: number): number {
  return index * 40;
}
