import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5195';
const rows = [1, 2, 3, 4, 12].map(rank => ({ rank, username: `contestant${rank}`, nickname: `测试选手 ${rank}`, solvedCount: 128 - rank, submissionCount: 200, acceptRate: 64, overallScore: 123, problemScore: 123, contestScore: 0, localSolvedCount: 20, penalty: 42 }));
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const json = path === '/api/contests' ? [{ id: 'c1', title: '测试比赛', state: 'ENDED' }]
        : path.includes('/standings') ? { contest: { title: '测试比赛', mode: 'ACM' }, rows }
        : path.includes('/leaderboard') ? rows : {};
      return route.fulfill({ json });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const scope of ['global', 'overall', 'contest']) {
      await page.goto(base + '/leaderboard' + (scope === 'contest' ? '?contestId=c1' : ''));
      await page.locator('.board-row').first().waitFor();
      if (scope === 'overall') {
        await page.getByRole('button', { name: '综合排名', exact: true }).click();
        await page.locator('.board-row.overall').first().waitFor();
      }
      assert.equal(await page.locator('.rank-medal').count(), 3);
      assert.equal(await page.locator('.leaderboard-hero p:not(.eyebrow), .rank-switcher small').count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No global horizontal overflow');
      const colors = [];
      for (let i = 0; i < 3; i++) {
        const medal = page.locator('.rank-medal').nth(i);
        const box = await medal.boundingBox();
        const row = await page.locator('.board-row').nth(i).boundingBox();
        assert(box.width >= 30 && box.width <= 36);
        assert(box.y >= row.y && box.y + box.height + 6 <= row.y + row.height, 'Medal and ribbon fit inside row');
        assert.equal(await medal.getAttribute('aria-label'), `第 ${i + 1} 名，${['金', '银', '铜'][i]}牌`);
        colors.push(await medal.evaluate(el => getComputedStyle(el).backgroundImage));
      }
      assert.equal(new Set(colors).size, 3, 'Distinct metal palettes');
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/leaderboard-${scope}-${width}.png`, fullPage: true });
      console.log(`PASS ${scope} ${width}px: no rule copy, three numeric medals, bounded ribbons and no global overflow`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
