import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const platform of ['CODEFORCES', 'LUOGU', 'QOJ']) {
    const page = await browser.newPage();
    let finished = false, opens = 0;
    await page.exposeFunction('recordOpen', () => { opens++; });
    await page.addInitScript(() => {
      window.open = () => { window.recordOpen(); return null; };
      window.addEventListener('message', e => {
        if (e.data?.type === 'SWUFE_HELPER_PING') window.postMessage({ ...e.data, type: 'SWUFE_HELPER_PONG', version: '1.0' }, location.origin);
      });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path.includes('/auth/refresh')) return route.fulfill({ status: 401, json: {} });
      if (path === '/api/problems/p1') data = { id: 'p1', title: 'Test', sourceInfo: { platform }, tags: [], versions: [{ description: 'Test', timeLimit: 1000, memoryLimit: 256 }] };
      if (path === '/api/submissions' && route.request().method() === 'POST') data = { submissionId: 's1', mode: platform, cfSubmitUrl: 'https://codeforces.com/test', luoguSubmitUrl: 'https://www.luogu.com.cn/test', qojSubmitUrl: 'https://qoj.ac/test' };
      else if (path === '/api/submissions') data = { items: [] };
      if (path === '/api/submissions/s1') data = { id: 's1', status: finished ? 'WRONG_ANSWER' : 'QUEUING', cases: [] };
      await route.fulfill({ json: data });
    });
    await page.goto((process.env.OJ_PREVIEW_URL || 'http://127.0.0.1:4178') + '/problems/p1');
    await page.locator('.cm-content').fill('// test');
    await page.locator('.btn-submit').click();
    await page.locator('.cf-overlay').waitFor();
    assert(!(await page.locator('.cf-overlay').innerText()).includes('浏览器拦截了新标签页'));
    finished = true;
    await page.locator('.cf-overlay').waitFor({ state: 'detached', timeout: 15000 });
    assert.equal(opens, 1);
    assert(await page.getByText('WA', { exact: true }).count() > 0);
    console.log('PASS', platform, 'pending dialog → final WA visible, dialog closed, no extra tab');
    await page.close();
  }
} finally { await browser.close(); }
