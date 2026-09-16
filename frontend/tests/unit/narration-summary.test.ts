/**
 * game_theater T9 (pure half): game score, player of the game, user-team top/low and the
 * roster-hint rule table on hand-made box scores. Product rule pinned here: no hint text
 * ever mentions OVR / rating / overall.
 */
import { describe, it, expect } from 'vitest';
import { gameScore, playerOfTheGame, summarizeGame } from '@/narration/summary';
import { HINT_RULES, rosterHints, buildHintContext } from '@/narration/hints';
import { MAX_HINTS, SUMMARY_MIN_POSSESSIONS } from '@/narration/types';
import type { GameTheater, PlayerBoxScore, Side } from '@/narration/types';
import type { TeamInfo } from '@/engine/game';
import type { PlayerCardData, Trait } from '@/engine/types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

function makePlayer(id: string, name: string, position: string, traits: Trait[] = []): PlayerCardData {
  return {
    id, type: 'Player', player: { id, name, position, height: '6-6', weight: 210, age: 27, team: 'SYN' },
    stats: {} as PlayerCardData['stats'], awards: [], ratings: {} as PlayerCardData['ratings'], traits, rarity: 'Common',
  };
}

function makeTeam(seatId: string, name: string, prefix: string): TeamInfo {
  const players = Array.from({ length: 10 }, (_, i) => makePlayer(`${prefix}${i}`, `${name} P${i}`, POSITIONS[i % 5]));
  const depthChart: Record<string, string[]> = {};
  POSITIONS.forEach((pos, i) => { depthChart[pos] = [players[i].id, players[i + 5].id]; });
  return { seatId, name, players, starters: players.slice(0, 5).map(p => p.id), plays: [], depthChart };
}

function box(playerId: string, extra: Partial<PlayerBoxScore> = {}): PlayerBoxScore {
  return {
    playerId, playerName: playerId, minutes: 24, possessions: 40, points: 8, twoPointers: 0, threePointers: 0, andOnes: 0,
    turnovers: 1, assists: 2, offensiveRebounds: 1, defensiveRebounds: 3, steals: 1, blocks: 0,
    fieldGoalsMade: 3, fieldGoalsAttempted: 7, threesMade: 1, threesAttempted: 3, freeThrowsMade: 1,
    freeThrowsAttempted: 2, plusMinus: 0, ...extra,
  };
}

/** A quiet baseline box (no rule fires): 10 rows, starters 24 min, bench 12 min. */
function baselineBox(prefix: string): PlayerBoxScore[] {
  return Array.from({ length: 10 }, (_, i) => box(`${prefix}${i}`, {
    minutes: i < 5 ? 24 : 12, possessions: i < 5 ? 45 : 20, offensiveRebounds: 1, defensiveRebounds: 4,
  }));
}

function makeTheater(opts: { home?: PlayerBoxScore[]; away?: PlayerBoxScore[]; finalScore?: [number, number] } = {}): GameTheater {
  const home = makeTeam('human-0', 'You', 'h');
  const away = makeTeam('bot-1', 'Astro', 'a');
  return {
    homeTeam: home, awayTeam: away, possessions: [], quarterSummaries: [],
    finalScore: opts.finalScore ?? [100, 90],
    boxScore: { home: opts.home ?? baselineBox('h'), away: opts.away ?? baselineBox('a') },
    homeBonuses: {} as GameTheater['homeBonuses'], awayBonuses: {} as GameTheater['awayBonuses'],
    isOvertime: false, overtimePeriods: 0, seed: 1, playbook: {} as GameTheater['playbook'],
  };
}

/** Baseline home box with one row replaced. */
function withRow(prefix: string, index: number, extra: Partial<PlayerBoxScore>): PlayerBoxScore[] {
  const rows = baselineBox(prefix);
  rows[index] = { ...rows[index], ...extra };
  return rows;
}

const ruleById = (id: string) => {
  const r = HINT_RULES.find(x => x.id === id);
  if (!r) throw new Error(`no rule ${id}`);
  return r;
};
const ctxFor = (theater: GameTheater, side: Side = 'home') => buildHintContext(theater, side);

// ── gameScore / player of the game ──────────────────────────────────────────

