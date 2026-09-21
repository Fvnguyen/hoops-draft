/**
 * Pure Cache-Control rule builder for `next.config.ts`'s `headers()` (plan mobile_load D5).
 *
 * Split out of next.config.ts because next.config.ts is transpiled standalone by Next's own
 * config loader (`node_modules/next/dist/build/next-config-ts/transpile-config.js`), not
 * through the app's normal module graph — Vitest can't import next.config.ts directly the
 * way it imports everything else under `src/`, so the pure rule-building logic lives here
 * instead and next.config.ts just calls it.
 *
 * Rules are built FROM `headshotThumb.ts`'s two prefix lists rather than retyped here, so a
 * prefix added there — which also drives the service worker's own cache list (D11) — only
 * has to be declared once. `IMMUTABLE_ASSET_PREFIXES` entries get a one-year immutable
 * Cache-Control (their URLs change whenever the content does); `LONG_LIVED_ASSET_PREFIXES`
 * entries get 30 days, not `immutable`, because their file names never change and a
 * replaced logo/icon still needs to reach users within a month.
 */
import { IMMUTABLE_ASSET_PREFIXES, LONG_LIVED_ASSET_PREFIXES } from './headshotThumb';

export interface CacheHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

const ONE_YEAR_SECONDS = 31536000;
const THIRTY_DAYS_SECONDS = 2592000;

/**
 * Next.js already stamps `/_next/static/*` (content-hashed build output) with
 * `public, max-age=31536000, immutable` itself and refuses to let `headers()` override it
 * (node_modules/next/dist/docs/.../headers.md, "Cache-Control" section) — declaring a rule
 * for it here would be a no-op at best, so it's skipped.
 */
const SELF_MANAGED_PREFIX = '/_next/static/';

/** "Everything under this prefix" per the Next.js headers() path-matching docs. */
function prefixToSource(prefix: string): string {
  return `${prefix}:path*`;
}

export function buildCacheHeaderRules(): CacheHeaderRule[] {
  const rules: CacheHeaderRule[] = [];

  for (const prefix of IMMUTABLE_ASSET_PREFIXES) {
    if (prefix === SELF_MANAGED_PREFIX) continue;
    rules.push({
      source: prefixToSource(prefix),
      headers: [{ key: 'Cache-Control', value: `public, max-age=${ONE_YEAR_SECONDS}, immutable` }],
    });
  }

  for (const prefix of LONG_LIVED_ASSET_PREFIXES) {
    rules.push({
      source: prefixToSource(prefix),
      headers: [{ key: 'Cache-Control', value: `public, max-age=${THIRTY_DAYS_SECONDS}` }],
    });
  }

  return rules;
}
