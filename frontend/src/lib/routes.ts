/**
 * plan_ui_foundation D6: route classification shared by TopNav (and anything else that
 * needs to know "is this a game screen"). The deck builder lives at `/roster/[id]`, not
 * `/deckbuilder` — that old TopNav check never matched.
 */

/** Draft, deck builder, season and 82:0 screens: no chrome bar, just the gear menu.
 *  The challenge run is ~4 minutes with no other way out, so it needs the gear's Home
 *  item (which confirms before leaving) — its own 56px headers reserve `pr-nav-gear` on
 *  the right so their controls clear the fixed gear. */
export function isGameRoute(pathname: string): boolean {
  return pathname.startsWith('/draft') || pathname.startsWith('/roster/') || pathname.startsWith('/season')
    || pathname.startsWith('/challenge');
}

/** Full-bleed dark shells with no room for an opaque bar: the home hero and every (auth)
 *  page (login/signup/pending share AuthLayout's dark shell). The 82:0 Challenge is NOT
 *  here — it carries its own 56px header, so the cream bar would land on top of it, but
 *  it still needs a way out mid-run; it is a game route instead. */
export function isBareRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/pending';
}
