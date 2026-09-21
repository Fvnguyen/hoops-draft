import { useRef, useState } from 'react';

/** game_canvas (owner): touch devices have no hover, so a long-press (held still for
 *  `LONG_PRESS_MS`) shows the screen-centred preview while the finger stays down; a
 *  short tap keeps its existing meaning (flip / select). Any movement cancels it, and a
 *  press that opened the preview swallows the following click so it never also picks. */
const LONG_PRESS_MS = 450;
export function useLongPressPreview() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const onTouchStart = () => {
    fired.current = false;
    clear();
    timer.current = window.setTimeout(() => { timer.current = null; fired.current = true; setOpen(true); }, LONG_PRESS_MS);
  };
  const onTouchMove = () => { clear(); setOpen(false); };
  const onTouchEnd = (e: React.TouchEvent) => {
    clear();
    if (fired.current) { e.preventDefault(); setOpen(false); }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; }
  };
  // No browser context menu on a card, anywhere (owner): Android and the installed PWA
  // open a "Copy image / Share" sheet on long-press that competes with the preview, and
  // a desktop right-click's "Save image" is never a game action. The iOS equivalent is
  // the `-webkit-touch-callout` CSS on the card roots.
  const onContextMenu = (e: React.MouseEvent) => { e.preventDefault(); };
  return { open, fired, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchMove, onClickCapture, onContextMenu } };
}
