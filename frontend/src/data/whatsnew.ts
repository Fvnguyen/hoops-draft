/**
 * Hand-maintained changelog feed (season_lifecycle_notifications D7, extended by
 * whats_new_splash): one entry per release, shown as a full-screen splash on the first
 * visit after it ships and as a compact row in the TopNav bell. Ordered oldest -> newest;
 * add new entries at the end. Not auto-generated from git log — keep entries short and
 * user-facing, not commit messages.
 */
export type ChangelogIcon = 'cloud' | 'activity' | 'trophy' | 'chart' | 'bell' | 'palette' | 'layout' | 'pointer' | 'zap' | 'phone' | 'hand' | 'grid' | 'sparkles';

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
  {
    id: 'mobile-landscape-2026-09-16',
    date: '2026-09-16',
    eyebrow: 'Patch notes',
    title: 'Pocket court',
    subtitle: 'Hoops Draft now fits your phone. Turn it sideways and play.',
    highlights: [
      { icon: 'phone', title: 'Built for landscape', body: 'Home, the draft, the deck builder, games and seasons all fit a phone screen, no pinching, no sideways scrolling.' },
      { icon: 'hand', title: 'Press and hold to read a card', body: 'Long-press any player or play card for the big version with every badge explained. Tap to select, tap again to deselect, Confirm to pick.' },
      { icon: 'grid', title: 'Two rows of eight', body: 'Pack picks show all eight cards at once with names that wrap instead of getting cut off.' },
      { icon: 'pointer', title: 'Basic plays, one tap', body: 'Tap Basic Offense or Basic Defense and it lands in your first open play slot.' },
      { icon: 'sparkles', title: 'New pack, new card backs', body: 'A fresh pack cover and Hoop Draft card backs for the reveal, and the reveal no longer shows text through the packs.' },
      { icon: 'layout', title: 'Season at a glance', body: 'Schedule and standings sit side by side, so the season page needs less scrolling.' },
    ],
    cta: 'Back to the court',
  },
];
