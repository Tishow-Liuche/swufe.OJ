import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync(new URL('../public/luogu-helper.user.js', import.meta.url), 'utf8');
const instrumented = source.replace('if (!shouldActivateHelper()) return;', 'window.helperTest = { normalizeLuoguVerdictStatus, extractLuoguVerdictText, parseRemoteId, readRecordResult, watchResult, reportResult, saveState }; return;');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
let failures = 0;
async function test(name, run) {
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
  await page.goto('https://www.luogu.com.cn/record/298642603');
  await page.addInitScript(() => { window.GM_getValue = (_, fallback) => fallback; });
  await page.evaluate(() => { window.GM_getValue = (_, fallback) => fallback; });
  await page.addScriptTag({ content: instrumented });
  try { await run(page); console.log('PASS', name); }
  catch (error) { failures++; console.error('FAIL', name, error.message); }
  finally { await page.close(); }
}
await test('Unaccepted is never Accepted', async page => {
  assert.notEqual(await page.evaluate(() => helperTest.normalizeLuoguVerdictStatus('Unaccepted')), 'ACCEPTED');
});
await test('Waiting primary verdict beats unrelated Accepted and testcase AC', async page => {
  await page.setContent('<div style="display:none">Accepted</div><div class="l-flex-info-row"><span>评测状态</span><span>Waiting</span></div><div class="test-case"><div class="status">AC</div></div>');
  assert.equal(await page.evaluate(() => helperTest.normalizeLuoguVerdictStatus(helperTest.extractLuoguVerdictText())), 'JUDGING');
});
await test('page without primary verdict cannot infer acceptance', async page => {
  await page.setContent('<div>Accepted</div><div>AC</div>');
  assert.equal(await page.evaluate(() => helperTest.extractLuoguVerdictText()), '');
});
await test('explicit Wrong Answer beats successful individual testcase', async page => {
  await page.setContent('<div>AC</div><div class="l-flex-info-row"><span>评测状态</span><span>Wrong Answer</span></div>');
  assert.equal(await page.evaluate(() => helperTest.normalizeLuoguVerdictStatus(helperTest.extractLuoguVerdictText())), 'WRONG_ANSWER');
});
await test('mixed prose and negation are not verdicts', async page => {
  for (const text of ['未通过', 'not Accepted', 'Accepted Waiting', 'AC WA']) {
    assert.notEqual(await page.evaluate(text => helperTest.normalizeLuoguVerdictStatus(text), text), 'ACCEPTED');
  }
});
await test('record ID is never taken from an unrelated page link', async page => {
  await page.goto('https://www.luogu.com.cn/problem/P1001');
  await page.addScriptTag({ content: instrumented });
  await page.setContent('<a href="/record/123">old record</a>');
  assert.equal(await page.evaluate(() => helperTest.parseRemoteId()), '');
});
// Current public RecordShow and NormalPageLayout structures, verified at:
// https://fecdn.luogu.com.cn/columba/columba~4da6587d708a8f52.js
// https://fecdn.luogu.com.cn/columba/columba~8de03ed0deab1d05.js
function record(verdict, cases = ['AC', 'WA'], pid = 'P1001', metrics = true) {
  return `<div class="header-layout"><div class="top-row">R298642603 记录详情 ${metrics ? '用时 40ms 内存 872KB' : ''}</div></div>
  <div class="l-flex-info-row"><span>所属题目</span><span>${pid} A+B Problem</span></div>
  <div class="l-flex-info-row"><span>评测状态</span><span id="verdict">${verdict}</span></div>
  <div class="l-flex-info-row"><span>评测分数</span><span>0</span></div>
  ${cases.map(c => `<div class="test-case"><div class="status">${c}</div></div>`).join('')}`;
}
async function active(page, options = {}) {
  await page.evaluate(options => {
    const store = {}; window.requests = []; window.idAttempts = 0;
    window.GM_getValue = (k, d) => store[k] ?? d;
    window.GM_setValue = (k, v) => store[k] = v;
    window.GM_deleteValue = k => delete store[k];
    window.close = () => {};
    window.GM_xmlhttpRequest = req => {
      const body = JSON.parse(req.data || '{}');
      window.requests.push({ url: req.url, body });
      if (req.url.endsWith('/report-id') && ++window.idAttempts <= (options.failIds || 0)) {
        req.onload({ status: 500, responseText: '{}' }); return;
      }
      req.onload({ status: 200, responseText: '{}' });
    };
    helperTest.saveState({ submissionId: 's', problemId: 'P1001', token: 'token', leaseNonce: 'lease', submittedAt: Math.floor(Date.now() / 1000) });
    const timeout = window.setTimeout;
    window.setTimeout = (fn, ms) => timeout(fn, ms >= 1000 ? 20 : ms);
  }, options);
}
await test('Unaccepted resolves WA from record testcase blocks, not preceding AC', async page => {
  await page.setContent(record('Unaccepted'));
  const result = await page.evaluate(() => helperTest.readRecordResult());
  assert.equal(result.status, 'WRONG_ANSWER');
  assert.equal(result.score, 0); assert.equal(result.timeUsed, 40); assert.equal(result.memoryUsed, 872);
});
await test('Unaccepted without a visible failure stays unconfirmed', async page => {
  await page.setContent(record('Unaccepted', ['AC']));
  assert.equal(await page.evaluate(() => helperTest.readRecordResult().status), '');
});
await test('Waiting then Unaccepted reports only WA and retries failed record binding', async page => {
  await page.setContent(record('Waiting'));
  await active(page, { failIds: 2 });
  await page.evaluate(() => helperTest.watchResult());
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => requests.filter(r => r.url.endsWith('/report-result')).length), 0);
  await page.locator('#verdict').evaluate(el => el.textContent = 'Unaccepted');
  await page.waitForFunction(() => requests.some(r => r.url.endsWith('/report-result')));
  const results = await page.evaluate(() => requests.filter(r => r.url.endsWith('/report-result')).map(r => r.body));
  assert.equal(results.length, 1); assert.equal(results[0].status, 'WRONG_ANSWER');
  assert.equal(results[0].remoteSubmissionId, '298642603');
  assert.equal(await page.evaluate(() => idAttempts >= 3), true);
});
await test('wrong problem never binds or reports a record', async page => {
  await page.setContent(record('Accepted', ['AC'], 'P1002'));
  await active(page); await page.evaluate(() => helperTest.watchResult());
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => requests.length), 0);
});
await test('metric waiting rereads verdict instead of freezing Accepted', async page => {
  await page.setContent(record('Accepted', ['WA'], 'P1001', false));
  await active(page); await page.evaluate(() => helperTest.watchResult());
  await page.waitForTimeout(90);
  await page.locator('#verdict').evaluate(el => el.textContent = 'Unaccepted');
  await page.locator('.top-row').evaluate(el => el.textContent += ' 用时 40ms 内存 872KB');
  await page.waitForFunction(() => requests.some(r => r.url.endsWith('/report-result')));
  assert.equal(await page.evaluate(() => requests.find(r => r.url.endsWith('/report-result')).body.status), 'WRONG_ANSWER');
});
await test('confirmed Accepted reports AC with its metrics', async page => {
  await page.setContent(record('Accepted', ['AC']));
  await active(page); await page.evaluate(() => helperTest.watchResult());
  await page.waitForFunction(() => requests.some(r => r.url.endsWith('/report-result')));
  const r = await page.evaluate(() => requests.find(r => r.url.endsWith('/report-result')).body);
  assert.equal(r.status, 'ACCEPTED'); assert.equal(r.timeUsed, 40); assert.equal(r.memoryUsed, 872);
});
await test('Accepted becoming Waiting during metric delay does not send a terminal result', async page => {
  await page.setContent(record('Accepted', ['AC'], 'P1001', false));
  await active(page); await page.evaluate(() => helperTest.watchResult());
  await page.waitForTimeout(90);
  await page.locator('#verdict').evaluate(el => el.textContent = 'Waiting');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => requests.filter(r => r.url.endsWith('/report-result')).length), 0);
});
await test('Unaccepted with TLE returns TLE, not generic WA', async page => {
  await page.setContent(record('Unaccepted', ['AC', 'TLE']));
  assert.equal(await page.evaluate(() => helperTest.readRecordResult().status), 'TIME_LIMIT_EXCEEDED');
});
await browser.close();
if (failures) process.exitCode = 1;
