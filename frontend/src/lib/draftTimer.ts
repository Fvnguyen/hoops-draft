/**
 * Premier-draft pick clock (plan ui_draft_deckbuild_pack, D4).
 *
 * Seconds allowed per pick within a pack, index = pickNumber - 1. The curve is
 * deliberately non-linear: the first three picks are relaxed, the last three rush.
 * Quick drafts never use a clock (`pickDeadline` stays null).
 */
export const PICK_SECONDS: readonly number[] = [60, 55, 50, 40, 30, 20, 15, 10];

/** Warning thresholds for the timer ring, in seconds remaining. */
export const CLOCK_AMBER_AT = 10;
export const CLOCK_RED_AT = 5;

/**
 * Milliseconds for a given pick (1-based within the pack). Picks beyond the table
 * reuse the last entry. `scale` is a dev/test multiplier (`?clock=fast` → 0.02).
 */
export function pickTimeMs(pickNumber: number, scale = 1): number {
  const idx = Math.min(Math.max(pickNumber, 1), PICK_SECONDS.length) - 1;
  return Math.max(250, Math.round(PICK_SECONDS[idx] * 1000 * scale));
}

/** Deadline (epoch ms) for a pick starting now. */
export function deadlineFor(pickNumber: number, now: number, scale = 1): number {
  return now + pickTimeMs(pickNumber, scale);
}

/** Clock scale from a `clock` query value; only honoured outside production. */
export function clockScaleFromQuery(value: string | null | undefined, isProduction: boolean): number {
  if (isProduction || !value) return 1;
  if (value === 'fast') return 0.02;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
