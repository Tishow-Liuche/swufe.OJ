import {
  POINT_DIFFICULTIES,
  mapCfRatingToPointDifficulty,
  mapLuoguDifficultyToPointDifficulty,
  normalizePointDifficulty,
} from './point-difficulty';

describe('SWUFE Point difficulty mapping', () => {
  it('normalizes legacy names and keeps native Point values', () => {
    expect(normalizePointDifficulty('POINT_0')).toBe('POINT_0');
    expect(normalizePointDifficulty('BEGINNER')).toBe('POINT_0');
    expect(normalizePointDifficulty('POPULAR-')).toBe('POINT_1');
    expect(normalizePointDifficulty('POPULAR')).toBe('POINT_1');
    expect(normalizePointDifficulty('INTERMEDIATE')).toBe('POINT_2');
    expect(normalizePointDifficulty('IMPROVE-')).toBe('POINT_2');
    expect(normalizePointDifficulty('IMPROVE')).toBe('POINT_2');
    expect(normalizePointDifficulty('PROVINCIAL')).toBe('POINT_5');
    expect(normalizePointDifficulty('NOI-')).toBe('POINT_5');
    expect(normalizePointDifficulty('NOI')).toBe('POINT_5');
    expect(normalizePointDifficulty('IOI+')).toBe('POINT_5');
  });

  it('maps Codeforces ratings into the requested SWUFE Point bands', () => {
    expect(mapCfRatingToPointDifficulty(800)).toBe('POINT_0');
    expect(mapCfRatingToPointDifficulty(1000)).toBe('POINT_0');
    expect(mapCfRatingToPointDifficulty(1100)).toBe('POINT_1');
    expect(mapCfRatingToPointDifficulty(1300)).toBe('POINT_1');
    expect(mapCfRatingToPointDifficulty(1400)).toBe('POINT_2');
    expect(mapCfRatingToPointDifficulty(1600)).toBe('POINT_2');
    expect(mapCfRatingToPointDifficulty(1700)).toBe('POINT_3');
    expect(mapCfRatingToPointDifficulty(1900)).toBe('POINT_3');
    expect(mapCfRatingToPointDifficulty(2000)).toBe('POINT_4');
    expect(mapCfRatingToPointDifficulty(2200)).toBe('POINT_4');
    expect(mapCfRatingToPointDifficulty(2400)).toBe('POINT_4');
    expect(mapCfRatingToPointDifficulty(2500)).toBe('POINT_5');
    expect(mapCfRatingToPointDifficulty(2600)).toBe('POINT_5');
  });

  it('maps Luogu eight-level difficulty values into the requested SWUFE Point bands', () => {
    expect(mapLuoguDifficultyToPointDifficulty(0)).toBeNull();
    expect(mapLuoguDifficultyToPointDifficulty(1)).toBe('POINT_0');
    expect(mapLuoguDifficultyToPointDifficulty(2)).toBe('POINT_1');
    expect(mapLuoguDifficultyToPointDifficulty(3)).toBe('POINT_1');
    expect(mapLuoguDifficultyToPointDifficulty(4)).toBe('POINT_2');
    expect(mapLuoguDifficultyToPointDifficulty(5)).toBe('POINT_3');
    expect(mapLuoguDifficultyToPointDifficulty(6)).toBe('POINT_4');
    expect(mapLuoguDifficultyToPointDifficulty(7)).toBe('POINT_5');
    expect(mapLuoguDifficultyToPointDifficulty(8)).toBe('POINT_5');
  });

  it('exposes exactly the six SWUFE Point levels', () => {
    expect(POINT_DIFFICULTIES.map((item) => item.value)).toEqual([
      'POINT_0',
      'POINT_1',
      'POINT_2',
      'POINT_3',
      'POINT_4',
      'POINT_5',
    ]);
  });

  it('never fabricates difficulty for missing or invalid upstream ratings', () => {
    for (const value of [undefined, null, 0, -1, NaN, Infinity]) {
      expect(mapCfRatingToPointDifficulty(value)).toBeNull();
      expect(mapLuoguDifficultyToPointDifficulty(value)).toBeNull();
    }
    expect(mapLuoguDifficultyToPointDifficulty(9)).toBeNull();
    expect(mapLuoguDifficultyToPointDifficulty(2.5)).toBeNull();
    expect(normalizePointDifficulty('unknown-value')).toBeNull();
  });

  it('normalizes all CF rating values, including upper bands omitted from old lookup tables', () => {
    for (let rating = 800; rating <= 4000; rating += 100) {
      const expected = rating <= 1000 ? 'POINT_0' : rating <= 1300 ? 'POINT_1' : rating <= 1600 ? 'POINT_2' : rating <= 1900 ? 'POINT_3' : rating <= 2400 ? 'POINT_4' : 'POINT_5';
      expect(mapCfRatingToPointDifficulty(rating)).toBe(expected);
      expect(normalizePointDifficulty(String(rating))).toBe(expected);
    }
  });
});
