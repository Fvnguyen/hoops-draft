import type { Metadata } from "next";
import { Inter, Bebas_Neue, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from '@/components/TopNav';
import { WhatsNewSplash } from '@/components/WhatsNewSplash';
import { StorageProvider } from '@/components/StorageProvider';
import { AuthProvider } from '@/components/AuthProvider';

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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${bebasNeue.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <StorageProvider>
            <TopNav />
            <WhatsNewSplash />
            {children}
          </StorageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
