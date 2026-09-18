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
 * Mechanics: on mount we push one extra history entry (the "guard entry") so the first
 * back press is interceptable via `popstate` rather than actually navigating. Each time
 * the guard fires we immediately re-push the same entry, so the stack never grows no
 * matter how many times it's cancelled — `goBack()` always needs exactly `history.go(-2)`
 * to undo the guard entry and the real navigation it intercepted.
 */
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

    window.history.pushState({ backGuard: true }, '');
    armedRef.current = true;

    const onPopState = () => {
      if (!armedRef.current) return;
      window.history.pushState({ backGuard: true }, '');
      onBackAttemptRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      armedRef.current = false;
    };
  }, [enabled]);

  /** Actually leave: disarms the guard and undoes both the guard entry and the
   *  real back navigation it intercepted, landing wherever plain back would have. */
  const goBack = useCallback(() => {
    armedRef.current = false;
    window.history.go(-2);
  }, []);

  return { goBack };
}
