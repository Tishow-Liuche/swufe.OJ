// Uses a real, unpacked Tampermonkey extension in a fresh disposable profile.
// Does not open or modify the user's browser profile, cookies, or scripts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const extension = process.env.TAMPERMONKEY_PATH;
if (!extension || !fs.existsSync(path.join(extension, 'manifest.json'))) throw new Error('TAMPERMONKEY_PATH must point to an unpacked Tampermonkey extension');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'swufe-tm-presence-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
let failures = 0;
try {
  await context.route('https://www.tampermonkey.net/**', r => r.fulfill({ body: 'Isolated extension test' }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).hostname;
  const editor = await context.newPage();
  await editor.goto('chrome://extensions/');
  const dev = editor.locator('#devMode'); if (!(await dev.evaluate(e => e.checked))) await dev.click();
  await editor.goto('chrome://extensions/?id=' + extensionId);
  const allow = editor.locator('#allow-user-scripts cr-toggle');
  if (await allow.count() && !(await allow.evaluate(e => e.checked))) await allow.click();
  const files = process.env.HELPER_TEST_FILES?.split(',') || ['cf-helper.user.js', 'luogu-helper.user.js', 'qoj-helper.user.js'];
  for (const file of files) {
    const source = fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');
    await editor.goto(`chrome-extension://${extensionId}/options.html#nav=new-user-script`);
    await editor.locator('.CodeMirror').waitFor();
    await editor.locator('.CodeMirror').evaluate((el, text) => el.CodeMirror.setValue(text), source);
    await editor.locator('.CodeMirror').click(); await editor.keyboard.press('Control+s');
    await editor.waitForURL(/nav=dashboard/);
  }
  const page = await context.newPage();
  await page.route('https://test.singularitylab.online/presence-regression', r => r.fulfill({ contentType: 'text/html', body: '<html><body>SWUFE helper regression</body></html>' }));
  await page.goto('https://test.singularitylab.online/presence-regression');
  // Wait for actual extension script injection, not addScriptTag/page.evaluate.
  await page.waitForTimeout(1200);
  for (const platform of ['CODEFORCES', 'LUOGU', 'QOJ']) {
    const replies = await page.evaluate(platform => new Promise(resolve => {
      const requestId = crypto.randomUUID(); const messages = [];
      const receive = e => { if (e.source === window && e.origin === location.origin && e.data?.type === 'SWUFE_HELPER_PONG' && e.data.requestId === requestId && e.data.platform === platform) messages.push(e.data); };
      window.addEventListener('message', receive);
      window.postMessage({ type: 'SWUFE_HELPER_PING', platform, requestId }, location.origin);
      setTimeout(() => { window.removeEventListener('message', receive); resolve(messages); }, 1200);
    }), platform);
    try { assert.equal(replies.length, 1); console.log('PASS real Tampermonkey sandbox:', platform, replies[0].version); }
    catch (e) { failures++; console.error('FAIL real Tampermonkey sandbox:', platform, e.message); }
  }
} finally { await context.close(); }
if (failures) process.exitCode = 1;