describe('gameScore', () => {
  it('applies the fixed formula and rounds to 0.1', () => {
    const b = box('x', {
      points: 25, fieldGoalsMade: 10, fieldGoalsAttempted: 20, freeThrowsMade: 3, freeThrowsAttempted: 5,
      offensiveRebounds: 2, defensiveRebounds: 6, steals: 2, assists: 7, blocks: 1, turnovers: 3,
    });
    // 25 + 4 - 14 - 0.8 + 1.4 + 1.8 + 2 + 4.9 + 0.7 - 3 = 22.0
    expect(gameScore(b)).toBe(22);
    expect(gameScore(box('y', { points: 1, fieldGoalsMade: 1, fieldGoalsAttempted: 1, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 1, steals: 0, assists: 0, blocks: 0, turnovers: 0 }))).toBe(1);
  });
});

describe('playerOfTheGame', () => {
  it('picks the highest game score across both teams and resolves the roster name', () => {
    const t = makeTheater({
      home: withRow('h', 2, { points: 20, fieldGoalsMade: 8, fieldGoalsAttempted: 14 }),
      away: withRow('a', 4, { points: 31, fieldGoalsMade: 12, fieldGoalsAttempted: 18, assists: 5 }),
    });
    const potg = playerOfTheGame(t);
    expect(potg.playerId).toBe('a4');
    expect(potg.side).toBe('away');
    expect(potg.name).toBe('Astro P4');
    expect(potg.gameScore).toBe(gameScore(t.boxScore.away[4]));
  });

  it('breaks a game-score tie by points, then by the home side', () => {
    const tie = makeTheater({
      home: withRow('h', 0, { points: 20, fieldGoalsMade: 8, fieldGoalsAttempted: 14 }),
      away: withRow('a', 0, { points: 20, fieldGoalsMade: 8, fieldGoalsAttempted: 14 }),
    });
    expect(playerOfTheGame(tie).playerId).toBe('h0');
    const morePts = makeTheater({
      home: withRow('h', 0, { points: 20, fieldGoalsMade: 8, fieldGoalsAttempted: 14 }),
      away: withRow('a', 0, { points: 22, fieldGoalsMade: 8, fieldGoalsAttempted: 14, assists: 2, turnovers: 3 }),
    });
    expect(gameScore(morePts.boxScore.home[0])).toBe(gameScore(morePts.boxScore.away[0]));
    expect(playerOfTheGame(morePts).playerId).toBe('a0');
  });
});

// ── summarizeGame ───────────────────────────────────────────────────────────

describe('summarizeGame', () => {
  it('has no userTeam without a matching userSeatId', () => {
    const t = makeTheater();
    expect(summarizeGame(t).userTeam).toBeUndefined();
    expect(summarizeGame(t, 'bot-7').userTeam).toBeUndefined();
    expect(summarizeGame(t, 'bot-1').userTeam?.side).toBe('away');
  });

  it('top is the best game score on the user side; low ignores players under the possession floor', () => {
    const home = withRow('h', 1, { points: 24, fieldGoalsMade: 10, fieldGoalsAttempted: 15 });
    home[3] = { ...home[3], points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 9, turnovers: 4, possessions: SUMMARY_MIN_POSSESSIONS };
    home[7] = { ...home[7], points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 12, turnovers: 6, possessions: SUMMARY_MIN_POSSESSIONS - 1 };
    const t = makeTheater({ home });
    const s = summarizeGame(t, 'human-0');
    expect(s.userTeam?.side).toBe('home');
    expect(s.userTeam?.top.playerId).toBe('h1');
    expect(s.userTeam?.low?.playerId).toBe('h3'); // h7 is worse but under the floor
    expect(s.userTeam?.hints.length).toBeLessThanOrEqual(MAX_HINTS);
  });

  it('low is null when nobody reaches the possession floor', () => {
    const home = baselineBox('h').map(b => ({ ...b, possessions: 3 }));
    expect(summarizeGame(makeTheater({ home }), 'human-0').userTeam?.low).toBeNull();
  });
});

// ── Hint rules ──────────────────────────────────────────────────────────────

