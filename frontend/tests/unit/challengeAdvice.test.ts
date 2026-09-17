/**
 * Front-office advice (plan_challenge_mode T3 / D8).
 *
 * The fixtures are hand-built rather than simulated: every reason has to fire on demand,
 * and a real 41-game half cannot be steered into "a bench player out-produces a starter"
 * and "a play runs through someone who never plays" at the same time. Cards are cloned
 * from the real pool (so badges, positions and the archetype/playbook evaluators see real
 * shapes) with their traits and ratings overwritten.
 */

import { describe, it, expect } from 'vitest';
import {
  challengeAdvice, challengeReasons, challengePaceBand, challengeTeamSplits, shortName,
  type ChallengeAdviceInput, type ChallengeReasonId,
} from '@/engine/challengeAdvice';
import { LEAGUE_FOUR_FACTORS, PACE_BAND_SPREAD } from '@/engine/balance';
import { CHALLENGE_QUOTES, CHALLENGE_SPEAKERS } from '@/narration/challenge';
import { emptyBoxScore, type TeamInfo } from '@/engine/game';
import type { ChallengeGameResult, ChallengeHalf, ChallengePlayerTotals } from '@/engine/challenge';
import type { PlayerCardData, Trait } from '@/engine/types';
import { loadPlayers } from './helpers';

const GAMES = 41;
/** Every fixture card carries ratings in the 90s, so a leaked rating is a bare 90-99. */
const RATING_SENTINELS = { overall: 97, finishing: 96, midRange: 95, perimeter: 94, playmaking: 93, rebounding: 92, perimeterDefense: 91, postDefense: 90 };

const pool = loadPlayers();

function card(index: number, name: string, traits: Trait[]): PlayerCardData {
  const src = pool[index];
  return {
    ...src,
    id: `fx-${index}`,
    player: { ...src.player, name },
    traits,
    ratings: { ...src.ratings, ...RATING_SENTINELS },
  };
}

const SHOOTER: Trait[] = [{ name: 'Sharpshooter', level: 2 }];

/**
 * Twelve players: five starters (two of them carrying Sharpshooter 2, a third on the
 * bench — three carriers, six points, two starters: Shooting Gallery at 0.75 progress
 * and still locked), and a bench built so the scoring, plus-minus and minutes rules all
 * have something to find.
 */
const CARDS: PlayerCardData[] = [
  card(0, 'Aaron First', SHOOTER),
  card(1, 'Brian Second', SHOOTER),
  card(2, 'Carl Third', []),
  card(3, 'Dan Fourth', []),
  card(4, 'Eli Fifth', []),
  card(5, 'Frank Sixth', SHOOTER),
  card(6, 'Gary Seventh', []),
  card(7, 'Hal Eighth', []),
  card(8, 'Ian Ninth', []),
  card(9, 'Jack Tenth', []),
  card(10, 'Kyle Last', []),
  card(11, 'Liam Idle', []),
];
const ID = Object.fromEntries(CARDS.map((c) => [c.player.name.split(' ')[0].toLowerCase(), c.id])) as Record<string, string>;

const TEAM: TeamInfo = {
  seatId: 'human-0',
  name: 'You',
  players: CARDS,
  starters: CARDS.slice(0, 5).map((c) => c.id),
  plays: [],
  depthChart: {
    PG: [CARDS[0].id, CARDS[5].id],
    SG: [CARDS[1].id, CARDS[6].id],
    SF: [CARDS[2].id, CARDS[7].id, CARDS[11].id],
    PF: [CARDS[3].id, CARDS[8].id],
    C: [CARDS[4].id, CARDS[9].id, CARDS[10].id],
  },
  playAssignments: [
    // Staffed, but around a man who is barely on the floor -> 'play-idle'.
    { cardId: 'basic-offense', playId: 'basic-offense', roles: { featured: CARDS[11].id } },
    // Nobody in the role at all -> 'play-unstaffed'.
    { cardId: 'basic-defense', playId: 'basic-defense', roles: {} },
  ],
  archetypes: {},
};

/** One season-total row; everything not passed stays zero. */
function totals(id: string, over: Partial<ChallengePlayerTotals>): ChallengePlayerTotals {
  const name = CARDS.find((c) => c.id === id)?.player.name ?? id;
  return { ...emptyBoxScore(id, name), gamesPlayed: GAMES, ...over };
}

const perGame = (n: number) => Math.round(n * GAMES);

/**
 * Team shape: cold-ish shooting, average giveaways, and a glaring hole on the offensive
 * glass (15% of own misses against a league at 26%) so 'four-factor' picks second chances.
 */
