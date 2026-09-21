/**
 * `applyBuilderAction` — the reducer half of D8 (plan render_and_engine_perf, T9).
 *
 * Pure, no React: every test calls the engine transition directly with a hand-built
 * `BuilderState` (or one seeded from a real drafted pool for the property test) and
 * checks the returned `{ state, error }`. Refusals must return the SAME `state`
 * reference — `useRosterBuilder` relies on that for React's built-in bail-out.
 */
import { describe, it, expect } from 'vitest';
import {
  applyBuilderAction,
  initBuilderState,
  type BuilderAction,
  type BuilderState,
} from '@/engine/deckbuilder';
import { PLAYBOOK, getPlaybookId } from '@/engine/playbook';
import { createRng, type Rng } from '@/engine/rng';
import type { DepthColumn } from '@/engine/positions';
import type { Play, PlayerCardData } from '@/engine/types';
import { loadPlayers, runHeadlessDraft } from './helpers';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function fixturePlayer(id: string, position = 'PG', traits: { name: string; level: number }[] = []): PlayerCardData {
  return {
    type: 'Player',
    id,
    rarity: 'Common',
    player: { id, name: id, position, height: '', weight: 0, age: 0, team: '' },
    stats: {},
    awards: [],
    ratings: {},
    traits,
  } as unknown as PlayerCardData;
}

function fixturePlay(id: string, playId: string, category: Play['playCategory'] = 'system'): Play {
  return {
    type: 'Play',
    id,
    playId,
    name: id,
    rarity: 'Uncommon',
    playCategory: category,
    mechanicText: '',
    badges: [],
  } as Play;
}

const byId = (a: PlayerCardData, b: PlayerCardData) => a.id.localeCompare(b.id);
const opts = { sortRosterPlayers: byId };

function emptyState(): BuilderState {
  return {
    depthChart: { PG: [], SG: [], SF: [], PF: [], C: [] },
    rosterPlayers: [],
    activePlays: [null, null, null],
    rosterPlays: [],
    playAssignments: {},
  };
}

/** 'play-std-1' (High Pick & Roll): handler = Floor General 1+, roller = Finisher 1+. */
const HPR_PLAY_ID = 'play-std-1';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ── place ────────────────────────────────────────────────────────────────────

