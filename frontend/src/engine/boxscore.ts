/**
 * Box-score arithmetic shared by everything that totals rows (plan render_and_engine_perf
 * D6). Season totals (`season.ts`) and 82:0 totals (`challenge.ts`) each hand-copied the
 * same twenty `+=` lines; a column added to `PlayerBoxScore` had to be remembered in both,
 * and forgetting one silently produced a stat that never adds up.
 *
 * Wave 0 contract: this file starts with the accumulator only. T2 moves `emptyBoxScore`
 * and `boxScoreThrough` here from `game.ts` and switches the two callers over.
 */

import type { PlayerBoxScore } from './game';

/** Every column that is summed as-is. `minutes` is additive too but rounded (see below);
 *  `playerId`/`playerName` identify the row. A new numeric column belongs in this list —
 *  `boxscore-accumulate.test.ts` fails if `PlayerBoxScore` grows a number that is not covered. */
export const ADDITIVE_BOX_COLUMNS = [
  'possessions', 'points', 'twoPointers', 'threePointers', 'andOnes', 'turnovers', 'assists',
  'offensiveRebounds', 'defensiveRebounds', 'steals', 'blocks',
  'fieldGoalsMade', 'fieldGoalsAttempted', 'threesMade', 'threesAttempted',
  'freeThrowsMade', 'freeThrowsAttempted', 'plusMinus',
] as const satisfies readonly (keyof PlayerBoxScore)[];

/**
 * Adds one row into a running total, in place. Rows from saves that predate a column lack
 * it and count as 0. Minutes are kept to one decimal, re-rounded after every addition, so
 * a season of `x.x` values cannot drift into `1229.3999999999999`.
 *
 * Games played is deliberately NOT handled here: one game contributes 1 when the player
 * was on the floor, while merging two halves contributes that half's own count. That is
 * the caller's knowledge, not the row's.
 */
export function accumulateBoxRow(total: PlayerBoxScore, row: Partial<PlayerBoxScore>): void {
  total.minutes = Math.round((total.minutes + (row.minutes ?? 0)) * 10) / 10;
  for (const column of ADDITIVE_BOX_COLUMNS) total[column] += row[column] ?? 0;
}
