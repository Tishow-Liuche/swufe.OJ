export type PointDifficulty =
  | 'POINT_0'
  | 'POINT_1'
  | 'POINT_2'
  | 'POINT_3'
  | 'POINT_4'
  | 'POINT_5';

export const POINT_DIFFICULTIES: Array<{
  value: PointDifficulty;
  level: string;
  name: string;
  english: string;
}> = [
  { value: 'POINT_0', level: 'P0', name: '起点', english: 'Origin' },
  { value: 'POINT_1', level: 'P1', name: '焦点', english: 'Focus' },
  { value: 'POINT_2', level: 'P2', name: '拐点', english: 'Turning Point' },
  { value: 'POINT_3', level: 'P3', name: '临界点', english: 'Critical Point' },
  { value: 'POINT_4', level: 'P4', name: '奇点', english: 'Singularity' },
  { value: 'POINT_5', level: 'P5', name: '超奇点', english: 'Beyond Singularity' },
];

const POINT_VALUES = new Set(POINT_DIFFICULTIES.map((item) => item.value));

const LEGACY_DIFFICULTY_MAP: Record<string, PointDifficulty> = {
  BEGINNER: 'POINT_0',
  EASY: 'POINT_0',
  '800': 'POINT_0',
  '900': 'POINT_0',
  '1000': 'POINT_0',
  'POPULAR-': 'POINT_1',
  POPULAR: 'POINT_1',
  INTERMEDIATE: 'POINT_2',
  '1200': 'POINT_1',
  '1300': 'POINT_1',
  '1400': 'POINT_2',
  '1500': 'POINT_2',
  'IMPROVE-': 'POINT_2',
  IMPROVE: 'POINT_2',
  '1600': 'POINT_2',
  '1700': 'POINT_3',
  '1800': 'POINT_3',
  '1900': 'POINT_3',
  PROVINCIAL: 'POINT_5',
  '2000': 'POINT_4',
  '2100': 'POINT_4',
  '2200': 'POINT_4',
  '2300': 'POINT_4',
  '2400': 'POINT_4',
  '2500': 'POINT_5',
  '2600': 'POINT_5',
  NOI: 'POINT_5',
  'NOI-': 'POINT_5',
  'IOI+': 'POINT_5',
  '3000': 'POINT_5',
  UNRATED: 'POINT_1',
};

export function normalizePointDifficulty(value?: string | number | null): PointDifficulty | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized || normalized === 'UNRATED' || normalized === 'NONE' || normalized === 'NULL') return null;
  if (POINT_VALUES.has(normalized as PointDifficulty)) return normalized as PointDifficulty;
  return LEGACY_DIFFICULTY_MAP[normalized] || 'POINT_1';
}

export function mapCfRatingToPointDifficulty(rating?: number | null): PointDifficulty {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return 'POINT_1';
  if (value <= 1000) return 'POINT_0';
  if (value <= 1300) return 'POINT_1';
  if (value <= 1600) return 'POINT_2';
  if (value <= 1900) return 'POINT_3';
  if (value <= 2400) return 'POINT_4';
  return 'POINT_5';
}

export function mapLuoguDifficultyToPointDifficulty(difficulty?: number | null): PointDifficulty {
  const value = Number(difficulty);
  if (!Number.isFinite(value)) return 'POINT_1';
  if (value <= 1) return 'POINT_0';
  if (value <= 3) return 'POINT_1';
  if (value <= 4) return 'POINT_2';
  if (value <= 5) return 'POINT_3';
  if (value <= 6) return 'POINT_4';
  return 'POINT_5';
}
