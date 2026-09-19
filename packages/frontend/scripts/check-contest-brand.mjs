import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const user = { id: 'u1', username: 'contestant', nickname: '西财同学', role: 'ADMIN', studentId: '42411036' };
const problems = ['序列与区间', '图上的最短路径', '奇点之间'].map((title, i) => ({
  id: 'cp' + i, problemId: 'p' + i, order: i, score: 100,
  problem: { id: 'p' + i, problemNo: 100 + i, title },
}));
const contest = { id: 'brand', contestNo: 42, title: '2026 西财程序设计新生赛', description: '欢迎参加西南财经大学程序设计竞赛。\n请独立完成题目，合理安排比赛时间。祝各位选手比赛顺利！',
  mode: 'ACM', visibility: 'CAMPUS_PRIVATE', createdBy: user.id, state: 'RUNNING', participant: null,
  startTime: new Date(Date.now() - 3600000).toISOString(), endTime: new Date(Date.now() + 7200000).toISOString(),
  penaltyTime: 20, organizer: { name: '西南财经大学 · 程序设计协会' }, problems, _count: { problems: 3, participants: 128 } };
const cells = ['ACCEPTED', 'WRONG_ANSWER', 'PENDING'].map((status, i) => ({
  problemId: 'p' + i, label: String.fromCharCode(65 + i), title: problems[i].problem.title,
  status, attempts: i + 1, wrongAttempts: i, firstBlood: i === 0, acceptedAt: i === 0 ? new Date(Date.now() - 1800000).toISOString() : null,
}));
await context.route('**/api/**', route => {
  const p = new URL(route.request().url()).pathname; let body = {};
  if (p === '/api/auth/refresh') body = { accessToken: 'test-only' };
  else if (p === '/api/user/profile') body = user;
  else if (p === '/api/contests/brand') body = contest;
  else if (p === '/api/contests' || p === '/api/contests/mine') body = [contest];
  else if (p.endsWith('/standings')) body = { contest, problems: cells, rows: [{ userId: user.id, user, rank: 1, solvedCount: 1, penalty: 30, problems: cells }] };
  else if (p.endsWith('/submissions')) body = { items: cells.map((cell, i) => ({ id: 's' + i, user, problem: { ...problems[i].problem, label: cell.label }, status: cell.status, language: 'CPP17', createdAt: new Date().toISOString(), timeUsed: i === 0 ? 42 : null, memoryUsed: i === 0 ? 2048 : null })) };
  return route.fulfill({ json: body });
});
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5179';
try {
  await page.goto(base + '/contests/brand/register');
  await page.locator('.arena-registration').waitFor();
  assert.equal(await page.locator('.arena-highlights > div').count(), 3, 'Hero should show three real contest facts');
  assert.match(await page.locator('.arena-header').evaluate(el => getComputedStyle(el).backgroundImage), /gradient/);
  assert.match(await page.locator('.arena-highlights').innerText(), /180/);
  assert.match(await page.locator('.arena-tabs .router-link-exact-active').evaluate(el => getComputedStyle(el).backgroundImage), /gradient/);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1080 : 900 });
    for (const [tab, selector] of [['register', '.arena-registration'], ['problems', '.arena-problems'], ['standings', '.arena-standings'], ['submissions', '.arena-submissions']]) {
      await page.goto(base + '/contests/brand/' + tab); await page.locator(selector).waitFor();
      if (tab === 'standings') await page.locator('.score-cell').first().waitFor();
      if (tab === 'submissions') await page.locator('.submissions-table tbody tr').first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + '/' + tab + ' overflows');
      assert.equal(await page.locator('.contest-sidebar').count(), 0);
      assert.equal(await page.locator('.arena-tabs a').count(), 4);
      if (process.env.SCREENSHOT_DIR && [1440, 390].includes(width)) await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/contest-brand-' + tab + '-' + width + '.png', fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base + '/contests');
  await page.locator('.overview-card').waitFor();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/contest-brand-list.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: homepage brand hero, real contest facts, selected navigation, four pages at 1440/768/390/320px, no overflow/runtime errors');
} finally { await browser.close(); }
