/**
 * game_theater T4: beats on hand-made synthetic theaters (never simulateGame, so the
 * tests pin the D4/D5/D10 rules and not the sim's randomness).
 */
import { describe, it, expect } from 'vitest';
import { computeBeats, renderBeat, identityStats } from '@/narration/beats';
import type { Beat, GameTheater, PossessionEvent, PlayerBoxScore, Side } from '@/narration/types';
import { IDENTITY_TEMPLATES, fillIdentityTemplate } from '@/narration/templates/identity';
import { ARCHETYPES } from '@/engine/archetypes';
import type { TeamInfo, ShotAttempt } from '@/engine/game';
import type { PlayerCardData, Trait } from '@/engine/types';

// ── Synthetic theater factory ───────────────────────────────────────────────

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

export function makePlayer(id: string, name: string, position: string, traits: Trait[] = []): PlayerCardData {
  return {
    id, type: 'Player', player: { id, name, position, height: '6-6', weight: 210, age: 27, team: 'SYN' },
    stats: {} as PlayerCardData['stats'], awards: [], ratings: {} as PlayerCardData['ratings'], traits, rarity: 'Common',
  };
}

export function makeTeam(seatId: string, name: string, prefix: string, traitFor?: (i: number) => Trait[]): TeamInfo {
  const players = Array.from({ length: 10 }, (_, i) =>
    makePlayer(`${prefix}${i}`, `${name} P${i}`, POSITIONS[i % 5], traitFor ? traitFor(i) : []));
  const starters = players.slice(0, 5).map(p => p.id);
  const depthChart: Record<string, string[]> = {};
  POSITIONS.forEach((pos, i) => { depthChart[pos] = [players[i].id, players[i + 5].id]; });
  return { seatId, name, players, starters, plays: [], depthChart };
}

export interface Poss {
  side: Side;
  pts: number;          // 0 | 2 | 3
  q?: number;           // quarter (default: carried from previous, starting at 1)
  scorer?: string;      // scoringPlayerId (default: side's P0)
  shots?: ShotAttempt[];
  clutch?: boolean;
  assist?: string;
  oreb?: string[];
  turnover?: boolean;
}

export function emptyBox(playerId: string, playerName: string, extra: Partial<PlayerBoxScore> = {}): PlayerBoxScore {
  return {
    playerId, playerName, minutes: 0, possessions: 0, points: 0, twoPointers: 0, threePointers: 0, andOnes: 0,
    turnovers: 0, assists: 0, offensiveRebounds: 0, defensiveRebounds: 0, steals: 0, blocks: 0,
    fieldGoalsMade: 0, fieldGoalsAttempted: 0, threesMade: 0, threesAttempted: 0, freeThrowsMade: 0,
    freeThrowsAttempted: 0, plusMinus: 0, ...extra,
  };
}

