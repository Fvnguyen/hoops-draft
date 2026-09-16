/**
 * Narration renderer (plan game_theater T2, D2/D3/D7).
 *
 * Turns a `PossessionNarrative` into one broadcast-style line. Pure and deterministic:
 * no React, no Math.random — variant choice comes from `createPick(seed, index)`, a
 * mulberry32 stream keyed on the game seed and the possession index, so the same
 * theater always renders the same text.
 *
 * Placeholders (see types.ts): {actor} {assist} {defender} {play} {coverage} {team}
 * {rebounder}. This module adds one extra: {ftLine}, rendered from
 * narrative.ftMade / ftAttempted ("hits both", "splits the pair", "misses both"; a
 * one-shot trip reads "hits the free throw" / "misses the free throw"; anything else
 * "makes 2 of 3"). A template whose placeholders are not all available for this
 * possession (e.g. {defender} on an uncredited block) is skipped; if that empties the
 * pool, the whole pool is used with generic fallbacks ("a defender", "a teammate").
 *
 * Pool selection (D2): kind x channel. A called offensive play with a pool for this kind
 * wins; a coverage pool applies to defensive outcomes (miss, block, turnover, steal);
 * when both exist they alternate by pick(2). Otherwise the kind pool for the channel,
 * falling back to the kind's 'any' pool.
 *
 * No-repeat (D3): a variant (pool key + index) is not reused within the last 5
 * possessions of the same kind; when every candidate is excluded the least-recent one
 * is allowed.
 *
 * Assembly: [possession-win prefix] [second-chance prefix] body [assist suffix]
 * [steer tag]. If the line exceeds MAX_LINE_CHARS the steer tag is dropped, then the
 * assist suffix, then the possession-win prefix, then the second-chance prefix.
 */
import { createRng } from '../engine/rng';
import { PLAYBOOK } from '../engine/playbook';
import type {
  GameTheater, PossessionEvent, PossessionNarrative, NarrativeKind, ShotChannel,
  RenderContext, Pick,
} from './types';
import {
  KIND_TEMPLATES, PLAY_TEMPLATES, COVERAGE_TEMPLATES,
  SECOND_CHANCE_PREFIXES, POSSESSION_WIN_PREFIXES, STEER_TAGS,
} from './templates';

/** Rendered lines are strictly shorter than this (D3: "under 110 characters"). */
export const MAX_LINE_CHARS = 110;
export const NO_REPEAT_WINDOW = 5;

const DEFENSIVE_KINDS: ReadonlySet<NarrativeKind> = new Set(['miss', 'block', 'turnover', 'steal']);
const STEER_KINDS: ReadonlySet<NarrativeKind> = new Set(['miss', 'rim_make', 'rim_ft', 'mid_make', 'three_make']);
const ASSIST_KINDS: ReadonlySet<NarrativeKind> = new Set(['rim_make', 'rim_ft', 'mid_make', 'three_make', 'and1']);

/** Salt order = call order within one possession. Documented so the stream is auditable. */
const SALT = { POOL_ALTERNATE: 0, BODY: 1, POSSESSION_WIN: 2, SECOND_CHANCE: 3, ASSIST: 4, STEER: 5 } as const;

/** Per-kind memory of recently used variant ids (most recent last), capped at NO_REPEAT_WINDOW. */
export interface RenderState {
  recent: Map<NarrativeKind, string[]>;
}

export function createRenderState(): RenderState {
  return { recent: new Map() };
}

/**
 * Deterministic picker for one possession. Successive calls advance one mulberry32
 * stream seeded from `(seed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0`; the `salt`
 * argument is not mixed into the state — it documents the draw order (see SALT), so
 * callers must keep the call order stable for a given event shape.
 */
export function createPick(seed: number, index: number): Pick {
  const rng = createRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  return (n: number, _salt: number) => {
    void _salt;
    if (n <= 1) { rng.next(); return 0; }
    return Math.floor(rng.next() * n);
  };
}

// ── Placeholder handling ────────────────────────────────────────────────────

type Values = Record<string, string | undefined>;

const PLACEHOLDER_RE = /\{(\w+)\}/g;

function placeholdersOf(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(PLACEHOLDER_RE)) out.push(m[1]);
  return out;
}

