import { expect, it } from 'vitest';
import { pointDifficultyShortLabel, pointDifficultyClass, normalizePointDifficulty } from './pointDifficulty';

it.each([null, '', 'null', 'UNRATED', 'NONE'])('never labels unrated %s as P1', value => {
  expect(normalizePointDifficulty(value)).toBeNull();
  expect(pointDifficultyShortLabel(value)).toBe('未评定难度');
  expect(pointDifficultyClass(value)).toBe('unrated');
});
it('retains genuine P1 and legacy mapping', () => {
  expect(pointDifficultyShortLabel('POINT_1')).toBe('P1 · 焦点');
  expect(pointDifficultyShortLabel('POPULAR')).toBe('P1 · 焦点');
});
