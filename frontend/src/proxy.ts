import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { PUBLIC_PATHS, isProtected } from '@/lib/routeGate';

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

  // The session check below silently refreshes an expired access token via the refresh-token
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

  // plan mobile_load D6: `getClaims()`, not `getUser()`. This project signs its JWTs with an
  // asymmetric key (ES256, published at /auth/v1/.well-known/jwks.json), so the signature is
  // verified HERE against the cached JWKS instead of with a round trip to the auth server
  // on every request — and these functions run in iad1 while Supabase is in eu-central-1,
  // so that round trip crossed the Atlantic. It still goes through `getSession()`, so an
  // expired token is refreshed exactly as before. If the project ever falls back to a
  // symmetric (HS256) key, `getClaims()` calls `getUser()` itself: slower, never less safe.
  // Trade-off: a session revoked elsewhere stays valid here until its access token expires
  // (one hour) — acceptable for a page gate, and the same trust the database already
  // places in the token for RLS.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth')) {
    if (userId && (pathname === '/login' || pathname === '/signup')) {
      return redirect(new URL('/', request.url));
    }
    return response;
  }

  if (!isProtected(pathname)) return response;
  if (!userId) return redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.status !== 'APPROVED') {
    const destination = profile?.status === 'REJECTED' ? '/login?error=rejected' : '/pending';
    return redirect(new URL(destination, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    {
      // Skipped entirely: build output, optimized images, the PWA manifest and service
      // worker, and static files by extension. None of them is an app route, and each one
      // used to cost a session check (the manifest and every `.json` on every page load).
      source: '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|json|txt|woff2)$).*)',
      // `<Link>` prefetches are skipped too: the home page alone prefetches several gated
      // routes, and each one paid the `profiles` lookup above for a payload the user may
      // never open. Nothing is exposed by this — every page here is a client component
      // whose data lives in the browser's IndexedDB, so the prefetched payload is the same
      // static shell already public under /_next/static; server data sits behind /api
      // routes that check the session themselves. The real navigation still runs the gate.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
