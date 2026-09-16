import { describe, it, expect } from 'vitest';
import type { GameTheater, PossessionEvent, PossessionNarrative, NarrativeKind, ShotChannel } from '@/narration/types';
import {
  renderTheater, renderPossession, createPick, createRenderState, ftLine, MAX_LINE_CHARS, NO_REPEAT_WINDOW,
} from '@/narration/render';
import {
  KIND_TEMPLATES, PLAY_TEMPLATES, COVERAGE_TEMPLATES,
  REQUIRED_KIND_CHANNELS, REQUIRED_PLAY_KINDS, REQUIRED_COVERAGE_KINDS,
  SECOND_CHANCE_PREFIXES, POSSESSION_WIN_PREFIXES, STEER_TAGS,
} from '@/narration/templates';

const LONG = 'Shai Gilgeous-Alexander'; // 22 characters, the worst-case name in the pool
const FULL_VALUES: Record<string, string> = {
  actor: LONG, assist: LONG, defender: LONG, rebounder: LONG,
  play: 'High Pick & Roll', coverage: 'Full Court Press', team: 'Golden State Warriors', ftLine: 'splits the pair',
};

function substitute(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => FULL_VALUES[k] ?? k);
}

/** Every template string in the library, tagged with where it lives. */
function allTemplates(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const [kind, kt] of Object.entries(KIND_TEMPLATES)) {
    for (const [ch, pool] of Object.entries(kt.pools)) pool?.forEach((t, i) => out.push({ where: `kind ${kind}/${ch}#${i}`, text: t }));
    kt.assistSuffixes?.forEach((t, i) => out.push({ where: `kind ${kind}/assist#${i}`, text: t }));
  }
  for (const [id, pt] of Object.entries(PLAY_TEMPLATES)) {
    for (const [kind, pool] of Object.entries(pt.pools)) pool?.forEach((t, i) => out.push({ where: `play ${id}/${kind}#${i}`, text: t }));
  }
  for (const [id, ct] of Object.entries(COVERAGE_TEMPLATES)) {
    for (const [kind, pool] of Object.entries(ct.pools)) pool?.forEach((t, i) => out.push({ where: `coverage ${id}/${kind}#${i}`, text: t }));
  }
  SECOND_CHANCE_PREFIXES.forEach((t, i) => out.push({ where: `second_chance#${i}`, text: t }));
  POSSESSION_WIN_PREFIXES.forEach((t, i) => out.push({ where: `possession_win#${i}`, text: t }));
  for (const [ch, tags] of Object.entries(STEER_TAGS)) tags.forEach((t, i) => out.push({ where: `steer ${ch}#${i}`, text: t }));
  return out;
}

const ALLOWED_PLACEHOLDERS = new Set(['actor', 'assist', 'defender', 'play', 'coverage', 'team', 'rebounder', 'ftLine']);

