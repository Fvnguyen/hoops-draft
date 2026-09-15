'use client';

/**
 * whats_new_splash: a full-screen "what's new" splash, styled after the home page hero
 * (arena glow, Bebas Neue gradient headline, the same gold/orange CTA treatment as
 * PREMIER DRAFT). Shows once per unseen changelog release (`useNotices`), on whichever
 * page loads first after login — usually the home page, per the design brief. Dismissing
 * it (backdrop, close button, or the CTA) marks the release seen, same as opening the
 * TopNav bell would.
 *
 * plan_ui_foundation D9: renders through the shared `Overlay` primitive — Escape and
 * backdrop close, body scroll lock, and `max-h-[90dvh] overflow-y-auto` all come from
 * there for free (the previous hand-rolled scrim couldn't be dismissed on a short
 * viewport, D5/mobile-audit `undismissable splash`).
 */
import { Activity, BarChart3, Bell, Cloud, Trophy, type LucideIcon } from 'lucide-react';
import { useCurrentProfile } from './AuthProvider';
import { useNotices } from '@/hooks/useNotices';
import type { ChangelogIcon } from '@/data/whatsnew';
import { Overlay } from './ui/Overlay';
import { Panel } from './ui/Panel';
import { Button } from './ui/Button';

const ICONS: Record<ChangelogIcon, LucideIcon> = {
  cloud: Cloud,
  activity: Activity,
  trophy: Trophy,
  chart: BarChart3,
  bell: Bell,
};

const TITLE_ID = 'whats-new-splash-title';

export function WhatsNewSplash() {
  const profile = useCurrentProfile();
  const { latestUnseenEntry, markChangelogSeen } = useNotices();

  return (
    <Overlay open={!!profile && !!latestUnseenEntry} onClose={markChangelogSeen} labelledBy={TITLE_ID} size="md">
      {latestUnseenEntry && (
        <>
          <div className="relative px-7 pt-8 pb-4 overflow-hidden">
            <div className="absolute -top-16 -left-10 w-56 h-56 bg-accent-soft/40 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-16 -right-10 w-48 h-48 bg-accent/20 blur-[80px] rounded-full pointer-events-none" />
            <p className="relative text-xs font-black uppercase tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-brand-from to-brand-to">
              {latestUnseenEntry.eyebrow}
            </p>
            <h2
              id={TITLE_ID}
              className="relative text-4xl italic font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-ink-inverse to-ink-inverse-muted drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
              style={{ fontFamily: 'var(--font-bebas)' }}
            >
              {latestUnseenEntry.title}
            </h2>
            <p className="relative mt-1 text-sm text-ink-inverse-muted">{latestUnseenEntry.subtitle}</p>
          </div>

          <div className="px-6 pb-6 flex flex-col gap-2">
            {latestUnseenEntry.highlights.map((h) => {
              const Icon = ICONS[h.icon];
              return (
                <Panel key={h.title} variant="sunken" padding="sm" className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-surface-inverse-deep border border-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <p className="text-sm text-ink-inverse-muted leading-snug">
                    <span className="font-bold text-ink-inverse">{h.title}</span> — {h.body}
                  </p>
                </Panel>
              );
            })}

            <Button size="lg" className="mt-2 w-full" onClick={markChangelogSeen}>
              {latestUnseenEntry.cta}
            </Button>
          </div>
        </>
      )}
    </Overlay>
  );
}