const PLAYER_TOTALS: ChallengePlayerTotals[] = [
  totals(ID.aaron, { minutes: perGame(31), points: perGame(11), plusMinus: perGame(2), fieldGoalsAttempted: 800, fieldGoalsMade: 340, threesMade: 120, freeThrowsAttempted: 200, turnovers: 110, offensiveRebounds: 40 }),
  totals(ID.brian, { minutes: perGame(30), points: perGame(18), plusMinus: perGame(3), fieldGoalsAttempted: 700, fieldGoalsMade: 300, threesMade: 110, freeThrowsAttempted: 180, turnovers: 100, offensiveRebounds: 40 }),
  totals(ID.carl, { minutes: perGame(28), points: perGame(16), plusMinus: perGame(1), fieldGoalsAttempted: 600, fieldGoalsMade: 260, threesMade: 70, freeThrowsAttempted: 160, turnovers: 90, offensiveRebounds: 50 }),
  totals(ID.dan, { minutes: perGame(26), points: perGame(14), plusMinus: perGame(1), fieldGoalsAttempted: 500, fieldGoalsMade: 215, threesMade: 50, freeThrowsAttempted: 140, turnovers: 70, offensiveRebounds: 60 }),
  totals(ID.eli, { minutes: perGame(24), points: perGame(12), plusMinus: perGame(0), fieldGoalsAttempted: 400, fieldGoalsMade: 175, threesMade: 30, freeThrowsAttempted: 110, turnovers: 60, offensiveRebounds: 60 }),
  // The bench scorer: 13.8 in 18 minutes, far clear of the weakest starter's rate.
  totals(ID.frank, { minutes: perGame(18), points: perGame(13.8), plusMinus: perGame(2), fieldGoalsAttempted: 300, fieldGoalsMade: 130, threesMade: 15, freeThrowsAttempted: 60, turnovers: 40, offensiveRebounds: 20 }),
  // The rotation sinkhole.
  totals(ID.gary, { minutes: perGame(16), points: perGame(6), plusMinus: perGame(-4.1), fieldGoalsAttempted: 120, fieldGoalsMade: 50, threesMade: 5, freeThrowsAttempted: 30, turnovers: 20, offensiveRebounds: 15 }),
  totals(ID.hal, { minutes: perGame(14), points: perGame(5), plusMinus: perGame(0), fieldGoalsAttempted: 60, fieldGoalsMade: 25, threesMade: 0, freeThrowsAttempted: 12, turnovers: 6, offensiveRebounds: 8 }),
  totals(ID.ian, { minutes: perGame(12), points: perGame(4), plusMinus: perGame(0), fieldGoalsAttempted: 12, fieldGoalsMade: 4, threesMade: 0, freeThrowsAttempted: 6, turnovers: 3, offensiveRebounds: 5 }),
  totals(ID.jack, { minutes: perGame(8), points: perGame(3), plusMinus: perGame(0), fieldGoalsAttempted: 6, fieldGoalsMade: 1, threesMade: 0, freeThrowsAttempted: 2, turnovers: 1, offensiveRebounds: 2 }),
  // Last in the rotation -> 'deep-bench'.
  totals(ID.kyle, { minutes: perGame(3), points: perGame(1), plusMinus: perGame(0), fieldGoalsAttempted: 2, fieldGoalsMade: 0, threesMade: 0, turnovers: 0, offensiveRebounds: 0 }),
  // The featured player of a staffed play, on the floor 9 minutes a night -> 'play-idle'.
  totals(ID.liam, { minutes: perGame(9), points: perGame(3), plusMinus: perGame(0), fieldGoalsAttempted: 10, fieldGoalsMade: 3, threesMade: 0, turnovers: 2, offensiveRebounds: 2 }),
];

function half(wins: number): ChallengeHalf {
  const games: ChallengeGameResult[] = Array.from({ length: GAMES }, (_, i) => ({
    index: i,
    opponent: 'BOS',
    isHome: i % 2 === 0,
    seed: 1000 + i,
    won: i < wins,
    score: [i < wins ? 112 : 99, i < wins ? 104 : 108] as [number, number],
    topPerformer: { playerId: CARDS[1].id, playerName: CARDS[1].player.name, points: 24, rebounds: 5, assists: 4 },
  }));
  return {
    half: 1,
    results: games.map((g) => (g.won ? 'W' : 'L')).join(''),
    games,
    wins,
    losses: GAMES - wins,
    playerTotals: PLAYER_TOTALS,
  };
}