const FALLBACKS: Record<string, string> = {
  actor: 'the ball-handler',
  assist: 'a teammate',
  defender: 'a defender',
  play: 'the set',
  coverage: 'the coverage',
  team: 'the offence',
  rebounder: 'the offence',
  ftLine: 'goes to the line',
};

function fill(template: string, values: Values): string {
  const out = template.replace(PLACEHOLDER_RE, (_, key: string) => values[key] ?? FALLBACKS[key] ?? key);
  // A lowercase fallback ("a defender") can land at the start of a sentence.
  const first = out.search(/\S/);
  return first < 0 ? out : out.slice(0, first) + out[first].toUpperCase() + out.slice(first + 1);
}

export function ftLine(made: number, attempted: number): string {
  if (attempted === 2) {
    if (made === 2) return 'hits both';
    if (made === 1) return 'splits the pair';
    return 'misses both';
  }
  if (attempted === 1) return made === 1 ? 'hits the free throw' : 'misses the free throw';
  if (attempted <= 0) return 'goes to the line';
  return `makes ${made} of ${attempted}`;
}

// ── Variant choice with the no-repeat rule ──────────────────────────────────

function choose(pool: string[], poolKey: string, kind: NarrativeKind, values: Values, pick: Pick, salt: number, state: RenderState): string {
  // 1. Prefer templates whose placeholders are all available for this possession.
  let candidates: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (placeholdersOf(pool[i]).every(k => values[k] !== undefined)) candidates.push(i);
  }
  if (candidates.length === 0) candidates = pool.map((_, i) => i);

  // 2. Exclude variants used within the last NO_REPEAT_WINDOW possessions of this kind.
  const recent = state.recent.get(kind) ?? [];
  const fresh = candidates.filter(i => !recent.includes(`${poolKey}#${i}`));
  let index: number;
  if (fresh.length > 0) {
    index = fresh[pick(fresh.length, salt)];
  } else {
    // Every candidate is recent: allow the least-recent one (earliest in the ring).
    pick(1, salt); // keep the stream aligned with the branch above
    index = candidates.reduce((best, i) =>
      recent.lastIndexOf(`${poolKey}#${i}`) < recent.lastIndexOf(`${poolKey}#${best}`) ? i : best, candidates[0]);
  }
  const next = [...recent, `${poolKey}#${index}`];
  while (next.length > NO_REPEAT_WINDOW) next.shift();
  state.recent.set(kind, next);
  return fill(pool[index], values);
}

function kindPool(kind: NarrativeKind, channel: ShotChannel | undefined): { pool: string[]; key: string } {
  const kt = KIND_TEMPLATES[kind];
  if (channel && kt.pools[channel]?.length) return { pool: kt.pools[channel]!, key: `${kind}/${channel}` };
  if (kt.pools.any?.length) return { pool: kt.pools.any, key: `${kind}/any` };
  // Channel missing on a channelled kind: use the first non-empty pool deterministically.
  for (const ch of ['rim', 'mid', 'three'] as const) {
    if (kt.pools[ch]?.length) return { pool: kt.pools[ch]!, key: `${kind}/${ch}` };
  }
  return { pool: ['{actor} ends the possession.'], key: `${kind}/fallback` };
}

