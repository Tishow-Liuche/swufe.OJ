import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const context = await browser.newContext();
  let state = 'RUNNING';
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/auth/refresh') body = { accessToken: 'test' };
    else if (path === '/api/user/profile') body = { id: 'u1', username: 'student', role: 'STUDENT' };
    else if (path.endsWith('/problems/p1')) body = { id: 'p1', title: 'Contest problem', timeLimit: 1000, memoryLimit: 256,
      tags: [{ name: 'dp' }], difficulty: 'POINT_3', contestState: state, versions: [{ description: 'Statement', sampleInput: '1', sampleOutput: '2' }] };
    else if (path.includes('submissions')) body = { items: [], total: 0 };
    return route.fulfill({ json: body });
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5184';
  for (const scenario of ['RUNNING', 'UPCOMING', 'ENDED', 'practice']) {
    state = scenario;
    await page.goto(base + '/problems/p1' + (scenario === 'practice' ? '' : '?contestId=c1'));
    await page.locator('.problem-header').waitFor();
    const hidden = ['RUNNING', 'UPCOMING'].includes(scenario);
    assert.equal(await page.locator('.problem-community-links').count(), hidden ? 0 : 1);
    assert.equal((await page.getByText('查看题解', { exact: true }).count()) > 0, !hidden);
    assert.equal((await page.locator('.problem-meta').innerText()).includes('标签'), !hidden);
    assert.equal((await page.locator('.problem-meta').innerText()).includes('难度'), !hidden);
    assert.equal(await page.locator('.cm-editor').count(), 1);
    assert.equal(await page.locator('.btn-submit').count(), 1);
    if (hidden) assert.equal(await page.getByText('写题解', { exact: true }).count(), 0);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: active/upcoming contests hide hints and community; ended/practice restore; editor and submit remain.');
} finally { await browser.close(); }
