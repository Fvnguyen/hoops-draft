import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set(['/login', '/signup', '/pending']);
const PROTECTED_PREFIXES = ['/draft', '/rosters', '/season', '/deckbuilder-test', '/data', '/debug', '/test-ui', '/pack-opener-preview'];

function isProtected(pathname: string) {
  // The home page is gated too — an unauthenticated visitor should always
  // land on /login, never see the app shell first and only get bounced once
  // they click something.
  if (pathname === '/') return true;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// The project has multiple live production aliases (hoops-draft.vercel.app,
// hoops-draft-fvnguyen1.vercel.app, hoops-draft-git-main-fvnguyen1.vercel.app,
// frontend-six-zeta-19.vercel.app). Auth cookies and IndexedDB are both
// strictly per-origin, so landing on a non-canonical one mid-session drops
// your session (fixed above) or makes your saved rosters/drafts look missing
// (they're not — they're just in that origin's storage, unreachable from here
// by design). Normalizing to one host stops either from happening again; it
// can't recover data already split across them. Listed explicitly (not a
// blanket *.vercel.app match) so a future PR preview deployment's own unique
// URL still works for previewing that build.
const CANONICAL_HOST = 'hoops-draft.vercel.app';
const NON_CANONICAL_ALIASES = new Set([
  'hoops-draft-fvnguyen1.vercel.app',
  'hoops-draft-git-main-fvnguyen1.vercel.app',
  'frontend-six-zeta-19.vercel.app',
]);

export async function proxy(request: NextRequest) {
  if (NON_CANONICAL_ALIASES.has(request.nextUrl.hostname)) {
    const canonical = new URL(request.url);
    canonical.hostname = CANONICAL_HOST;
    canonical.port = '';
    return NextResponse.redirect(canonical, 308);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() silently refreshes an expired access token via the refresh-token
  // cookie and hands the new pair to `setAll` above, landing on `response` —
  // but a redirect built as `NextResponse.redirect(...)` is a brand-new object
  // that doesn't carry those refreshed cookies. Without copying them over here,
  // a refresh-then-redirect (e.g. hitting a protected route right as the access
  // token expires) ships the OLD, now-consumed refresh token back to the
  // browser: every next request repeats the same failed refresh and redirect,
  // even though the session is actually fine (confirmed by /api/auth/me, which
  // runs in a Route Handler and persists its own refresh correctly).
  const redirect = (url: URL) => {
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth')) {
    if (user && (pathname === '/login' || pathname === '/signup')) {
      return redirect(new URL('/', request.url));
    }
    return response;
  }

  if (!isProtected(pathname)) return response;
  if (!user) return redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.status !== 'APPROVED') {
    const destination = profile?.status === 'REJECTED' ? '/login?error=rejected' : '/pending';
    return redirect(new URL(destination, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};