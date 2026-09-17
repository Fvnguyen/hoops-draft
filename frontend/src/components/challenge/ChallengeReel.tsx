'use client';

/**
 * challenge_mode D7 — the reveal (boards 2, 3, 6).
 *
 * PRESENTATION OVER A FINISHED SIM. This component receives a `ChallengeHalf` that has
 * already been simulated AND committed to storage; it never calls the engine and never
 * decides anything. Everything below is pacing: which game the cursor is on, how blurred
 * the flaps are, and when to hand back control. A reload re-mounts it with the same
 * stored half and replays the same reveal.
 *
 * Pacing (D7): readable for the first week, accelerating until the flaps blur, still
 * blurred when half 1 ends (so the break is entered "sealed"), then readable again at a
 * locked speed for the last five games. The progress bar is NEUTRAL — it is amber at
 * every point of every run, win or lose. The ONLY mid-reel result signal allowed is the
 * streak call-out at 10/25/41/60/82 consecutive wins (board 3).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import type { ChallengeHalf, ChallengeScheduleEntry } from '@/engine/challenge';
import { NBA_TEAMS } from '@/engine/challenge';
import { CHALLENGE_GAMES } from '@/engine/balance';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { FlipClock } from './FlipClock';
import { TierLadder, nextFamilyAbove } from './TierLadder';

export type ReelSpeed = 'slower' | 'normal' | 'instant';

// ── Pacing curve ────────────────────────────────────────────────────────────
// All in ABSOLUTE game index (0..81), so half 2 picks the curve up where half 1 left it.

/** Games 1-7: slow enough to read every flap. */
const OPENING_GAMES = 7;
/** By this game the flaps are at full speed; between the two the reel accelerates. */
const RAMP_END = 26;
/** Games 78-82: readable again, and the speed control is locked (board 6). */
const FINAL_START = CHALLENGE_GAMES - 5;

const OPENING_MS = 1000;
const CRUISE_MS = 100;
const FINAL_MS = 1200;
/** Extra hold on a streak call-out, so it can actually be read. */
const MILESTONE_HOLD_MS = 1300;

const SPEED_FACTOR: Record<ReelSpeed, number> = { slower: 2, normal: 1, instant: 0 };

// Total run time at Normal is roughly 20s for half 1 and 10s for half 2 (the locked last
// five games are 6s of it). These five constants ARE the pacing — tune them here, nothing
// else in the reel encodes a duration.

/** Consecutive wins worth interrupting the reel for (D7). */
const STREAK_MILESTONES = [10, 25, 41, 60, 82];

/** Eased 0..1 position along the acceleration ramp. */
function rampT(abs: number): number {
  if (abs < OPENING_GAMES) return 0;
  if (abs >= RAMP_END) return 1;
  return (abs - OPENING_GAMES) / (RAMP_END - OPENING_GAMES);
}

/** How blurred the flaps are while game `abs` is on screen. */
export function blurForGame(abs: number): number {
  if (abs >= FINAL_START) return 0;
  const t = rampT(abs);
  return t * t;
}

/** How long game `abs` stays on screen at `speed` (ms). 0 means "skip ahead". */
export function dwellForGame(abs: number, speed: ReelSpeed): number {
  if (abs >= FINAL_START) return FINAL_MS; // locked: speed cannot touch the last five
  const t = rampT(abs);
  const base = OPENING_MS + (CRUISE_MS - OPENING_MS) * t;
  return Math.round(base * SPEED_FACTOR[speed]);
}

// ── Per-game derived state ──────────────────────────────────────────────────

interface Step {
  /** Record AFTER this many games of the half have been decided. */
  wins: number;
  losses: number;
  streak: number;
  /** Set when this step's win completed a streak milestone. */
  milestone: number | null;
}

function buildSteps(results: string, priorWins: number, priorLosses: number, priorStreak: number): Step[] {
  const steps: Step[] = [{ wins: priorWins, losses: priorLosses, streak: priorStreak, milestone: null }];
  let wins = priorWins;
  let losses = priorLosses;
  let streak = priorStreak;
  for (const r of results) {
    if (r === 'W') { wins++; streak++; } else { losses++; streak = 0; }
    steps.push({
      wins,
      losses,
      streak,
      milestone: STREAK_MILESTONES.includes(streak) ? streak : null,
    });
  }
  return steps;
}

const CITY_BY_ABBR = new Map(NBA_TEAMS.map((t) => [t.abbr, t.city]));

// ── Component ───────────────────────────────────────────────────────────────

