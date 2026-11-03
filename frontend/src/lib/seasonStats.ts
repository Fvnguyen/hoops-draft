'use client';

// season_2026_27 D6: daily current-season per-game stats for the card back, kept apart
// from the weekly card set. `card.stats` is a prior/current BLEND and is never shown
// once a card has `seasonStats` or a daily row.
import { useEffect, useState } from 'react';

/** One daily row, written by data/refresh_stats.js. Percentages are 0-1 fractions. */
export interface DailyStatRow {
  gp: number;
  gs?: number;
  mpg: number;
  pts: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fta?: number;
  fg_pct: number;
  fg3_pct: number;
  fg2_pct: number;
  ft_pct: number;
}

export interface SeasonStatsFile {
  asOf: string;
  season: string;
  players: Record<string, DailyStatRow>;
}

export interface CardStatsInput {
  id: string;
  seasonStats?: Partial<DailyStatRow> | null;
}

export interface ResolvedSeasonStats {
  stats: DailyStatRow | null;
  asOf: string | null;
  season: string | null;
}

/** Pure lookup: daily row by card id, else the baked `seasonStats`, else null. */
export function resolveSeasonStats(
  card: CardStatsInput,
  file: SeasonStatsFile | null,
): ResolvedSeasonStats {
  const daily = file?.players?.[card.id];
  if (daily) return { stats: daily, asOf: file!.asOf ?? null, season: file!.season ?? null };
  if (card.seasonStats) {
    return { stats: card.seasonStats as DailyStatRow, asOf: null, season: file?.season ?? null };
  }
  return { stats: null, asOf: null, season: file?.season ?? null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-03" -> "Nov 3"; null for anything unparseable. */
export function formatAsOf(asOf: string | null): string | null {
  const m = asOf ? /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf) : null;
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : null;
}

/** "2026-27 · as of Nov 3", or just "2026-27" when only the baked row is available. */
export function seasonLabel(season: string, asOf: string | null): string {
  const d = formatAsOf(asOf);
  return d ? `${season} · as of ${d}` : season;
}

let filePromise: Promise<SeasonStatsFile | null> | null = null;

/** Fetched once per page load; `no-cache` revalidates so a daily deploy is picked up. */
export function loadSeasonStats(): Promise<SeasonStatsFile | null> {
  if (!filePromise) {
    filePromise = fetch('/data/season-stats.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<SeasonStatsFile>) : null))
      .catch(() => null);
  }
  return filePromise;
}

export interface UseSeasonStats extends ResolvedSeasonStats {
  loading: boolean;
}

export function useSeasonStats(card: CardStatsInput): UseSeasonStats {
  const [file, setFile] = useState<SeasonStatsFile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    loadSeasonStats().then((f) => {
      if (!alive) return;
      setFile(f);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { ...resolveSeasonStats(card, file), loading };
}
