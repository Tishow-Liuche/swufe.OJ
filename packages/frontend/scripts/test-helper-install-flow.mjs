import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
let failures = 0;
for (const [platform, script] of [['CODEFORCES', 'cf-helper.user.js'], ['LUOGU', 'luogu-helper.user.js'], ['QOJ', 'qoj-helper.user.js'], ['LOCAL', null]]) {
  const page = await browser.newPage(); let submissions = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.includes('/auth/refresh')) return route.fulfill({ status: 401, json: { message: 'No session' } });
    if (path === '/api/problems/p1') data = { id: 'p1', title: '测试题', sourceInfo: platform === 'LOCAL' ? null : { platform }, tags: [], versions: [{ description: '测试题面', timeLimit: 1000, memoryLimit: 256, sampleInput: '', sampleOutput: '' }] };
    if (path === '/api/submissions' && route.request().method() === 'POST') { submissions++; data = { id: 'test-submission', mode: 'LOCAL' }; }
    else if (path === '/api/submissions') data = { items: [], total: 0 };
    if (path === '/api/submissions/test-submission') data = { id: 'test-submission', status: 'ACCEPTED', cases: [] };
    await route.fulfill({ json: data });
  });
  try {
    await page.goto((process.env.OJ_PREVIEW_URL || 'http://127.0.0.1:4178') + '/problems/p1');
    await page.locator('.cm-content').fill('// preserve this draft');
    await page.locator('.btn-submit').click();
    if (script) {
      await page.locator('dialog[open]').waitFor();
      const bounds = await page.locator('dialog').boundingBox();
      const viewport = page.viewportSize();
      assert(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 2, 'dialog must be horizontally centered');
      assert(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 2, 'dialog must be vertically centered');
      assert.equal(submissions, 0);
      assert.match(await page.locator('dialog').innerText(), /未检测到可用的/);
      assert.match(await page.locator('.cm-content').innerText(), /preserve this draft/);
      assert.equal(await page.locator('dialog a').getAttribute('href'), '/install-oj-helpers.html');
      if (platform === 'LUOGU' && process.env.OJ_DIALOG_SCREENSHOT) await page.screenshot({ path: process.env.OJ_DIALOG_SCREENSHOT });
      const expectedScript = fs.readFileSync(new URL('../public/' + script, import.meta.url), 'utf8');
      const response = await page.request.get(new URL('/' + script, page.url()).href);
      assert.equal(response.status(), 200);
      const publishedScript = await response.text();
      assert.equal(publishedScript, expectedScript, 'served script must match the tested release');
      await page.addScriptTag({ content: publishedScript });
      await page.getByRole('button', { name: '重新检测', exact: true }).click();
      await page.locator('dialog').waitFor({ state: 'detached' });
      assert.equal(submissions, 0, 'recheck must not silently submit code');
      await page.locator('.btn-submit').click();
    }
    await page.waitForTimeout(300);
    assert.equal(submissions, 1);
    console.log('PASS', platform, 'real page install guard + preserved draft + submission flow');
  } catch (e) { failures++; console.error('FAIL', platform, e.message); }
  finally { await page.close(); }
}
await browser.close(); if (failures) process.exitCode = 1;
