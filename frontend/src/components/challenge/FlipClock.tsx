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
 * perfectly legible and let the half-time record be read straight off the reel.
 *
 * Deliberately gentler than the second cut (which went to 19% and turned the cell into a
 * featureless wash). Illegibility comes from the strip ROLLING, not from blur alone — see
 * `rollMs`. Blur's job is only to soften the moving digits, not to erase them.
 */
export function blurRadiusPx(font: number, b: number): number {
  return font * (0.03 + Math.max(0, Math.min(1, b)) * 0.055);
}

/** How long the strip takes to advance one cell: visibly turning at a crawl, a blur at speed. */
export function rollMs(b: number): number {
  const t = Math.max(0, Math.min(1, b));
  return Math.round(620 - t * 520);
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
        // A turning flap: four consecutive digits stacked one cell apart, rolling upward
        // by exactly one cell per cycle. You can see it move at the start of the ramp and
        // it smears into an unreadable blur at full speed, which is the point — the record
        // is sealed by MOTION, not by drowning the cell in blur.
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="flap-roll absolute inset-x-0 top-0"
            style={{
              height: `${scale.h * 4}px`,
              ['--flap-roll-ms' as string]: `${rollMs(b)}ms`,
              filter: `blur(${blurRadiusPx(scale.font, b).toFixed(1)}px)`,
              opacity: 0.55 + b * 0.25,
            }}
          >
            {/* Stacked in ASCENDING order: the strip rolls up, so the cell below slides
                into view next and the digits count up the way a real flap does. */}
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="absolute inset-x-0 text-center text-ink-strong"
                style={{ ...glyph, top: `${i * scale.h + scale.nudge}px` }}
              >
                {(digit + i) % 10}
              </span>
            ))}
          </div>
        </div>
      )}
      <span
        className={cn('relative text-center', dim ? 'text-ink-inverse-muted' : 'text-ink-strong')}
        style={{
          ...glyph,
          paddingTop: `${scale.nudge}px`,
          opacity: moving ? Math.max(0, 1 - b * 4) : 1,
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
