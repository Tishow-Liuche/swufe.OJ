import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
let failures = 0;
for (const [file, platform] of [['cf-helper.user.js', 'CODEFORCES'], ['luogu-helper.user.js', 'LUOGU'], ['qoj-helper.user.js', 'QOJ']]) {
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ body: '<html><body>OJ</body></html>', contentType: 'text/html' }));
  await page.goto('https://test.singularitylab.online/problems/p1');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => {
    window.replies = []; window.gmCalls = 0;
    window.GM_getValue = (_, d) => { window.gmCalls++; return d; };
    window.GM_setValue = window.GM_xmlhttpRequest = () => { window.gmCalls++; };
    window.addEventListener('message', e => { if (e.data?.type === 'SWUFE_HELPER_PONG') window.replies.push(e.data); });
  });
  try {
    await page.addScriptTag({ content: fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8') });
    await page.evaluate(platform => {
      window.postMessage({ type: 'SWUFE_HELPER_PING', platform: 'OTHER', requestId: 'wrong' }, location.origin);
      window.postMessage({ type: 'SWUFE_HELPER_PING', platform, requestId: 'test-1' }, location.origin);
    }, platform);
    await page.waitForTimeout(80);
    const replies = await page.evaluate(() => window.replies);
    assert.equal(replies.length, 1); assert.equal(replies[0].platform, platform);
    assert.equal(replies[0].requestId, 'test-1'); assert.match(replies[0].version, /^\d+\.\d+$/);
    assert.equal(await page.evaluate(() => window.gmCalls), 0);
    assert.equal(await page.locator('[id*="helper-banner"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS', file, 'scoped presence response without submission side effects');
  } catch (e) { failures++; console.error('FAIL', file, e.message); }
  await page.close();
}
await browser.close();
if (failures) process.exitCode = 1;
