/**
 * plan_ui_foundation D6: route classification shared by TopNav (and anything else that
 * needs to know "is this a game screen"). The deck builder lives at `/roster/[id]`, not
 * `/deckbuilder` — that old TopNav check never matched.
 */

/** Draft, deck builder and season screens: no chrome bar, just the gear menu. */
export function isGameRoute(pathname: string): boolean {
  return pathname.startsWith('/draft') || pathname.startsWith('/roster/') || pathname.startsWith('/season');
}

/** Full-bleed dark shells with no room for an opaque bar: the home hero, every (auth)
 *  page (login/signup/pending share AuthLayout's dark shell), and the 82:0 Challenge
 *  (challenge_mode D2/D7 — the reel, the front office and the results screen each carry
 *  their own 56px header, and the cream nav bar would sit straight on top of it). */
export function isBareRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/pending'
    || pathname.startsWith('/challenge');
}
