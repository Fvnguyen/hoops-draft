/**
 * plan_ui_foundation D6: route classification shared by TopNav (and anything else that
 * needs to know "is this a game screen"). The deck builder lives at `/roster/[id]`, not
 * `/deckbuilder` — that old TopNav check never matched.
 */

/** Draft, deck builder and season screens: no chrome bar, just the gear menu. */
export function isGameRoute(pathname: string): boolean {
  return pathname.startsWith('/draft') || pathname.startsWith('/roster/') || pathname.startsWith('/season');
}

/** Full-bleed dark shells with no room for an opaque bar: the home hero and every
 *  (auth) page (login/signup/pending share AuthLayout's dark shell). */
export function isBareRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/pending';
}
