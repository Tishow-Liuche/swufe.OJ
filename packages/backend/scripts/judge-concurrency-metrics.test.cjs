const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeWave } = require('./judge-concurrency-metrics.cjs');
const row = (started, finished, queueMs = 10) => ({ started, finished, queueMs, status: 'ACCEPTED', score: 100, cases: 55, taskFinished: true });
test('requires real overlap and promptly started jobs', () => {
  assert.equal(summarizeWave(2, 55, [row(1, 10), row(2, 11)]).pass, true);
  assert.equal(summarizeWave(2, 55, [row(1, 10), row(10, 20)]).pass, false);
  const slow = summarizeWave(2, 55, [row(1, 10, 3000), row(2, 11)]);
  assert.equal(slow.verdictPass, true);
  assert.equal(slow.latencyPass, false);
  assert.equal(slow.pass, false);
});
test('fails missing cases, nonterminal task, invalid times, and incomplete waves', () => {
  for (const patch of [{ cases: 54 }, { taskFinished: false }, { status: 'WRONG_ANSWER' }, { started: undefined }, { finished: 0 }, { queueMs: -2000 }]) {
    assert.equal(summarizeWave(1, 55, [{ ...row(1, 10), ...patch }]).pass, false);
  }
  assert.equal(summarizeWave(2, 55, [row(1, 10)]).pass, false);
});
