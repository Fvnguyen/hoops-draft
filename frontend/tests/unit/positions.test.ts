/**
 * Position eligibility (plan ui_draft_deckbuild_pack, D13).
 *
 * `engine/positions.ts` is the single source of truth the deck builder UI and the
 * bot builder now share — these tests pin the raw-position shapes that actually
 * occur in the card pool: 'G', 'F', 'C', 'G/F', 'F/C' plus the hyphenated and
 * specific variants ('G-F', 'SF', 'PG', …).
 */
import { describe, it, expect } from 'vitest';
import {
  DEPTH_COLUMNS,
  canPlaceAt,
  defaultColumn,
  naturalPositions,
  positionFit,
  positionParts,
} from '@/engine/positions';

describe('positionParts', () => {
  it('splits on both separators', () => {
    expect(positionParts('G-F')).toEqual(['G', 'F']);
    expect(positionParts('F/C')).toEqual(['F', 'C']);
    expect(positionParts('PG')).toEqual(['PG']);
  });
});

describe('naturalPositions', () => {
  it('expands the generic G and F buckets', () => {
    expect(naturalPositions('G')).toEqual(['PG', 'SG']);
    expect(naturalPositions('F')).toEqual(['SF', 'PF']);
    expect(naturalPositions('C')).toEqual(['C']);
  });

  it('unions the parts of a compound position, in column order', () => {
    expect(naturalPositions('G-F')).toEqual(['PG', 'SG', 'SF', 'PF']);
    expect(naturalPositions('F/C')).toEqual(['SF', 'PF', 'C']);
    expect(naturalPositions('SF-PF')).toEqual(['SF', 'PF']);
  });

  it('treats ALL as every column and an unknown position as none', () => {
    expect(naturalPositions('ALL')).toEqual([...DEPTH_COLUMNS]);
    expect(naturalPositions('STAR')).toEqual([]);
  });
});

describe('positionFit', () => {
  it('reports a natural fit for a listed column', () => {
    expect(positionFit('G', 'PG')).toBe('natural');
    expect(positionFit('F/C', 'C')).toBe('natural');
  });

  it('reports an adjacent fit exactly one column over', () => {
    expect(positionFit('G', 'SF')).toBe('adjacent');   // SG → SF
    expect(positionFit('C', 'PF')).toBe('adjacent');
    expect(positionFit('PG', 'SG')).toBe('adjacent');
  });

  it('reports no fit two or more columns away', () => {
    expect(positionFit('G', 'PF')).toBe('none');
    expect(positionFit('G', 'C')).toBe('none');
    expect(positionFit('C', 'SG')).toBe('none');
  });
});

describe('canPlaceAt', () => {
  it('allows adjacent placement for humans and refuses it for bots', () => {
    expect(canPlaceAt('G', 'SF')).toBe(true);
    expect(canPlaceAt('G', 'SF', false)).toBe(false);
  });

  it('always allows a natural column', () => {
    for (const col of naturalPositions('G-F')) {
      expect(canPlaceAt('G-F', col, false)).toBe(true);
    }
  });

  it('never allows a column that is two positions away', () => {
    expect(canPlaceAt('PG', 'PF')).toBe(false);
    expect(canPlaceAt('C', 'SF')).toBe(false);
  });
});

describe('defaultColumn', () => {
  it('picks the first natural column', () => {
    expect(defaultColumn('G')).toBe('PG');
    expect(defaultColumn('F')).toBe('SF');
    expect(defaultColumn('C')).toBe('C');
    expect(defaultColumn('F/C')).toBe('SF');
  });

  it('falls back to SF for an unparseable position', () => {
    expect(defaultColumn('STAR')).toBe('SF');
  });
});
