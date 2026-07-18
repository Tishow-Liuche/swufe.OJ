import { formatCfStatement, normalizeCfProblemId } from './cf-statement-format';

describe('cf statement formatting', () => {
  it('normalizes Codeforces problem identifiers', () => {
    expect(normalizeCfProblemId({ problemId: '4A' })).toBe('4A');
    expect(normalizeCfProblemId({ contestId: 1800, index: 'c2' })).toBe('1800C2');
    expect(normalizeCfProblemId({ sourceId: '852/A' })).toBe('852A');
  });

  it('formats statement fields into the OJ version shape', () => {
    const result = formatCfStatement({
      problemId: '4A',
      title: 'Watermelon',
      url: 'https://codeforces.com/problemset/problem/4/A',
      limits: { timeSeconds: 1, memoryMegabytes: 64 },
      statement: 'Pete and Billy bought a watermelon.',
      input: 'The first line contains integer w.',
      output: 'Print YES or NO.',
      examples: [
        { input: '8', output: 'YES' },
        { input: '5', output: 'NO' },
      ],
      note: 'For 8, split into 4 and 4.',
      tags: ['math', 'brute force'],
      rating: 800,
    });

    expect(result.remoteProblemId).toBe('4A');
    expect(result.title).toBe('4A Watermelon');
    expect(result.timeLimit).toBe(1000);
    expect(result.memoryLimit).toBe(64);
    expect(result.description).toContain('## 题目描述');
    expect(result.description).toContain('Pete and Billy bought a watermelon.');
    expect(result.description).toContain('### 样例 2');
    expect(result.inputFormat).toBe('The first line contains integer w.');
    expect(result.outputFormat).toBe('Print YES or NO.');
    expect(result.sampleInput).toBe('8\n---\n5');
    expect(result.sampleOutput).toBe('YES\n---\nNO');
    expect(result.hint).toBe('For 8, split into 4 and 4.');
    expect(result.dataRange).toBe('Time: 1000ms, Memory: 64MB');
    expect(result.tags).toEqual(['math', 'brute force']);
    expect(result.difficulty).toBe('POINT_0');
  });
});
