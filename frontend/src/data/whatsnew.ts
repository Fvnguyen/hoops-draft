/**
 * Hand-maintained changelog feed for the TopNav notification bell
 * (season_lifecycle_notifications D7). Ordered oldest -> newest; add new entries at the
 * end. Not auto-generated from git log — keep entries short and user-facing, not commit
 * messages.
 */
export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
}

export const WHATS_NEW: ChangelogEntry[] = [
  {
    id: 'cloud-saves-2026-09-14',
    date: '2026-09-14',
    title: 'Cloud saves',
    body: 'Your drafts, rosters, and seasons now sync across devices — sign in anywhere to pick up where you left off.',
  },
  {
    id: 'season-lifecycle-2026-09-14',
    date: '2026-09-14',
    title: 'Season status and records',
    body: 'Rosters and seasons now show Pre-Season, Live, or Completed status. Completed seasons are locked read-only, and your record now shows up on the Roster overview and in this menu.',
  },
];
