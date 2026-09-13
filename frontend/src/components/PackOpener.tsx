'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { PackRevealCard } from './PackRevealCard';
import type { DraftCard } from '@/engine/types';
import {
  buildRevealTimeline,
  orderForReveal,
  REVEAL_FLIP_MS,
  REDUCED_FADE_MS,
} from '@/lib/packReveal';
import { isSfxEnabled, play, rareSting, setSfxEnabled } from '@/audio/sfx';

/** Phases of the opener (D6/D7). `picking` is terminal: the spread stays up. */
type PackPhase = 'sealed' | 'opening' | 'dealing' | 'revealing' | 'picking';

/**
 * What the opener hands back when the human takes a card (D7/D8).
 * `rect` is the picked card's on-screen box at confirm time so the draft room
 * can fly it to its sidebar row (framer `layoutId` fallback).
 */
export interface PackPick {
  cardId: string;
  card: DraftCard;
  /** Always Active/Roster — a zoning default, not roster auto-fill (D7). */
  zone: 'Roster';
  rect: DOMRect | null;
}

export interface PackOpenerProps {
  pack: DraftCard[];
  /** 1-based pack index; drives the "Pack N of 3" heading (D7). */
  packNumber?: number;
  totalPacks?: number;
  /** Draft mode (D1-D3) — only labelling here; the clock lives in the header. */
  mode?: 'quick' | 'premier';
  /** Epoch ms the human's pick expires at (D4). Drawn by the room's
   *  `PickTimerRing`, accepted here so the opener can be handed the same props. */
  pickDeadline?: number | null;
  /** Embedded inside the draft room's `<main>` grid (D7): no full-screen shell. */
  embedded?: boolean;
  /** Extra classes for the embedded wrapper (the grid's own column classes). */
  className?: string;
  /** Legacy full-screen presentation (own background). */
  backdrop?: boolean;
  /** Fired when the human confirms "Take <name>". */
  onPick?: (pick: PackPick) => void;
  /** Fired right after `onPick` (or on its own for preview/legacy callers). */
  onComplete?: () => void;
}

const OPEN_MS = 650;
const DEAL_MS = 450;

const RARITY_GLOW: Record<string, { ring: string; shadow: string }> = {
  Rare: { ring: '#eab308', shadow: 'rgba(234,179,8,0.75)' },
  Mythic: { ring: '#f97316', shadow: 'rgba(249,115,22,0.85)' },
};

