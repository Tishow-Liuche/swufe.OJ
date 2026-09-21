const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMirrorStatement,
  buildPlan,
} = require('./cf-statement-repair.cjs');
const item = () => ({
  remoteProblemId: '2240B',
  pid: 'CF2240B',
  url: 'https://www.luogu.com.cn/problem/CF2240B',
  fetchedAt: '2026-09-21T05:00:00Z',
  vjudge: {
    id: '2240B',
    link: 'https://codeforces.com/problemset/problem/2240/B',
  },
  content: {
    locale: 'en',
    description: 'Find $n$ such that $$$x^2=n$$$.',
    formatI: 'Read n.',
    formatO: 'Print x.',
    hint: 'Example.',
  },
  samples: [
    ['4', '2'],
    ['9', '3'],
  ],
  limits: { time: [1000], memory: [256000] },
});
const row = () => ({
  id: 'p1',
  title: 'Keep title',
  difficulty: 'POINT_1',
  timeLimit: 1000000,
  memoryLimit: 256,
  sourceInfo: { id: 's1', platform: 'CODEFORCES', remoteProblemId: '2240B' },
  versions: [
    {
      id: 'v1',
      description: 'CF problem 2240B: metadata',
      inputFormat: null,
      outputFormat: null,
      sampleInput: null,
      sampleOutput: null,
      hint: null,
      dataRange: null,
    },
  ],
});
test('allows only reviewed CF802 renumberings with exact original titles', () => {
  const source = {...item(), remoteProblemId:'802A1', sourceRemoteProblemId:'802A', pid:'CF802A', name:'Heidi and Library (easy)', url:'https://www.luogu.com.cn/problem/CF802A', vjudge:{id:'802A',link:'https://codeforces.com/problemset/problem/802/A'}};
  const result = formatMirrorStatement(source);
  assert.equal(result.remoteProblemId,'802A1');
  assert.match(result.version.description,/problem\/802\/A1/);
  assert.throws(()=>formatMirrorStatement({...source,name:'Heidi and Library (medium)'}));
  assert.throws(()=>formatMirrorStatement({...source,remoteProblemId:'802D1'}));
});
test('preserves math and all samples, explicit mirror attribution, correct units', () => {
  const p = formatMirrorStatement(item());
  assert.match(p.version.description, /\$\$\$x\^2=n\$\$\$/);
  assert.match(p.version.description, /样例 2/);
  assert.match(
    p.version.description,
    /https:\/\/www.luogu.com.cn\/problem\/CF2240B/,
  );
  assert.equal(p.version.sampleInput, '4\n---\n9');
  assert.equal(p.timeLimit, 1000);
  assert.equal(p.memoryLimit, 256);
  assert.equal(p.difficulty, undefined);
});
test('rejects mismatched identity, untrusted URLs, missing body, invalid units and bad samples', () => {
  for (const patch of [
    { pid: 'CF4A' },
    { url: 'https://example.org/CF2240B' },
    { vjudge: { id: '4A' } },
    { content: { locale: 'en', description: '' } },
    { content: { locale: 'zh-CN', description: 'not original' } },
    { limits: { time: [0], memory: [256000] } },
    { samples: [['x']] },
  ])
    assert.throws(() => formatMirrorStatement({ ...item(), ...patch }));
});
test('only fills placeholders, keeps difficulty/title/id, repeat is no-op', () => {
  const before = row(),
    plan = buildPlan([before], [item()]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].problemId, 'p1');
  assert.deepEqual(Object.keys(plan[0].problem), ['timeLimit', 'memoryLimit']);
  assert.equal(before.difficulty, 'POINT_1');
  const after = {
    ...before,
    ...plan[0].problem,
    versions: [{ ...before.versions[0], ...plan[0].version }],
  };
  assert.equal(buildPlan([after], [item()]).length, 0);
});
test('never overwrites existing short real statement; rejects duplicate evidence', () => {
  assert.equal(
    buildPlan(
      [{ ...row(), versions: [{ id: 'v1', description: 'Compute a+b.' }] }],
      [item()],
    ).length,
    0,
  );
  assert.throws(() => buildPlan([row()], [item(), item()]));
});
test('updates version limits too because the judge prioritizes version overrides', () => {
  const p = formatMirrorStatement(item());
  assert.equal(p.version.timeLimit, 1000);
  assert.equal(p.version.memoryLimit, 256);
});
