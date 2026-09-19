import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const context = await browser.newContext();
  let profiles = 0;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64');
  await context.route('**/avatar-test/*', route => route.request().url().endsWith('expired.png')
    ? route.fulfill({ status: 403, body: 'Expired' })
    : route.fulfill({ contentType: 'image/png', body: png }));
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/auth/refresh') body = { accessToken: 'test-only' };
    if (path === '/api/user/profile') {
      profiles++;
      body = { id: 'u1', username: 'alice', role: 'STUDENT', avatar: '/avatar-test/' + (profiles === 1 ? 'expired.png' : 'fresh.png') };
    }
    return route.fulfill({ json: body });
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.UI_BASE_URL || 'http://127.0.0.1:5181') + '/');
  await page.waitForFunction(() => {
    const img = document.querySelector('.header-avatar-link img');
    return img?.naturalWidth > 0;
  }, { }, { timeout: 8000 });
  assert.equal(profiles, 2, 'exactly one recovery fetch');
  assert.equal(await page.locator('.header-avatar-link img').getAttribute('src'), '/avatar-test/fresh.png');
  assert.deepEqual(errors, []);
  console.log('PASS: expired avatar recovers to a decoded image in header, one recovery fetch, session retained.');
} finally { await browser.close(); }
