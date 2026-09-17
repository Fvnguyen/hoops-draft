'use client';

/**
 * challenge_mode D6 — the grade ladder (board 6, reused by the front office in T7).
 *
 * The engine's `CHALLENGE_GRADES` has fifteen rungs because it grades with +/-. Showing
 * fifteen bars would be unreadable at a glance, so the ladder draws the seven LETTER
 * FAMILIES the board does, and every family's win range is derived from the engine's own
 * ladder rather than restated here — if D6's bands ever move, the ladder moves with them.
 * `A+` is its own family (not folded into `A`) because the board treats "Historic" as a
 * separate destination, and `S+`/`S` share one.
 *
 * Bar widths are the board's fixed flex weights, NOT the real win widths: F alone covers
 * 40 of 82 wins and would swallow the ladder. The needles are still placed by real wins
 * inside their family, so the marker means what it says.
 */

import type { ReactNode } from 'react';
import { CHALLENGE_GRADES } from '@/engine/challenge';
import { cn } from '@/lib/cn';

interface TierFamily {
  key: string;
  title: string;
  /** Grades from `CHALLENGE_GRADES` that make up this family. */
  grades: string[];
  /** Board 6's bar weight. */
  flex: number;
  min: number;
  max: number;
}

const FAMILY_SPEC: Omit<TierFamily, 'min' | 'max'>[] = [
  { key: 'F', title: 'Tanking', grades: ['F'], flex: 10 },
  { key: 'D', title: 'Lottery', grades: ['D+', 'D', 'D-'], flex: 10 },
  { key: 'C', title: 'Playoff', grades: ['C+', 'C', 'C-'], flex: 7 },
  { key: 'B', title: 'Contender', grades: ['B+', 'B', 'B-'], flex: 5 },
  { key: 'A', title: 'Dynasty', grades: ['A', 'A-'], flex: 10 },
  { key: 'A+', title: 'Historic', grades: ['A+'], flex: 8 },
  { key: 'S', title: 'Perfect', grades: ['S+', 'S'], flex: 3 },
];

/** Built once: each family's inclusive win range, read off the engine ladder. */
export const TIER_FAMILIES: TierFamily[] = FAMILY_SPEC.map((spec) => {
  const rungs = CHALLENGE_GRADES.filter((g) => spec.grades.includes(g.grade));
  return {
    ...spec,
    min: Math.min(...rungs.map((g) => g.min)),
    max: Math.max(...rungs.map((g) => g.max)),
  };
});

/** The family a win total sits in. Clamped, so 0 and 82 both land somewhere. */
export function familyForWins(wins: number): TierFamily {
  const w = Math.round(wins);
  return TIER_FAMILIES.find((f) => w >= f.min && w <= f.max) ?? TIER_FAMILIES[0];
}

/** The next family up, or null at the top of the ladder. */
export function nextFamilyAbove(wins: number): TierFamily | null {
  const current = familyForWins(wins);
  const i = TIER_FAMILIES.indexOf(current);
  return i >= 0 && i < TIER_FAMILIES.length - 1 ? TIER_FAMILIES[i + 1] : null;
}

const TOTAL_FLEX = TIER_FAMILIES.reduce((a, f) => a + f.flex, 0);

/**
 * Left edge of a needle as a percentage of the ladder's width. Families are laid out
 * with `flex-grow`, so a family's share of the track is its flex weight; the position
 * inside it is the win's share of that family's range, centred on the win's own cell.
 */
function needlePercent(wins: number): number {
  const w = Math.max(0, Math.min(82, wins));
  let before = 0;
  for (const f of TIER_FAMILIES) {
    if (w <= f.max) {
      const span = f.max - f.min + 1;
      const frac = Math.max(0, Math.min(1, (w - f.min + 0.5) / span));
      return ((before + frac * f.flex) / TOTAL_FLEX) * 100;
    }
    before += f.flex;
  }
  return 100;
}

export interface TierLadderProps {
  /** The live record so far — highlights its family and drops the bright needle. */
  wins?: number;
  /** D10's "same season without the trade": a faint second needle. Omit to hide it. */
  ghostWins?: number;
  /** D8's pace band (inclusive win range) — the front office's projection, not a record. */
  band?: [number, number];
  /** Call-out pill under the ladder ("Win 2 of the last 3 for Historic"). */
  note?: ReactNode;
  className?: string;
}

export function TierLadder({ wins, ghostWins, band, note, className }: TierLadderProps) {
  const current = wins === undefined ? null : familyForWins(wins);
  const inBand = (f: TierFamily) =>
    band !== undefined && f.max >= Math.min(...band) && f.min <= Math.max(...band);

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative w-full">
        <div className="flex gap-1">
          {TIER_FAMILIES.map((f) => {
            const isCurrent = current?.key === f.key;
            const highlighted = inBand(f);
            return (
              <div key={f.key} className="flex flex-col gap-1.5" style={{ flex: `${f.flex} 1 0` }}>
                <div
                  className={cn(
                    'h-3.5 rounded',
                    isCurrent ? 'bg-accent' : highlighted ? 'bg-line-strong' : 'bg-line',
                  )}
                />
                <div
                  className={cn(
                    'text-xs font-black',
                    isCurrent ? 'text-accent' : highlighted ? 'text-ink' : 'text-ink-inverse-muted',
                  )}
                >
                  {f.key} <span className="font-medium">{f.title}</span>
                </div>
              </div>
            );
          })}
        </div>

        {ghostWins !== undefined && (
          <div
            aria-hidden
            className="absolute bg-ink-subtle opacity-70"
            style={{ left: `${needlePercent(ghostWins)}%`, top: '-8px', width: '2px', height: '30px' }}
          />
        )}
        {wins !== undefined && (
          <div
            aria-hidden
            className="absolute rounded-sm bg-ink-strong"
            style={{ left: `${needlePercent(wins)}%`, top: '-10px', width: '4px', height: '34px' }}
          />
        )}
      </div>

      {(note || ghostWins !== undefined) && (
        <div className="flex items-center gap-4">
          {note && (
            <div className="flex h-9 items-center rounded-full bg-accent-soft px-4 text-xs font-black uppercase tracking-wider text-accent">
              {note}
            </div>
          )}
          {ghostWins !== undefined && (
            <div className="flex items-center gap-2 text-xs font-bold text-ink-subtle">
              <span className="inline-block bg-ink-subtle" style={{ width: '2px', height: '14px' }} />
              Same season without the trade
            </div>
          )}
        </div>
      )}
    </div>
  );
}
