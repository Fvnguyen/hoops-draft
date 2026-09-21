import { CARD_SET_VERSION } from '@/engine/cardSetVersion';
import { IMMUTABLE_ASSET_PREFIXES, LONG_LIVED_ASSET_PREFIXES } from '@/lib/headshotThumb';
import { buildServiceWorkerSource } from '@/lib/serviceWorker';

// Generated once per build (`force-static`), so the build id below is baked into the
// deployment: a new deploy serves a byte-different worker, which is how browsers notice
// there is an update. A plain file in `public/` could not know its own build.
export const dynamic = 'force-static';

const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? `local-${Date.now()}`).slice(0, 16);

export function GET() {
  const source = buildServiceWorkerSource({
    buildId: BUILD_ID,
    cardSetVersion: CARD_SET_VERSION,
    immutablePrefixes: IMMUTABLE_ASSET_PREFIXES,
    longLivedPrefixes: LONG_LIVED_ASSET_PREFIXES,
    disabled: process.env.NEXT_PUBLIC_DISABLE_SW === '1',
  });
  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // The worker script itself must always be revalidated, or a bad one could not be
      // replaced (or killed) until its cache lifetime ran out.
      'Cache-Control': 'no-cache',
    },
  });
}
