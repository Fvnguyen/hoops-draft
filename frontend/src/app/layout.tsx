import type { Metadata, Viewport } from "next";
import { Inter, Bebas_Neue, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from '@/components/TopNav';
import { WhatsNewSplash } from '@/components/WhatsNewSplash';
import { StorageProvider } from '@/components/StorageProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { OrientationGate } from '@/components/OrientationGate';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { APPLE_TOUCH_ICON, THEME_COLOR } from './manifest';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

// mobile_load T8/D8: Geist_Mono is only used in the box score, game and season views —
// not every route — so it shouldn't be preloaded on every page load.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Hoops Draft",
  description: "The Ultimate Basketball TCG Experience",
  // mobile_load T9/D9: iOS Safari ignores an SVG apple-touch-icon, so this points at the
  // 180x180 PNG `scripts/gen-icons.mjs` renders (flattened onto the manifest's dark
  // background). No `icon` entry here: `app/favicon.ico` (Next's file-convention icon)
  // already covers the browser-tab favicon; the PNGs in `manifest.ts` are what Android's
  // install prompt/splash screen read, not `metadata.icons`.
  icons: {
    apple: APPLE_TOUCH_ICON,
  },
  appleWebApp: {
    title: 'Hoops Draft',
    statusBarStyle: 'black-translucent',
  },
  // plan_mobile_responsive D3: iOS Safari only honours the legacy `apple-*` names,
  // not the standard mobile-web-app-capable tag appleWebApp above already emits.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

// Next 16 already emits `width=device-width, initial-scale=1` by default; only add
// what that default is missing (safe-area insets for notches/gesture bars on install,
// and a theme-color meta tag so the OS status bar / task switcher chrome matches the
// dark shell rather than defaulting to white).
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // plan_ui_foundation D1: the theme is this one attribute. Every semantic colour
      // utility resolves against it (see globals.css); "night" is the other value.
      data-theme="court"
      className={`${inter.variable} ${bebasNeue.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <StorageProvider>
            <TopNav />
            <WhatsNewSplash />
            <OrientationGate />
            <ServiceWorkerRegistrar />
            {children}
          </StorageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
