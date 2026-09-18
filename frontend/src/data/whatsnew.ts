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
  {
    id: 'card-balance-game-theater-2026-09-17',
    date: '2026-09-17',
    eyebrow: 'Patch notes',
    title: 'A fairer game, a livelier one',
    subtitle: 'Card balance got a full pass, and every game now tells its own story.',
    highlights: [
      { icon: 'sparkles', title: 'Badges, retuned', body: 'Every badge tier now means something real and consistent across every skill, and four new combo badges reward players who are genuinely elite at two things at once, not just one.' },
      { icon: 'grid', title: 'Two new ways to build', body: 'Point Forward is a new play built around a playmaking big who kicks out to shooters. Positionless Revolution is a new team identity that rewards a roster full of versatile, multi-position players.' },
      { icon: 'chart', title: 'Positions and rarity, fixed', body: 'Player positions now reflect how they actually play, rarity leans more on real accolades and reputation, and the card pool overall plays fairer from top to bottom.' },
      { icon: 'activity', title: 'Game Theater', body: 'Watch a game unfold with real play-by-play narration, a fuller live box score, and playback controls, not just a score ticking up.' },
      { icon: 'zap', title: 'Plays feel more real', body: 'Play and identity activation now reflects genuine roster construction — build toward an archetype and you can actually reach it.' },
    ],
    cta: 'Back to the court',
  },
  {
    id: 'challenge-mode-2026-09-18',
    date: '2026-09-18',
    eyebrow: 'Patch notes',
    title: '82 games. One grade.',
    subtitle: 'A whole new way to play, and a card pool being rebuilt underneath it.',
    highlights: [
      { icon: 'trophy', title: 'The 82:0 Challenge', body: 'Pick your mode on the start page before you draft. One full season against all 30 real NBA teams, revealed on a split-flap clock that speeds up as the season runs away from you, ending in a single grade from F to S+.' },
      { icon: 'bell', title: 'The All-Star break', body: 'At game 41 your coach, owner and fans each tell you what they would change and show you the evidence for it. Reset the lineup, re-cut your plays, and make one trade from a pack of five offers.' },
      { icon: 'chart', title: 'See what the trade was worth', body: 'The results screen replays your second half with the roster you had before the deadline, so the "+3 wins" on your trade is a real comparison, not a guess.' },
      { icon: 'grid', title: 'Coming next: players who play where they actually play', body: 'Position eligibility is being sourced properly, so someone who genuinely covers three spots will be eligible at all three instead of pinned to one. More ways to build a lineup — and real material for Positionless Revolution.' },
      { icon: 'sparkles', title: 'Coming next: cards that reward what is hard', body: 'Card strength is being rebuilt around shot creation, passing load and real defensive impact, instead of counting stats that mostly reward minutes on court. A backup big will stop out-ranking a star shooter. And anyone genuinely off the charts in a skill earns a new gold badge, a tier above level 3.' },
    ],
    cta: 'Back to the court',
  },
  {
    id: 'card-badge-balance-2026-09-19',
    date: '2026-09-19',
    eyebrow: 'Patch notes',
    title: 'Every colour gets its shot',
    subtitle: 'Rarity, badges and team identities all got tuned, and bots stopped playing it so safe.',
    highlights: [
      { icon: 'sparkles', title: 'Rarity, simplified', body: 'Card rarity now follows one clear rule — an OVR band, a couple of bumps, then a floor and ceiling — so award winners and legends are reliably rare without a grab-bag of special cases.' },
      { icon: 'chart', title: 'Badges, rebalanced', body: 'Every skill badge now shows up about as often as every other one — shooters and finishers are no longer starved for badges next to stacked defenders.' },
      { icon: 'grid', title: 'A new identity: Crash and Finish', body: 'Rebounders get a second team identity — crash the offensive glass and finish at the rim, alongside Second-Chance Engine.' },
      { icon: 'activity', title: 'Bots play more identities', body: 'Opponent and bot rosters now pick from every identity they have earned instead of always defaulting to the safest one — expect more variety across your league and the 82:0 field.' },
      { icon: 'zap', title: 'Fairer plans across the board', body: 'Defensive identities are no longer easier to unlock than offensive ones now that badges are balanced — every plan takes real roster building.' },
    ],
    cta: 'Back to the court',
  },
];
