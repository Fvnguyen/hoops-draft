import type { Metadata, Viewport } from "next";
import { Inter, Bebas_Neue, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from '@/components/TopNav';
import { WhatsNewSplash } from '@/components/WhatsNewSplash';
import { StorageProvider } from '@/components/StorageProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { OrientationGate } from '@/components/OrientationGate';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hoops Draft",
  description: "The Ultimate Basketball TCG Experience",
  icons: {
    apple: '/icons/icon.svg',
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
// what that default is missing (safe-area insets for notches/gesture bars on install).
export const viewport: Viewport = {
  viewportFit: 'cover',
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
            {children}
          </StorageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