export interface ChallengeReelProps {
  /** The committed half. Never re-simulated, never mutated. */
  half: ChallengeHalf;
  schedule: ChallengeScheduleEntry[];
  /** Record carried in from half 1 (0/0 for half 1 itself). */
  priorWins?: number;
  priorLosses?: number;
  /** Win streak still alive at the break, so a streak can cross into half 2. */
  priorStreak?: number;
  /** D10's ghost season, if half 2 has one — drawn as the faint needle on the ladder. */
  ghostWins?: number;
  /** Fired exactly once, when the last game of this half has been revealed. */
  onComplete: () => void;
  /** Fixture pages only (`/challenge/preview`): open on a given game instead of game 1. */
  initialCursor?: number;
  /** Fixture pages only: freeze the reel so a board state can be screenshotted. */
  paused?: boolean;
}

export function ChallengeReel({
  half,
  schedule,
  priorWins = 0,
  priorLosses = 0,
  priorStreak = 0,
  ghostWins,
  onComplete,
  initialCursor = 0,
  paused = false,
}: ChallengeReelProps) {
  const games = half.games;
  const n = games.length;
  const halfStart = games[0]?.index ?? (half.half === 1 ? 0 : CHALLENGE_GAMES / 2);

  const steps = useMemo(
    () => buildSteps(half.results, priorWins, priorLosses, priorStreak),
    [half.results, priorWins, priorLosses, priorStreak],
  );

  /** Cursor = how many games of this half are decided. `n` means the half is over. */
  const [cursor, setCursor] = useState(initialCursor);
  const [speed, setSpeed] = useState<ReelSpeed>('normal');
  const completed = useRef(false);

  // Every cursor at which the reel pauses: a streak call-out, the start of the final
  // stretch, and the end of the half. A tap jumps to the next one.
  const stops = useMemo(() => {
    const out: number[] = [];
    for (let c = 1; c <= n; c++) if (steps[c]?.milestone) out.push(c);
    const finalCursor = FINAL_START - halfStart;
    if (finalCursor > 0 && finalCursor < n) out.push(finalCursor);
    out.push(n);
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }, [steps, n, halfStart]);

  const skipToNextStop = useCallback(() => {
    setCursor((c) => stops.find((s) => s > c) ?? n);
  }, [stops, n]);

  // The clock reads the record BEFORE the game named in the header, the way a broadcast
  // bug does — so `cursor` games are on the flaps and game `cursor + 1` is on the floor.
  const shown = steps[Math.min(cursor, n)];
  const currentIndex = Math.min(cursor, n - 1);
  const absIndex = halfStart + currentIndex;
  const gameNumber = absIndex + 1;
  const finalStretch = absIndex >= FINAL_START;
  const blur = cursor >= n ? 0 : blurForGame(absIndex);

  useEffect(() => {
    if (paused) return;
    if (cursor >= n) {
      if (!completed.current) {
        completed.current = true;
        onComplete();
      }
      return;
    }
    const abs = halfStart + cursor;
    // "Instant" is a zero dwell, not a jump to the end: `dwellForGame` still returns the
    // locked FINAL_MS from game 78 on, so instant races to the final stretch and then
    // plays it at the same speed everyone else sees. Streak call-outs still hold.
    const hold = steps[cursor + 1]?.milestone ? MILESTONE_HOLD_MS : 0;
    const t = window.setTimeout(() => setCursor((c) => c + 1), dwellForGame(abs, speed) + hold);
    return () => window.clearTimeout(t);
  }, [cursor, n, halfStart, speed, steps, stops, onComplete, paused]);

  const entry: ChallengeScheduleEntry | undefined = schedule[absIndex];
  const opponentAbbr = entry?.opponent ?? games[currentIndex]?.opponent ?? '';
  const opponentCity = CITY_BY_ABBR.get(opponentAbbr) ?? opponentAbbr;
  const isHome = entry?.isHome ?? games[currentIndex]?.isHome ?? true;

  /** The two opponents already behind us, for the blurred trail (board 3). */
  const trail = [absIndex - 2, absIndex - 1]
    .filter((i) => i >= 0)
    .map((i) => schedule[i]?.opponent ?? '')
    .filter(Boolean);

  const progressPct = ((halfStart + cursor) / CHALLENGE_GAMES) * 100;

  const phaseLabel = finalStretch ? 'Final stretch' : half.half === 1 ? 'First half' : 'Second half';

  // The call-out shows the last MILESTONE passed, not a live streak counter: a ticking
  // "17 straight" would leak the run's shape every frame, which D7 does not allow.
  const calledStreak = useMemo(() => {
    const hit = STREAK_MILESTONES.filter((m) => m <= shown.streak);
    return hit.length > 0 ? hit[hit.length - 1] : null;
  }, [shown.streak]);

  // Board 6's call-out: the next tier still reachable with the games that are left. It
  // is NOT a result signal — it says what is on offer, not how the season has gone.
  const reachable = useMemo(() => {
    const remaining = CHALLENGE_GAMES - (halfStart + cursor);
    const target = nextFamilyAbove(shown.wins);
    if (!target || remaining <= 0) return null;
    const needed = target.min - shown.wins;
    if (needed <= 0 || needed > remaining) return null;
    return { target, note: `Win ${needed} of the last ${remaining} for ${target.title}` };
  }, [shown.wins, halfStart, cursor]);

  const footer = finalStretch
    ? null
    : absIndex < OPENING_GAMES
      ? 'The clock speeds up after the first week. The record comes back into view for the final stretch.'
      : half.half === 1
        ? 'Tap anywhere to jump to the All-Star break.'
        : 'Tap anywhere to jump to the final stretch.';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Skip ahead"
      onClick={paused ? undefined : skipToNextStop}
      onKeyDown={(e) => {
        if (paused) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skipToNextStop(); }
      }}
      className="flex h-dvh-z flex-col bg-surface text-ink outline-none"
      data-testid="challenge-reel"
    >
      {/* header — same height as the app nav */}
      <header className="flex h-nav shrink-0 items-center gap-4 border-b border-line px-6">
        <span className="font-display text-3xl leading-none text-accent">82:0</span>
        <span className="text-xs font-black uppercase tracking-widest text-ink-muted">{phaseLabel}</span>
        <div className="grow" />
        {finalStretch ? (
          <span className="text-xs font-bold text-ink-subtle">Speed locked for the last five games</span>
        ) : (
          <div className="flex overflow-hidden rounded-control border border-line-strong" role="group" aria-label="Reveal speed">
            {(['slower', 'normal', 'instant'] as ReelSpeed[]).map((s) => (
              <Button
                key={s}
                variant="ghost"
                aria-pressed={speed === s}
                onClick={(e) => { e.stopPropagation(); setSpeed(s); }}
                className={cn(
                  'rounded-none px-4 text-xs',
                  speed === s ? 'bg-ink-strong text-surface hover:bg-ink-strong' : 'text-ink-muted',
                )}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
      </header>

      <div className="flex grow flex-col items-center justify-center gap-8 px-8">
        {/* the only per-game information on screen */}
        <div className="flex h-control items-center gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">
            Game {gameNumber} of {CHALLENGE_GAMES}
          </span>
          <span className="h-5 w-px bg-line-strong" />
          {blur > 0.2 ? (
            <>
              {trail.map((abbr, i) => (
                <TeamChip key={`${abbr}-${i}`} abbr={abbr} muted={i === 0 ? 'more' : 'less'} />
              ))}
              <TeamChip abbr={opponentAbbr} current />
            </>
          ) : (
            <>
              <TeamChip abbr={opponentAbbr} current={finalStretch} />
              <span className="text-base font-bold text-ink">
                {isHome ? 'vs' : 'at'} {opponentCity}
              </span>
            </>
          )}
          {calledStreak !== null && <StreakPill streak={calledStreak} />}
        </div>

        <FlipClock wins={shown.wins} losses={shown.losses} blur={blur} />

        {finalStretch ? (
          <TierLadder
            wins={shown.wins}
            ghostWins={ghostWins}
            band={reachable ? [reachable.target.min, reachable.target.max] : undefined}
            note={reachable?.note}
            className="w-full max-w-5xl"
          />
        ) : (
          <div className="flex w-full max-w-5xl flex-col gap-2">
            {/* NEUTRAL by design: never tinted by how the season is going. */}
            <div className="relative h-2 rounded-full bg-line">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-150 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
              <div className="absolute bg-ink-subtle" style={{ left: '50%', top: '-6px', width: '2px', height: '20px' }} />
            </div>
            <div className="grid grid-cols-3 text-xs font-bold text-ink-subtle">
              <span>Opening night</span>
              <span className="text-center">All-Star break · trade deadline</span>
              <span className="text-right">Game {CHALLENGE_GAMES}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-16 shrink-0 items-center justify-center text-sm font-medium text-ink-subtle">
        {footer}
      </div>
    </div>
  );
}

function TeamChip({ abbr, current = false, muted }: { abbr: string; current?: boolean; muted?: 'more' | 'less' }) {
  return (
    <span
      className={cn(
        'flex size-9 items-center justify-center rounded-full border bg-surface-raised text-xs font-black',
        current ? 'border-accent text-ink-strong' : 'border-line-strong text-ink-muted',
        muted === 'more' && 'opacity-35',
        muted === 'less' && 'opacity-60',
      )}
    >
      {abbr}
    </span>
  );
}

function StreakPill({ streak }: { streak: number }) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-black uppercase tracking-wider text-accent">
      <Flame className="h-3.5 w-3.5" />
      {streak} straight
    </span>
  );
}