describe('hint rules', () => {
  it('the baseline box fires no rule', () => {
    const ctx = ctxFor(makeTheater());
    for (const r of HINT_RULES) expect(r.test(ctx), r.id).toBeNull();
  });

  it('volume-low-eff', () => {
    const r = ruleById('volume-low-eff');
    const hit = r.test(ctxFor(makeTheater({ home: withRow('h', 0, { fieldGoalsMade: 4, fieldGoalsAttempted: 15 }) })));
    expect(hit).toMatchObject({ ruleId: 'volume-low-eff', playerId: 'h0' });
    expect(hit?.text).toBe('You P0 took 15 shots at 27%: the volume outruns the efficiency — a second creator would take shots off his plate.');
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 0, { fieldGoalsMade: 6, fieldGoalsAttempted: 15 }) })))).toBeNull();
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 0, { fieldGoalsMade: 3, fieldGoalsAttempted: 11 }) })))).toBeNull();
  });

  it('bench-closer', () => {
    const r = ruleById('bench-closer');
    const hit = r.test(ctxFor(makeTheater({ home: withRow('h', 6, { minutes: 14, plusMinus: 11 }) })));
    expect(hit).toMatchObject({ ruleId: 'bench-closer', playerId: 'h6' });
    expect(hit?.text).toBe('You P6 was +11 in 14 minutes off the bench: closing-five material, and a case for starting him.');
    // a starter beats him
    const rows = withRow('h', 6, { minutes: 14, plusMinus: 11 });
    rows[0] = { ...rows[0], plusMinus: 12 };
    expect(r.test(ctxFor(makeTheater({ home: rows })))).toBeNull();
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 6, { minutes: 10, plusMinus: 11 }) })))).toBeNull();
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 1, { minutes: 30, plusMinus: 11 }) })))).toBeNull(); // starter
  });

  it('turnover-prone', () => {
    const r = ruleById('turnover-prone');
    const hit = r.test(ctxFor(makeTheater({ home: withRow('h', 0, { turnovers: 5, assists: 3 }) })));
    expect(hit?.text).toBe('You P0 coughed it up 5 times against 3 assists: the handling load needs a second ball-handler.');
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 0, { turnovers: 5, assists: 6 }) })))).toBeNull();
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 0, { turnovers: 3, assists: 1 }) })))).toBeNull();
  });

  it('rebound-hole', () => {
    const r = ruleById('rebound-hole');
    const hit = r.test(ctxFor(makeTheater({ home: withRow('h', 4, { minutes: 28, offensiveRebounds: 1, defensiveRebounds: 2 }) })));
    expect(hit).toMatchObject({ ruleId: 'rebound-hole', playerId: 'h4' });
    expect(hit?.text).toBe('You P4 grabbed 3 boards in 28 minutes: the frontcourt needs a glass-cleaner next draft.');
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 0, { minutes: 28, offensiveRebounds: 0, defensiveRebounds: 2 }) })))).toBeNull(); // PG
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 3, { minutes: 20, offensiveRebounds: 0, defensiveRebounds: 2 }) })))).toBeNull(); // < 24 min
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 8, { minutes: 28, offensiveRebounds: 0, defensiveRebounds: 2 }) })))).toBeNull(); // bench PF
  });

  it('no-spacing', () => {
    const r = ruleById('no-spacing');
    const home = baselineBox('h').map(b => ({ ...b, fieldGoalsAttempted: 8, threesAttempted: 1 })); // 10 of 80
    const hit = r.test(ctxFor(makeTheater({ home })));
    expect(hit).toMatchObject({ ruleId: 'no-spacing' });
    expect(hit?.text).toBe('Only 10 threes on 80 shots: the roster lacks spacing — draft shooters.');
    expect(r.test(ctxFor(makeTheater({ home: baselineBox('h').map(b => ({ ...b, fieldGoalsAttempted: 8, threesAttempted: 2 })) })))).toBeNull();
  });

  it('cold-from-deep', () => {
    const r = ruleById('cold-from-deep');
    const home = baselineBox('h').map(b => ({ ...b, threesMade: 0, threesAttempted: 3 })); // 0 of 30
    home[0] = { ...home[0], threesMade: 7 };
    const hit = r.test(ctxFor(makeTheater({ home })));
    expect(hit?.text).toBe('7 of 30 from deep: plenty of attempts, not enough shooters who make them.');
    home[1] = { ...home[1], threesMade: 2 }; // 9 of 30 = 30%
    expect(r.test(ctxFor(makeTheater({ home })))).toBeNull();
    expect(r.test(ctxFor(makeTheater({ home: baselineBox('h').map(b => ({ ...b, threesMade: 0, threesAttempted: 2 })) })))).toBeNull(); // 20 attempts
  });

  it('assist-engine', () => {
    const r = ruleById('assist-engine');
    const hit = r.test(ctxFor(makeTheater({ home: withRow('h', 0, { assists: 9 }) })));
    expect(hit?.text).toBe('You P0 dished 9: the offence runs through him — protect that role when you build.');
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 0, { assists: 7 }) })))).toBeNull();
  });

  it('starter-sunk', () => {
    const r = ruleById('starter-sunk');
    const lost = makeTheater({ home: withRow('h', 2, { plusMinus: -14 }), finalScore: [88, 100] });
    const hit = r.test(ctxFor(lost));
    expect(hit?.text).toBe('You P2 was -14 in the loss: the lineup around him is not covering his matchup.');
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 2, { plusMinus: -14 }), finalScore: [100, 88] })))).toBeNull(); // won
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 7, { plusMinus: -14 }), finalScore: [88, 100] })))).toBeNull(); // bench
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 2, { plusMinus: -11 }), finalScore: [88, 100] })))).toBeNull();
  });

  it('two-way-anchor', () => {
    const r = ruleById('two-way-anchor');
    const hit = r.test(ctxFor(makeTheater({ home: withRow('h', 4, { points: 14, steals: 2, blocks: 3 }) })));
    expect(hit?.text).toBe('You P4: 14 points, 2 steals, 3 blocks — a two-way anchor worth building around.');
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 4, { points: 8, steals: 2, blocks: 3 }) })))).toBeNull();
    expect(r.test(ctxFor(makeTheater({ home: withRow('h', 4, { points: 14, steals: 1, blocks: 2 }) })))).toBeNull();
  });

  it('rosterHints returns at most MAX_HINTS, in priority order, one per player', () => {
    // h0 qualifies for volume-low-eff AND turnover-prone AND assist-engine; h6 is a bench closer; h4 a two-way anchor.
    const home = withRow('h', 0, { fieldGoalsMade: 4, fieldGoalsAttempted: 16, turnovers: 5, assists: 3 });
    home[6] = { ...home[6], minutes: 15, plusMinus: 10 };
    home[4] = { ...home[4], points: 14, steals: 2, blocks: 3 };
    const hints = rosterHints(makeTheater({ home }), 'home');
    expect(hints).toHaveLength(MAX_HINTS);
    expect(hints.map(h => h.ruleId)).toEqual(['volume-low-eff', 'bench-closer']);
    expect(new Set(hints.map(h => h.playerId)).size).toBe(hints.length);

    // With the bench closer gone, the next rule that fires on a NEW player wins (turnover-prone is h0 again → skipped).
    home[6] = { ...home[6], plusMinus: 0 };
    const again = rosterHints(makeTheater({ home }), 'home');
    expect(again.map(h => h.ruleId)).toEqual(['volume-low-eff', 'two-way-anchor']);
  });

  it('no hint text ever mentions OVR, rating or overall; all under 160 chars', () => {
    const forbidden = /\bOVR\b|rating|overall/i;
    const crafted: PlayerBoxScore[][] = [
      withRow('h', 0, { fieldGoalsMade: 2, fieldGoalsAttempted: 20, turnovers: 6, assists: 1 }),
      withRow('h', 7, { minutes: 20, plusMinus: 15 }),
      withRow('h', 4, { minutes: 30, offensiveRebounds: 0, defensiveRebounds: 1, points: 12, steals: 3, blocks: 2 }),
      baselineBox('h').map(b => ({ ...b, fieldGoalsAttempted: 10, threesAttempted: 1 })),
      baselineBox('h').map(b => ({ ...b, threesMade: 0, threesAttempted: 4 })),
      withRow('h', 1, { assists: 11, plusMinus: -15 }),
    ];
    const texts: string[] = [];
    for (const home of crafted) {
      for (const fs of [[100, 90], [80, 100]] as [number, number][]) {
        const ctx = ctxFor(makeTheater({ home, finalScore: fs }));
        for (const r of HINT_RULES) { const h = r.test(ctx); if (h) texts.push(h.text); }
      }
    }
    expect(new Set(texts.map(t => t.split(' ').slice(-3).join(' '))).size).toBeGreaterThanOrEqual(HINT_RULES.length);
    for (const t of texts) {
      expect(t, t).not.toMatch(forbidden);
      expect(t.length, t).toBeLessThan(160);
      expect(t, t).toMatch(/[.]$/);
    }
  });
});