describe('narration templates (T3)', () => {
  it('every template renders under 110 characters with 22-character names', () => {
    const offenders = allTemplates()
      .map(t => ({ ...t, rendered: substitute(t.text) }))
      .filter(t => t.rendered.length >= MAX_LINE_CHARS)
      .map(t => `${t.where} (${t.rendered.length}): ${t.rendered}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('only uses known placeholders', () => {
    const bad = allTemplates().filter(t => [...t.text.matchAll(/\{(\w+)\}/g)].some(m => !ALLOWED_PLACEHOLDERS.has(m[1])));
    expect(bad.map(b => b.where)).toEqual([]);
  });

  it('every kind/channel pool has at least 6 variants', () => {
    const short: string[] = [];
    for (const [kind, channels] of Object.entries(REQUIRED_KIND_CHANNELS) as Array<[NarrativeKind, Array<ShotChannel | 'any'>]>) {
      for (const ch of channels) {
        const n = KIND_TEMPLATES[kind].pools[ch]?.length ?? 0;
        if (n < 6) short.push(`${kind}/${ch}: ${n}`);
      }
    }
    expect(short).toEqual([]);
  });

  it('every make kind has at least 6 assist suffixes', () => {
    for (const kind of ['rim_make', 'rim_ft', 'mid_make', 'three_make', 'and1'] as NarrativeKind[]) {
      expect(KIND_TEMPLATES[kind].assistSuffixes?.length ?? 0, kind).toBeGreaterThanOrEqual(6);
    }
  });

  it('every offensive play has at least 3 variants per required kind', () => {
    const expected = ['basic-offense', 'play-std-3', 'play-std-1', 'play-sys-4', 'play-std-5', 'play-sys-1', 'play-sys-2'];
    expect(Object.keys(PLAY_TEMPLATES).sort()).toEqual([...expected].sort());
    const short: string[] = [];
    for (const [id, pt] of Object.entries(PLAY_TEMPLATES)) {
      expect(pt.playId).toBe(id);
      for (const kind of REQUIRED_PLAY_KINDS) {
        const n = pt.pools[kind]?.length ?? 0;
        if (n < 3) short.push(`${id}/${kind}: ${n}`);
      }
    }
    expect(short).toEqual([]);
  });

  it('every coverage has at least 3 variants per required kind', () => {
    const expected = ['basic-defense', 'play-std-4', 'play-std-2', 'play-sys-3'];
    expect(Object.keys(COVERAGE_TEMPLATES).sort()).toEqual([...expected].sort());
    const short: string[] = [];
    for (const [id, ct] of Object.entries(COVERAGE_TEMPLATES)) {
      expect(ct.playId).toBe(id);
      for (const kind of REQUIRED_COVERAGE_KINDS) {
        const n = ct.pools[kind]?.length ?? 0;
        if (n < 3) short.push(`${id}/${kind}: ${n}`);
      }
    }
    expect(short).toEqual([]);
  });

  it('prefix and steer pools are populated', () => {
    expect(SECOND_CHANCE_PREFIXES.length).toBeGreaterThanOrEqual(6);
    expect(POSSESSION_WIN_PREFIXES.length).toBeGreaterThanOrEqual(6);
    for (const ch of ['rim', 'mid', 'three'] as ShotChannel[]) expect(STEER_TAGS[ch].length).toBeGreaterThanOrEqual(3);
  });

  it('exclamation marks appear only in and1 pools', () => {
    const bad = allTemplates().filter(t => t.text.includes('!') && !/^(kind and1\/(rim|mid|three)|play [\w-]+\/and1)#/.test(t.where));
    expect(bad.map(b => `${b.where}: ${b.text}`)).toEqual([]);
    // and every and1 body has one, so the pool stays lively
    for (const ch of ['rim', 'mid', 'three'] as ShotChannel[]) {
      for (const t of KIND_TEMPLATES.and1.pools[ch]!) expect(t, t).toContain('!');
    }
  });
});

// ── Synthetic theater ───────────────────────────────────────────────────────

const HOME_IDS = Array.from({ length: 12 }, (_, i) => `h${i}`);
const AWAY_IDS = Array.from({ length: 12 }, (_, i) => `a${i}`);
const HOME_NAMES = ['Shai Gilgeous-Alexander', 'Jalen Williams', 'Chet Holmgren', 'Luguentz Dort', 'Isaiah Hartenstein', 'Alex Caruso', 'Cason Wallace', 'Aaron Wiggins', 'Isaiah Joe', 'Kenrich Williams', 'Jaylin Williams', 'Ousmane Dieng'];
const AWAY_NAMES = ['Tyrese Haliburton', 'Pascal Siakam', 'Myles Turner', 'Andrew Nembhard', 'Aaron Nesmith', 'T.J. McConnell', 'Obi Toppin', 'Bennedict Mathurin', 'Ben Sheppard', 'Thomas Bryant', 'Tony Bradley', 'Johnny Furphy'];

function team(seatId: string, name: string, ids: string[], names: string[]) {
  return {
    seatId, name,
    players: ids.map((id, i) => ({ id, type: 'Player', player: { name: names[i] } })),
    starters: ids.slice(0, 5), plays: [], depthChart: {},
  };
}

const KIND_CYCLE: Array<{ kind: NarrativeKind; channel?: ShotChannel; outcome: PossessionEvent['outcome'] }> = [
  { kind: 'rim_make', channel: 'rim', outcome: '2pt' },
  { kind: 'miss', channel: 'three', outcome: 'miss' },
  { kind: 'three_make', channel: 'three', outcome: '3pt' },
  { kind: 'turnover', outcome: 'miss' },
  { kind: 'mid_make', channel: 'mid', outcome: '2pt' },
  { kind: 'miss', channel: 'rim', outcome: 'miss' },
  { kind: 'steal', outcome: 'miss' },
  { kind: 'block', channel: 'rim', outcome: 'miss' },
  { kind: 'and1', channel: 'rim', outcome: 'and1' },
  { kind: 'rim_ft', outcome: '2pt' },
  { kind: 'miss', channel: 'mid', outcome: 'miss' },
  { kind: 'rim_make', channel: 'rim', outcome: '2pt' },
];

function makeEvent(i: number, overrides: Partial<PossessionNarrative> = {}, extra: Partial<PossessionEvent> = {}): PossessionEvent {
  const spec = KIND_CYCLE[i % KIND_CYCLE.length];
  const home = i % 2 === 0;
  const off = home ? HOME_IDS : AWAY_IDS;
  const def = home ? AWAY_IDS : HOME_IDS;
  const isMake = spec.kind.endsWith('make') || spec.kind === 'and1';
  const narrative: PossessionNarrative = {
    kind: spec.kind,
    channel: spec.channel,
    actorId: off[i % 5],
    assistId: isMake && i % 3 !== 0 ? off[(i + 1) % 5] : undefined,
    defenderId: (spec.kind === 'block' || spec.kind === 'steal') ? def[i % 5] : undefined,
    isAnd1: spec.kind === 'and1',
    isPossessionWin: i % 17 === 0,
    isSecondChance: i % 7 === 0,
    ftMade: spec.kind === 'rim_ft' ? (i % 3) : spec.kind === 'and1' ? 1 : 0,
    ftAttempted: spec.kind === 'rim_ft' ? 2 : spec.kind === 'and1' ? 1 : 0,
    tags: [],
    ...overrides,
  };
  const event: PossessionEvent = {
    index: i, quarter: Math.floor(i / 15) + 1, segment: 0,
    team: home ? 'home' : 'away',
    lineupOnCourt: off.slice(0, 5), defenseOnCourt: def.slice(0, 5),
    outcome: spec.outcome,
    scoringPlayerId: isMake ? narrative.actorId : undefined,
    assistPlayerId: narrative.assistId,
    offensiveRebounders: narrative.isSecondChance ? [off[3]] : undefined,
    narrativeText: `legacy ${i}`,
    narrative,
    shots: [],
    runningScore: [0, 0],
    ...extra,
  };
  return event;
}

function makeTheater(events: PossessionEvent[], seed = 4242): GameTheater {
  return {
    homeTeam: team('seat-0', 'You', HOME_IDS, HOME_NAMES),
    awayTeam: team('seat-1', 'Indiana Pacers', AWAY_IDS, AWAY_NAMES),
    possessions: events,
    quarterSummaries: [], finalScore: [0, 0], boxScore: { home: [], away: [] },
    homeBonuses: {}, awayBonuses: {}, isOvertime: false, overtimePeriods: 0, seed,
    playbook: { home: {}, away: {} },
  } as unknown as GameTheater;
}

function syntheticTheater(): GameTheater {
  const events: PossessionEvent[] = [];
  for (let i = 0; i < 60; i++) {
    const overrides: Partial<PossessionNarrative> = {};
    const extra: Partial<PossessionEvent> = {};
    if (i % 5 === 1) {
      overrides.calledPlayId = 'play-std-1';
      extra.calledPlays = [{ playId: 'play-std-1', name: 'High Pick & Roll', side: 'offense', teamSide: i % 2 === 0 ? 'home' : 'away' }];
    }
    if (i % 4 === 3) {
      overrides.coverageId = 'play-sys-3';
      extra.calledPlays = [...(extra.calledPlays ?? []), { playId: 'play-sys-3', name: 'Grit and Grind', side: 'defense', teamSide: i % 2 === 0 ? 'away' : 'home' }];
    }
    if (i % 9 === 4) overrides.steeredTo = 'three';
    events.push(makeEvent(i, overrides, extra));
  }
  return makeTheater(events);
}

describe('narration renderer (T2)', () => {
  it('createPick is deterministic and returns indices in range', () => {
    const a = createPick(99, 7);
    const b = createPick(99, 7);
    const c = createPick(99, 8);
    const seqA = [a(6, 0), a(6, 1), a(3, 2), a(100, 3)];
    const seqB = [b(6, 0), b(6, 1), b(3, 2), b(100, 3)];
    expect(seqA).toEqual(seqB);
    expect(seqA[0]).toBeGreaterThanOrEqual(0);
    expect(seqA[0]).toBeLessThan(6);
    expect(c(1, 0)).toBe(0);
    // different possession index => different stream (statistically; check over a few draws)
    const seqC = [c(100, 0), c(100, 1), c(100, 2), c(100, 3)];
    expect(seqC).not.toEqual(seqA);
  });

  it('ftLine covers the rim_ft trip and the and-one', () => {
    expect(ftLine(2, 2)).toBe('hits both');
    expect(ftLine(1, 2)).toBe('splits the pair');
    expect(ftLine(0, 2)).toBe('misses both');
    expect(ftLine(1, 1)).toBe('hits the free throw');
    expect(ftLine(2, 3)).toBe('makes 2 of 3');
  });

  it('renderTheater is deterministic and one line per possession', () => {
    const theater = syntheticTheater();
    const first = renderTheater(theater);
    const second = renderTheater(theater);
    expect(first).toEqual(second);
    expect(first.length).toBe(theater.possessions.length);
    for (const line of first) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThan(MAX_LINE_CHARS);
      expect(line).not.toMatch(/\{\w+\}/);
    }
    // a different seed renders a different game
    const other = renderTheater(makeTheater(theater.possessions, 1));
    expect(other).not.toEqual(first);
  });

  it('substitutes real names, play and coverage names, and the second-chance rebounder', () => {
    const theater = syntheticTheater();
    const lines = renderTheater(theater);
    const joined = lines.join('\n');
    expect(joined).toContain('Shai Gilgeous-Alexander');
    expect(joined).toContain('Tyrese Haliburton');
    expect(joined).toContain('High Pick & Roll');
    expect(joined).toContain('Grit and Grind');
    // event 7 is second chance (7 % 7 === 0) on the away team: rebounder a3 = Andrew Nembhard
    expect(lines[7]).toContain('Andrew Nembhard');
    // event 34 is a possession win (34 % 17 === 0, not a second chance) for the home team "You"
    expect(lines[34]).toContain('You');
    expect(lines[34]).not.toMatch(/\bYou (is|gets|wins|earns)\b/);
    // event 0 carries both prefixes on a long body: the trim ladder keeps the second chance, drops the win.
    expect(lines[0].length).toBeLessThan(MAX_LINE_CHARS);
  });

  it('never reuses a variant within 5 possessions of the same kind', () => {
    // 60 straight three-point misses with no play/coverage: the pool (8) is larger than the window.
    const events: PossessionEvent[] = [];
    for (let i = 0; i < 60; i++) {
      events.push(makeEvent(i * 12 + 1, { kind: 'miss', channel: 'three', isSecondChance: false, isPossessionWin: false, assistId: undefined, defenderId: undefined }, { index: i }));
    }
    const lines = renderTheater(makeTheater(events));
    const pool = KIND_TEMPLATES.miss.pools.three!;
    const variantOf = (line: string) => pool.findIndex(t => {
      const re = new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{actor\\\}/g, '.+') + '$');
      return re.test(line);
    });
    const ids = lines.map(variantOf);
    expect(ids.every(v => v >= 0), 'every line maps to a template').toBe(true);
    for (let i = 0; i < ids.length; i++) {
      for (let j = Math.max(0, i - NO_REPEAT_WINDOW); j < i; j++) {
        expect(ids[j], `possession ${j} and ${i} share variant ${ids[i]}`).not.toBe(ids[i]);
      }
    }
    expect(new Set(ids).size).toBeGreaterThanOrEqual(6);
  });

  it('falls back to the least-recent variant when the pool is smaller than the window', () => {
    // A play pool with exactly 3 variants for mid_make, called 12 times in a row.
    const events: PossessionEvent[] = [];
    for (let i = 0; i < 12; i++) {
      events.push(makeEvent(4, { calledPlayId: 'play-std-3', isSecondChance: false, isPossessionWin: false, assistId: undefined }, {
        index: i, calledPlays: [{ playId: 'play-std-3', name: 'Horns', side: 'offense', teamSide: 'home' }],
      }));
    }
    const lines = renderTheater(makeTheater(events));
    expect(lines.length).toBe(12);
    for (const line of lines) expect(line).toContain('Horns');
    // With 3 variants and a window of 5, consecutive lines are never identical.
    for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
  });

  it('uses play-aware, coverage-aware and kind pools as specified', () => {
    const state = createRenderState();
    const pick = createPick(1, 1);
    const base = makeEvent(1); // miss / three, home offense... index 1 => away
    const ctx = { actor: 'A', team: 'T', play: 'High Pick & Roll', coverage: 'Box-and-One' };
    const withPlay = renderPossession({ ...base, narrative: { ...base.narrative, calledPlayId: 'play-std-1' } }, ctx, pick, state);
    expect(withPlay).toContain('High Pick & Roll');
    const withCoverage = renderPossession({ ...base, narrative: { ...base.narrative, coverageId: 'play-std-2' } }, ctx, createPick(1, 2), state);
    expect(withCoverage).toContain('Box-and-One');
    // Coverage never narrates a make.
    const makeEv = makeEvent(0);
    const makeLine = renderPossession({ ...makeEv, narrative: { ...makeEv.narrative, coverageId: 'play-std-2', isPossessionWin: false, isSecondChance: false } }, ctx, createPick(1, 3), state);
    expect(makeLine).not.toContain('Box-and-One');
    // Unknown play id falls back to the kind pool without throwing.
    const unknown = renderPossession({ ...base, narrative: { ...base.narrative, calledPlayId: 'nope' } }, ctx, createPick(1, 4), state);
    expect(unknown.length).toBeGreaterThan(0);
  });

  it('appends the assist suffix on makes and the steer tag on makes and misses only', () => {
    const state = createRenderState();
    const ctx = { actor: 'Chet Holmgren', assist: 'Alex Caruso', team: 'You' };
    const make = makeEvent(0, { assistId: 'h1', steeredTo: 'rim', isPossessionWin: false, isSecondChance: false });
    const line = renderPossession(make, ctx, createPick(7, 0), state);
    expect(line).toContain('Alex Caruso');
    expect(line).toMatch(/—/);
    const to = makeEvent(3, { steeredTo: 'three', isPossessionWin: false, isSecondChance: false });
    const toLine = renderPossession(to, ctx, createPick(7, 3), state);
    expect(toLine).not.toMatch(/—/);
    expect(toLine).not.toContain('Alex Caruso');
  });

  it('drops the steer tag, then the assist, then the prefix to stay under 110 characters', () => {
    const state = createRenderState();
    const ctx = { actor: LONG, assist: LONG, team: 'Golden State Warriors', rebounder: LONG };
    const ev = makeEvent(0, { assistId: 'h1', steeredTo: 'rim', isPossessionWin: true, isSecondChance: true });
    for (let s = 0; s < 20; s++) {
      const line = renderPossession(ev, ctx, createPick(s, 0), state);
      expect(line.length, line).toBeLessThan(MAX_LINE_CHARS);
      expect(line).toContain(LONG);
    }
  });

  it('renders rim_ft with the free-throw line', () => {
    const state = createRenderState();
    const ctx = { actor: 'Chet Holmgren', team: 'You' };
    const ev = makeEvent(9, { isPossessionWin: false, isSecondChance: false, assistId: undefined, ftMade: 1, ftAttempted: 2 });
    expect(ev.narrative.kind).toBe('rim_ft');
    const line = renderPossession(ev, ctx, createPick(3, 9), state);
    expect(line).toContain('splits the pair');
  });

  it('never mentions a missing defender by placeholder or falls through to garbage', () => {
    const state = createRenderState();
    const ctx = { actor: 'Chet Holmgren', team: 'You' };
    for (let s = 0; s < 30; s++) {
      const ev = makeEvent(7, { defenderId: undefined, isPossessionWin: false, isSecondChance: false });
      expect(ev.narrative.kind).toBe('block');
      const line = renderPossession(ev, ctx, createPick(s, 7), state);
      expect(line).not.toMatch(/\{\w+\}/);
      expect(line).not.toContain('undefined');
      expect(line[0]).toBe(line[0].toUpperCase());
    }
  });

  it('legacy events without narrative return their stored text (D7)', () => {
    const legacy = { ...makeEvent(2), narrative: undefined } as unknown as PossessionEvent;
    const lines = renderTheater(makeTheater([legacy, makeEvent(1)]));
    expect(lines[0]).toBe('legacy 2');
    expect(lines[1]).not.toBe('legacy 1');
    expect(renderPossession(legacy, { actor: 'x', team: 'y' }, createPick(0, 0), createRenderState())).toBe('legacy 2');
  });
});
