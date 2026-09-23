import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const extension = process.env.TAMPERMONKEY_PATH;
if (!extension) throw new Error('TAMPERMONKEY_PATH required');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (!['install-oj-helpers.html', 'oj-helpers.user.js'].includes(name)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8');
  res.end(fs.readFileSync(new URL('../public/' + name, import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'swufe-tm-install-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  await context.route('https://www.tampermonkey.net/**', r => r.fulfill({ body: 'Isolated extension test' }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  const dev = page.locator('#devMode'); if (!(await dev.evaluate(e => e.checked))) await dev.click();
  await page.goto('chrome://extensions/?id=' + id);
  const allow = page.locator('#allow-user-scripts cr-toggle');
  if (await allow.count() && !(await allow.evaluate(e => e.checked))) await allow.click();
  await page.goto(base + '/install-oj-helpers.html');
  await page.waitForTimeout(2500);
  await page.locator('#install-all').click();
  let confirmation;
  for (let i = 0; i < 40; i++) {
    confirmation = context.pages().find(p => p.url().startsWith(`chrome-extension://${id}/`) && !p.url().includes('options.html'));
    if (confirmation) break;
    await page.waitForTimeout(250);
  }
  if (!confirmation) console.log('PAGES', context.pages().map(p => p.url()));
  assert(confirmation, 'one click must open the real script-manager installation page');
  const closed = confirmation.waitForEvent('close');
  await confirmation.getByRole('button', { name: '安装', exact: true }).click();
  await closed;
  await page.reload();
  await page.getByRole('button', { name: '检测安装状态', exact: true }).click();
  await page.waitForFunction(() => (document.getElementById('installer-status').textContent.match(/已就绪/g) || []).length === 3);
  console.log('PASS real installation link → one Tampermonkey confirmation → CF/Luogu/QOJ all detected');
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