function selectPool(n: PossessionNarrative, pick: Pick): { pool: string[]; key: string } {
  const playPool = n.calledPlayId ? PLAY_TEMPLATES[n.calledPlayId]?.pools[n.kind] : undefined;
  const coveragePool = n.coverageId && DEFENSIVE_KINDS.has(n.kind)
    ? COVERAGE_TEMPLATES[n.coverageId]?.pools[n.kind] : undefined;
  const hasPlay = !!playPool?.length;
  const hasCoverage = !!coveragePool?.length;
  if (hasPlay && hasCoverage) {
    return pick(2, SALT.POOL_ALTERNATE) === 0
      ? { pool: playPool!, key: `play:${n.calledPlayId}/${n.kind}` }
      : { pool: coveragePool!, key: `coverage:${n.coverageId}/${n.kind}` };
  }
  if (hasPlay) return { pool: playPool!, key: `play:${n.calledPlayId}/${n.kind}` };
  if (hasCoverage) return { pool: coveragePool!, key: `coverage:${n.coverageId}/${n.kind}` };
  return kindPool(n.kind, n.channel);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function renderPossession(event: PossessionEvent, ctx: RenderContext, pick: Pick, state: RenderState): string {
  const n = event.narrative;
  if (!n) return event.narrativeText ?? '';

  const values: Values = {
    actor: ctx.actor,
    assist: ctx.assist,
    defender: ctx.defender,
    play: ctx.play,
    coverage: ctx.coverage,
    team: ctx.team,
    rebounder: ctx.rebounder,
    ftLine: ftLine(n.ftMade ?? 0, n.ftAttempted ?? 0),
  };

  const { pool, key } = selectPool(n, pick);
  const body = choose(pool, key, n.kind, values, pick, SALT.BODY, state);

  const winPrefix = n.isPossessionWin
    ? fill(POSSESSION_WIN_PREFIXES[pick(POSSESSION_WIN_PREFIXES.length, SALT.POSSESSION_WIN)], values) : '';
  const chancePrefix = n.isSecondChance
    ? fill(SECOND_CHANCE_PREFIXES[pick(SECOND_CHANCE_PREFIXES.length, SALT.SECOND_CHANCE)], values) : '';

  let assist = '';
  const suffixes = KIND_TEMPLATES[n.kind].assistSuffixes;
  if (n.assistId && ctx.assist && ASSIST_KINDS.has(n.kind) && suffixes?.length) {
    assist = fill(suffixes[pick(suffixes.length, SALT.ASSIST)], values);
  }

  let steer = '';
  if (n.steeredTo && STEER_KINDS.has(n.kind)) {
    const tags = STEER_TAGS[n.steeredTo];
    if (tags?.length) steer = tags[pick(tags.length, SALT.STEER)];
  }

  // Trim ladder: each step drops one more optional part until the line fits.
  const assemble = (withChance: boolean, withWin: boolean, withAssist: boolean, withSteer: boolean): string => {
    let line = body;
    if (withSteer && steer) {
      line = (line.endsWith('.') ? line.slice(0, -1) : line) + ` — ${steer}.`;
    }
    if (withAssist && assist) line += assist;
    const prefixes = [withWin ? winPrefix : '', withChance ? chancePrefix : ''].filter(Boolean);
    if (prefixes.length) line = `${prefixes.join(' ')} ${line}`;
    return line;
  };

  const ladder: Array<[boolean, boolean, boolean, boolean]> = [
    [true, true, true, true], [true, true, true, false], [true, true, false, false],
    [true, false, false, false], [false, false, false, false],
  ];
  for (const [c, w, a, s] of ladder) {
    const line = tidy(assemble(c, w, a, s));
    if (line.length < MAX_LINE_CHARS) return line;
  }
  return tidy(assemble(false, false, false, false));
}

/** A name ending in a period ("Wendell Carter Jr.") must not produce "Jr.." before a break. */
function tidy(line: string): string {
  return line.replace(/\.\.(?=\s|$)/g, '.');
}

export function renderTheater(theater: GameTheater): string[] {
  const names = new Map<string, string>();
  for (const team of [theater.homeTeam, theater.awayTeam]) {
    for (const p of team?.players ?? []) names.set(p.id, p.player.name);
  }
  const nameOf = (id: string | undefined): string | undefined => (id ? (names.get(id) ?? id) : undefined);
  const state = createRenderState();
  const seed = theater.seed ?? 0;

  return theater.possessions.map((event, i) => {
    const n = event.narrative;
    if (!n) return event.narrativeText ?? '';
    const offense = event.team === 'home' ? theater.homeTeam : theater.awayTeam;
    const called = event.calledPlays ?? [];
    const playName = called.find(c => c.side === 'offense' && c.playId === n.calledPlayId)?.name
      ?? (n.calledPlayId ? PLAYBOOK[n.calledPlayId]?.name : undefined);
    const coverageName = called.find(c => c.side === 'defense' && c.playId === n.coverageId)?.name
      ?? (n.coverageId ? PLAYBOOK[n.coverageId]?.name : undefined);
    const rebounders = event.offensiveRebounders ?? [];
    const ctx: RenderContext = {
      actor: nameOf(n.actorId) ?? FALLBACKS.actor,
      assist: nameOf(n.assistId),
      defender: nameOf(n.defenderId),
      play: playName,
      coverage: coverageName,
      team: offense?.name ?? FALLBACKS.team,
      rebounder: rebounders.length ? nameOf(rebounders[rebounders.length - 1]) : undefined,
    };
    return renderPossession(event, ctx, createPick(seed, event.index ?? i), state);
  });
}
