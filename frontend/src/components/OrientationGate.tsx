'use client';

import { usePathname } from 'next/navigation';
import { RotateCw } from 'lucide-react';

/**
 * plan_mobile_responsive D2: full-screen "rotate your device" overlay for phones/tablets
 * held in portrait. Shown purely via CSS (`portrait:pointer-coarse:`, i.e.
 * `@media (orientation: portrait) and (pointer: coarse)`) rather than a JS matchMedia
 * listener, so it reacts the instant the device rotates and works under SSR with no
 * hydration flash. Mounted once in the root layout so it covers every route; opts out on
 * the auth routes (login/signup/pending — see `proxy.ts`'s PUBLIC_PATHS), which stay
 * usable in portrait since the owner may install/sign in before ever rotating.
 */
const AUTH_PATHS = new Set(['/login', '/signup', '/pending']);

export function OrientationGate() {
  const pathname = usePathname();
  if (AUTH_PATHS.has(pathname)) return null;

  return (
    <div
      className="fixed inset-0 z-[300] hidden flex-col items-center justify-center gap-4 bg-surface-inverse-deep px-6 text-center text-ink-inverse portrait:pointer-coarse:flex"
      role="alert"
      aria-live="assertive"
    >
      <RotateCw className="size-16 text-ink-inverse-muted" aria-hidden="true" />
      <p className="font-display text-3xl italic tracking-wide">Rotate your device</p>
      <p className="max-w-xs text-sm text-ink-inverse-muted">
        Hoops Draft is built for landscape. Turn your phone or tablet sideways to keep playing.
      </p>
    </div>
  );
}
