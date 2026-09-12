/**
 * These tests exercise the full headless simulation pipeline. The PPP band
 * (and possibly other bands) targets the INTENDED post-fix behaviour — see
 * docs/ROADMAP.md P0-1/P0-3/P1-1. They may fail until the parallel engine
 * fixes land; keep the assertions as specified rather than loosening them.
 */
import { describe, it, expect } from 'vitest';
import { simulateMany, ppp } from './helpers';

describe('game simulation (200 headless games)', () => {
  const games = simulateMany(200);

  it('produces no ties', () => {
    for (const g of games) {
      expect(g.finalScore[0]).not.toBe(g.finalScore[1]);
    }
  });

  it('keeps every finalScore entry within a plausible band (regulation 50-170, +15/OT period)', () => {
    // Team scores have sd ~16 around a ~114 mean, so a hard cap must leave room for the
    // 3-sigma tail over 400 samples; overtime periods add ~10-15 points each.
    for (const g of games) {
      const cap = 170 + 15 * g.overtimePeriods;
      for (const score of g.finalScore) {
        expect(score).toBeGreaterThanOrEqual(50);
        expect(score).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('quarterSummaries points sum to finalScore', () => {
    for (const g of games) {
      const homeSum = g.quarterSummaries.reduce((s, q) => s + q.homeScore, 0);
      const awaySum = g.quarterSummaries.reduce((s, q) => s + q.awayScore, 0);
      expect(homeSum).toBe(g.finalScore[0]);
      expect(awaySum).toBe(g.finalScore[1]);
    }
  });

  it('boxScore points per team sum to finalScore', () => {
    for (const g of games) {
      const homePts = g.boxScore.home.reduce((s, b) => s + b.points, 0);
      const awayPts = g.boxScore.away.reduce((s, b) => s + b.points, 0);
      expect(homePts).toBe(g.finalScore[0]);
      expect(awayPts).toBe(g.finalScore[1]);
    }
  });

  it('every box-score starter has minutes between 20 and 48 (+5 per OT period)', () => {
    for (const g of games) {
      const starterIds = new Set([...g.homeTeam.starters, ...g.awayTeam.starters]);
      const allBox = [...g.boxScore.home, ...g.boxScore.away];
      const maxMinutes = 48 + 5 * g.overtimePeriods + 0.05; // OT periods are 5 minutes; tolerance for rounding
      for (const bs of allBox) {
        if (starterIds.has(bs.playerId)) {
          expect(bs.minutes).toBeGreaterThanOrEqual(20);
          expect(bs.minutes).toBeLessThanOrEqual(maxMinutes);
        }
      }
    }
  });

  it('keeps regulation possessions per team between 85 and 115 (+6 per OT period)', () => {
    for (const g of games) {
      const homePoss = g.possessions.filter((p) => p.team === 'home').length;
      const awayPoss = g.possessions.filter((p) => p.team === 'away').length;
      // Regulation is clamped to [85, 115] per team in calcPossessionSplit; each OT
      // period adds 5 ± 1 possessions per team on top.
      const cap = 115 + 6 * g.overtimePeriods;
      expect(homePoss).toBeGreaterThanOrEqual(85);
      expect(homePoss).toBeLessThanOrEqual(cap);
      expect(awayPoss).toBeGreaterThanOrEqual(85);
      expect(awayPoss).toBeLessThanOrEqual(cap);
    }
  });

  it('keeps PPP between 0.95 and 1.25', () => {
    const value = ppp(games);
    expect(value).toBeGreaterThanOrEqual(0.95);
    expect(value).toBeLessThanOrEqual(1.25);
  });
});
