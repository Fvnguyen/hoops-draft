'use client';

import { useEffect } from 'react';

/**
 * Registers the asset-only service worker (`/sw.js`, see `lib/serviceWorker.ts`).
 *
 * Production only: in `next dev` the chunks under `/_next/static/` are NOT content-hashed,
 * and a cache-first worker would pin stale code and break hot reload. With the kill switch
 * (`NEXT_PUBLIC_DISABLE_SW=1`) it unregisters whatever an earlier build installed; the
 * `/sw.js` of that build also removes itself, for browsers that never load this page again.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    if (process.env.NEXT_PUBLIC_DISABLE_SW === '1') {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      return;
    }

    // After load, so registering never competes with the first paint for bandwidth.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('Service worker registration failed:', err));
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
