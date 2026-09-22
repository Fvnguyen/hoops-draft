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
    || pathname.startsWith('/challenge') || PLAYOFFS_ROOM.test(pathname);
}

/** pvp_draft/pvp_series: the Playoffs draft room, deck builder and game page are the solo
 *  screens in PvP form. Without this the fixed bar sat over the deck builder's KPI band and
 *  ate "Lock roster", and the game page rendered inside a page shell instead of the
 *  tournament's full-height one. `/playoffs/new` and the series page stay ordinary pages. */
const PLAYOFFS_ROOM = /^\/playoffs\/[^/]+\/(draft|build|game)(\/|$)/;

/** Full-bleed dark shells with no room for an opaque bar: the home hero and every (auth)
 *  page (login/signup/pending share AuthLayout's dark shell). The 82:0 Challenge is NOT
 *  here — it carries its own 56px header, so the cream bar would land on top of it, but
 *  it still needs a way out mid-run; it is a game route instead. */
export function isBareRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/pending';
}

/**
 * Where the "What's New" splash is allowed to interrupt.
 *
 * It lives in the root layout and opens as soon as BOTH the profile and the stored
 * last-seen id have loaded — two async reads. Whatever page you are on when the slower
 * one lands is where a full-screen modal appears, which in practice meant mid-draft
 * rather than on the start page it was designed for (owner, 2026-09-18).
 *
 * So it is confined to the calm routes: never over a draft, deck builder, season or 82:0
 * run, and never over the auth pages. It is not lost when suppressed — the release stays
 * unread in the notification bell, which is reachable from every screen including the
 * game routes' gear menu, and the splash still opens next time the user is somewhere calm.
 */
export function canShowWhatsNew(pathname: string): boolean {
  if (isGameRoute(pathname)) return false;
  return pathname !== '/login' && pathname !== '/signup' && pathname !== '/pending';
}
