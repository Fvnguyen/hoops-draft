/**
 * Rotation Engine (plan render_and_engine_perf D6 — split out of game.ts).
 *
 * NBA-style substitution patterns: who's on court each possession.
 */

import type { PlayerCardData } from './types';
import type { Rng } from './rng';
import type { TeamInfo } from './gameTypes';
import { SEGMENTS_PER_GAME } from './balance';
import { weightedRandom } from './shot';

// ── Rotation Engine ────────────────────────────────────────────────────────

/**
 * Calculate possession shares for each player (0-1, how much of the game they play),
 * from talent gap (bigger OVR gap → starter plays more), real historical MPG (blended
 * 60/40 with the formula), and an age penalty for 35+.
 *
 * T6 code review follow-up (2026-09-14): this is now the ONLY input driving who's on
 * court each possession (see drawLineup) — a fresh weighted draw per position, per
 * possession, rather than the old precomputed quarter-phase rotation timeline, which
 * only read this map's starter fraction and only in half the quarters (see HANDOVER.md
 * issue #9). No per-quarter choreography (starter-opens/backup-closes, etc.) survives:
 * that was NBA-broadcast flavor with no game_theater consumer (`SubstitutionEvent` was
 * never read by any UI) and no strategic weight — the roster-construction signal this
 * function encodes is what should matter, not a scripted pattern layered on top of it.
 */
export function calcPossessionShares(
  depthChart: Record<string, string[]>,
  players: PlayerCardData[]
): Map<string, number> {
  const shares = new Map<string, number>();
  const playerMap = new Map(players.map(p => [p.id, p]));

  for (const [, ids] of Object.entries(depthChart)) {
    if (ids.length === 0) continue;

    const starter = playerMap.get(ids[0]);
    const backup = ids[1] ? playerMap.get(ids[1]) : null;
    const deep = ids[2] ? playerMap.get(ids[2]) : null;

    // Base shares
    let starterShare = 0.70;
    let backupShare = 0.25;
    let deepShare = 0.05;

    if (starter && backup) {
      const ovrGap = (starter.ratings?.overall ?? 70) - (backup.ratings?.overall ?? 50);

      // OVR gap modifier: smaller gap → more even distribution
      if (ovrGap < 5) {
        starterShare = 0.58; backupShare = 0.35; deepShare = 0.07;
      } else if (ovrGap < 10) {
        starterShare = 0.65; backupShare = 0.28; deepShare = 0.07;
      } else if (ovrGap > 15) {
        starterShare = 0.78; backupShare = 0.18; deepShare = 0.04;
      }

      // MPG anchor: blend with real MPG ratio
      if (starter.stats?.mpg && backup.stats?.mpg) {
        const totalMpg = starter.stats.mpg + backup.stats.mpg + (deep?.stats?.mpg || 0);
        if (totalMpg > 0) {
          const mpgStarter = starter.stats.mpg / totalMpg;
          const mpgBackup = backup.stats.mpg / totalMpg;
          // 60% formula, 40% MPG anchor
          starterShare = starterShare * 0.6 + mpgStarter * 0.4;
          backupShare = backupShare * 0.6 + mpgBackup * 0.4;
        }
      }

      // Age penalty for players 35+
      if (starter.player?.age >= 35) starterShare *= 0.92;
      if (backup?.player?.age >= 35) backupShare *= 0.92;
    }

    if (!backup) {
      starterShare = 1.0; backupShare = 0; deepShare = 0;
    } else if (!deep) {
      deepShare = 0;
      // Redistribute deep bench share
      starterShare += 0.03;
      backupShare += 0.02;
    }

    // Normalize
    const total = starterShare + backupShare + deepShare;
    shares.set(ids[0], (starterShare / total));
    if (ids[1]) shares.set(ids[1], (backupShare / total));
    if (ids[2]) shares.set(ids[2], (deepShare / total));
  }

  return shares;
}

/**
 * Draw one possession's lineup: one player per position, weighted by that position's
 * players' `calcPossessionShares` values (T6 code review follow-up, 2026-09-14 — replaces
 * the old precomputed quarter-phase rotation timeline). Independent per possession, per
 * team, regardless of which side of the ball that team is on this possession — the
 * engine doesn't model continuous on-court stints; if a presentation ever wants
 * real-looking substitution patterns, that's a game_theater transform over this log, not
 * something the engine needs to fake for itself.
 */
export function drawLineup(depthChart: Record<string, string[]>, shares: Map<string, number>, rng: Rng): Map<string, string> {
  const lineup = new Map<string, string>();
  for (const [pos, ids] of Object.entries(depthChart)) {
    if (ids.length === 0) continue;
    if (ids.length === 1) { lineup.set(pos, ids[0]); continue; }
    const weights = ids.map(id => shares.get(id) ?? 0);
    lineup.set(pos, weightedRandom(ids, weights, rng));
  }
  return lineup;
}

/**
 * Coach-mode hook (not yet read anywhere — see SEGMENTS_PER_GAME in balance.ts): which
 * segment of the game a quarter falls in. Overtime is always the trailing segment,
 * whatever SEGMENTS_PER_GAME is set to.
 */
export function segmentForQuarter(quarter: number): number {
  if (quarter > 4) return SEGMENTS_PER_GAME;
  const quartersPerSegment = 4 / SEGMENTS_PER_GAME;
  return Math.floor((quarter - 1) / quartersPerSegment);
}

/** A lineup map built from each position's starter (depth-chart index 0) only — OT's
 *  "your best 5 close the game" default before any play call is applied. */
/** D10: true when every player in `lineup` is one of the team's depth-chart starters. */
export function closersOnly(lineup: Map<string, string>, team: TeamInfo): boolean {
  const starters = new Set(team.starters);
  for (const id of lineup.values()) if (!starters.has(id)) return false;
  return true;
}

export function starterLineupMap(depthChart: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [pos, ids] of Object.entries(depthChart)) {
    if (ids.length > 0) map.set(pos, ids[0]);
  }
  return map;
}
