import { useSyncExternalStore } from 'react';

/**
 * mobile_load T8/D8: `PlayerCard`'s back face used to mount unconditionally inside the
 * `preserve-3d` flip wrapper, but phones never hover-flip (see `useLongPressPreview` —
 * the long-press preview is a completely separate portalled component with its own back
 * face) so every card on a phone paid to mount and lay out a face nobody could reach.
 * The fix is to mount it only while actually flipped or on a device that can hover at
 * all (`(pointer: fine)`, same signal `useHoverPreview.ts`'s `isCoarsePointer` reads,
 * just the inverse and reactive).
 *
 * A screen can show 8-30 cards at once, so this is deliberately ONE shared
 * `MediaQueryList`/native `change` listener for the whole app — not a `matchMedia` call
 * per card — via a module-level listener registry that every `useHasFinePointer()`
 * caller just adds a callback to. `useSyncExternalStore`'s separate server snapshot
 * (always `false`) is what avoids a hydration mismatch: SSR and the first client render
 * agree the device has no fine pointer, and only a later, post-hydration render (driven
 * by the store) can flip it to `true` on desktop.
 */
let finePointerMql: MediaQueryList | null = null;
const finePointerListeners = new Set<() => void>();
function getFinePointerMql(): MediaQueryList | null {
  if (typeof window === 'undefined') return null;
  if (!finePointerMql) {
    finePointerMql = window.matchMedia('(pointer: fine)');
    finePointerMql.addEventListener('change', () => finePointerListeners.forEach(listener => listener()));
  }
  return finePointerMql;
}
function subscribeFinePointer(onChange: () => void): () => void {
  getFinePointerMql();
  finePointerListeners.add(onChange);
  return () => { finePointerListeners.delete(onChange); };
}
function finePointerSnapshot(): boolean {
  return getFinePointerMql()?.matches ?? false;
}
function finePointerServerSnapshot(): boolean {
  return false;
}
export function useHasFinePointer(): boolean {
  return useSyncExternalStore(subscribeFinePointer, finePointerSnapshot, finePointerServerSnapshot);
}
