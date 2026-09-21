/**
 * Click-to-assign helpers (plan deckbuilder_ux, D3/T2).
 *
 * `assignPlayToFirstOpenSlot` and `placePlayerInSlot` are the pure rule
 * functions `DeckBuilder`'s click handlers share with its drag handlers, so
 * click and drag can never disagree. Both are plain data in, data out —
 * covered here without any React/DOM.
 */
import { describe, it, expect } from 'vitest';
import {
  assignPlayToFirstOpenSlot,
  initBuilderState,
  placePlayerInSlot,
  type PlaySlotsState,
  type DepthChartState,
} from '@/engine/deckbuilder';
import type { DraftCard } from '@/engine/types';

describe('assignPlayToFirstOpenSlot', () => {
  const baseState = (): PlaySlotsState => ({
    activeSlots: [null, null, null],
    playsById: {
      offA: { id: 'offA', side: 'offense' },
      offB: { id: 'offB', side: 'offense' },
      defA: { id: 'defA', side: 'defense' },
    },
  });

  it('places a legal play into the first open slot', () => {
    const result = assignPlayToFirstOpenSlot(baseState(), 'offA');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotIndex).toBe(0);
    expect(result.next.activeSlots).toEqual(['offA', null, null]);
  });

  it('fills the first empty slot, skipping already-filled ones', () => {
    const state: PlaySlotsState = { ...baseState(), activeSlots: ['offA', null, null] };
    const result = assignPlayToFirstOpenSlot(state, 'defA');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotIndex).toBe(1);
    expect(result.next.activeSlots).toEqual(['offA', 'defA', null]);
  });

  it('refuses when every slot is full', () => {
    const state: PlaySlotsState = {
      ...baseState(),
      activeSlots: ['offA', 'offB', 'defA'],
      playsById: { ...baseState().playsById, defB: { id: 'defB', side: 'defense' } },
    };
    const result = assignPlayToFirstOpenSlot(state, 'defB');
    expect(result).toEqual({ ok: false, reason: 'full' });
  });

  it('refuses a play already active (duplicate)', () => {
    const state: PlaySlotsState = { ...baseState(), activeSlots: ['offA', null, null] };
    const result = assignPlayToFirstOpenSlot(state, 'offA');
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('refuses an unknown play id', () => {
    const result = assignPlayToFirstOpenSlot(baseState(), 'nope');
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses a play with no open slot for its side, when slots are zoned', () => {
    // The live builder has no zoned slots (slotSides is always omitted), but the
    // helper supports it for a future layout — exercised here directly.
    const state: PlaySlotsState = {
      ...baseState(),
      activeSlots: ['offA', 'offB', null],
      slotSides: ['offense', 'offense', 'defense'],
    };
    const result = assignPlayToFirstOpenSlot(state, 'offA');
    // offA already active -> duplicate takes precedence over wrong-side.
    expect(result).toEqual({ ok: false, reason: 'duplicate' });

    const result2 = assignPlayToFirstOpenSlot(
      { ...state, playsById: { ...state.playsById, offC: { id: 'offC', side: 'offense' } } },
      'offC',
    );
    // Only the defense-zoned slot is empty; offC is offense -> no eligible slot.
    expect(result2).toEqual({ ok: false, reason: 'wrong-side' });
  });
});

describe('placePlayerInSlot', () => {
  const baseState = (): DepthChartState => ({
    chart: { PG: ['pg0'], SG: [], SF: [], PF: [], C: [] },
    benchIds: ['pg1', 'sg0', 'weird0'],
    positionsById: { pg1: 'PG', sg0: 'SG', weird0: 'ZZZ' },
  });

  it('places a legal bench player into the column\'s next open slot', () => {
    const result = placePlayerInSlot(baseState(), 'sg0', 'SG', 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.chart.SG).toEqual(['sg0']);
    expect(result.next.benchIds).toEqual(['pg1', 'weird0']);
  });

  it('appends behind an existing starter at the correct next-open index', () => {
    const result = placePlayerInSlot(baseState(), 'pg1', 'PG', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.chart.PG).toEqual(['pg0', 'pg1']);
  });

  it('refuses a player ineligible for the column', () => {
    // sg0 is an SG, not eligible (nor adjacent) for C.
    const result = placePlayerInSlot(baseState(), 'sg0', 'C', 0);
    expect(result).toEqual({ ok: false, reason: 'ineligible' });
  });

  it('refuses a slotIndex that is not the column\'s next open slot (occupied)', () => {
    // PG already has one occupant (index 0); index 0 is not the next open slot.
    const result = placePlayerInSlot(baseState(), 'pg1', 'PG', 0);
    expect(result).toEqual({ ok: false, reason: 'occupied' });
  });

  it('refuses a player not on the bench', () => {
    const result = placePlayerInSlot(baseState(), 'ghost', 'SG', 0);
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('initBuilderState', () => {
  const player = (id: string) => ({ type: 'Player', id, rarity: 'Common', player: { name: id, position: 'PG' } }) as unknown as DraftCard;
  const play = (id: string) => ({ type: 'Play', id, name: id, rarity: 'Common', playCategory: 'special' }) as unknown as DraftCard;
  const drafted = [player('a'), player('b'), player('c'), play('p1'), play('p2')];

  it('starts a fresh draft empty: no auto-fill, everything in the Roster list', () => {
    const state = initBuilderState(drafted);
    expect(Object.values(state.depthChart).flat()).toEqual([]);
    expect(state.rosterPlayers.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(state.activePlays).toEqual([null, null, null]);
    expect(state.rosterPlays.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(state.playAssignments).toEqual({});
  });

  it('restores a saved roster WITH its role assignments (regression: they were wiped on open)', () => {
    const saved = { cardId: 'p2', playId: 'pick_and_roll', roles: { handler: 'a', screener: 'b' } };
    const state = initBuilderState(drafted, {
      depthOrder: { PG: ['b', 'a'], C: ['gone'] },
      playsOrder: ['p2'],
      playAssignments: [saved],
    });
    expect(state.depthChart.PG.map(p => p.id)).toEqual(['b', 'a']);
    expect(state.depthChart.C).toEqual([]);
    expect(state.rosterPlayers.map(p => p.id)).toEqual(['c']);
    expect(state.activePlays.map(p => p?.id ?? null)).toEqual(['p2', null, null]);
    expect(state.rosterPlays.map(p => p.id)).toEqual(['p1']);
    expect(state.playAssignments).toEqual({ p2: saved });
  });

  it('gives an active play without a saved assignment empty roles, and drops one for a benched play', () => {
    const state = initBuilderState(drafted, {
      playsOrder: ['p1'],
      playAssignments: [{ cardId: 'p2', playId: 'x', roles: { r: 'a' } }],
    });
    expect(Object.keys(state.playAssignments)).toEqual(['p1']);
    expect(state.playAssignments.p1.roles).toEqual({});
  });
});
