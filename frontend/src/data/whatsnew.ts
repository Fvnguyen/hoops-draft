/**
 * Hand-maintained changelog feed (season_lifecycle_notifications D7, extended by
 * whats_new_splash): one entry per release, shown as a full-screen splash on the first
 * visit after it ships and as a compact row in the TopNav bell. Ordered oldest -> newest;
 * add new entries at the end. Not auto-generated from git log — keep entries short and
 * user-facing, not commit messages.
 */
export type ChangelogIcon = 'cloud' | 'activity' | 'trophy' | 'chart' | 'bell' | 'palette' | 'layout' | 'pointer' | 'zap';

export interface ChangelogHighlight {
  icon: ChangelogIcon;
  title: string;
  body: string;
}

export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  eyebrow: string;
  title: string;
  subtitle: string;
  highlights: ChangelogHighlight[];
  cta: string;
}

export const WHATS_NEW: ChangelogEntry[] = [
  {
    id: 'season-lifecycle-2026-09-14',
    date: '2026-09-14',
    eyebrow: 'Patch notes',
    title: 'Fresh off the bench',
    subtitle: "Here's what changed since yesterday's game.",
    highlights: [
      { icon: 'cloud', title: 'Cloud saves', body: 'Your rosters and seasons now follow you to any device.' },
      { icon: 'activity', title: 'Season status', body: 'Pre-Season, Live, and Completed tags on every roster.' },
      { icon: 'trophy', title: 'Champions, preserved', body: 'A Completed season locks in place, view-only, forever.' },
      { icon: 'chart', title: 'Records on the board', body: 'W-L on every roster card, career stats in your profile menu.' },
      { icon: 'bell', title: 'A bell for the buzzer', body: 'Get notified on season wraps and updates like this one.' },
    ],
    cta: 'Back to the court',
  },
  {
    id: 'deckbuilder-hud-2026-09-15',
    date: '2026-09-15',
    eyebrow: 'Patch notes',
    title: 'New court, same game',
    subtitle: 'The whole app got one look, and the deck builder got a rebuild.',
    highlights: [
      { icon: 'palette', title: 'One look, everywhere', body: 'Every screen shares one design system now: bigger buttons, readable text, no more clipped cards.' },
      { icon: 'layout', title: 'Deck builder HUD', body: 'Players, plays and identity at a glance in a slim top bar. Open it for the full team report; click anywhere to close it.' },
      { icon: 'pointer', title: 'Click to build', body: 'Click a play or a player to place it. Dragging still works.' },
      { icon: 'activity', title: 'Sidebars that get out of the way', body: 'Plays and roster dock or fold to a strip; the depth chart scrolls when squeezed.' },
      { icon: 'zap', title: 'Draft room tidy-up', body: 'One Confirm pick button that stays put, smoother pack passes, and a gear menu instead of a website bar.' },
    ],
    cta: 'Back to the court',
  },
];
