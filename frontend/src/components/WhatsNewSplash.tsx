'use client';

/**
 * whats_new_splash: a full-screen "what's new" splash, styled after the home page hero
 * (arena glow, Bebas Neue gradient headline, the same gold/orange CTA treatment as
 * PREMIER DRAFT). Shows once per unseen changelog release (`useNotices`), on whichever
 * page loads first after login — usually the home page, per the design brief. Dismissing
 * it (backdrop, close button, or the CTA) marks the release seen, same as opening the
 * TopNav bell would.
 */
import { Activity, BarChart3, Bell, Cloud, Trophy, X, type LucideIcon } from 'lucide-react';
import { useCurrentProfile } from './AuthProvider';
import { useNotices } from '@/hooks/useNotices';
import type { ChangelogIcon } from '@/data/whatsnew';

const ICONS: Record<ChangelogIcon, LucideIcon> = {
  cloud: Cloud,
  activity: Activity,
  trophy: Trophy,
  chart: BarChart3,
  bell: Bell,
};

export function WhatsNewSplash() {
  const profile = useCurrentProfile();
  const { latestUnseenEntry, markChangelogSeen } = useNotices();

  if (!profile || !latestUnseenEntry) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={markChangelogSeen}
    >
      <div
        className="relative w-full max-w-md bg-stone-900 border border-stone-700/60 rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={markChangelogSeen}
          className="absolute right-3 top-3 z-10 text-stone-500 hover:text-stone-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative px-7 pt-8 pb-4 overflow-hidden">
          <div className="absolute -top-16 -left-10 w-56 h-56 bg-yellow-500/20 blur-[80px] rounded-full pointer-events-none" />
          <div className="absolute -bottom-16 -right-10 w-48 h-48 bg-orange-600/20 blur-[80px] rounded-full pointer-events-none" />
          <p className="relative text-[11px] font-black uppercase tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
            {latestUnseenEntry.eyebrow}
          </p>
          <h2
            className="relative text-4xl italic font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-stone-200 to-stone-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: 'var(--font-bebas)' }}
          >
            {latestUnseenEntry.title}
          </h2>
          <p className="relative mt-1 text-sm text-stone-400">{latestUnseenEntry.subtitle}</p>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2">
          {latestUnseenEntry.highlights.map((h) => {
            const Icon = ICONS[h.icon];
            return (
              <div
                key={h.title}
                className="flex items-start gap-3 bg-stone-800/60 border border-stone-700/50 rounded-lg px-3 py-2.5"
              >
                <div className="w-7 h-7 rounded-full bg-stone-900 border border-yellow-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <p className="text-[13px] text-stone-300 leading-snug">
                  <span className="font-bold text-white">{h.title}</span> — {h.body}
                </p>
              </div>
            );
          })}

          <button
            onClick={markChangelogSeen}
            className="mt-2 px-6 py-3 bg-gradient-to-r from-yellow-500/90 to-orange-600/70 border border-yellow-400/60 rounded hover:from-yellow-400 hover:to-orange-500 transition-all shadow-[0_0_25px_rgba(234,179,8,0.25)] font-black uppercase tracking-widest text-sm text-white"
          >
            {latestUnseenEntry.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
