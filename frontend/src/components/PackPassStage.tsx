'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

/** D10: on each pass, the current pack slides 140px toward the passing side
 *  and exits while the next pack slides in from the other side (280ms each,
 *  ~600ms total). Any click or key finishes it instantly. Keyed off
 *  `passSeq` rather than pack contents. */
export function PackPassStage({ passSeq, direction, children }: PackPassStageProps) {
  const [phase, setPhase] = useState<'idle' | 'exiting' | 'entering'>('idle');
  const [exitSnapshot, setExitSnapshot] = useState<React.ReactNode>(null);
  const prevChildren = useRef<React.ReactNode>(children);
  const prevSeq = useRef(passSeq);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (passSeq === prevSeq.current) {
      prevChildren.current = children;
      return;
    }
    prevSeq.current = passSeq;
    setExitSnapshot(prevChildren.current);
    setPhase('exiting');
    clearTimers();
    timers.current.push(
      window.setTimeout(() => setPhase('entering'), EXIT_MS),
      window.setTimeout(() => setPhase('idle'), EXIT_MS + ENTER_MS)
    );
    prevChildren.current = children;
    return clearTimers;
    // Only passSeq should retrigger the animation — `children` is captured
    // via the ref above so a re-render mid-animation doesn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passSeq]);

  useEffect(() => clearTimers, []);

  const finishNow = () => {
    if (phase === 'idle') return;
    clearTimers();
    setPhase('idle');
  };

  useEffect(() => {
    if (phase === 'idle') return;
    const handleKey = () => finishNow();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const exitX = direction === 'left' ? -EXIT_DISTANCE : EXIT_DISTANCE;
  const enterX = -exitX;

  return (
    <div className="relative w-full" onClick={phase !== 'idle' ? finishNow : undefined}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'exiting' ? (
          <motion.div
            key={`exit-${passSeq}`}
            initial={{ x: 0, opacity: 1 }}
            animate={{ x: exitX, opacity: 0 }}
            transition={{ duration: EXIT_MS / 1000, ease: 'easeIn' }}
          >
            {exitSnapshot}
          </motion.div>
        ) : phase === 'entering' ? (
          <motion.div
            key={`enter-${passSeq}`}
            initial={{ x: enterX, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: ENTER_MS / 1000, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div key={`settled-${passSeq}`} initial={false} animate={{ opacity: 1 }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Per-item stagger delay (ms) for bot avatars pulsing and ticker rows
 *  animating in, in passing order (D10): 40ms per step. */
export function passStaggerDelayMs(index: number): number {
  return index * 40;
}
