import { describe, expect, it } from 'vitest';
import { resolveQuickStartProblem } from './quick-start';

describe('resolveQuickStartProblem', () => {
  it('uses the stable Luogu problem identifier instead of a database id', () => {
    const problem = resolveQuickStartProblem([
      { id: 'current-database-id', sourceInfo: { platform: 'LUOGU', remoteProblemId: 'P1001' } },
      { id: 'another-id', sourceInfo: { platform: 'LUOGU', remoteProblemId: 'P1003' } },
    ], 'P1001');

    expect(problem?.id).toBe('current-database-id');
  });

  it('returns null when the requested quick-start problem is absent', () => {
    expect(resolveQuickStartProblem([], 'P1007')).toBeNull();
  });
});
