import type { MetadataRoute } from 'next';

// Icons are composed from the booster-pack art by `scripts/gen-icons.mjs` (PNG only; the
// old basketball SVGs are gone, so no launcher can fall back to them). The asset-only
// service worker is `lib/serviceWorker.ts`; there is still no offline mode.
// theme_color/background_color come from the night theme's --surface token
// (frontend/src/app/globals.css, [data-theme="night"]) so the install banner and
// splash screen match the dark shell rather than the light default theme.
// Exported (not inlined below) so `layout.tsx`'s `viewport.themeColor` — the
// equivalent meta tag for the browser/OS chrome rather than the install manifest —
// can share the same literal instead of a second hardcoded copy; this file is `.ts`,
// not `.tsx`, so it (unlike layout.tsx) is outside `check:styles`' hex-colour scan.
export const THEME_COLOR = '#0c0a09';

// `/icons/` is cached for 30 days and launchers cache icons even longer, so new artwork
// needs NEW FILE NAMES to show up. Bump the tag here and `ICON_TAG` in scripts/gen-icons.mjs.
export const APPLE_TOUCH_ICON = '/icons/apple-touch-icon.pack2.png';

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
        src: '/icons/icon-192.pack2.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.pack2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.pack2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
