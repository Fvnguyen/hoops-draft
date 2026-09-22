/**
 * Which paths the auth proxy (`src/proxy.ts`) gates. Its own module so the rules are unit
 * tested: a missing prefix here is a page that renders for a signed-out visitor.
 */

export const PUBLIC_PATHS = new Set(['/login', '/signup', '/pending']);
const PROTECTED_PREFIXES = ['/draft', '/rosters', '/roster', '/season', '/challenge', '/playoffs', '/admin', '/deckbuilder-test', '/data', '/debug', '/test-ui', '/pack-opener-preview', '/theater-preview'];
// AGENTS.md: the no-auth design sign-off routes. They render fixtures only — no storage,
// no simulation — and must stay reachable without a session.
const PUBLIC_PREVIEWS = new Set(['/challenge/preview', '/challenge/preview-results']);

export function isProtected(pathname: string) {
  // The home page is gated too — an unauthenticated visitor should always
  // land on /login, never see the app shell first and only get bounced once
  // they click something.
  if (pathname === '/') return true;
  if (PUBLIC_PREVIEWS.has(pathname)) return false;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
