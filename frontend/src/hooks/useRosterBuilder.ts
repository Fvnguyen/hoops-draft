'use client';

import { useCallback, useReducer, useRef } from 'react';
import {
  applyBuilderAction,
  initBuilderState,
  type BuilderAction,
  type BuilderActionError,
  type BuilderState,
} from '@/engine/deckbuilder';
import type { DraftCard, PlayerCardData } from '@/engine/types';
import type { PlayAssignment } from '@/engine/playbook';

export interface UseRosterBuilderInit {
  draftedCards: DraftCard[];
  depthOrder?: Record<string, string[]>;
  playsOrder?: string[];
  playAssignments?: PlayAssignment[];
  /** Display sort for the bench Players list (invariant 4 in `engine/deckbuilder.ts`) — a
   *  display concern the engine doesn't own, so the caller supplies it. `DeckBuilder.tsx`
   *  always passes the same module-level function, so a plain closure (recreated fresh
   *  every render, same as any other hook argument) is all this needs — no ref. */
  sortRosterPlayers: (a: PlayerCardData, b: PlayerCardData) => number;
}

export interface UseRosterBuilderResult {
  state: BuilderState;
  /**
   * Apply one `BuilderAction`. Returns the refusal reason synchronously (or `undefined` on
   * success) so a handler can toast it immediately — a plain `useReducer` dispatch returns
   * `void`, because React queues the action and doesn't run the reducer until it processes
   * the update, by which point the call site has already returned. Instead this computes
   * the transition itself, up front, via the same pure `applyBuilderAction` the reducer
   * below also runs, against a ref that always holds the latest state THIS hook committed
   * (updated only here, never read or written during render — React's `useReducer`
   * reducer/initializer functions run during render, where a ref access is a lint error;
   * this callback runs later, from an event handler), then hands the same action to
   * `dispatchState` so React's own tracked state stays canonical, and returns the error.
   */
  dispatch: (action: BuilderAction) => BuilderActionError | undefined;
}

/**
 * `useReducer` over the pure `applyBuilderAction` transition (plan render_and_engine_perf,
 * D8 reducer half / T9). Owns the five slices that used to be five separate `useState`s in
 * `DeckBuilder.tsx`, changed by ~15 handlers — two of which called `setRosterPlays(...)`
 * from inside `setActivePlays`'s updater, which under React StrictMode runs that updater
 * twice and so appended a displaced play to the bench twice. Routing every mutation through
 * one pure function (called once per dispatch, not from inside another setter) removes that
 * class of bug structurally.
 */
export function useRosterBuilder({
  draftedCards,
  depthOrder,
  playsOrder,
  playAssignments,
  sortRosterPlayers,
}: UseRosterBuilderInit): UseRosterBuilderResult {
  const [state, dispatchState] = useReducer(
    (s: BuilderState, action: BuilderAction) => applyBuilderAction(s, action, { sortRosterPlayers }).state,
    undefined,
    (): BuilderState => {
      const seeded = initBuilderState(draftedCards, { depthOrder, playsOrder, playAssignments });
      return { ...seeded, rosterPlayers: [...seeded.rosterPlayers].sort(sortRosterPlayers) };
    },
  );

  // Written only inside `dispatch` below (an event-handler-context callback, not render),
  // seeded once from the initial `state`. `dispatchState` is the only thing that ever
  // changes `state`, and only `dispatch` ever calls it, so this and `state` never diverge.
  const stateRef = useRef(state);

  const dispatch = useCallback((action: BuilderAction): BuilderActionError | undefined => {
    const result = applyBuilderAction(stateRef.current, action, { sortRosterPlayers });
    stateRef.current = result.state;
    dispatchState(action);
    return result.error;
  }, [sortRosterPlayers]);

  return { state, dispatch };
}
