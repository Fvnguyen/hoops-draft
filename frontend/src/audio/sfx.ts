/**
 * SFX interface stub (plan ui_draft_deckbuild_pack, D9). Fixes the API surface
 * and the on/off persistence so callers can wire the toggle before the actual
 * Web Audio synthesis lands in T2. `play`/`rareSting` are no-ops until then.
 */

const STORAGE_KEY = 'magicball.sfx';

export type SfxName = 'tear' | 'flip';
export type SfxRarity = 'Rare' | 'Mythic';

/** Off by default (D9) — only reads the persisted opt-in. */
export function isSfxEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function setSfxEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function play(name: SfxName): void {
  // no-op until T2 wires the Web Audio synthesis
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function rareSting(rarity: SfxRarity): void {
  // no-op until T2 wires the Web Audio synthesis
}
