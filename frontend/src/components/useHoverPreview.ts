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
 *
 * Two more clears (D28, plan `ui_draft_deckbuild_pack`): a stationary hover-then-drag
 * used to leave the preview parked over the drop targets, blocking drag-and-drop, since
 * neither of the above requires the cursor to actually move. A `dragstart` anywhere in
 * the document clears it immediately — added at `document` rather than the trigger
 * element because `dragstart` bubbles there regardless of whether the draggable node is
 * the hover trigger itself or an ancestor of it (e.g. a depth-chart slot wrapping its
 * starter card), so every call site is covered without individually wiring it up. And a
 * timer auto-clears it after `HOVER_PREVIEW_AUTO_DISMISS_MS` even with no drag and no
 * movement at all, as a hard ceiling.
 */
export const HOVER_PREVIEW_AUTO_DISMISS_MS = 1500;

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
    const clearOnDragStart = () => setIsHovered(false);
    document.addEventListener('mousemove', checkStillOver);
    document.addEventListener('dragstart', clearOnDragStart);
    const dismissTimer = setTimeout(() => setIsHovered(false), HOVER_PREVIEW_AUTO_DISMISS_MS);
    return () => {
      document.removeEventListener('mousemove', checkStillOver);
      document.removeEventListener('dragstart', clearOnDragStart);
      clearTimeout(dismissTimer);
    };
  }, [isHovered]);

  return { ref, isHovered, onMouseEnter, onMouseLeave };
}
