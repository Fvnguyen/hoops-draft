/**
 * The card set version, on its own in a module with NO data import.
 *
 * It used to live in `engine/cards.ts`, next to `import cardsJson from '@/data/cards.json'`.
 * `storage/types.ts` needs only this string, but importing it from there dragged the whole
 * 482 KB card set into the root layout chunk, so every route (the login page included)
 * downloaded and parsed all 448 cards. Anything that needs the VERSION imports it from
 * here; only code that needs the CARDS imports `engine/cards.ts` (plan mobile_load D1).
 *
 * card_balance D8: stamped onto every card by `scripts/build-cards.ts` and read back by
 * storage (`CURRENT_CARD_SET_VERSION`) to flag a drafted/rostered card set older than the
 * one currently shipped. Bump it whenever `computeCards`'s output changes (positions,
 * rarity, badges, ratings).
 */
export const CARD_SET_VERSION = '2026-27.1';

/** season_2026_27 D8: the season part of a version ("2026-27.3" -> "2026-27"). */
export function cardSetSeason(version: string): string {
  return version.split('.')[0];
}