describe('place', () => {
  it('moves a roster player onto the chart', () => {
    const state = deepFreeze({ ...emptyState(), rosterPlayers: [fixturePlayer('p1', 'PG')] });
    const result = applyBuilderAction(state, { type: 'place', playerId: 'p1', column: 'PG' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.depthChart.PG.map(p => p.id)).toEqual(['p1']);
    expect(result.state.rosterPlayers).toEqual([]);
  });

  it('refuses a player not on the roster (not-found), same state reference', () => {
    const state = deepFreeze(emptyState());
    const result = applyBuilderAction(state, { type: 'place', playerId: 'ghost', column: 'PG' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
    expect(result.state).toBe(state);
  });

  it('refuses a position ineligible for the column (PG at C)', () => {
    const state = deepFreeze({ ...emptyState(), rosterPlayers: [fixturePlayer('p1', 'PG')] });
    const result = applyBuilderAction(state, { type: 'place', playerId: 'p1', column: 'C' }, opts);
    expect(result).toEqual({ state, error: 'ineligible' });
  });

  it('refuses a slotIndex that is not the column\'s next open slot (occupied)', () => {
    const state = deepFreeze({
      ...emptyState(),
      depthChart: { PG: [fixturePlayer('starter', 'PG')], SG: [], SF: [], PF: [], C: [] },
      rosterPlayers: [fixturePlayer('p1', 'PG')],
    });
    const result = applyBuilderAction(state, { type: 'place', playerId: 'p1', column: 'PG', slotIndex: 0 }, opts);
    expect(result).toEqual({ state, error: 'occupied' });
  });
});

// ── move ─────────────────────────────────────────────────────────────────────

describe('move', () => {
  it('moves a chart player to another column', () => {
    const state = deepFreeze({
      ...emptyState(),
      depthChart: { PG: [fixturePlayer('p1', 'PG')], SG: [], SF: [], PF: [], C: [] },
    });
    const result = applyBuilderAction(state, { type: 'move', playerId: 'p1', column: 'SG' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.depthChart.PG).toEqual([]);
    expect(result.state.depthChart.SG.map(p => p.id)).toEqual(['p1']);
  });

  it('refuses a player not currently on the chart (not-found)', () => {
    const state = deepFreeze(emptyState());
    const result = applyBuilderAction(state, { type: 'move', playerId: 'ghost', column: 'PG' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });

  it('refuses a full destination column', () => {
    const state = deepFreeze({
      ...emptyState(),
      depthChart: {
        PG: [fixturePlayer('p1', 'PG')],
        SG: [fixturePlayer('a', 'SG'), fixturePlayer('b', 'SG'), fixturePlayer('c', 'SG'), fixturePlayer('d', 'SG')],
        SF: [], PF: [], C: [],
      },
    });
    const result = applyBuilderAction(state, { type: 'move', playerId: 'p1', column: 'SG' }, opts);
    expect(result).toEqual({ state, error: 'full' });
  });

  it('refuses an ineligible destination column', () => {
    const state = deepFreeze({
      ...emptyState(),
      depthChart: { PG: [fixturePlayer('p1', 'PG')], SG: [], SF: [], PF: [], C: [] },
    });
    const result = applyBuilderAction(state, { type: 'move', playerId: 'p1', column: 'C' }, opts);
    expect(result).toEqual({ state, error: 'ineligible' });
  });
});

// ── sendToRoster ─────────────────────────────────────────────────────────────

describe('sendToRoster', () => {
  it('sends a chart player back to the roster, sorted', () => {
    const state = deepFreeze({
      ...emptyState(),
      depthChart: { PG: [fixturePlayer('b', 'PG')], SG: [], SF: [], PF: [], C: [] },
      rosterPlayers: [fixturePlayer('a', 'PG')],
    });
    const result = applyBuilderAction(state, { type: 'sendToRoster', playerId: 'b' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.depthChart.PG).toEqual([]);
    expect(result.state.rosterPlayers.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('clears every role the player held (invariant 3)', () => {
    const chartPlayer = fixturePlayer('handler', 'PG', [{ name: 'Floor General', level: 1 }]);
    const state = deepFreeze({
      ...emptyState(),
      depthChart: { PG: [chartPlayer], SG: [], SF: [], PF: [], C: [] },
      activePlays: [fixturePlay('hpr', HPR_PLAY_ID), null, null],
      playAssignments: { hpr: { cardId: 'hpr', playId: HPR_PLAY_ID, roles: { handler: 'handler' } } },
    });
    const result = applyBuilderAction(state, { type: 'sendToRoster', playerId: 'handler' }, opts);
    expect(result.state.playAssignments.hpr.roles).toEqual({});
  });

  it('refuses a player not on the chart (not-found)', () => {
    const state = deepFreeze(emptyState());
    const result = applyBuilderAction(state, { type: 'sendToRoster', playerId: 'ghost' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });
});

// ── activatePlay ─────────────────────────────────────────────────────────────

describe('activatePlay', () => {
  it('activates a bench play into the first open slot and gives it an assignment', () => {
    const p = fixturePlay('bench1', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), rosterPlays: [p] });
    const result = applyBuilderAction(state, { type: 'activatePlay', play: p }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.activePlays[0]?.id).toBe('bench1');
    expect(result.state.rosterPlays).toEqual([]);
    expect(result.state.playAssignments.bench1).toEqual({ cardId: 'bench1', playId: HPR_PLAY_ID, roles: {} });
  });

  it('activates a freshly minted basic play not tracked anywhere yet', () => {
    const basic = fixturePlay('basic-offense-123', 'basic-offense', 'basic');
    const state = deepFreeze(emptyState());
    const result = applyBuilderAction(state, { type: 'activatePlay', play: basic }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.activePlays[0]?.id).toBe('basic-offense-123');
  });

  it('refuses when every slot is full', () => {
    const full = [fixturePlay('a', HPR_PLAY_ID), fixturePlay('b', HPR_PLAY_ID), fixturePlay('c', HPR_PLAY_ID)];
    const incoming = fixturePlay('d', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: full, rosterPlays: [incoming] });
    const result = applyBuilderAction(state, { type: 'activatePlay', play: incoming }, opts);
    expect(result).toEqual({ state, error: 'full' });
  });

  it('refuses a play already active (duplicate)', () => {
    const p = fixturePlay('dup', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [p, null, null] });
    const result = applyBuilderAction(state, { type: 'activatePlay', play: p }, opts);
    expect(result).toEqual({ state, error: 'duplicate' });
  });

  describe('with a slotIndex (a basic play dragged onto a specific slot)', () => {
    const basic = fixturePlay('basic-offense-1', 'basic-offense', 'basic');

    it('lands in that slot, not the first open one', () => {
      const state = deepFreeze(emptyState());
      const result = applyBuilderAction(state, { type: 'activatePlay', play: basic, slotIndex: 2 }, opts);
      expect(result.error).toBeUndefined();
      expect(result.state.activePlays.map(p => p?.id ?? null)).toEqual([null, null, 'basic-offense-1']);
      expect(result.state.playAssignments['basic-offense-1']).toBeDefined();
    });

    it('displaces a drafted play back to the bench and drops its assignment', () => {
      const drafted = fixturePlay('drafted1', HPR_PLAY_ID);
      const state = deepFreeze({
        ...emptyState(),
        activePlays: [null, drafted, null],
        playAssignments: { drafted1: { cardId: 'drafted1', playId: HPR_PLAY_ID, roles: {} } },
      });
      const result = applyBuilderAction(state, { type: 'activatePlay', play: basic, slotIndex: 1 }, opts);
      expect(result.error).toBeUndefined();
      expect(result.state.activePlays[1]?.id).toBe('basic-offense-1');
      expect(result.state.rosterPlays.map(p => p.id)).toEqual(['drafted1']);
      expect(result.state.playAssignments.drafted1).toBeUndefined();
    });

    it('a displaced basic play vanishes instead of joining the bench', () => {
      const old = fixturePlay('basic-defense-9', 'basic-defense', 'basic');
      const state = deepFreeze({ ...emptyState(), activePlays: [old, null, null] });
      const result = applyBuilderAction(state, { type: 'activatePlay', play: basic, slotIndex: 0 }, opts);
      expect(result.state.activePlays[0]?.id).toBe('basic-offense-1');
      expect(result.state.rosterPlays).toEqual([]);
      expect(result.state.playAssignments['basic-defense-9']).toBeUndefined();
    });

    it('works on a full board, where the slotless form refuses', () => {
      const full = [fixturePlay('a', HPR_PLAY_ID), fixturePlay('b', HPR_PLAY_ID), fixturePlay('c', HPR_PLAY_ID)];
      const state = deepFreeze({ ...emptyState(), activePlays: full });
      const result = applyBuilderAction(state, { type: 'activatePlay', play: basic, slotIndex: 1 }, opts);
      expect(result.state.activePlays.map(p => p?.id)).toEqual(['a', 'basic-offense-1', 'c']);
      expect(result.state.rosterPlays.map(p => p.id)).toEqual(['b']);
    });

    it('never leaves one play in two slots', () => {
      const p = fixturePlay('mover', HPR_PLAY_ID);
      const state = deepFreeze({ ...emptyState(), activePlays: [p, null, null] });
      const result = applyBuilderAction(state, { type: 'activatePlay', play: p, slotIndex: 2 }, opts);
      expect(result.state.activePlays.map(x => x?.id ?? null)).toEqual([null, null, 'mover']);
    });

    it('dropped on its own slot is a no-op with the same state reference', () => {
      const p = fixturePlay('same', HPR_PLAY_ID);
      const state = deepFreeze({ ...emptyState(), activePlays: [p, null, null] });
      expect(applyBuilderAction(state, { type: 'activatePlay', play: p, slotIndex: 0 }, opts).state).toBe(state);
    });

    it('refuses an out-of-range slot with the same state reference', () => {
      const state = deepFreeze(emptyState());
      for (const slotIndex of [-1, 3, 99]) {
        const result = applyBuilderAction(state, { type: 'activatePlay', play: basic, slotIndex }, opts);
        expect(result.error).toBe('not-found');
        expect(result.state).toBe(state);
      }
    });
  });
});

// ── swapPlay ─────────────────────────────────────────────────────────────────

describe('swapPlay', () => {
  it('swaps a bench play into an occupied slot; the displaced play returns to the bench', () => {
    const active = fixturePlay('active1', HPR_PLAY_ID);
    const bench = fixturePlay('bench1', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [active, null, null], rosterPlays: [bench] });
    const result = applyBuilderAction(state, { type: 'swapPlay', slotIndex: 0, playId: 'bench1' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.activePlays[0]?.id).toBe('bench1');
    expect(result.state.rosterPlays.map(p => p.id)).toEqual(['active1']);
    // Invariant 2: the displaced play's assignment is gone, the incoming one has one.
    expect(result.state.playAssignments.active1).toBeUndefined();
    expect(result.state.playAssignments.bench1).toBeDefined();
  });

  it('drops a displaced BASIC play instead of returning it to the bench', () => {
    const basic = fixturePlay('basic-offense-1', 'basic-offense', 'basic');
    const bench = fixturePlay('bench1', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [basic, null, null], rosterPlays: [bench] });
    const result = applyBuilderAction(state, { type: 'swapPlay', slotIndex: 0, playId: 'bench1' }, opts);
    expect(result.state.rosterPlays).toEqual([]);
  });

  it('reorders by dragging one active play onto another slot (source is active, not bench)', () => {
    const a = fixturePlay('a', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [a, null, null] });
    const result = applyBuilderAction(state, { type: 'swapPlay', slotIndex: 1, playId: 'a' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.activePlays.map(p => p?.id ?? null)).toEqual([null, 'a', null]);
  });

  it('refuses an unknown play id (not-found)', () => {
    const state = deepFreeze(emptyState());
    const result = applyBuilderAction(state, { type: 'swapPlay', slotIndex: 0, playId: 'ghost' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });
});

// ── removePlay ───────────────────────────────────────────────────────────────

describe('removePlay', () => {
  it('empties a slot; a drafted play returns to the roster', () => {
    const p = fixturePlay('p', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [p, null, null] });
    const result = applyBuilderAction(state, { type: 'removePlay', slotIndex: 0 }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.activePlays[0]).toBeNull();
    expect(result.state.rosterPlays.map(p2 => p2.id)).toEqual(['p']);
    expect(result.state.playAssignments.p).toBeUndefined();
  });

  it('a basic play vanishes instead of returning to the roster', () => {
    const basic = fixturePlay('basic-defense-1', 'basic-defense', 'basic');
    const state = deepFreeze({ ...emptyState(), activePlays: [basic, null, null] });
    const result = applyBuilderAction(state, { type: 'removePlay', slotIndex: 0 }, opts);
    expect(result.state.rosterPlays).toEqual([]);
  });

  it('refuses an already-empty slot (not-found)', () => {
    const state = deepFreeze(emptyState());
    const result = applyBuilderAction(state, { type: 'removePlay', slotIndex: 0 }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });
});

// ── assignRole / clearRole ───────────────────────────────────────────────────

describe('assignRole', () => {
  const eligiblePlayer = fixturePlayer('handler', 'PG', [{ name: 'Floor General', level: 1 }]);
  const ineligiblePlayer = fixturePlayer('scrub', 'PG', []);
  const activePlay = fixturePlay('hpr', HPR_PLAY_ID);

  function stateWith(player: PlayerCardData) {
    return deepFreeze({
      ...emptyState(),
      depthChart: { PG: [player], SG: [], SF: [], PF: [], C: [] },
      activePlays: [activePlay, null, null],
      playAssignments: { hpr: { cardId: 'hpr', playId: HPR_PLAY_ID, roles: {} } },
    });
  }

  it('assigns an eligible depth-chart player to a role', () => {
    const state = stateWith(eligiblePlayer);
    const result = applyBuilderAction(state, { type: 'assignRole', cardId: 'hpr', roleId: 'handler', playerId: 'handler' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.playAssignments.hpr.roles).toEqual({ handler: 'handler' });
  });

  it('refuses a player who does not meet the badge requirement (role-ineligible)', () => {
    const state = stateWith(ineligiblePlayer);
    const result = applyBuilderAction(state, { type: 'assignRole', cardId: 'hpr', roleId: 'handler', playerId: 'scrub' }, opts);
    expect(result).toEqual({ state, error: 'role-ineligible' });
  });

  it('refuses a player already holding a different role in the same play (role-conflict)', () => {
    const player = fixturePlayer('star', 'PG', [{ name: 'Floor General', level: 1 }, { name: 'Finisher', level: 1 }]);
    const state = deepFreeze({
      ...emptyState(),
      depthChart: { PG: [player], SG: [], SF: [], PF: [], C: [] },
      activePlays: [activePlay, null, null],
      playAssignments: { hpr: { cardId: 'hpr', playId: HPR_PLAY_ID, roles: { handler: 'star' } } },
    });
    const result = applyBuilderAction(state, { type: 'assignRole', cardId: 'hpr', roleId: 'roller', playerId: 'star' }, opts);
    expect(result).toEqual({ state, error: 'role-conflict' });
  });

  it('refuses a player not on the depth chart (invariant 3, not-found)', () => {
    const state = stateWith(eligiblePlayer);
    const result = applyBuilderAction(state, { type: 'assignRole', cardId: 'hpr', roleId: 'handler', playerId: 'bench-ghost' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });

  it('refuses an unknown play/role (not-found)', () => {
    const state = stateWith(eligiblePlayer);
    const result = applyBuilderAction(state, { type: 'assignRole', cardId: 'nope', roleId: 'handler', playerId: 'handler' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });
});

describe('clearRole', () => {
  it('clears a filled role', () => {
    const state = deepFreeze({
      ...emptyState(),
      playAssignments: { hpr: { cardId: 'hpr', playId: HPR_PLAY_ID, roles: { handler: 'p1' } } },
    });
    const result = applyBuilderAction(state, { type: 'clearRole', cardId: 'hpr', roleId: 'handler' }, opts);
    expect(result.error).toBeUndefined();
    expect(result.state.playAssignments.hpr.roles).toEqual({});
  });

  it('refuses a role that is not currently set (not-found)', () => {
    const state = deepFreeze({
      ...emptyState(),
      playAssignments: { hpr: { cardId: 'hpr', playId: HPR_PLAY_ID, roles: {} } },
    });
    const result = applyBuilderAction(state, { type: 'clearRole', cardId: 'hpr', roleId: 'handler' }, opts);
    expect(result).toEqual({ state, error: 'not-found' });
  });
});

// ── clear / undo ─────────────────────────────────────────────────────────────

describe('clear', () => {
  it('sends every placed player and drafted play back to the roster; basic plays vanish', () => {
    const basic = fixturePlay('basic-offense-1', 'basic-offense', 'basic');
    const drafted = fixturePlay('drafted1', HPR_PLAY_ID);
    const state = deepFreeze({
      depthChart: { PG: [fixturePlayer('p1', 'PG')], SG: [], SF: [], PF: [], C: [] },
      rosterPlayers: [fixturePlayer('p0', 'PG')],
      activePlays: [basic, drafted, null],
      rosterPlays: [],
      playAssignments: {
        [basic.id]: { cardId: basic.id, playId: 'basic-offense', roles: {} },
        [drafted.id]: { cardId: drafted.id, playId: HPR_PLAY_ID, roles: {} },
      },
    });
    const result = applyBuilderAction(state, { type: 'clear' }, opts);
    expect(result.error).toBeUndefined();
    expect(Object.values(result.state.depthChart).every(col => col.length === 0)).toBe(true);
    expect(result.state.rosterPlayers.map(p => p.id)).toEqual(['p0', 'p1']);
    expect(result.state.activePlays).toEqual([null, null, null]);
    expect(result.state.rosterPlays.map(p => p.id)).toEqual(['drafted1']);
    expect(result.state.playAssignments).toEqual({});
  });

  it('never refuses (always returns without an error)', () => {
    const result = applyBuilderAction(deepFreeze(emptyState()), { type: 'clear' }, opts);
    expect(result.error).toBeUndefined();
  });
});

describe('undo', () => {
  it('restores a snapshot verbatim', () => {
    const snapshot = deepFreeze({ ...emptyState(), rosterPlayers: [fixturePlayer('p1', 'PG')] });
    const current = deepFreeze(emptyState());
    const result = applyBuilderAction(current, { type: 'undo', snapshot }, opts);
    expect(result.state).toBe(snapshot);
  });
});

// ── StrictMode regression (the bug T9 exists to fix) ────────────────────────

describe('StrictMode double-invocation safety', () => {
  it('swapPlay leaves exactly ONE copy of the displaced play on the bench, even called twice on the same frozen input', () => {
    const active = fixturePlay('active1', HPR_PLAY_ID);
    const bench = fixturePlay('bench1', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [active, null, null], rosterPlays: [bench] });
    const action: BuilderAction = { type: 'swapPlay', slotIndex: 0, playId: 'bench1' };

    // The old bug: a `setActivePlays` updater called `setRosterPlays(g => [...g, existing])`
    // from INSIDE itself, and React (under StrictMode) invokes an updater function twice —
    // so two independent invocations against the same starting state each pushed a copy.
    // `applyBuilderAction` is a plain pure function with no such side channel, so two
    // independent calls against the same frozen input must each — independently — produce
    // exactly one copy, not accumulate.
    const first = applyBuilderAction(state, action, opts);
    const second = applyBuilderAction(state, action, opts);
    expect(first.state.rosterPlays.map(p => p.id)).toEqual(['active1']);
    expect(second.state.rosterPlays.map(p => p.id)).toEqual(['active1']);
  });

  it('a drop that displaces a play (swapPlay onto an occupied slot) is safe to apply twice in a row, chained off the previous result', () => {
    const a = fixturePlay('a', HPR_PLAY_ID);
    const b = fixturePlay('b', HPR_PLAY_ID);
    const state = deepFreeze({ ...emptyState(), activePlays: [a, null, null], rosterPlays: [b] });
    const action: BuilderAction = { type: 'swapPlay', slotIndex: 0, playId: 'b' };

    const step1 = applyBuilderAction(state, action, opts);
    // Chaining a second call off the FIRST call's result (not the original frozen input)
    // is a normal, independent transition — `b` is now active, so the second dispatch of
    // the identical action reorders `b` onto itself rather than duplicating anything.
    const step2 = applyBuilderAction(deepFreeze(step1.state), action, opts);
    expect(step2.state.activePlays.filter(p => p?.id === 'b')).toHaveLength(1);
    expect(step2.state.rosterPlays.filter(p => p.id === 'a')).toHaveLength(1);
  });

  it('never mutates the input state object (deep-frozen inputs throw on write attempts, not on read)', () => {
    const state = deepFreeze({
      ...emptyState(),
      rosterPlayers: [fixturePlayer('p1', 'PG')],
      activePlays: [fixturePlay('a', HPR_PLAY_ID), null, null],
      rosterPlays: [fixturePlay('b', HPR_PLAY_ID)],
    });
    // If any transition below tried to `push`/assign into a frozen array or object, this
    // would throw (ES modules run in strict mode) instead of silently corrupting `state`.
    expect(() => applyBuilderAction(state, { type: 'place', playerId: 'p1', column: 'PG' }, opts)).not.toThrow();
    expect(() => applyBuilderAction(state, { type: 'swapPlay', slotIndex: 0, playId: 'b' }, opts)).not.toThrow();
    expect(() => applyBuilderAction(state, { type: 'clear' }, opts)).not.toThrow();
  });
});

// ── Property test: 300 pseudo-random actions from a realistic drafted pool ─

function randomColumn(rng: Rng): DepthColumn {
  const cols: DepthColumn[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  return cols[Math.floor(rng.next() * cols.length)];
}

function pick<T>(rng: Rng, arr: T[]): T | undefined {
  return arr.length === 0 ? undefined : arr[Math.floor(rng.next() * arr.length)];
}

/** One pseudo-random `BuilderAction`, mostly targeting ids the state already knows about
 *  (with an occasional unknown id) so both accepted and refused transitions get exercised. */
function randomAction(rng: Rng, state: BuilderState): BuilderAction {
  const chartPlayers = Object.values(state.depthChart).flat();
  const activePlaysList = state.activePlays.filter((p): p is Play => p !== null);
  const roll = rng.next();

  if (roll < 0.2) {
    const p = pick(rng, state.rosterPlayers);
    return { type: 'place', playerId: p?.id ?? 'ghost', column: randomColumn(rng) };
  }
  if (roll < 0.35) {
    const p = pick(rng, chartPlayers);
    return { type: 'move', playerId: p?.id ?? 'ghost', column: randomColumn(rng) };
  }
  if (roll < 0.45) {
    const p = pick(rng, chartPlayers);
    return { type: 'sendToRoster', playerId: p?.id ?? 'ghost' };
  }
  if (roll < 0.58) {
    const p = pick(rng, state.rosterPlays);
    return { type: 'activatePlay', play: p ?? fixturePlay(`basic-offense-${Math.floor(rng.next() * 1e9)}`, 'basic-offense', 'basic') };
  }
  if (roll < 0.7) {
    const p = pick(rng, [...state.rosterPlays, ...activePlaysList]);
    return { type: 'swapPlay', slotIndex: Math.floor(rng.next() * 3), playId: p?.id ?? 'ghost' };
  }
  if (roll < 0.8) {
    return { type: 'removePlay', slotIndex: Math.floor(rng.next() * 3) };
  }
  if (roll < 0.9) {
    const play = pick(rng, activePlaysList);
    const def = play ? PLAYBOOK[getPlaybookId(play)] : undefined;
    const role = def ? pick(rng, def.roles) : undefined;
    const player = pick(rng, chartPlayers);
    return {
      type: 'assignRole',
      cardId: play?.id ?? 'ghost',
      roleId: role?.id ?? 'ghost',
      playerId: player?.id ?? 'ghost',
    };
  }
  if (roll < 0.97) {
    const cardId = pick(rng, Object.keys(state.playAssignments)) ?? 'ghost';
    const roleId = pick(rng, Object.keys(state.playAssignments[cardId]?.roles ?? {})) ?? 'ghost';
    return { type: 'clearRole', cardId, roleId };
  }
  return { type: 'clear' };
}

function checkInvariants(state: BuilderState, allPlayerIds: Set<string>, allPlayIds: Set<string>) {
  // 1. Conservation: every drafted player is in exactly one place; no unknown player ids.
  const playerCounts = new Map<string, number>();
  for (const p of state.rosterPlayers) playerCounts.set(p.id, (playerCounts.get(p.id) ?? 0) + 1);
  for (const p of Object.values(state.depthChart).flat()) playerCounts.set(p.id, (playerCounts.get(p.id) ?? 0) + 1);
  for (const id of playerCounts.keys()) expect(allPlayerIds.has(id)).toBe(true);
  for (const count of playerCounts.values()) expect(count).toBe(1);

  // Every drafted play is in exactly one place OR active-only (basic plays vanish, so
  // total count across roster+active can be < the full drafted set, but never > 1 each,
  // and every id seen must be either a drafted play or a basic- id this run minted).
  const playCounts = new Map<string, number>();
  for (const p of state.rosterPlays) playCounts.set(p.id, (playCounts.get(p.id) ?? 0) + 1);
  for (const p of state.activePlays) if (p) playCounts.set(p.id, (playCounts.get(p.id) ?? 0) + 1);
  for (const [id, count] of playCounts.entries()) {
    expect(count).toBe(1);
    expect(allPlayIds.has(id) || id.startsWith('basic-')).toBe(true);
  }

  // 2. playAssignments has exactly one entry per active play.
  const activeIds = new Set(state.activePlays.filter((p): p is Play => p !== null).map(p => p.id));
  expect(new Set(Object.keys(state.playAssignments))).toEqual(activeIds);

  // 3. No role points at a player who is not on the depth chart.
  const onChart = new Set(Object.values(state.depthChart).flat().map(p => p.id));
  for (const a of Object.values(state.playAssignments)) {
    for (const pid of Object.values(a.roles)) expect(onChart.has(pid)).toBe(true);
  }

  // 4. rosterPlayers stays sorted by the comparator passed in.
  const sortedIds = [...state.rosterPlayers].sort(byId).map(p => p.id);
  expect(state.rosterPlayers.map(p => p.id)).toEqual(sortedIds);
}

describe('property: 300 pseudo-random actions from a realistic drafted pool', () => {
  it('keeps all four invariants after every step', () => {
    const players = loadPlayers();
    const seats = runHeadlessDraft(players, undefined, 4242);
    const drafted = seats[0].drafted;
    const allPlayerIds = new Set(drafted.filter(c => c.type === 'Player').map(c => c.id));
    const allPlayIds = new Set(drafted.filter(c => c.type === 'Play').map(c => c.id));

    let state: BuilderState = initBuilderState(drafted);
    state = { ...state, rosterPlayers: [...state.rosterPlayers].sort(byId) };
    checkInvariants(state, allPlayerIds, allPlayIds);

    const rng = createRng(20260921);
    for (let i = 0; i < 300; i++) {
      const action = randomAction(rng, state);
      const frozenInput = deepFreeze({
        depthChart: { ...state.depthChart },
        rosterPlayers: [...state.rosterPlayers],
        activePlays: [...state.activePlays],
        rosterPlays: [...state.rosterPlays],
        playAssignments: { ...state.playAssignments },
      });
      const result = applyBuilderAction(frozenInput, action, opts);
      state = result.state;
      checkInvariants(state, allPlayerIds, allPlayIds);
    }
  });
});