export function makeTheater(script: Poss[], opts: { home?: TeamInfo; away?: TeamInfo; finalScore?: [number, number] } = {}): GameTheater {
  const home = opts.home ?? makeTeam('human-0', 'You', 'h');
  const away = opts.away ?? makeTeam('bot-1', 'Astro', 'a');
  const score: [number, number] = [0, 0];
  let q = 1;
  const possessions: PossessionEvent[] = script.map((p, index) => {
    if (p.q !== undefined) q = p.q;
    if (p.side === 'home') score[0] += p.pts; else score[1] += p.pts;
    const team = p.side === 'home' ? home : away;
    const scorer = p.pts > 0 ? (p.scorer ?? team.starters[0]) : undefined;
    const channel = p.pts === 3 ? 'three' : 'rim';
    const shots: ShotAttempt[] = p.shots ?? (p.turnover ? [] : [{ shooterId: scorer ?? team.starters[0], channel, made: p.pts > 0 }]);
    const outcome = p.pts === 3 ? '3pt' : p.pts === 2 ? '2pt' : 'miss';
    return {
      index, quarter: q, segment: 0, team: p.side,
      lineupOnCourt: team.starters, defenseOnCourt: (p.side === 'home' ? away : home).starters,
      outcome, scoringPlayerId: scorer, assistPlayerId: p.assist,
      turnoverPlayerId: p.turnover ? team.starters[0] : undefined,
      offensiveRebounders: p.oreb,
      narrativeText: '',
      narrative: {
        kind: p.turnover ? 'turnover' : p.pts === 3 ? 'three_make' : p.pts === 2 ? 'rim_make' : 'miss',
        channel: p.turnover ? undefined : channel, actorId: scorer ?? team.starters[0],
        isAnd1: false, isPossessionWin: false, isSecondChance: false, ftMade: 0, ftAttempted: 0, tags: [],
      },
      shots, isClutch: p.clutch, runningScore: [score[0], score[1]],
    };
  });
  const quarters = [...new Set(possessions.map(p => p.quarter))];
  const overtimePeriods = Math.max(0, Math.max(...quarters) - 4);
  const pointsBy = new Map<string, number>();
  possessions.forEach((e, i) => {
    const prev = i > 0 ? possessions[i - 1].runningScore : [0, 0];
    const pts = (e.runningScore[0] - prev[0]) + (e.runningScore[1] - prev[1]);
    if (e.scoringPlayerId && pts > 0) pointsBy.set(e.scoringPlayerId, (pointsBy.get(e.scoringPlayerId) ?? 0) + pts);
  });
  const boxFor = (team: TeamInfo, side: Side) => team.players.map(p => emptyBox(p.id, p.player.name, {
    possessions: possessions.filter(e => e.team === side).length,
    points: pointsBy.get(p.id) ?? 0,
  }));
  return {
    homeTeam: home, awayTeam: away, possessions,
    quarterSummaries: [],
    finalScore: opts.finalScore ?? [score[0], score[1]],
    boxScore: { home: boxFor(home, 'home'), away: boxFor(away, 'away') },
    homeBonuses: {} as GameTheater['homeBonuses'], awayBonuses: {} as GameTheater['awayBonuses'],
    isOvertime: overtimePeriods > 0, overtimePeriods, seed: 1,
    playbook: {} as GameTheater['playbook'],
  };
}

const rep = (side: Side, pts: number, n: number, extra: Partial<Poss> = {}): Poss[] => Array.from({ length: n }, () => ({ side, pts, ...extra }));
const ofType = <T extends Beat['type']>(beats: Beat[], type: T) => beats.filter((b): b is Extract<Beat, { type: T }> => b.type === type);

// ── Runs ────────────────────────────────────────────────────────────────────

describe('computeBeats: runs', () => {
  it('an 8-0 run emits exactly one run beat then one run_answered', () => {
    const t = makeTheater([
      { side: 'away', pts: 2 },
      ...rep('home', 2, 5),      // 10-0 run: reaches 8 on the 4th make
      { side: 'away', pts: 3 },  // answered
    ]);
    const beats = computeBeats(t);
    const runs = ofType(beats, 'run');
    const answered = ofType(beats, 'run_answered');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ side: 'home', points: 8, opponentPoints: 0, atIndex: 4, score: [8, 2] });
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ side: 'away', runPoints: 10, atIndex: 6, score: [10, 5] });
  });

  it('a 7-0 run emits nothing', () => {
    const t = makeTheater([...rep('home', 2, 2), { side: 'home', pts: 3 }, { side: 'away', pts: 2 }]);
    const beats = computeBeats(t);
    expect(ofType(beats, 'run')).toHaveLength(0);
    expect(ofType(beats, 'run_answered')).toHaveLength(0);
  });

  it('a run that spans a quarter break still counts and misses do not break it', () => {
    const t = makeTheater([
      { side: 'home', pts: 2, q: 1 }, { side: 'away', pts: 0 }, { side: 'home', pts: 2 },
      { side: 'away', pts: 0, q: 2 }, { side: 'home', pts: 2 }, { side: 'home', pts: 2 },
    ]);
    const runs = ofType(computeBeats(t), 'run');
    expect(runs).toHaveLength(1);
    expect(runs[0].atIndex).toBe(5);
    expect(runs[0].points).toBe(8);
  });
});