const struggling: ChallengeAdviceInput = { team: TEAM, half: half(20), seed: 42 };
/** 40 first-half wins projects to 80 +/- 7, whose low end snaps to 72 = A+ -> Hold. */
const flying: ChallengeAdviceInput = { team: TEAM, half: half(40), seed: 42 };

// ── Pace band (D8) ──────────────────────────────────────────────────────────

describe('pace band', () => {
  it('projects twice the first half and snaps both ends outward to grade edges', () => {
    const band = challengePaceBand(28); // 56 +/- 7 = 49..63 -> D+ (47-49) .. A- (62-65)
    expect(band.low).toBe(47);
    expect(band.high).toBe(65);
    expect(band.lowGrade.grade).toBe('D+');
    expect(band.highGrade.grade).toBe('A-');
    expect(band.label).toBe('Lottery to Dynasty');
    expect(band.hold).toBe(false);
  });

  it('covers every grade between the two ends, best first', () => {
    const band = challengePaceBand(28);
    expect(band.grades[0].grade).toBe('A-');
    expect(band.grades[band.grades.length - 1].grade).toBe('D+');
    expect(band.grades.map((g) => g.grade)).toContain('C');
  });

  it('collapses the label when both ends share a title', () => {
    const band = challengePaceBand(2); // 4 +/- 7 -> F at both ends
    expect(band.label).toBe('Tanking');
  });

  it('clamps at the top of the ladder', () => {
    const band = challengePaceBand(41);
    expect(band.high).toBe(82);
    expect(band.low).toBe(82 - PACE_BAND_SPREAD - 3); // 75 snaps down to A+ min 72
    expect(band.hold).toBe(true);
  });

  it('holds only once the band starts at Historic', () => {
    expect(challengePaceBand(39).hold).toBe(false); // 78 -> 71 = A
    expect(challengePaceBand(40).hold).toBe(true);  // 80 -> 73 = A+
  });
});

// ── Reason catalogue (D8) ───────────────────────────────────────────────────

describe('reason catalogue', () => {
  const reasons = challengeReasons(struggling);
  const byId = new Map(reasons.map((r) => [r.id, r]));

  it('fires every reason the fixture was built for', () => {
    const expected: ChallengeReasonId[] = [
      'four-factor', 'bench-over-starter', 'worst-plus-minus',
      'play-unstaffed', 'play-idle', 'identity-near', 'pace-band', 'deep-bench',
    ];
    expect(reasons.map((r) => r.id).sort()).toEqual([...expected].sort());
  });

  it('picks the weakest four factor against the league', () => {
    const splits = challengeTeamSplits(struggling.half);
    expect(splits.orebRate).toBeLessThan(LEAGUE_FOUR_FACTORS.orebRate);
    expect(byId.get('four-factor')!.vars.issue).toBe('second chances');
    expect(byId.get('four-factor')!.action).toBe('lineup');
  });

  it('names the bench scorer and the starter he is behind', () => {
    const r = byId.get('bench-over-starter')!;
    expect(r.action).toBe('lineup');
    expect(r.playerId).toBe(ID.frank);
    expect(r.evidence).toContain('F. Sixth');
    expect(r.evidence).toContain('13.8 points in 18.0 minutes');
  });

  it('finds the worst rotation plus-minus and nobody below the minutes floor', () => {
    const r = byId.get('worst-plus-minus')!;
    expect(r.action).toBe('trade');
    expect(r.playerId).toBe(ID.gary);
    expect(r.evidence).toContain('-4.1');
  });

  it('reports the play nobody staffs and the play nobody runs', () => {
    expect(byId.get('play-unstaffed')!.evidence).toContain('Basic Defense');
    expect(byId.get('play-unstaffed')!.action).toBe('plays');
    const idle = byId.get('play-idle')!;
    expect(idle.evidence).toContain('Basic Offense');
    expect(idle.playerId).toBe(ID.liam);
  });

  it('surfaces the plan that is one step from online', () => {
    const r = byId.get('identity-near')!;
    expect(r.vars.plan).toBe('Shooting Gallery');
    expect(r.evidence).toMatch(/one step from online/);
  });

  it('points at the last man in the rotation for the free gamble', () => {
    const r = byId.get('deep-bench')!;
    expect(r.playerId).toBe(ID.kyle);
    expect(r.action).toBe('trade');
  });

  it('ranks by severity, most urgent first', () => {
    expect(reasons.map((r) => r.rank)).toEqual(reasons.map((_, i) => i + 1));
    for (let i = 1; i < reasons.length; i++) {
      expect(reasons[i - 1].severity).toBeGreaterThanOrEqual(reasons[i].severity);
    }
    expect(reasons[reasons.length - 1].id).toBe('deep-bench');
  });
});

