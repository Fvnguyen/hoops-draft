import type { MetadataRoute } from 'next';

// plan_mobile_responsive D3: Add to Home Screen only, no service worker/offline.
// theme_color/background_color come from the night theme's --surface token
// (frontend/src/app/globals.css, [data-theme="night"]) so the install banner and
// splash screen match the dark shell rather than the light default theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hoops Draft',
    short_name: 'Hoops Draft',
    description: 'The Ultimate Basketball TCG Experience',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0c0a09',
    theme_color: '#0c0a09',
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
