'use client';

import { useEffect, useState } from 'react';
import { PICK_SECONDS } from '@/lib/draftTimer';

export interface PickTimerRingProps {
  /** Epoch ms the current pick expires at, or null when no clock is running
   *  (armed by `useDraftEngine`'s `armIntroClock`; null outside a timed
   *  Premier pick — this component renders nothing in that case). */
  pickDeadline: number | null;
  /** 1-8: which pick within the current pack this deadline is for, used only
   *  to look up the total duration for the ring's sweep. */
  pickNumber: number;
  size?: number;
}

/** Circular countdown ring (D4/D11, Premier only). Amber under 10s remaining,
 *  red + pulsing under 5s. Ticks locally off `pickDeadline` (an epoch ms) via
 *  a lightweight interval rather than owning any timer state itself. */
export function PickTimerRing({ pickDeadline, pickNumber, size = 40 }: PickTimerRingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pickDeadline == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [pickDeadline]);

  if (pickDeadline == null) return null;

  const index = Math.min(Math.max(pickNumber - 1, 0), PICK_SECONDS.length - 1);
  const totalMs = PICK_SECONDS[index] * 1000;
  const remainingMs = Math.max(0, pickDeadline - now);
  const remainingSeconds = remainingMs / 1000;
  const fraction = totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;

  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - fraction);

  const isRed = remainingSeconds < 5;
  const isAmber = !isRed && remainingSeconds < 10;
  const color = isRed ? '#dc2626' : isAmber ? '#d97706' : '#78716c';

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${isRed ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${Math.ceil(remainingSeconds)} seconds left to pick`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e7e5e4" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.2s ease' }}
        />
      </svg>
      <span className="absolute text-[10px] font-black tabular-nums" style={{ color }}>
        {Math.ceil(remainingSeconds)}
      </span>
    </div>
  );
}
