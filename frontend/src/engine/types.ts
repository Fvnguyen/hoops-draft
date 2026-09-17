/**
 * Engine domain types.
 *
 * This file must stay pure TypeScript: no React, no Next, no fs, no sqlite.
 * The PlayerCard UI component imports these types and re-exports them so
 * existing type-only imports of the old component-module path keep working.
 */

export interface PlayerBio {
  id: string;
  name: string;
  position: string;
  height: string;
  weight: number;
  age: number;
  team: string;
}

export interface SeasonStat {
  gp: number;
  /** Games started (card_balance T2, 2026-09-17) — the real starter signal for the
   *  Uncommon rarity floor; `gs / gp >= 0.5` is a real starter for the season. Optional
   *  so existing test/fixture SeasonStat literals don't all need updating — absent
   *  means "not known to be a starter", never inflates rarity by accident. */
  gs?: number;
  mpg: number;
  pts: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fta: number;
  pct_fga_0_3: number;
  pct_fga_3_10: number;
  pct_fga_10_16: number;
  pct_fga_16_3p: number;
  pct_fga_3p: number;
  fg_pct_0_3: number;
  fg_pct_3_10: number;
  fg_pct_10_16: number;
  fg_pct_16_3p: number;
  fg_pct_3p: number;
  fg_pct: number;
  fg3_pct: number;
  fg2_pct: number;
  ft_pct: number;
  per: number;
  ts: number;
  vorp: number;
  dbpm: number;
  tov: number;
}

export interface ComputedRatings {
  overall: number;
  finishing: number;
  midRange: number;
  perimeter: number;
  playmaking: number;
  rebounding: number;
  perimeterDefense: number;
  postDefense: number;
  _baseOvr?: number;
  _multiplier?: number;
}

export interface Trait {
  name: string;
  level: number;
}

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Mythic';

/** A single Award row as read from the pipeline (build-cards.ts / the SQLite Award table). */
export interface AwardRow {
  playerId: string;
  name: string;
  level: number | null;
}

/** Input to computeCards(): everything the ratings math needs, with no I/O. */
export interface RatingsInput {
  players: PlayerBio[];
  stats: (SeasonStat & { playerId: string; season: string })[];
  awards: AwardRow[];
}

export interface PlayerCard {
  id: string;
  player: PlayerBio;
  stats: SeasonStat;
  awards: string[];
  ratings: ComputedRatings;
  traits: Trait[];
  rarity: Rarity;
}

export interface PlayerCardData extends PlayerCard {
  type: 'Player';
  imageUrl?: string;
  /** Stamped by build-cards.ts from engine/cards.ts's CARD_SET_VERSION, same value on
   *  every card in a given `cards.json` build (card_balance D8). Optional because
   *  synthetic test fixtures build a `PlayerCardData` without it. */
  cardSetVersion?: string;
}

export type Player = PlayerCardData;

export interface Play {
  type: 'Play';
  id: string;
  /**
   * Base effect id (matches a key in synergies.ts PLAY_EFFECTS), independent of `id`.
   * `id` gets a `_pack{N}` suffix in draftEngine.generateCubePool so React has a unique
   * key per pack copy; `playId` is the stable id effect lookups should use. Optional so
   * older saved sessions (localStorage) without this field still fall back to stripping
   * the suffix off `id` — see checkPlayActivation in synergies.ts.
   */
  playId?: string;
  name: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Mythic';
  playCategory: 'system' | 'special' | 'basic';
  badges: string[];
  mechanicText: string;
  imageUrl?: string;
}

export type DraftCard = PlayerCardData | Play;
