/**
 * pvp_series T6 (D6): `computeUserPlayoffsStats` — the signed-in user's Playoffs series
 * record (`ProfileSummary` in `components/TopNav.tsx` shows "Playoffs: W-L series" from
 * this), counted only from `done` matches (winner_id set). Forfeits, voids, declines and
 * anything still in progress don't count as a played series.
 */
import { describe, expect, it } from 'vitest';
import { computeUserPlayoffsStats } from '@/hooks/useUserSeasonStats';

const ME = 'user-me';
const THEM = 'user-them';

function match(status: string, winner_id: string | null) {
  return { status, winner_id };
}

describe('computeUserPlayoffsStats', () => {
  it('is all-zero with no matches', () => {
    expect(computeUserPlayoffsStats([], ME)).toEqual({ series: 0, wins: 0, losses: 0 });
  });

  it('counts only done matches, ignoring in-progress and other terminal statuses', () => {
    const matches = [
      match('done', ME),
      match('done', THEM),
      match('series', null),
      match('sideboard', null),
      match('invited', null),
      match('forfeit', ME),
      match('void', null),
      match('declined', null),
      match('expired', null),
    ];
    expect(computeUserPlayoffsStats(matches, ME)).toEqual({ series: 2, wins: 1, losses: 1 });
  });

  it('tallies wins vs losses by winner_id', () => {
    const matches = [match('done', ME), match('done', ME), match('done', ME), match('done', THEM)];
    expect(computeUserPlayoffsStats(matches, ME)).toEqual({ series: 4, wins: 3, losses: 1 });
  });

  it('a perfect losing record is still reported (not mistaken for "no series played")', () => {
    const matches = [match('done', THEM), match('done', THEM)];
    expect(computeUserPlayoffsStats(matches, ME)).toEqual({ series: 2, wins: 0, losses: 2 });
  });
});
