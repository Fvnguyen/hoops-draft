'use client';

import { useEffect, useRef, useState } from 'react';

// deckbuilder_ux D4: each sidebar's own docked/strip toggle persists per browser,
// same pattern TopKPIBand's collapse toggle already uses.
const ROSTER_DOCK_KEY = 'deckbuilder.rosterDocked';
const PLAYS_DOCK_KEY = 'deckbuilder.playsDocked';

function readStoredDock(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

function writeStoredDock(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // best-effort persistence only
  }
}

export type DockTier = 'compact' | 'regular' | 'wide';

export interface UseDockLayoutResult {
  /** Attach to the `@container` shell — the ResizeObserver measures its width. */
  shellRef: React.RefObject<HTMLDivElement | null>;
  tier: DockTier;
  rosterDocked: boolean;
  playsDocked: boolean;
  dockRoster: (next: boolean) => void;
  dockPlays: (next: boolean) => void;
  /** Compact tier has no docked/strip state at all — both sidebars are overlay
   *  drawers, closed by default regardless of the docked toggle. */
  rosterDrawerOpen: boolean;
  setRosterDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  playsDrawerOpen: boolean;
  setPlaysDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * `useDockLayout` (plan render_and_engine_perf, D8 layout half / T10): owns the
 * `@container` shell's measured width (via `ResizeObserver`), the derived compact /
 * regular / wide tier, and both sidebars' docked-vs-strip + drawer-open state. Moved
 * out of `DeckBuilder.tsx` verbatim — every threshold number is unchanged.
 */
export function useDockLayout(): UseDockLayoutResult {
  const shellRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1600);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tier: DockTier = containerWidth < 960 ? 'compact' : containerWidth < 1440 ? 'regular' : 'wide';

  const [rosterDocked, setRosterDockedState] = useState(false);
  const [playsDocked, setPlaysDockedState] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRosterDockedState(readStoredDock(ROSTER_DOCK_KEY, false));
    setPlaysDockedState(readStoredDock(PLAYS_DOCK_KEY, true));
  }, []);
  const [rosterDrawerOpen, setRosterDrawerOpen] = useState(false);
  const [playsDrawerOpen, setPlaysDrawerOpen] = useState(false);

  /** Both sidebars may dock at once in every docked tier (owner review 2026-09-15:
   *  dragging a play from the roster into a slot needs both open; the earlier
   *  "< 1440 collapses the other" rule is withdrawn). The depth chart scales to
   *  whatever width is left. */
  const dockRoster = (next: boolean) => {
    setRosterDockedState(next);
    writeStoredDock(ROSTER_DOCK_KEY, next);
  };
  const dockPlays = (next: boolean) => {
    setPlaysDockedState(next);
    writeStoredDock(PLAYS_DOCK_KEY, next);
  };

  return {
    shellRef,
    tier,
    rosterDocked,
    playsDocked,
    dockRoster,
    dockPlays,
    rosterDrawerOpen,
    setRosterDrawerOpen,
    playsDrawerOpen,
    setPlaysDrawerOpen,
  };
}
