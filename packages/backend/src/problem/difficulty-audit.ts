import { mapCfRatingToPointDifficulty, mapLuoguDifficultyToPointDifficulty } from './point-difficulty';

export interface DifficultyBankRow {
  id: string;
  difficulty: string | null;
  sourceInfo: { id: string; platform: string; remoteProblemId: string } | null;
}
export interface DifficultyCatalog {
  codeforces: Array<{ contestId: number; index: string; rating?: number | null; evidence?: 'CF_CATALOG' | 'CF_CONTEST' | 'CF_CRAWL_SNAPSHOT' }>;
  luogu: Array<{ pid: string; sourceRemoteId?: string; difficulty: number; evidence?: 'LUOGU_CATALOG' | 'LUOGU_CRAWL_SNAPSHOT' }>;
  unavailable?: Array<{ platform: string; remoteProblemId: string; status: number; url: string; checkedAt: string }>;
}
export interface DifficultyAuditRow {
  problemId: string;
  sourceId?: string;
  platform: string;
  remoteProblemId?: string;
  canonicalRemoteProblemId?: string;
  before: string | null;
  after?: string | null;
  rawDifficulty?: number | null;
  evidence: 'CF_CATALOG' | 'CF_CONTEST' | 'CF_CRAWL_SNAPSHOT' | 'LUOGU_CATALOG' | 'LUOGU_CRAWL_SNAPSHOT' | 'QOJ_POLICY' | 'LOCAL_AUTHOR' | 'MISSING_EVIDENCE' | 'UPSTREAM_UNAVAILABLE';
  result: 'MATCH' | 'CHANGE' | 'PRESERVED' | 'UNRESOLVED';
}

/** Pure dry-run: an unavailable upstream record never becomes a guessed rating. */
export function buildDifficultyAudit(bank: DifficultyBankRow[], catalog: DifficultyCatalog): DifficultyAuditRow[] {
  const cf = new Map<string, { raw: number | null; evidence: DifficultyAuditRow['evidence'] }>();
  for (const row of catalog.codeforces) {
    if (!Number.isInteger(row.contestId) || row.contestId <= 0 || typeof row.index !== 'string' || !/^[A-Z0-9]+$/i.test(row.index) || (row.rating != null && (typeof row.rating !== 'number' || !mapCfRatingToPointDifficulty(row.rating)))) throw new Error('Invalid CF difficulty metadata');
    const key = `${row.contestId}${row.index.toUpperCase()}`;
    if (cf.has(key)) throw new Error(`Duplicate CF identity: ${key}`);
    if (row.evidence && !['CF_CATALOG', 'CF_CONTEST', 'CF_CRAWL_SNAPSHOT'].includes(row.evidence)) throw new Error('Invalid CF evidence provider');
    cf.set(key, { raw: row.rating ?? null, evidence: row.evidence || 'CF_CATALOG' });
  }
  const luogu = new Map<string, { raw: number; canonical: string; evidence: DifficultyAuditRow['evidence'] }>();
  for (const row of catalog.luogu) {
    if (!/^P\d+$/.test(row.pid) || !Number.isInteger(row.difficulty) || row.difficulty < 0 || row.difficulty > 8) throw new Error('Invalid Luogu difficulty metadata');
    const key = row.sourceRemoteId || row.pid;
    if (row.sourceRemoteId && !new RegExp(`^${row.pid}__duplicate_[a-z0-9]+$`).test(row.sourceRemoteId)) throw new Error('Invalid legacy Luogu identity');
    if (luogu.has(key)) throw new Error(`Duplicate Luogu identity: ${key}`);
    if (row.evidence && !['LUOGU_CATALOG', 'LUOGU_CRAWL_SNAPSHOT'].includes(row.evidence)) throw new Error('Invalid Luogu evidence provider');
    luogu.set(key, { raw: row.difficulty, canonical: row.pid, evidence: row.evidence || 'LUOGU_CATALOG' });
  }
  const unavailable = new Set<string>();
  for (const row of catalog.unavailable || []) {
    // This is a reviewed preservation exception, never authorization to assign a rating.
    if (row.platform !== 'LUOGU' || !/^P\d+$/.test(row.remoteProblemId) || ![401, 403, 404].includes(row.status) || row.url !== `https://www.luogu.com.cn/problem/${row.remoteProblemId}` || !Number.isFinite(Date.parse(row.checkedAt))) throw new Error('Invalid unavailable evidence');
    unavailable.add(`${row.platform}:${row.remoteProblemId}`);
  }
  const ids = new Set<string>();
  return bank.map(problem => {
    if (ids.has(problem.id)) throw new Error(`Duplicate bank identity: ${problem.id}`);
    ids.add(problem.id);
    const source = problem.sourceInfo;
    const row: DifficultyAuditRow = { problemId: problem.id, before: problem.difficulty, platform: source?.platform || 'LOCAL', evidence: 'MISSING_EVIDENCE', result: 'UNRESOLVED' };
    if (!source) return { ...row, after: problem.difficulty, evidence: 'LOCAL_AUTHOR', result: 'PRESERVED' };
    row.sourceId = source.id;
    row.remoteProblemId = source.remoteProblemId;
    if (source.platform === 'CODEFORCES' && cf.has(source.remoteProblemId)) {
      row.rawDifficulty = cf.get(source.remoteProblemId)!.raw;
      row.after = mapCfRatingToPointDifficulty(row.rawDifficulty);
      row.evidence = cf.get(source.remoteProblemId)!.evidence;
    } else if (source.platform === 'LUOGU' && luogu.has(source.remoteProblemId)) {
      row.rawDifficulty = luogu.get(source.remoteProblemId)!.raw;
      row.after = mapLuoguDifficultyToPointDifficulty(row.rawDifficulty);
      row.evidence = luogu.get(source.remoteProblemId)!.evidence;
      if (source.remoteProblemId !== luogu.get(source.remoteProblemId)!.canonical) row.canonicalRemoteProblemId = luogu.get(source.remoteProblemId)!.canonical;
    } else if (source.platform === 'QOJ') {
      row.rawDifficulty = null;
      row.after = null;
      row.evidence = 'QOJ_POLICY';
    } else if (unavailable.has(`${source.platform}:${source.remoteProblemId}`)) {
      return { ...row, after: problem.difficulty, evidence: 'UPSTREAM_UNAVAILABLE', result: 'PRESERVED' };
    } else return row;
    row.result = row.before === row.after ? 'MATCH' : 'CHANGE';
    return row;
  });
}