// Reduced motion and the SFX opt-in are read through useSyncExternalStore so the
// first client render already has the right value (no setState-in-effect) and SSR
// falls back to "no preference / sound off".
function subscribeMotion(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const falseSnapshot = () => false;

/** Dispatched by the opener's own toggle so the store re-reads localStorage. */
const SFX_EVENT = 'magicball:sfx';
function subscribeSfx(onChange: () => void): () => void {
  window.addEventListener(SFX_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SFX_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function cardName(card: DraftCard): string {
  return card.type === 'Player' ? card.player.name : card.name;
}

export function PackOpener({
  pack,
  packNumber = 1,
  totalPacks = 3,
  mode = 'premier',
  embedded = false,
  className = '',
  backdrop = false,
  onPick,
  onComplete,
}: PackOpenerProps) {
  // Reveal TIMING is fixed on mount: Common -> Mythic, so the guaranteed Rare+
  // slot flips last (D6). This is separate from GRID POSITION below — `ordered`
  // only drives flipAt/holdMs indices, never what's rendered where.
  const [ordered] = useState<DraftCard[]>(() => orderForReveal(pack));
  // Grid position stays in the pack's original slot order so the guaranteed
  // Rare+ card doesn't visually jump to the last cell just because it flips last.
  const [displayOrder] = useState<DraftCard[]>(() => pack);
  const revealIndexOf = useMemo(() => {
    const map = new Map<string, number>();
    ordered.forEach((card, index) => map.set(card.id, index));
    return map;
  }, [ordered]);
  const [phase, setPhase] = useState<PackPhase>('sealed');
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, falseSnapshot);
  const sfxOn = useSyncExternalStore(subscribeSfx, isSfxEnabled, falseSnapshot);
  const [flipped, setFlipped] = useState<boolean[]>(() => ordered.map(() => false));
  const [holdIndex, setHoldIndex] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const timersRef = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  const selectedRef = useRef<string | null>(null);
  const confirmedRef = useRef(false);
  const stungRef = useRef(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const takeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    phaseRef.current = phase;
  });
  useEffect(() => {
    selectedRef.current = selectedId;
  });

  const timeline = useMemo(
    () => buildRevealTimeline(ordered, { reducedMotion }),
    [ordered, reducedMotion]
  );

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }, []);

  /** Jump straight to the fully-revealed spread — the pick is still made there (D7). */
  const skipToSpread = useCallback(() => {
    if (phaseRef.current === 'picking') return;
    clearTimers();
    setFlipped(ordered.map(() => true));
    setHoldIndex(null);
    setPhase('picking');
  }, [clearTimers, ordered]);

  const runReveal = useCallback(() => {
    setPhase('revealing');
    ordered.forEach((card, index) => {
      schedule(() => {
        setFlipped(prev => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
        // In the reduced-motion path every card "flips" at 0ms; one tick, not seven.
        if (!reducedMotion || index === 0) play('flip');
        const hold = timeline.holdMs[index];
        if (hold > 0) {
          setHoldIndex(index);
          if (!reducedMotion || !stungRef.current) {
            stungRef.current = true;
            rareSting(card.rarity === 'Mythic' ? 'Mythic' : 'Rare');
          }
          schedule(() => setHoldIndex(current => (current === index ? null : current)), hold);
        }
      }, timeline.flipAt[index]);
    });
    schedule(() => {
      setHoldIndex(null);
      setPhase('picking');
    }, timeline.total);
  }, [ordered, reducedMotion, schedule, timeline]);

  const beginOpening = useCallback(() => {
    if (phaseRef.current !== 'sealed') return;
    play('tear');
    if (reducedMotion) {
      setPhase('dealing');
      schedule(runReveal, 0);
      return;
    }
    setPhase('opening');
    schedule(() => setPhase('dealing'), OPEN_MS);
    schedule(runReveal, OPEN_MS + DEAL_MS);
  }, [reducedMotion, runReveal, schedule]);

  const confirmPick = useCallback(() => {
    const cardId = selectedRef.current;
    if (!cardId || confirmedRef.current || phaseRef.current !== 'picking') return;
    const card = ordered.find(c => c.id === cardId);
    if (!card) return;
    confirmedRef.current = true;
    const rect = cardRefs.current[cardId]?.getBoundingClientRect() ?? null;
    onPick?.({ cardId, card, zone: 'Roster', rect });
    onComplete?.();
  }, [onComplete, onPick, ordered]);

  useEffect(() => {
    openButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skipToSpread();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (phaseRef.current === 'sealed') {
          event.preventDefault();
          beginOpening();
        } else if (phaseRef.current === 'picking' && selectedRef.current) {
          event.preventDefault();
          confirmPick();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [beginOpening, confirmPick, skipToSpread]);

  // Once the spread is pickable, park focus on the confirm button so Tab/Enter
  // stay in the opener instead of falling through to the blurred room behind it.
  useEffect(() => {
    if (phase === 'picking') takeButtonRef.current?.focus();
  }, [phase]);

  // Single cleanup point: clears any still-pending timers on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxEnabled(next);
    window.dispatchEvent(new Event(SFX_EVENT));
    if (next) play('flip');
  };

  const cardsVisible = phase === 'revealing' || phase === 'picking' || phase === 'dealing';
  const selectedCard = selectedId ? ordered.find(card => card.id === selectedId) ?? null : null;
  const flipDuration = reducedMotion ? REDUCED_FADE_MS / 1000 : REVEAL_FLIP_MS / 1000;

  const shell = embedded
    ? `relative flex w-full flex-col items-center justify-center px-4 py-6 text-stone-800 ${className}`
    : `relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-8 text-stone-800 ${
        backdrop ? 'bg-[#F5F0EA]/25 backdrop-blur-[2px]' : 'bg-[#F5F0EA]'
      } ${className}`;

  const body = (
    <div className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-5">
      <div className="flex w-full max-w-4xl items-start justify-between gap-4">
        <div className="flex-1 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-700/70">
            {mode === 'quick' ? 'Quick Draft' : 'Premier Draft'}
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] sm:text-4xl">
            Pack {packNumber} of {totalPacks}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {phase === 'picking' ? 'Click a card, then take it.' : 'Reveal the cards waiting in your draft.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSfx}
          aria-pressed={sfxOn}
          title={sfxOn ? 'Sound on' : 'Sound off'}
          className="shrink-0 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-stone-500 transition-colors hover:border-amber-600 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          <span aria-hidden="true">{sfxOn ? '🔊' : '🔇'}</span>
          <span className="sr-only">{sfxOn ? 'Turn sound off' : 'Turn sound on'}</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'sealed' || phase === 'opening' ? (
          <motion.div
            key="sealed"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: phase === 'opening' ? 1.08 : 1 }}
            exit={{ opacity: 0, scale: 0.8, rotate: 5 }}
            transition={{ duration: reducedMotion ? 0 : phase === 'opening' ? 0.55 : 0.35 }}
            className="w-44 sm:w-52"
          >
            <button
              ref={openButtonRef}
              type="button"
              onClick={beginOpening}
              disabled={phase !== 'sealed'}
              className="block w-full rounded-2xl outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-default"
              aria-label={`Open pack ${packNumber} of ${totalPacks}`}
            >
              <Image
                src="/pack_2025_2026.png"
                alt="Magic Ball 2025-26 draft pack"
                width={448}
                height={624}
                priority
                className="w-full rounded-2xl"
              />
            </button>
            {phase === 'sealed' && (
              <p className="mt-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-amber-700/80">
                Press Enter or click to open
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
          >
            {displayOrder.map((card) => {
              const index = revealIndexOf.get(card.id)!;
              const isFlipped = flipped[index];
              const holding = holdIndex === index;
              const dimmed = holdIndex !== null && !holding;
              const glow = RARITY_GLOW[card.rarity];
              const mythicHold = holding && card.rarity === 'Mythic' && !reducedMotion;
              const isSelected = selectedId === card.id;
              const pickable = phase === 'picking';
              return (
                <motion.div
                  key={card.id}
                  ref={element => {
                    cardRefs.current[card.id] = element;
                  }}
                  initial={{ opacity: 0, y: 24, scale: 0.85 }}
                  animate={{
                    opacity: cardsVisible ? (dimmed ? 0.4 : 1) : 0,
                    y: 0,
                    scale: holding ? 1.06 : 1,
                    x: mythicHold ? [0, -5, 5, -3, 3, 0] : 0,
                  }}
                  transition={{
                    opacity: { duration: reducedMotion ? 0 : 0.3 },
                    scale: { duration: reducedMotion ? 0 : 0.25 },
                    x: { duration: mythicHold ? 0.34 : 0 },
                    default: { delay: reducedMotion ? 0 : Math.min(index * 0.06, 0.42), duration: 0.3 },
                  }}
                  className={`[perspective:900px] ${pickable ? 'cursor-pointer' : ''}`}
                >
                  <div
                    role={pickable ? 'button' : undefined}
                    tabIndex={pickable ? 0 : -1}
                    aria-pressed={pickable ? isSelected : undefined}
                    aria-label={pickable ? `Select ${cardName(card)}` : undefined}
                    onClick={() => pickable && setSelectedId(card.id)}
                    onKeyDown={event => {
                      if (!pickable) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedId(card.id);
                      }
                    }}
                    className="relative rounded-xl outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-amber-600"
                    style={{
                      boxShadow: holding && glow
                        ? `0 0 0 3px ${glow.ring}, 0 0 26px 6px ${glow.shadow}`
                        : isSelected
                          ? '0 0 0 3px #b45309, 0 0 18px 2px rgba(180,83,9,0.45)'
                          : undefined,
                    }}
                  >
                    {mythicHold && (
                      <motion.span
                        aria-hidden="true"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.9, 0] }}
                        transition={{ duration: 0.45, times: [0, 0.25, 1] }}
                        className="pointer-events-none absolute -inset-1 z-20 rounded-xl border-2 border-white"
                      />
                    )}
                    <motion.div
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: flipDuration }}
                      className="relative aspect-[5/7] [transform-style:preserve-3d]"
                    >
                      <div className="absolute inset-0 [backface-visibility:hidden]">
                        <PackRevealCard card={card} revealed={false} />
                      </div>
                      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        <PackRevealCard card={card} revealed />
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-h-10 items-center justify-center gap-3">
        {phase !== 'sealed' && phase !== 'picking' && (
          <button
            type="button"
            onClick={skipToSpread}
            className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-stone-500 transition-colors hover:border-amber-600 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            Skip reveal (Esc)
          </button>
        )}
        {phase === 'picking' && (
          <button
            ref={takeButtonRef}
            type="button"
            onClick={confirmPick}
            disabled={!selectedCard}
            className="rounded-lg bg-amber-700 px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            {selectedCard ? `Take ${cardName(selectedCard)}` : 'Select a card'}
          </button>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <section aria-label={`Opening pack ${packNumber} of ${totalPacks}`} className={shell}>
        {body}
      </section>
    );
  }

  return (
    <main aria-label={`Opening pack ${packNumber} of ${totalPacks}`} className={shell}>
      {body}
    </main>
  );
}
