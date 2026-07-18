export type PointDifficulty =
  | 'POINT_0'
  | 'POINT_1'
  | 'POINT_2'
  | 'POINT_3'
  | 'POINT_4'
  | 'POINT_5';

export const pointDifficultyOptions: Array<{
  value: PointDifficulty;
  level: string;
  name: string;
  english: string;
  label: string;
  shortLabel: string;
  className: string;
}> = [
  { value: 'POINT_0', level: 'P0', name: '起点', english: 'Origin', label: 'P0 · 起点 / Origin', shortLabel: 'P0 · 起点', className: 'point-0' },
  { value: 'POINT_1', level: 'P1', name: '焦点', english: 'Focus', label: 'P1 · 焦点 / Focus', shortLabel: 'P1 · 焦点', className: 'point-1' },
  { value: 'POINT_2', level: 'P2', name: '拐点', english: 'Turning Point', label: 'P2 · 拐点 / Turning Point', shortLabel: 'P2 · 拐点', className: 'point-2' },
  { value: 'POINT_3', level: 'P3', name: '临界点', english: 'Critical Point', label: 'P3 · 临界点 / Critical Point', shortLabel: 'P3 · 临界点', className: 'point-3' },
  { value: 'POINT_4', level: 'P4', name: '奇点', english: 'Singularity', label: 'P4 · 奇点 / Singularity', shortLabel: 'P4 · 奇点', className: 'point-4' },
  { value: 'POINT_5', level: 'P5', name: '超奇点', english: 'Beyond Singularity', label: 'P5 · 超奇点 / Beyond Singularity', shortLabel: 'P5 · 超奇点', className: 'point-5' },
];

const byValue = new Map(pointDifficultyOptions.map((item) => [item.value, item]));

const legacyMap: Record<string, PointDifficulty> = {
  BEGINNER: 'POINT_0',
  EASY: 'POINT_0',
  '800': 'POINT_0',
  '900': 'POINT_0',
  '1000': 'POINT_0',
  POPULAR: 'POINT_1',
  'POPULAR-': 'POINT_1',
  '1100': 'POINT_1',
  '1200': 'POINT_1',
  '1300': 'POINT_1',
  INTERMEDIATE: 'POINT_2',
  IMPROVE: 'POINT_2',
  'IMPROVE-': 'POINT_2',
  '1400': 'POINT_2',
  '1500': 'POINT_2',
  '1600': 'POINT_2',
  '1700': 'POINT_3',
  '1800': 'POINT_3',
  '1900': 'POINT_3',
  '2000': 'POINT_4',
  '2100': 'POINT_4',
  '2200': 'POINT_4',
  '2300': 'POINT_4',
  '2400': 'POINT_4',
  PROVINCIAL: 'POINT_5',
  NOI: 'POINT_5',
  'NOI-': 'POINT_5',
  'IOI+': 'POINT_5',
  '2500': 'POINT_5',
  '2600': 'POINT_5',
  '3000': 'POINT_5',
  UNRATED: 'POINT_1',
};

export function normalizePointDifficulty(value?: string | null): PointDifficulty | null {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;
  if (byValue.has(raw as PointDifficulty)) return raw as PointDifficulty;
  return legacyMap[raw] || null;
}

export function pointDifficultyMeta(value?: string | null) {
  return byValue.get(normalizePointDifficulty(value) || 'POINT_1')!;
}

export function pointDifficultyLabel(value?: string | null) {
  if (!value) return '未评定难度';
  return pointDifficultyMeta(value).label;
}

export function pointDifficultyShortLabel(value?: string | null) {
  if (!value) return '未评定难度';
  return pointDifficultyMeta(value).shortLabel;
}

export function pointDifficultyClass(value?: string | null) {
  if (!value) return 'unrated';
  return pointDifficultyMeta(value).className;
}

export function pointDifficultyOrder(value?: string | null) {
  const normalized = normalizePointDifficulty(value);
  if (!normalized) return 99;
  return pointDifficultyOptions.findIndex((item) => item.value === normalized);
}
