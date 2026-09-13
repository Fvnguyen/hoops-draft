'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { PackRevealCard } from './PackRevealCard';
import type { DraftCard } from '@/engine/types';

type PackPhase = 'sealed' | 'opening' | 'dealing' | 'revealing' | 'handoff';

type PackOpenerProps = {
  pack: DraftCard[];
  onComplete: () => void;
  backdrop?: boolean;
  /** Draft mode this opener is running in (plan ui_draft_deckbuild_pack, D1-D2).
   *  Unused until T2's pick-from-spread rework (D7); Quick and Premier render
   *  identically until then. */
  mode?: 'quick' | 'premier';
  /** Epoch ms the human's pick expires at, when running inside a timed Premier
   *  pack (D4). Unused until T2 draws the `PickTimerRing`. */
  pickDeadline?: number | null;
};

const OPEN_MS = 650;
const DEAL_MS = 450;
const REVEAL_STAGGER_MS = 120;
const READ_MS = 750;
const HANDOFF_MS = 220;

export function PackOpener({ pack, onComplete, backdrop = false }: PackOpenerProps) {
  const [phase, setPhase] = useState<PackPhase>('sealed');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [focusedSkip, setFocusedSkip] = useState(false);
  const completedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const [snapshot] = useState<readonly DraftCard[]>(() => [...pack]);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const clearTimers = () => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  };

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const beginOpening = () => {
    if (phaseRef.current !== 'sealed') return;
    setFocusedSkip(true);
    setPhase('opening');
    if (reducedMotion) {
      setPhase('revealing');
      schedule(() => setPhase('handoff'), READ_MS);
      return;
    }
    schedule(() => setPhase('dealing'), OPEN_MS);
    schedule(() => setPhase('revealing'), OPEN_MS + DEAL_MS);
    schedule(() => setPhase('handoff'), OPEN_MS + DEAL_MS + READ_MS + snapshot.length * REVEAL_STAGGER_MS);
  };

  const skip = () => {
    if (phaseRef.current === 'handoff') return;
    clearTimers();
    setPhase('handoff');
  };

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(query.matches);
    updateMotionPreference();
    query.addEventListener('change', updateMotionPreference);
    openButtonRef.current?.focus();
    return () => query.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (focusedSkip) skipButtonRef.current?.focus();
  }, [focusedSkip]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      } else if ((event.key === 'Enter' || event.key === ' ') && phaseRef.current === 'sealed') {
        event.preventDefault();
        beginOpening();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // beginOpening/skip read current phase via phaseRef, so they don't need to be
    // deps — re-subscribing this listener every render would just churn it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'handoff') return;
    schedule(complete, HANDOFF_MS);
  }, [phase, complete]);

  // Single cleanup point: clears any still-pending timers on unmount.
  useEffect(() => clearTimers, []);

  const revealIndex = phase === 'revealing' || phase === 'handoff' ? snapshot.length : 0;
  const cardsVisible = phase !== 'sealed' && phase !== 'opening';

  return (
    <main
      aria-label="Opening your first draft pack"
      className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-8 text-stone-800 ${backdrop ? 'bg-[#F5F0EA]/25 backdrop-blur-[2px]' : 'bg-[#F5F0EA]'} ${phase === 'handoff' ? 'opacity-0 transition-opacity duration-200' : 'opacity-100'}`}
    >
      <div className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-700/70">Magic Ball Draft</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] sm:text-5xl">First pack</h1>
          <p className="mt-2 text-sm text-stone-500">Reveal the cards waiting in your draft.</p>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'sealed' || phase === 'opening' ? (
            <motion.div
              key="sealed"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: phase === 'opening' ? 1.08 : 1 }}
              exit={{ opacity: 0, scale: 0.8, rotate: 5 }}
              transition={{ duration: phase === 'opening' ? 0.55 : 0.35 }}
              className="w-48 sm:w-56"
            >
              <button
                ref={openButtonRef}
                type="button"
                onClick={beginOpening}
                disabled={phase !== 'sealed'}
                className="block w-full rounded-2xl outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-default"
                aria-label="Open first draft pack"
              >
                <Image src="/pack_2025_2026.png" alt="Magic Ball 2025-26 draft pack" width={448} height={624} priority className="w-full rounded-2xl" />
              </button>
              {phase === 'sealed' && <p className="mt-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-amber-700/80">Press Enter or click to open</p>}
            </motion.div>
          ) : (
            <motion.div
              key="cards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
            >
              {snapshot.map((card, index) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 24, scale: 0.85 }}
                  animate={{ opacity: cardsVisible ? 1 : 0, y: 0, scale: 1 }}
                  transition={{ delay: reducedMotion ? 0 : Math.min(index * 0.08, 0.56), duration: 0.35 }}
                  className="[perspective:900px]"
                >
                  <motion.div
                    animate={{ rotateY: index < revealIndex ? 180 : 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.45, delay: reducedMotion ? 0 : index * REVEAL_STAGGER_MS / 1000 }}
                    className="relative aspect-[5/7] [transform-style:preserve-3d]"
                  >
                    <div className="absolute inset-0 [backface-visibility:hidden]">
                      <PackRevealCard card={card} revealed={false} />
                    </div>
                    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <PackRevealCard card={card} revealed />
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-h-8 items-center justify-center">
          {phase !== 'sealed' && (
            <button
              ref={skipButtonRef}
              type="button"
              onClick={skip}
              className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-stone-500 transition-colors hover:border-amber-600 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              Skip opening
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
