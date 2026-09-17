'use client';

/**
 * challenge_mode D7 — the split-flap W:L display (boards 2, 3, 6).
 *
 * Four flaps: two for wins, two for losses, a Bebas colon between them. The whole point
 * of the reveal is that this is the ONLY number on screen, so it is sized off a fixed
 * pixel scale rather than the type ramp (there is no 168px token, and the arbitrary
 * text-size syntax is banned by the style gate). Colour, borders and surfaces are semantic tokens; the
 * challenge shell renders under `data-theme="night"`, which is what resolves them to the
 * board's stone-950/stone-900/amber palette.
 *
 * `blur` (0..1) is how fast the flaps are turning, not a result signal: at 0 the digits are
 * crisp and readable (board 2), at 1 they are an illegible strip of motion-blurred digits
 * with the crisp one faded out entirely (board 3). The reel drives it from its own pacing
 * curve; nothing here knows or cares whether a game was won.
 *
 * The blur has to actually hide the number — the point of the sealed middle is that you
 * cannot read the record until the final stretch. Radii are therefore a fraction of the
 * glyph size, not fixed pixels, and several digits are shown at once.
 */

import { cn } from '@/lib/cn';

export type FlipClockSize = 'lg' | 'sm';

interface Scale {
  /** Flap cell. */
  w: number;
  h: number;
  /** Digit glyph size and its optical nudge (Bebas sits high in its em box). */
  font: number;
  nudge: number;
  gap: number;
  colon: number;
  colonDrop: number;
}

const SCALES: Record<FlipClockSize, Scale> = {
  lg: { w: 132, h: 176, font: 168, nudge: 14, gap: 10, colon: 120, colonDrop: 28 },
  sm: { w: 64, h: 86, font: 82, nudge: 7, gap: 6, colon: 58, colonDrop: 14 },
};

/** Reduced motion still gets the digits, just never the blur. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Below this, a flap renders as a single crisp digit — the record is readable. */
export const MOVING_THRESHOLD = 0.02;

/**
 * Motion-blur radius in px for a glyph of `font` px at blur `b`. A FRACTION of the glyph,
 * never a fixed pixel count: the first cut used 6-12px, which leaves a 168px digit's shape
 * perfectly legible, and the half-time record could be read straight off the reel.
 */
export function blurRadiusPx(font: number, b: number): number {
  return font * (0.05 + Math.max(0, Math.min(1, b)) * 0.14);
}

function Flap({
  digit,
  dim,
  blur,
  scale,
}: {
  digit: number;
  /** A leading zero is printed, but muted — the board never blanks it. */
  dim: boolean;
  blur: number;
  scale: Scale;
}) {
  const b = Math.max(0, Math.min(1, blur));
  const moving = b > MOVING_THRESHOLD;

  const glyph = {
    fontFamily: 'var(--font-bebas)',
    fontSize: `${scale.font}px`,
    lineHeight: 1,
  } as const;

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-panel border border-line-strong bg-surface-raised"
      style={{ width: `${scale.w}px`, height: `${scale.h}px` }}
    >
      {moving && (
        <>
          {/* A moving flap is a STRIP of digits, not two ghosts of this one. Four layers
              spanning the cell means no single value dominates, and the blur radius is a
              FRACTION OF THE GLYPH rather than a fixed pixel count — a 168px digit blurred
              by 8px keeps its shape and stays readable, which is how the half-time record
              was guessable mid-reel (owner, 2026-09-17). */}
          {[-1, 0, 1, 2].map((offset, i) => {
            const shown = (digit + offset + 20) % 10;
            const spread = (i - 1.5) / 1.5; // -1 .. 1 across the four layers
            return (
              <span
                key={offset}
                aria-hidden
                className="absolute inset-x-0 text-center text-ink-strong"
                style={{
                  ...glyph,
                  top: `${scale.nudge + spread * b * scale.h * 0.75}px`,
                  filter: `blur(${blurRadiusPx(scale.font, b).toFixed(1)}px)`,
                  opacity: (0.38 - Math.abs(spread) * 0.12) * (0.55 + b * 0.45),
                }}
              >
                {shown}
              </span>
            );
          })}
        </>
      )}
      <span
        className={cn('relative text-center', dim ? 'text-ink-inverse-muted' : 'text-ink-strong')}
        style={{
          ...glyph,
          paddingTop: `${scale.nudge}px`,
          opacity: moving ? Math.max(0, 1 - b * 3.2) : 1,
        }}
      >
        {digit}
      </span>
      {/* the split line of the flap */}
      <div
        className="absolute inset-x-0 bg-surface"
        style={{ top: '50%', height: '3px', marginTop: '-1px' }}
      />
    </div>
  );
}

function Pair({
  value,
  label,
  labelClass,
  blur,
  scale,
}: {
  value: number;
  label: string;
  labelClass: string;
  blur: number;
  scale: Scale;
}) {
  const clamped = Math.max(0, Math.min(99, Math.round(value)));
  const tens = Math.floor(clamped / 10);
  const ones = clamped % 10;
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex" style={{ gap: `${scale.gap}px` }}>
        <Flap digit={tens} dim={tens === 0} blur={blur} scale={scale} />
        <Flap digit={ones} dim={false} blur={blur} scale={scale} />
      </div>
      <div className={cn('text-xs font-black uppercase', labelClass)} style={{ letterSpacing: '0.2em' }}>
        {label}
      </div>
    </div>
  );
}

export interface FlipClockProps {
  wins: number;
  losses: number;
  /** 0 = settled and readable, 1 = flaps at full speed. Ignored under reduced motion. */
  blur?: number;
  size?: FlipClockSize;
  className?: string;
}

export function FlipClock({ wins, losses, blur = 0, size = 'lg', className }: FlipClockProps) {
  const scale = SCALES[size];
  const b = prefersReducedMotion() ? 0 : blur;
  return (
    <div
      className={cn('flex items-center', className)}
      style={{ gap: `${scale.gap * 2.8}px` }}
      role="img"
      aria-label={`Record ${Math.round(wins)} wins, ${Math.round(losses)} losses`}
    >
      <Pair value={wins} label="Wins" labelClass="text-positive" blur={b} scale={scale} />
      <div
        aria-hidden
        className="text-ink-inverse-muted"
        style={{
          fontFamily: 'var(--font-bebas)',
          fontSize: `${scale.colon}px`,
          lineHeight: 1,
          paddingBottom: `${scale.colonDrop}px`,
        }}
      >
        :
      </div>
      <Pair value={losses} label="Losses" labelClass="text-danger" blur={b} scale={scale} />
    </div>
  );
}
