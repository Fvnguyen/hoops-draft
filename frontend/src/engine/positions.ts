/**
 * Single source of position eligibility (plan ui_draft_deckbuild_pack, D13).
 *
 * Raw positions in the card data look like 'PG', 'G', 'G-F', 'F/C', 'SF-PF'. The
 * depth chart has five columns. A player fits a column naturally (their listed
 * position covers it) or adjacently (one column over, allowed for humans with a
 * penalty in the sim). Bots build natural-only.
 */

export const DEPTH_COLUMNS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type DepthColumn = (typeof DEPTH_COLUMNS)[number];

const ADJACENT: Record<DepthColumn, DepthColumn[]> = {
  PG: ['SG'], SG: ['PG', 'SF'], SF: ['SG', 'PF'], PF: ['SF', 'C'], C: ['PF'],
};

/** Split a raw position into its atomic parts: 'G-F' → ['G','F'], 'SF/PF' → ['SF','PF']. */
export function positionParts(raw: string): string[] {
  return raw.split(/[-/]/).map(p => p.trim()).filter(Boolean);
}

/** Columns a raw position covers naturally. 'G' → PG+SG, 'F' → SF+PF, 'C' → C, 'ALL' → all. */
export function naturalPositions(raw: string): DepthColumn[] {
  if (raw === 'ALL') return [...DEPTH_COLUMNS];
  const out = new Set<DepthColumn>();
  for (const part of positionParts(raw)) {
    if (part === 'G') { out.add('PG'); out.add('SG'); continue; }
    if (part === 'F') { out.add('SF'); out.add('PF'); continue; }
    if ((DEPTH_COLUMNS as readonly string[]).includes(part)) out.add(part as DepthColumn);
  }
  return DEPTH_COLUMNS.filter(c => out.has(c));
}

/** How a raw position fits a column. */
export function positionFit(raw: string, column: string): 'natural' | 'adjacent' | 'none' {
  const natural = naturalPositions(raw);
  if (natural.includes(column as DepthColumn)) return 'natural';
  for (const n of natural) {
    if (ADJACENT[n].includes(column as DepthColumn)) return 'adjacent';
  }
  return 'none';
}

/** Whether a player can be placed in a column. `allowAdjacent` false = bots. */
export function canPlaceAt(raw: string, column: string, allowAdjacent = true): boolean {
  const fit = positionFit(raw, column);
  return fit === 'natural' || (allowAdjacent && fit === 'adjacent');
}

/** Preferred column for a raw position (first natural column; SF as the last resort). */
export function defaultColumn(raw: string): DepthColumn {
  return naturalPositions(raw)[0] ?? 'SF';
}
