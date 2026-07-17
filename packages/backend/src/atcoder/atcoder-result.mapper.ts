import { AtCoderVerdict } from './atcoder.types';

const VERDICTS: Record<string, Omit<AtCoderVerdict, 'rawStatus'>> = {
  WJ: { status: 'JUDGING', terminal: false },
  WR: { status: 'JUDGING', terminal: false },
  JUDGING: { status: 'JUDGING', terminal: false },
  AC: { status: 'ACCEPTED', terminal: true },
  WA: { status: 'WRONG_ANSWER', terminal: true },
  TLE: { status: 'TIME_LIMIT_EXCEEDED', terminal: true },
  MLE: { status: 'MEMORY_LIMIT_EXCEEDED', terminal: true },
  RE: { status: 'RUNTIME_ERROR', terminal: true },
  CE: { status: 'COMPILE_ERROR', terminal: true },
  OLE: { status: 'OUTPUT_LIMIT_EXCEEDED', terminal: true },
  PE: { status: 'PRESENTATION_ERROR', terminal: true },
  IE: { status: 'SYSTEM_ERROR', terminal: true },
};

export function mapAtCoderVerdict(rawStatus: string): AtCoderVerdict | null {
  const normalized = rawStatus.trim().replace(/\s+/g, ' ').toUpperCase();
  const key = normalized.startsWith('JUDGING') ? 'JUDGING' : normalized;
  const verdict = VERDICTS[key];
  return verdict ? { rawStatus: rawStatus.trim(), ...verdict } : null;
}
