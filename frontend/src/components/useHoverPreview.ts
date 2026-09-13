'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hover-preview trigger state (D-hover-stuck). `onMouseEnter`/`onMouseLeave` alone are
 * enough in the common case, but they desync badly here: cards get inserted into a
 * scrolling draft/roster list right where the mouse already is (confirming a pick adds
 * a row under a stationary cursor), and the browser doesn't reliably fire enter/leave
 * for an element appearing/disappearing under a pointer that isn't actually moving —
 * "enter" sometimes fires from the DOM mutation itself, "leave" never does, since
 * nothing ever un-hovers it. The result: a growing pile of cards permanently stuck
 * `isHovered = true`, each with its own portalled preview, all stacking on screen as
 * more picks are made.
 *
 * The fix is a safety net, not a replacement: once hovered, every real `mousemove`
 * re-checks the trigger's current bounding box against the cursor and clears the state
 * the moment they no longer overlap — so a desynced hover can never survive past the
 * next actual mouse movement, regardless of what caused the desync.
 */
export function useHoverPreview<T extends HTMLElement>() {
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<T>(null);

  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);

  useEffect(() => {
    if (!isHovered) return;
    const checkStillOver = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) { setIsHovered(false); return; }
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) setIsHovered(false);
    };
    document.addEventListener('mousemove', checkStillOver);
    return () => document.removeEventListener('mousemove', checkStillOver);
  }, [isHovered]);

  return { ref, isHovered, onMouseEnter, onMouseLeave };
}
