import { buildDifficultyAudit } from './difficulty-audit';

const bank = (platform: string, remoteProblemId: string, difficulty: string | null = 'POINT_1') => ({ id: `${platform}-${remoteProblemId}`, difficulty, sourceInfo: { id: `s-${platform}-${remoteProblemId}`, platform, remoteProblemId } });
describe('authoritative difficulty audit', () => {
  it('accepts official numeric CF task indexes without inventing letter aliases', () => {
    const rows = buildDifficultyAudit([bank('CODEFORCES', '92101')], { codeforces: [{ contestId: 921, index: '01', rating: 3200 }], luogu: [] });
    expect(rows[0].after).toBe('POINT_5');
  });
  it('distinguishes absent evidence from an explicit unrated upstream problem', () => {
    const rows = buildDifficultyAudit([bank('CODEFORCES', '1A'), bank('CODEFORCES', '2A')], { codeforces: [{ contestId: 1, index: 'A' }], luogu: [] });
    expect(rows[0]).toMatchObject({ result: 'CHANGE', after: null, evidence: 'CF_CATALOG' });
    expect(rows[1]).toMatchObject({ result: 'UNRESOLVED' });
    expect(rows[1]).not.toHaveProperty('after');
  });
  it('audits all platforms without overwriting authored problems', () => {
    const rows = buildDifficultyAudit([bank('CODEFORCES', '1A', 'POINT_3'), bank('LUOGU', 'P1'), bank('LUOGU', 'P2'), bank('QOJ', '1'), { id: 'local', difficulty: 'POINT_5', sourceInfo: null }], { codeforces: [{ contestId: 1, index: 'A', rating: 2000 }], luogu: [{ pid: 'P1', difficulty: 6 }, { pid: 'P2', difficulty: 0 }] });
    expect(rows.map(r => r.after)).toEqual(['POINT_4', 'POINT_4', null, null, 'POINT_5']);
    expect(rows[4].result).toBe('PRESERVED');
  });
  it('rejects duplicate identities and invalid upstream ratings before creating a write plan', () => {
    expect(() => buildDifficultyAudit([], { codeforces: [{ contestId: 1, index: 'A' }, { contestId: 1, index: 'A', rating: 2000 }], luogu: [] })).toThrow('Duplicate');
    expect(() => buildDifficultyAudit([], { codeforces: [], luogu: [{ pid: 'P1', difficulty: 9 }] })).toThrow('Invalid');
    expect(() => buildDifficultyAudit([], { codeforces: [{ contestId: 1, index: 'A', rating: -1 }], luogu: [] })).toThrow('Invalid');
  });
  it('reports matches so a repeat audit produces zero changes', () => {
    const rows = buildDifficultyAudit([bank('CODEFORCES', '1A', 'POINT_4'), bank('QOJ', '1', null)], { codeforces: [{ contestId: 1, index: 'A', rating: 2400 }], luogu: [] });
    expect(rows.every(r => r.result === 'MATCH')).toBe(true);
  });
  it('retains explicit historical provenance rather than claiming a fresh upstream lookup', () => {
    const rows = buildDifficultyAudit([bank('CODEFORCES', '1308A')], { codeforces: [{ contestId: 1308, index: 'A', rating: null, evidence: 'CF_CRAWL_SNAPSHOT' }], luogu: [] } as any);
    expect(rows[0]).toMatchObject({ after: null, evidence: 'CF_CRAWL_SNAPSHOT' });
  });
  it('recognizes only explicitly reviewed legacy duplicate identities', () => {
    const catalog = { codeforces: [], luogu: [{ pid: 'P1102', sourceRemoteId: 'P1102__duplicate_abc', difficulty: 2 }] };
    expect(buildDifficultyAudit([bank('LUOGU', 'P1102__duplicate_abc')], catalog as any)[0]).toMatchObject({ after: 'POINT_1', result: 'MATCH', canonicalRemoteProblemId: 'P1102' });
    expect(() => buildDifficultyAudit([], { codeforces: [], luogu: [{ pid: 'P1102', sourceRemoteId: 'P999__duplicate_abc', difficulty: 2 }] } as any)).toThrow('Invalid');
  });
  it('preserves a specifically checked inaccessible upstream record and discloses the exception', () => {
    const rows = buildDifficultyAudit([bank('LUOGU', 'P8952')], { codeforces: [], luogu: [], unavailable: [{ platform: 'LUOGU', remoteProblemId: 'P8952', status: 401, url: 'https://www.luogu.com.cn/problem/P8952', checkedAt: '2026-09-21T03:00:00.000Z' }] } as any);
    expect(rows[0]).toMatchObject({ after: 'POINT_1', result: 'PRESERVED', evidence: 'UPSTREAM_UNAVAILABLE' });
  });
});
