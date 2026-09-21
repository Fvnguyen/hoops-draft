/**
 * `safeNextPath` (`src/lib/safeNextPath.ts`) — guards the login flow's `next` redirect
 * target. `//evil.com` and `/\evil.com` both pass a naive `startsWith('/')` check but are
 * protocol-relative, so an unguarded value reaching `router.push` is an open redirect.
 */

import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safeNextPath';

describe('safeNextPath', () => {
  it('keeps a plain same-origin path', () => {
    expect(safeNextPath('/rosters')).toBe('/rosters');
  });

  it('keeps query and hash on a same-origin path', () => {
    expect(safeNextPath('/roster/abc?x=1')).toBe('/roster/abc?x=1');
  });

  it('rejects a protocol-relative target (//evil.com)', () => {
    expect(safeNextPath('//evil.com')).toBeNull();
  });

  it('rejects a backslash-led target (/\\evil.com), which browsers also treat as protocol-relative', () => {
    expect(safeNextPath('/\\evil.com')).toBeNull();
  });

  it('rejects an absolute off-site URL', () => {
    expect(safeNextPath('https://evil.com')).toBeNull();
  });

  it('keeps a percent-encoded backslash as a literal same-origin path segment', () => {
    // '%5C' is never decoded back into a raw backslash before the URL parser applies its
    // backslash-as-slash rule, so this never leaves the app's origin — it is safe, even
    // though the app itself will just 404 on the literal path.
    expect(safeNextPath('/%5Cevil.com')).toBe('/%5Cevil.com');
  });

  it('rejects an empty string', () => {
    expect(safeNextPath('')).toBeNull();
  });

  it('rejects a non-string value', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it('rejects a javascript: URL', () => {
    expect(safeNextPath('javascript:alert(1)')).toBeNull();
  });
});
