/**
 * game_theater D1 — structured `PossessionEvent.narrative` emitted by the engine.
 */
import { describe, it, expect } from 'vitest';
import { simulateMany } from './helpers';
import type { NarrativeKind } from '@/engine/game';

const KINDS: NarrativeKind[] = ['miss', 'block', 'turnover', 'steal', 'rim_make', 'rim_ft', 'mid_make', 'three_make', 'and1'];
const MAKES: NarrativeKind[] = ['rim_make', 'rim_ft', 'mid_make', 'three_make', 'and1'];

describe('structured narrative (D1)', () => {
  const games = simulateMany(10, undefined, undefined, 31337);

  it('a fixed seed produces the identical narrative sequence', () => {
    const again = simulateMany(10, undefined, undefined, 31337);
    for (let i = 0; i < games.length; i++) {
      expect(again[i].possessions.map(e => e.narrative)).toEqual(games[i].possessions.map(e => e.narrative));
    }
  });

  it('every event carries a narrative with a valid kind, actor, and consistent flags', () => {
    for (const g of games) {
      for (const e of g.possessions) {
        const n = e.narrative;
        expect(KINDS).toContain(n.kind);
        expect(typeof n.actorId).toBe('string');
        expect(n.actorId.length).toBeGreaterThan(0);
        expect(n.isPossessionWin).toBe(!!e.isPossessionWinEvent);
        expect(n.isSecondChance).toBe((e.offensiveRebounders?.length ?? 0) > 0);
        expect(n.tags.includes('second_chance')).toBe(n.isSecondChance);
        expect(n.tags.includes('poss_win')).toBe(n.isPossessionWin);
        expect(n.isAnd1).toBe(n.kind === 'and1');
        if (e.calledPlays?.some(p => p.side === 'offense')) expect(n.calledPlayId).toBe(e.calledPlays.find(p => p.side === 'offense')!.playId);
        else expect(n.calledPlayId).toBeUndefined();
        if (e.calledPlays?.some(p => p.side === 'defense')) expect(n.coverageId).toBe(e.calledPlays.find(p => p.side === 'defense')!.playId);
        else expect(n.coverageId).toBeUndefined();
      }
    }
  });

  it('turnover/steal events have no shots and no channel; steals name the defender', () => {
    let steals = 0, turnovers = 0;
    for (const g of games) {
      for (const e of g.possessions) {
        const n = e.narrative;
        if (n.kind === 'turnover' || n.kind === 'steal') {
          expect(e.shots).toEqual([]);
          expect(n.channel).toBeUndefined();
          expect(e.turnoverPlayerId).toBeDefined();
          expect(n.actorId).toBe(e.turnoverPlayerId);
          expect(e.outcome).toBe('miss');
          if (n.kind === 'steal') { steals++; expect(e.stealPlayerId).toBeDefined(); expect(n.defenderId).toBe(e.stealPlayerId); }
          else { turnovers++; expect(e.stealPlayerId).toBeUndefined(); }
        } else {
          expect(e.turnoverPlayerId).toBeUndefined();
          expect(e.stealPlayerId).toBeUndefined();
        }
      }
    }
    expect(steals).toBeGreaterThan(0);
    expect(turnovers).toBeGreaterThan(0);
  });

  it('block events end on a missed shot with a blockerId; misses and blocks credit the defensive board', () => {
    let blocks = 0;
    for (const g of games) {
      for (const e of g.possessions) {
        const n = e.narrative;
        if (n.kind === 'block' || n.kind === 'miss') {
          expect(e.shots.length).toBeGreaterThan(0);
          const last = e.shots[e.shots.length - 1];
          expect(last.made).toBe(false);
          expect(n.channel).toBe(last.channel);
          expect(n.actorId).toBe(last.shooterId);
          expect(e.scoringPlayerId).toBe(last.shooterId);
          expect(e.defensiveRebounderId).toBeDefined();
          if (n.kind === 'block') { blocks++; expect(last.blockerId).toBeDefined(); expect(n.defenderId).toBe(last.blockerId); }
          else { expect(last.blockerId).toBeUndefined(); expect(n.defenderId).toBe(e.defensiveRebounderId); }
        }
      }
    }
    expect(blocks).toBeGreaterThan(0);
  });

  it('makes carry the scoring channel, the shooter as actor, and no defensive board', () => {
    for (const g of games) {
      for (const e of g.possessions) {
        const n = e.narrative;
        if (!MAKES.includes(n.kind)) continue;
        expect(n.actorId).toBe(e.scoringPlayerId);
        expect(e.defensiveRebounderId).toBeUndefined();
        if (n.kind === 'rim_ft') {
          expect(n.channel).toBe('rim');
          // No FGA on the trip itself; any earlier shots were misses.
          expect(e.shots.every(s => !s.made)).toBe(true);
        } else {
          const last = e.shots[e.shots.length - 1];
          expect(last.made).toBe(true);
          expect(n.channel).toBe(last.channel);
          if (n.kind === 'three_make') expect(n.channel).toBe('three');
          if (n.kind === 'mid_make') expect(n.channel).toBe('mid');
          if (n.kind === 'rim_make') expect(n.channel).toBe('rim');
        }
        if (n.assistId) expect(n.assistId).toBe(e.assistPlayerId);
      }
    }
  });

  it('ftAttempted is 2 for rim_ft, 1 for and1, 0 otherwise, and ftMade matches the points', () => {
    let prev: [number, number] = [0, 0];
    for (const g of games) {
      prev = [0, 0];
      for (const e of g.possessions) {
        const n = e.narrative;
        const pts = e.team === 'home' ? e.runningScore[0] - prev[0] : e.runningScore[1] - prev[1];
        prev = e.runningScore;
        if (n.kind === 'rim_ft') { expect(n.ftAttempted).toBe(2); expect(n.ftMade).toBe(pts); expect(pts).toBeLessThanOrEqual(2); }
        else if (n.kind === 'and1') { expect(n.ftAttempted).toBe(1); expect(n.ftMade).toBe(1); expect(pts).toBe(n.channel === 'three' ? 4 : 3); }
        else { expect(n.ftAttempted).toBe(0); expect(n.ftMade).toBe(0); }
      }
    }
  });

  it('steeredTo, when present, is a channel and is set on a plausible share of possessions', () => {
    let steered = 0, total = 0;
    for (const g of games) {
      for (const e of g.possessions) {
        total++;
        if (e.narrative.steeredTo) { steered++; expect(['rim', 'mid', 'three']).toContain(e.narrative.steeredTo); }
      }
    }
    console.log(`[narrative] steeredTo set on ${(100 * steered / total).toFixed(1)}% of possessions`);
    expect(steered).toBeLessThan(total);
  });
});
