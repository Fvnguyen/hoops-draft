/**
 * plan mobile_load T5/D5: `next.config.ts`'s `headers()` rules, built from
 * `headshotThumb.ts`'s prefix lists. next.config.ts itself isn't importable from Vitest (it
 * is loaded by Next's own config transpiler, not the app's module graph), so this exercises
 * the pure `buildCacheHeaderRules` it calls.
 */
import { describe, it, expect } from 'vitest';
import { buildCacheHeaderRules } from '@/lib/cacheHeaders';
import { IMMUTABLE_ASSET_PREFIXES, LONG_LIVED_ASSET_PREFIXES } from '@/lib/headshotThumb';

const NEVER_MATCH = ['/', '/api/cards', '/api/auth/callback', '/_next/image', '/draft', '/rosters', '/login'];

describe('buildCacheHeaderRules', () => {
  const rules = buildCacheHeaderRules();

  // `/_next/static/` is immutable in IMMUTABLE_ASSET_PREFIXES, but Next.js sets that
  // Cache-Control itself and refuses to let headers() override it, so no rule is emitted.
  const expectedImmutable = IMMUTABLE_ASSET_PREFIXES.filter((p) => p !== '/_next/static/');

  it('emits exactly one rule per non-self-managed prefix', () => {
    expect(rules).toHaveLength(expectedImmutable.length + LONG_LIVED_ASSET_PREFIXES.length);
    const sources = rules.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('does not emit a rule for /_next/static/, which Next.js manages itself', () => {
    expect(rules.some((r) => r.source.startsWith('/_next/static/'))).toBe(false);
  });

  it('immutable prefixes get a one-year immutable Cache-Control', () => {
    for (const prefix of expectedImmutable) {
      const rule = rules.find((r) => r.source === `${prefix}:path*`);
      expect(rule, `no rule for ${prefix}`).toBeDefined();
      expect(rule!.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
    }
  });

  it('long-lived prefixes get 30 days and are NOT immutable', () => {
    for (const prefix of LONG_LIVED_ASSET_PREFIXES) {
      const rule = rules.find((r) => r.source === `${prefix}:path*`);
      expect(rule, `no rule for ${prefix}`).toBeDefined();
      expect(rule!.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=2592000' }]);
      expect(rule!.headers[0].value).not.toContain('immutable');
    }
  });

  it('no rule source can match "/", an API route, /_next/image, or an HTML route', () => {
    for (const rule of rules) {
      // `<prefix>:path*` (zero-or-more) matches exactly the paths starting with `<prefix>`.
      expect(rule.source.endsWith(':path*')).toBe(true);
      const prefix = rule.source.slice(0, -':path*'.length);
      expect(prefix).not.toBe('/');
      expect(prefix.startsWith('/api/')).toBe(false);
      expect(prefix.startsWith('/_next/image')).toBe(false);
      for (const path of NEVER_MATCH) {
        expect(path.startsWith(prefix), `rule "${rule.source}" unexpectedly matches "${path}"`).toBe(false);
      }
    }
  });
});