// ── Lead changes / ties / largest lead ──────────────────────────────────────

describe('computeBeats: lead changes, ties, largest lead', () => {
  it('counts lead changes against the last non-tie leader', () => {
    const t = makeTheater([
      { side: 'home', pts: 2 },  // home leads (first lead: no change)
      { side: 'away', pts: 2 },  // tie
      { side: 'home', pts: 2 },  // home leads again: NOT a lead change
      { side: 'away', pts: 3 },  // away leads: lead change #1
      { side: 'home', pts: 3 },  // home leads 7-5: lead change #2
      { side: 'away', pts: 2 },  // tie 7-7
      { side: 'away', pts: 2 },  // away leads: lead change #3
    ]);
    const beats = computeBeats(t);
    const changes = ofType(beats, 'lead_change');
    expect(changes.map(c => [c.atIndex, c.side])).toEqual([[3, 'away'], [4, 'home'], [6, 'away']]);
    const ties = ofType(beats, 'tie');
    expect(ties.map(c => c.atIndex)).toEqual([1, 5]);
    expect(ties[0].score).toEqual([2, 2]);
  });

  it('largest_lead fires once per side per quarter on a new high of at least 10', () => {
    const t = makeTheater([
      ...rep('home', 2, 5),                 // 10-0 in Q1 → largest_lead (10)
      { side: 'home', pts: 2 },             // 12-0: new high but same quarter → no beat
      { side: 'home', pts: 2, q: 2 },       // 14-0 in Q2 → largest_lead (14)
      { side: 'away', pts: 2 },
      { side: 'home', pts: 2 },             // 16-2: 14, not a new high
    ]);
    const ll = ofType(computeBeats(t), 'largest_lead');
    expect(ll.map(b => [b.atIndex, b.margin])).toEqual([[4, 10], [6, 14]]);
  });
});

// ── Quarter end ─────────────────────────────────────────────────────────────

describe('computeBeats: quarter_end', () => {
  it('reports the quarter score, top scorer and shooting split per side', () => {
    const t = makeTheater([
      { side: 'home', pts: 3, scorer: 'h1', shots: [{ shooterId: 'h1', channel: 'three', made: true }] },
      { side: 'away', pts: 2, scorer: 'a0' },
      { side: 'home', pts: 0, shots: [{ shooterId: 'h0', channel: 'three', made: false }, { shooterId: 'h2', channel: 'rim', made: false }] },
      { side: 'home', pts: 3, scorer: 'h1', shots: [{ shooterId: 'h1', channel: 'three', made: true }] },
      { side: 'away', pts: 2, scorer: 'a3', q: 2 },
      { side: 'home', pts: 2, scorer: 'h0' },
    ]);
    const qe = ofType(computeBeats(t), 'quarter_end');
    expect(qe).toHaveLength(2);
    expect(qe[0]).toMatchObject({ quarter: 1, atIndex: 3, score: [6, 2], quarterScore: [6, 2] });
    expect(qe[0].topScorer).toMatchObject({ side: 'home', playerId: 'h1', name: 'You P1', points: 6 });
    expect(qe[0].shooting.home).toEqual({ fgm: 2, fga: 4, tpm: 2, tpa: 3 });
    expect(qe[0].shooting.away).toEqual({ fgm: 1, fga: 1, tpm: 0, tpa: 0 });
    expect(qe[1]).toMatchObject({ quarter: 2, atIndex: 5, score: [8, 4], quarterScore: [2, 2] });
    expect(qe[1].shooting.home).toEqual({ fgm: 1, fga: 1, tpm: 0, tpa: 0 });
  });

  it('topScorer is null when nobody scored in the period', () => {
    const t = makeTheater([{ side: 'home', pts: 0 }, { side: 'away', pts: 0 }]);
    expect(ofType(computeBeats(t), 'quarter_end')[0].topScorer).toBeNull();
  });
});