// ── Quotes (D8) ─────────────────────────────────────────────────────────────

describe('quotes', () => {
  it('always returns exactly three, in board order, all non-empty', () => {
    const { quotes } = challengeAdvice(struggling);
    expect(quotes.map((q) => q.speaker)).toEqual(CHALLENGE_SPEAKERS);
    for (const q of quotes) {
      expect(q.text.length).toBeGreaterThan(20);
      expect(q.evidence.length).toBeGreaterThan(10);
      expect(q.text).not.toMatch(/\{\w+\}/);
    }
  });

  it('gives each speaker its own reason and prefers its own lane', () => {
    const { quotes } = challengeAdvice(struggling);
    expect(new Set(quotes.map((q) => q.reasonId)).size).toBe(3);
    expect(['lineup', 'plays', 'hold']).toContain(quotes[0].action);
    expect(['trade', 'hold']).toContain(quotes[1].action);
  });

  it('is deterministic for a given seed and varies with it', () => {
    const a = challengeAdvice(struggling).quotes.map((q) => q.text);
    const b = challengeAdvice(struggling).quotes.map((q) => q.text);
    expect(a).toEqual(b);
    const seeds = new Set<string>();
    for (let s = 0; s < 12; s++) {
      seeds.add(challengeAdvice({ ...struggling, seed: s }).quotes[0].text);
    }
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('covers every reason id with 3-4 variants per speaker', () => {
    const ids = new Set<string>([
      ...challengeReasons(struggling).map((r) => r.id),
      ...challengeReasons(flying).map((r) => r.id),
    ]);
    for (const speaker of CHALLENGE_SPEAKERS) {
      for (const id of ids) {
        const pool2 = CHALLENGE_QUOTES[speaker][id] ?? [];
        expect(pool2.length, `${speaker}/${id}`).toBeGreaterThanOrEqual(3);
        expect(pool2.length, `${speaker}/${id}`).toBeLessThanOrEqual(4);
      }
    }
  });
});

// ── Hold (D8) ───────────────────────────────────────────────────────────────

describe('a band starting at Historic', () => {
  const advice = challengeAdvice(flying);

  it('replaces the catalogue with hold reasons plus one free gamble', () => {
    expect(advice.band.hold).toBe(true);
    expect(advice.reasons.map((r) => r.id)).toEqual(['pace-hold', 'form-hold', 'deep-bench']);
  });

  it('has the coach and the owner saying do nothing', () => {
    expect(advice.quotes[0].action).toBe('hold');
    expect(advice.quotes[1].action).toBe('hold');
    expect(advice.quotes[2].action).toBe('trade');
    expect(advice.quotes[2].reasonId).toBe('deep-bench');
  });

  it('backs the hold with scoring evidence, not a record', () => {
    const form = advice.reasons.find((r) => r.id === 'form-hold')!;
    expect(form.evidence).toMatch(/score .* a game and allow/);
  });
});

// ── Product rules ───────────────────────────────────────────────────────────

/** Every string the module can put in front of a user, for both pace variants. */
function allStrings(): string[] {
  const out: string[] = [];
  for (const input of [struggling, flying]) {
    for (let seed = 0; seed < 8; seed++) {
      const advice = challengeAdvice({ ...input, seed });
      out.push(advice.band.label, advice.band.lowGrade.title, advice.band.highGrade.title);
      for (const r of advice.reasons) out.push(r.evidence, ...Object.values(r.vars));
      for (const q of advice.quotes) out.push(q.text, q.evidence);
    }
  }
  return out;
}

describe('product rules', () => {
  const strings = allStrings();

  it('produced a meaningful number of strings to scan', () => {
    expect(strings.length).toBeGreaterThan(100);
  });

  it('never names OVR or an engine rating', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/\b(ovr|overall|ratings?)\b/i);
      expect(s, s).not.toMatch(/midRange|perimeterDefense|postDefense/);
    }
  });

  it('never leaks a rating value (every fixture rating is in the 90s)', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/\b9\d\b/);
    }
  });

  it('never prints a win-loss record', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/\b\d{1,2}\s*[-–—]\s*\d{1,2}\b/);
      expect(s, s).not.toMatch(/\b\d{1,2}\s*(wins?|and)\s*\d{1,2}\s*loss/i);
    }
  });
});

describe('shortName', () => {
  it('reads like the board', () => {
    expect(shortName('Ryan Sheppard')).toBe('R. Sheppard');
    expect(shortName('Shai Gilgeous-Alexander')).toBe('S. Gilgeous-Alexander');
    expect(shortName('Nene')).toBe('Nene');
  });
});
