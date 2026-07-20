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
    expect(mapLuoguDifficultyToPointDifficulty(0)).toBe('POINT_0');
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
});