// ── Clutch / OT ─────────────────────────────────────────────────────────────

describe('computeBeats: clutch_start and ot_start', () => {
  it('clutch_start fires once per period, one index before the first clutch event', () => {
    const t = makeTheater([
      { side: 'home', pts: 2, q: 4 }, { side: 'away', pts: 2 },
      { side: 'home', pts: 2, clutch: true }, { side: 'away', pts: 2, clutch: true },
      { side: 'home', pts: 0, clutch: true }, { side: 'away', pts: 0, clutch: true },   // 4-4 → OT
      { side: 'home', pts: 2, q: 5 }, { side: 'away', pts: 2, clutch: true }, { side: 'home', pts: 0, clutch: true },
      { side: 'away', pts: 2, clutch: true },
    ]);
    const beats = computeBeats(t);
    const cs = ofType(beats, 'clutch_start');
    expect(cs.map(b => [b.quarter, b.atIndex])).toEqual([[4, 1], [5, 6]]);
    expect(cs[0].score).toEqual([2, 2]);
    const ot = ofType(beats, 'ot_start');
    expect(ot).toEqual([{ type: 'ot_start', atIndex: 5, period: 1, score: [4, 4] }]);
    expect(ofType(beats, 'quarter_end').map(b => b.quarter)).toEqual([4, 5]);
  });

  it('clutch_start at index 0 clamps to 0; double OT emits two ot_start beats', () => {
    const t = makeTheater([
      { side: 'home', pts: 2, q: 4, clutch: true }, { side: 'away', pts: 2, clutch: true },
      { side: 'home', pts: 2, q: 5 }, { side: 'away', pts: 2 },
      { side: 'home', pts: 2, q: 6 }, { side: 'away', pts: 0 },
    ]);
    const beats = computeBeats(t);
    expect(ofType(beats, 'clutch_start')[0].atIndex).toBe(0);
    expect(ofType(beats, 'ot_start').map(b => [b.atIndex, b.period])).toEqual([[1, 1], [3, 2]]);
  });
});

// ── Game winner / final ─────────────────────────────────────────────────────

describe('computeBeats: game_winner and final', () => {
  it('game_winner only on a walk-off make from tied or trailing, winning by 3 or less', () => {
    const walkOff = makeTheater([{ side: 'home', pts: 2 }, { side: 'away', pts: 2 }, { side: 'away', pts: 3, scorer: 'a2' }]);
    const gw = ofType(computeBeats(walkOff), 'game_winner');
    expect(gw).toHaveLength(1);
    expect(gw[0]).toMatchObject({ side: 'away', playerId: 'a2', name: 'Astro P2', score: [2, 5], atIndex: 2 });

    const alreadyLeading = makeTheater([{ side: 'away', pts: 2 }, { side: 'away', pts: 2 }, { side: 'away', pts: 2 }]);
    expect(ofType(computeBeats(alreadyLeading), 'game_winner')).toHaveLength(0);

    const missAtEnd = makeTheater([{ side: 'home', pts: 2 }, { side: 'away', pts: 3 }, { side: 'home', pts: 0 }]);
    expect(ofType(computeBeats(missAtEnd), 'game_winner')).toHaveLength(0);

    const blowout = makeTheater([{ side: 'home', pts: 3 }, { side: 'away', pts: 3 }, { side: 'away', pts: 3 }, { side: 'away', pts: 2 }]);
    expect(ofType(computeBeats(blowout), 'game_winner')).toHaveLength(0);
  });

  it('final carries the winner, margin and the largest deficit the winner faced', () => {
    const t = makeTheater([...rep('away', 2, 6), ...rep('home', 2, 8)]); // away up 12, home wins 16-12
    const beats = computeBeats(t);
    const fin = ofType(beats, 'final');
    expect(fin).toHaveLength(1);
    expect(fin[0]).toMatchObject({ side: 'home', score: [16, 12], margin: 4, largestComeback: 12, atIndex: 13 });
    expect(beats[beats.length - 1].type).toBe('final');
  });

  it('final uses theater.finalScore when the tiebreak point is folded in', () => {
    const t = makeTheater([{ side: 'home', pts: 2 }, { side: 'away', pts: 2 }], { finalScore: [3, 2] });
    expect(ofType(computeBeats(t), 'final')[0]).toMatchObject({ side: 'home', score: [3, 2], margin: 1 });
    expect(ofType(computeBeats(t), 'game_winner')).toHaveLength(0);
  });
});

