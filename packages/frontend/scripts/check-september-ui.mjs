import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const profile = { id: 'ui-test', username: 'ui-test', nickname: '界面验证', role: 'STUDENT', studentId: '42411036', gender: 'FEMALE', email: 'test@example.invalid' };
const problem = { id: 'p1', problemNo: 1, title: '验证题目', difficulty: 'POINT_1', source: 'REMOTE', tags: [{ name: 'Constructive Algorithms' }], sourceInfo: { platform: 'CODEFORCES', remoteProblemId: '4A' }, _count: { submissions: 1 } };
const contest = { id: 'campus-ui', title: '校赛验证', contestNo: 1, mode: 'ACM', visibility: 'CAMPUS_PRIVATE', state: 'UPCOMING', startTime: '2099-01-01T00:00:00Z', endTime: '2099-01-02T00:00:00Z', problems: [], participant: null, _count: { problems: 2, participants: 0 }, organizer: { name: '赛事组' } };
await context.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  let body = {};
  if (path === '/api/auth/refresh') body = { accessToken: 'ui-test-only' };
  else if (path === '/api/user/profile') {
    if (route.request().method() === 'PATCH') Object.assign(profile, route.request().postDataJSON());
    body = profile;
  }
  else if (path === '/api/user/settings') body = { profile, externalAccounts: [], awards: [] };
  else if (path === '/api/user/stats') body = { heatmap: [], recentSubmissions: [], difficultyDistribution: [] };
  else if (path === '/api/user/accepted-problems') body = { items: [{ problem, problemId: 'p1', contestId: 'campus-ui', source: 'LOCAL' }] };
  else if (path === '/api/auth/password-recovery') body = { enabled: false };
  else if (path === '/api/problems/metadata') body = { total: 1, tags: [{ name: 'Constructive Algorithms', count: 1 }, { name: 'CSP-J 入门级', count: 1 }, ...Array.from({ length: 50 }, (_, i) => ({ name: '测试标签' + i, count: 1 }))], difficulties: [], sources: [] };
  else if (path === '/api/problems') body = { items: [problem], total: 1 };
  else if (path === '/api/problems/mine/created') body = { items: [problem, { ...problem, id: 'p2', problemNo: 2, title: '第二题' }] };
  else if (path === '/api/contests' || path === '/api/contests/mine') body = [contest];
  else if (path === '/api/contests/campus-ui') body = contest;
  else if (path === '/api/stats') body = { problemCount: 26987, submissionCount: 123456, userCount: 500 };
  else if (path === '/api/leaderboard') body = [{ id: profile.id, username: profile.username, nickname: profile.nickname, solvedCount: 42, submissionCount: 66 }];
  else if (path.endsWith('/standings')) body = { rows: [], problems: [] };
  else if (path.endsWith('/submissions')) body = { items: [] };
  else if (path.includes('notifications')) body = { items: [], unreadCount: 0 };
  return route.fulfill({ json: body });
});
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5179';
try {
  await page.goto(base + '/forgot-password');
  await page.getByText('短信服务尚未开通，请联系平台管理员协助重置密码。').waitFor();
  assert.equal(await page.getByRole('button', { name: '获取验证码' }).isDisabled(), true);
  await page.goto(base + '/problems');
  const link = page.locator('a[href="/problems/p1"]').first();
  await link.waitFor(); assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.innerText(), /T1/);
  await page.locator('.tag-dialog-trigger').click();
  assert((await page.locator('.tag-cloud button').count()) <= 9, 'Opening all tags must not expand the sidebar');
  await page.getByRole('dialog').getByText('非专业级软件能力认证入门级', { exact: true }).waitFor();
  await page.getByRole('dialog').locator('input').fill('constructive');
  await page.getByRole('dialog').getByText('构造', { exact: true }).click();
  await page.waitForURL(/tag=Constructive/);
  await page.goto(base + '/contests/campus-ui');
  await page.locator('.campus-registration').waitFor();
  assert.match(await page.locator('.campus-registration').innerText(), /学号.*姓名/s);
  await page.reload(); await page.locator('.campus-registration').waitFor();
  await page.goto(base + '/profile');
  await page.getByRole('button', { name: '已通过题目', exact: true }).click();
  const accepted = page.locator('.accepted-row').first();
  await accepted.waitFor(); assert.match(await accepted.getAttribute('href'), /problems\/p1\?contestId=campus-ui/);
  assert.match(await accepted.innerText(), /T1/);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('select').filter({ has: page.locator('option[value="FEMALE"]') }).waitFor();
  for (const role of ['STUDENT', 'TEACHER', 'ADMIN']) {
    profile.role = role; profile.studentId = '';
    await page.goto(base + '/profile');
    await page.getByRole('button', { name: '绑定学号', exact: true }).click();
    await page.getByPlaceholder('绑定 8 位数字学号').fill('42411036');
    await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/user/profile') && r.request().method() === 'GET'),
      page.getByRole('button', { name: '保存基础资料', exact: true }).click(),
    ]);
    await page.reload();
    await page.getByRole('button', { name: '修改学号', exact: true }).waitFor();
    assert.match(await page.locator('.student-id-pill').innerText(), /42411036/);
  }
  await page.goto(base + '/contests');
  for (const selector of ['.overview-card', '.contest-card']) {
    const popupPromise = page.waitForEvent('popup');
    await page.locator(selector).first().click();
    const popup = await popupPromise;
    await popup.waitForURL('**/contests/campus-ui/register');
    await popup.locator('.campus-registration').waitFor();
    assert.equal(new URL(page.url()).pathname, '/contests');
    await popup.close();
  }
  profile.role = 'TEACHER';
  await page.goto(base + '/contests');
  await page.locator('.overview-meta').getByText('校赛私有赛', { exact: true }).waitFor();
  await page.getByRole('button', { name: '＋ 创建比赛', exact: true }).click();
  await page.locator('.picker label').nth(0).click();
  await page.locator('.picker label').nth(1).click();
  await page.locator('.problem-order li').nth(1).getByRole('button', { name: '上移' }).click();
  assert.match(await page.locator('.problem-order li').first().innerText(), /T2/);
  await page.locator('select').filter({ has: page.locator('option[value="CAMPUS_PRIVATE"]') }).selectOption('CAMPUS_PRIVATE');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/forgot-password');
  await page.locator('.recovery-card').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, selector] of [['/', '.hero-title'], ['/leaderboard', '.rank-switcher'], ['/profile', '.student-id-action']]) {
      await page.goto(base + path); await page.locator(selector).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + ' must fit viewport');
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/restrained-' + (path.slice(1) || 'home') + '-' + width + '.png' });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: disabled SMS, translated searchable tags, new-tab T-number problem links, campus deep-link/reload, accepted contest links, gender setting, contest type and problem reorder, mobile layout, no runtime errors');
} catch (error) {
  console.error('PAGE', page.url(), 'ERRORS', errors, 'TEXT', (await page.locator('body').innerText()).slice(0,2000));
  throw error;
} finally { await browser.close(); }
