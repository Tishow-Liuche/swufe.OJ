import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const counts = { standings: 0, submissions: 0 };
const user = { id: 'u1', username: 'test', nickname: '测试选手', role: 'STUDENT', studentId: '42411036' };
const contest = { id: 'c1', contestNo: 42, title: '校赛赛场验收', description: '比赛说明', mode: 'ACM', visibility: 'CAMPUS_PRIVATE',
  state: 'RUNNING', startTime: '2020-01-01T00:00:00Z', endTime: '2099-01-01T00:00:00Z', penaltyTime: 20,
  participant: null, createdBy: 'teacher', organizer: { name: '赛事组' },
  problems: [{ id: 'cp1', problemId: 'p1', order: 1, problem: { id: 'p1', problemNo: 8, title: '测试题目' } }] };
const cell = { problemId: 'p1', label: 'A', title: '测试题目', status: 'ACCEPTED', firstBlood: true, wrongAttempts: 0, attempts: 1, acceptedAt: '2020-01-01T00:02:00Z', viewableSubmissionId: 's1' };
const board = { contest: { mode: 'ACM', frozen: false }, problems: [{ problemId: 'p1', label: 'A', title: '测试题目' }], rows: [{ userId: 'u1', user, rank: 1, solvedCount: 1, penalty: 2, problems: [cell] }] };
const submission = { id: 's1', user, problem: { id: 'p1', problemNo: 8, label: 'A', title: '测试题目', timeLimit: 1000, memoryLimit: 256 }, createdAt: '2020-01-01T00:02:00Z', status: 'ACCEPTED', language: 'cpp', timeUsed: 3, memoryUsed: 1024, sourceCode: 'int main() { return 0; }' };
await context.route('**/api/**', route => {
  const p = new URL(route.request().url()).pathname;
  let body = {};
  if (p === '/api/auth/refresh') body = { accessToken: 'test-token' };
  else if (p === '/api/user/profile') body = user;
  else if (p === '/api/contests/c1') body = contest;
  else if (p === '/api/contests/c1/register') { contest.participant = { isVirtual: false }; body = { participant: contest.participant }; }
  else if (p === '/api/contests/c1/standings') { counts.standings++; body = board; }
  else if (p === '/api/contests/c1/submissions') {
    counts.submissions++;
    body = { items: new URL(route.request().url()).searchParams.get('mine') === 'true'
      ? [submission] : [submission, { ...submission, id: 's2', user: { id: 'u2', username: 'other-player' } }] };
  }
  else if (p === '/api/contests/c1/submissions/s1') body = submission;
  else if (p === '/api/contests/mine' || p === '/api/contests') body = [contest];
  return route.fulfill({ json: body });
});
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5179';
try {
  await page.goto(base + '/contests/c1');
  await page.locator('.campus-registration').waitFor();
  assert.equal(await page.locator('.contest-sidebar').count(), 0, 'Arena must not have list sidebar');
  assert.equal(new URL(page.url()).pathname, '/contests/c1/register');
  assert.deepEqual(counts, { standings: 0, submissions: 0 }, 'Registration must not fetch live feeds');
  await page.getByLabel('学号', { exact: true }).fill('42411036');
  await page.getByLabel('姓名', { exact: true }).fill('测试同学');
  await page.getByRole('button', { name: '确认报名', exact: true }).click();
  await page.getByText('已报名', { exact: true }).waitFor();
  await page.getByRole('link', { name: '比赛题目', exact: true }).click();
  await page.locator('.arena-problems').waitFor();
  assert.equal(await page.locator('.campus-registration').count(), 0);
  assert.equal(await page.locator('.arena-standings').count(), 0);
  assert.deepEqual(counts, { standings: 0, submissions: 0 });
  await page.getByRole('link', { name: '排名', exact: true }).click();
  await page.locator('.arena-standings .first-blood').first().waitFor();
  assert.equal(counts.submissions, 0);
  await page.locator('.score-cell').first().click();
  await page.getByRole('dialog').getByText('int main() { return 0; }', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭提交详情' }).click();
  await page.getByRole('link', { name: '提交记录', exact: true }).click();
  await page.locator('.arena-submissions').getByText('other-player', { exact: true }).waitFor();
  const mineButton = page.getByRole('button', { name: '仅查看自己的提交', exact: true });
  await Promise.all([
    page.waitForResponse(r => new URL(r.url()).searchParams.get('mine') === 'true'),
    mineButton.click(),
  ]);
  await page.locator('.arena-submissions').getByText('other-player', { exact: true }).waitFor({ state: 'detached' });
  await page.locator('.arena-submissions').getByText('cpp', { exact: true }).waitFor();
  assert.equal(await mineButton.getAttribute('aria-pressed'), 'true');
  await mineButton.click();
  await page.locator('.arena-submissions').getByText('other-player', { exact: true }).waitFor();
  assert.equal(await page.locator('.arena-standings').count(), 0);
  await page.reload(); await page.locator('.arena-submissions').getByText('cpp', { exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/contests/c1/submissions');
  await page.goBack(); await page.locator('.arena-standings').waitFor();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/contest-arena-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/contest-arena-mobile.png' });
  contest.participant = null;
  const previousCounts = { ...counts };
  await page.goto(base + '/contests/c1/standings');
  await page.getByText('该比赛的排名仅限参赛者查看，请先报名。').waitFor();
  await page.getByRole('link', { name: '提交记录', exact: true }).click();
  await page.getByText('该比赛的提交记录仅限参赛者查看，请先报名。').waitFor();
  assert.deepEqual(counts, previousCounts, 'Unauthorized private viewers must not request feeds');
  contest.state = 'ENDED'; contest.allowUpsolve = true; contest.createdBy = user.id;
  await page.goto(base + '/contests/c1/register');
  await page.getByRole('button', { name: '开始虚拟比赛' }).waitFor();
  contest.participant = { isVirtual: false };
  await page.reload(); await page.getByText('已报名', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '开始虚拟比赛' }).count(), 0, 'Do not offer virtual re-entry to existing participants');
  assert.deepEqual(errors, []);
  console.log('PASS: four independent contest pages, registration, no sidebar, route reload/back, only active feed requests, first AC/source detail, responsive layout');
} catch(e) { console.error('PAGE', page.url(), 'ERRORS', errors, (await page.locator('body').innerText()).slice(0,1200)); throw e; }
finally { await browser.close(); }