// ── Identity (D5) ───────────────────────────────────────────────────────────

describe('computeBeats: identity', () => {
  const shooters = (i: number): Trait[] => (i < 6 ? [{ name: 'Sharpshooter', level: 2 }] : []);

  it('emits one identity line per quarter for a side whose selected plan is online', () => {
    const home = { ...makeTeam('human-0', 'You', 'h', shooters), archetypes: { offense: 'shooting-gallery' } };
    const script: Poss[] = [
      ...rep('home', 3, 3, { q: 1 }), ...rep('away', 2, 3),
      ...rep('home', 3, 2, { q: 2 }), ...rep('away', 0, 2),
    ];
    const t = makeTheater(script, { home });
    const ids = ofType(computeBeats(t), 'identity');
    expect(ids).toHaveLength(2);
    expect(ids.every(b => b.side === 'home' && b.identityName === 'Shooting Gallery')).toBe(true);
    expect(ids[0].atIndex).toBe(3); // midpoint of a 6-possession quarter
    expect(ids[0].text).toContain('You');
    expect(ids[0].text.length).toBeLessThan(110);
  });

  it('stays silent when no identity is selected or the plan is not online', () => {
    const off = { ...makeTeam('human-0', 'You', 'h'), archetypes: { offense: 'shooting-gallery' } };
    expect(ofType(computeBeats(makeTheater(rep('home', 2, 4), { home: off })), 'identity')).toHaveLength(0);
    expect(ofType(computeBeats(makeTheater(rep('home', 2, 4))), 'identity')).toHaveLength(0);
  });

  it('identityStats counts threes, paint points, boards and forced turnovers', () => {
    const t = makeTheater([
      { side: 'home', pts: 3, shots: [{ shooterId: 'h0', channel: 'three', made: true }] },
      { side: 'home', pts: 2, oreb: ['h4'], shots: [{ shooterId: 'h0', channel: 'rim', made: false }, { shooterId: 'h4', channel: 'rim', made: true }] },
      { side: 'away', pts: 0, turnover: true },
      { side: 'away', pts: 3 },
    ]);
    const s = identityStats(t.possessions, 'home', [0, 0]);
    expect(s).toMatchObject({ tpm: 1, tpa: 1, rimm: 1, rima: 2, paint: 2, oreb: 1, poss: 2, pts: 5, forced: 1, opptpm: 1, opptpa: 1, opppts: 3 });
  });

  it('every archetype has 3+ variants that render under 110 chars', () => {
    const vars = { team: 'CourtSense', q: 'Q3', tpm: 10, tpa: 24, midm: 10, mida: 20, rimm: 12, rima: 18, paint: 24, oreb: 8, ast: 12, poss: 30, pts: 45, opptpm: 10, opptpa: 25, opprimm: 10, opprima: 20, forced: 10, opppts: 40 };
    for (const def of ARCHETYPES) {
      const pool = IDENTITY_TEMPLATES[def.id];
      expect(pool, def.id).toBeDefined();
      expect(pool.length, def.id).toBeGreaterThanOrEqual(3);
      for (const tpl of pool) {
        const line = fillIdentityTemplate(tpl, vars);
        expect(line.length, line).toBeLessThan(110);
        expect(line, line).not.toContain('!');
        expect(line, line).not.toMatch(/\{\w+\}/);
      }
    }
    expect(Object.keys(IDENTITY_TEMPLATES).sort()).toEqual(ARCHETYPES.map(d => d.id).sort());
  });
});

