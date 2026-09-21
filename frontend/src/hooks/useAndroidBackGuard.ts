'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * plan_mobile_native_feel D3: makes the hardware/gesture back button trigger an in-app
 * callback instead of silently navigating away, on gameplay screens where an unguarded
 * back press would drop in-progress state nothing currently persists (a mid-draft pick
 * order, an incomplete depth chart, a fresh unfinished game). The callback decides what
 * to show — either a screen's own existing leave-confirmation (SeasonView already has
 * one for a live game) or the generic `BackGuardSheet`.
 *
 * Mechanics: while armed there is exactly ONE extra history entry (the "guard entry") on
 * top of the real one, so the first back press is interceptable via `popstate` rather than
 * actually navigating. Each time the guard fires we immediately re-push it.
 *
 * plan mobile_load D10 — "exactly one" is the whole point. The first version pushed an
 * entry on every mount and never reused or removed one, so entries piled up: React
 * StrictMode's double mount (dev), the draft room handing over to the deck builder's own
 * guard (production), a page reload, and every game opened in a season each left one
 * behind. `goBack()` always went back two, landed on a leftover guard entry with the same
 * URL, and "Leave" visibly did nothing; at the season hub each leftover was a dead back
 * press. Three rules fix that:
 *   1. Arming REUSES a guard entry that is already current instead of pushing another.
 *   2. Disarming while still on the page (a season game closing) removes the entry.
 *   3. Leaving goes back over the guard entry only if one is actually current.
 */

const GUARD_KEY = 'backGuard';

/** True between a programmatic `history.back()` of ours and its `popstate`, so an armed
 *  guard does not mistake it for the user pressing back. */
let ignoreNextPop = false;
/** Rule 2 is deferred by a tick: under StrictMode (and in the draft room -> deck builder
 *  hand-off) a disarm is immediately followed by a re-arm, which cancels it and reuses
 *  the entry instead. Module-level because the two are different hook instances. */
let pendingRemoval: ReturnType<typeof setTimeout> | null = null;

function onGuardEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[GUARD_KEY] === true;
}

function cancelPendingRemoval(): void {
  if (pendingRemoval) clearTimeout(pendingRemoval);
  pendingRemoval = null;
}

/** Steps back over the guard entry if one is current, then runs `then`. */
function removeGuardEntry(then?: () => void): void {
  if (!onGuardEntry()) {
    then?.();
    return;
  }
  ignoreNextPop = true;
  const done = () => {
    window.removeEventListener('popstate', done);
    ignoreNextPop = false;
    then?.();
  };
  window.addEventListener('popstate', done);
  window.history.back();
}

export function useAndroidBackGuard({
  enabled,
  onBackAttempt,
}: {
  enabled: boolean;
  onBackAttempt: () => void;
}) {
  const armedRef = useRef(false);
  const onBackAttemptRef = useRef(onBackAttempt);
  useEffect(() => {
    onBackAttemptRef.current = onBackAttempt;
  }, [onBackAttempt]);

  useEffect(() => {
    if (!enabled) return;

    cancelPendingRemoval();
    if (!onGuardEntry()) window.history.pushState({ [GUARD_KEY]: true }, '');
    armedRef.current = true;

    const onPopState = () => {
      if (ignoreNextPop || !armedRef.current) return;
      window.history.pushState({ [GUARD_KEY]: true }, '');
      onBackAttemptRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      armedRef.current = false;
      // Still on this page with the guard entry on top (the guarded thing closed, nothing
      // navigated): remove it, or the next back press does nothing. After a real
      // navigation the current entry is the new page's, and this is a no-op.
      cancelPendingRemoval();
      pendingRemoval = setTimeout(() => {
        pendingRemoval = null;
        removeGuardEntry();
      }, 0);
    };
  }, [enabled]);

  /** "Leave": land wherever a plain back press would have. */
  const goBack = useCallback(() => {
    armedRef.current = false;
    cancelPendingRemoval();
    window.history.go(onGuardEntry() ? -2 : -1);
  }, []);

  /**
   * Leave FORWARD (after a save): drops the guard entry, then runs `navigate`, which
   * should be a `router.replace(...)`. The guarded page's own entry is replaced rather
   * than kept under the destination — otherwise back from the rosters list walked into
   * the draft room again and silently started a new draft.
   */
  const exitTo = useCallback((navigate: () => void) => {
    armedRef.current = false;
    cancelPendingRemoval();
    removeGuardEntry(navigate);
  }, []);

  return { goBack, exitTo };
}
