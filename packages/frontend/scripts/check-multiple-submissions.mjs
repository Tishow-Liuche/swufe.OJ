import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const c = await browser.newContext();
  let submitted = 0, releaseOld;
  let firstPollReady;
  const firstPoll = new Promise(resolve => { firstPollReady = resolve; });
  const rows = [];
  await c.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/auth/refresh') body = { accessToken: 'test' };
    else if (path === '/api/user/profile') body = { id: 'u1', username: 'student', role: 'STUDENT' };
    else if (path.endsWith('/problems/p1')) body = { id: 'p1', title: 'Submission test', contestState: 'RUNNING', versions: [{ description: 'Test' }] };
    else if (path === '/api/contests/c1/submit') {
      const id = 's' + ++submitted;
      rows.unshift({ id, status: 'RUNNING', language: 'cpp', createdAt: new Date().toISOString() });
      body = { id, status: 'QUEUING', mode: 'LOCAL' };
    } else if (path === '/api/submissions') body = { items: [...rows], total: rows.length };
    else if (path === '/api/submissions/s1') {
      firstPollReady();
      await new Promise(resolve => { releaseOld = resolve; });
      body = { id: 's1', status: 'WRONG_ANSWER', score: 0 };
    } else if (path === '/api/submissions/s2') body = { id: 's2', status: 'ACCEPTED', score: 100, timeUsed: 2 };
    await route.fulfill({ json: body }).catch(() => {});
  });
  const page = await c.newPage();
  await page.goto((process.env.UI_BASE_URL || 'http://127.0.0.1:5186') + '/problems/p1?contestId=c1');
  await page.locator('.cm-editor').waitFor();
  await page.locator('.btn-submit').click();
  await firstPoll;
  await page.locator('.btn-submit:not([disabled])').waitFor();
  await page.locator('.btn-submit').click();
  await page.waitForFunction(() => document.querySelector('.result-badge')?.textContent?.trim() === 'AC');
  releaseOld?.();
  await page.waitForTimeout(800);
  assert.equal(submitted, 2);
  assert.equal((await page.locator('.result-badge').innerText()).trim(), 'AC');
  assert.equal(await page.locator('.problem-submission-row').count(), 2);
  assert.equal(await page.locator('.btn-submit').isEnabled(), true);
  console.log('PASS: second submission allowed while first pending; old delayed result cannot overwrite newest; both records visible.');
} finally { await browser.close(); }