// ── Ordering and rendering ──────────────────────────────────────────────────

describe('computeBeats: ordering and renderBeat', () => {
  const full = (): GameTheater => {
    const shooters = (i: number): Trait[] => (i < 6 ? [{ name: 'Sharpshooter', level: 2 }] : []);
    const home = { ...makeTeam('human-0', 'CourtSense', 'h', shooters), archetypes: { offense: 'shooting-gallery' } };
    return makeTheater([
      ...rep('away', 2, 6, { q: 1 }), ...rep('home', 3, 5),
      { side: 'away', pts: 2, q: 2 }, ...rep('home', 2, 3), { side: 'away', pts: 3 },
      { side: 'away', pts: 2, q: 3 }, { side: 'away', pts: 2 }, { side: 'home', pts: 0 },
      { side: 'home', pts: 2, q: 4 }, { side: 'away', pts: 2, clutch: true }, { side: 'home', pts: 0, clutch: true },
      { side: 'away', pts: 2, clutch: true }, { side: 'home', pts: 3, clutch: true },
    ], { home });
  };

  it('beats are sorted by atIndex', () => {
    const beats = computeBeats(full());
    for (let i = 1; i < beats.length; i++) expect(beats[i].atIndex).toBeGreaterThanOrEqual(beats[i - 1].atIndex);
    const types = new Set(beats.map(b => b.type));
    for (const t of ['run', 'run_answered', 'lead_change', 'largest_lead', 'quarter_end', 'clutch_start', 'identity', 'game_winner', 'final'] as const) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it('every rendered line is under 110 chars and only game_winner uses "!"', () => {
    const t = full();
    const beats = computeBeats(t);
    for (const b of beats) {
      const line = renderBeat(b, t);
      expect(line.length, line).toBeGreaterThan(0);
      expect(line.length, line).toBeLessThan(110);
      if (b.type !== 'game_winner') expect(line, line).not.toContain('!');
      else expect(line).toContain('!');
    }
  });

  it('renders the documented broadcast phrasings', () => {
    const t = full();
    const beats = computeBeats(t);
    const by = <T extends Beat['type']>(type: T) => ofType(beats, type)[0];
    expect(renderBeat(by('run'), t)).toBe('8-0 run for Astro.');
    expect(renderBeat(by('run_answered'), t)).toBe('CourtSense answers the 12-0 run.');
    expect(renderBeat(by('lead_change'), t)).toMatch(/^Lead change: CourtSense up \d+-\d+\.$/);
    expect(renderBeat(by('quarter_end'), t)).toBe('End of Q1: Astro 12, CourtSense 15. CourtSense P0 leads with 15.');
    expect(renderBeat(by('clutch_start'), t)).toMatch(/^Crunch time\. Astro \d+, CourtSense \d+\.$/);
    expect(renderBeat(by('game_winner'), t)).toMatch(/^CourtSense P0 wins it, \d+-\d+!$/);
    expect(renderBeat(by('final'), t)).toMatch(/^Final: Astro \d+, CourtSense \d+\. CourtSense wins by \d+ after trailing by 12\.$/);
    const ot: Beat = { type: 'ot_start', atIndex: 0, period: 1, score: [0, 0] };
    expect(renderBeat(ot, t)).toBe('Overtime.');
    expect(renderBeat({ type: 'tie', atIndex: 0, score: [50, 50] }, t)).toBe('Tied at 50.');
  });
});
