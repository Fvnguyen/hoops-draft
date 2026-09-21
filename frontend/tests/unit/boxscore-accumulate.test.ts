import { describe, it, expect } from 'vitest';
import { emptyBoxScore, type PlayerBoxScore } from '@/engine/game';
import { ADDITIVE_BOX_COLUMNS, accumulateBoxRow } from '@/engine/boxscore';

const row = (overrides: Partial<PlayerBoxScore>): PlayerBoxScore => ({ ...emptyBoxScore('p1', 'Player One'), ...overrides });

describe('accumulateBoxRow', () => {
  it('covers every numeric column of PlayerBoxScore', () => {
    const numeric = Object.entries(emptyBoxScore('x', 'X')).filter(([, v]) => typeof v === 'number').map(([k]) => k).sort();
    expect([...ADDITIVE_BOX_COLUMNS, 'minutes'].sort()).toEqual(numeric);
  });

  it('sums every column and leaves the identity alone', () => {
    const total = emptyBoxScore('p1', 'Player One');
    const game: PlayerBoxScore = { ...total };
    ADDITIVE_BOX_COLUMNS.forEach((column, i) => { game[column] = i + 1; });
    game.minutes = 31.4;
    accumulateBoxRow(total, game);
    accumulateBoxRow(total, game);
    ADDITIVE_BOX_COLUMNS.forEach((column, i) => expect(total[column], column).toBe(2 * (i + 1)));
    expect(total.minutes).toBe(62.8);
    expect(total.playerId).toBe('p1');
    expect(total.playerName).toBe('Player One');
  });

  it('keeps minutes at one decimal across a long season', () => {
    const total = emptyBoxScore('p1', 'Player One');
    for (let i = 0; i < 82; i++) accumulateBoxRow(total, row({ minutes: 0.1 * ((i % 7) + 1) + 30 }));
    expect(Number.isInteger(Math.round(total.minutes * 10))).toBe(true);
    expect(String(total.minutes).length).toBeLessThanOrEqual(6);
  });

  it('treats columns missing from an old save as zero, and negative plus/minus as a real value', () => {
    const total = row({ points: 10, plusMinus: 4 });
    accumulateBoxRow(total, { points: 5 }); // a pre-D9 row: no steals, no plus/minus, no minutes
    accumulateBoxRow(total, { plusMinus: -9 });
    expect(total).toMatchObject({ points: 15, plusMinus: -5, steals: 0, minutes: 0 });
  });
});
