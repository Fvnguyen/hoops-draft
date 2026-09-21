import type { MetadataRoute } from 'next';

// plan_mobile_responsive D3: Add to Home Screen only, no service worker/offline.
// theme_color/background_color come from the night theme's --surface token
// (frontend/src/app/globals.css, [data-theme="night"]) so the install banner and
// splash screen match the dark shell rather than the light default theme.
// Exported (not inlined below) so `layout.tsx`'s `viewport.themeColor` — the
// equivalent meta tag for the browser/OS chrome rather than the install manifest —
// can share the same literal instead of a second hardcoded copy; this file is `.ts`,
// not `.tsx`, so it (unlike layout.tsx) is outside `check:styles`' hex-colour scan.
export const THEME_COLOR = '#0c0a09';

// mobile_load T9/D9: PNGs (from `node scripts/gen-icons.mjs`) come first — Android's
// install prompt and richer splash screens use these, not the SVG. The SVG stays last
// as a `sizes: 'any'` fallback for anything that prefers a vector icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Hoops Draft',
    short_name: 'Hoops Draft',
    description: 'The Ultimate Basketball TCG Experience',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
