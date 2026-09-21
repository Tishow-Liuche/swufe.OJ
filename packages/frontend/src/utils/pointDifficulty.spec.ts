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
it('maps the complete CF numeric rating range consistently with the six bands', () => {
  for (let rating = 800; rating <= 4000; rating += 100) {
    const level = rating <= 1000 ? 0 : rating <= 1300 ? 1 : rating <= 1600 ? 2 : rating <= 1900 ? 3 : rating <= 2400 ? 4 : 5;
    expect(normalizePointDifficulty(String(rating))).toBe(`POINT_${level}`);
  }
});
