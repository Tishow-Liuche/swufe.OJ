import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync(new URL('../public/luogu-helper.user.js', import.meta.url), 'utf8');
// Expose existing closure functions in the test only; production has no test API.
const instrumented = source.replace('if (!shouldActivateHelper()) return;', 'window.helperTest = { chooseLanguage, startSubmitFlow }; return;');
const browser = await chromium.launch({ channel: 'chromium' });
let failures = 0;
async function test(name, run) {
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
  await page.goto('https://www.luogu.com.cn/problem/P1000#submit');
  await page.evaluate(() => {
    const values = {}; window.requests = []; window.clicks = 0;
    window.GM_getValue = (key, fallback) => values[key] ?? fallback;
    window.GM_setValue = (key, value) => values[key] = value;
    window.GM_deleteValue = key => delete values[key];
    window.GM_xmlhttpRequest = request => {
      window.requests.push(JSON.parse(request.data || '{}'));
      const data = request.url.includes('/lookup') ? { submissionId: '1', token: 'token', sourceCode: 'int main() {}', language: 'cpp' } : { leaseNonce: 'lease' };
      request.onload({ status: 200, responseText: JSON.stringify(data) });
    };
  });
  await page.addScriptTag({ content: instrumented });
  try { await run(page); console.log('PASS', name); }
  catch (error) { failures++; console.error('FAIL', name, error.message); }
  finally { await page.close(); }
}
const native = '<select aria-label="Language"><option value="c">C (GCC)</option><option value="cpp">C++14 (GCC)</option></select>';
// Public Columba 20260919-2271 LCombo render structure: caption + teleported dropdown.
// Inspected read-only 2026-09-21:
// https://fecdn.luogu.com.cn/columba/loader.20260919-2271.js (LCombo)
// https://fecdn.luogu.com.cn/columba/columba~2900b6145d38e342.js (submit panel)
// The authenticated submit DOM itself is not accessible without login.
await test('current Luogu LCombo selects from its teleported dropdown', async page => {
  await page.setContent('<div id="app"><div class="combo-wrapper lang-select" data-v-dbc33c63><div class="text">C</div><span class="arrow"></span><div class="ruler"></div></div><div class="dropdown" data-v-dbc33c63 style="display:none"><ul><li>C</li><li>C++14 (GCC 9)</li></ul></div><div class="dropdown" data-v-other><ul><li>C++ tutorial</li></ul></div></div>');
  await page.evaluate(() => {
    const wrapper = document.querySelector('.combo-wrapper'); const menu = document.querySelector('.dropdown');
    wrapper.onclick = () => { wrapper.classList.add('shown'); menu.style.display = 'block'; };
    menu.querySelectorAll('li').forEach(li => li.onclick = () => { menu.style.display = 'none'; wrapper.classList.remove('shown'); queueMicrotask(() => wrapper.querySelector('.text').textContent = li.textContent); });
  });
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), false);
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), true);
  assert.equal(await page.locator('.combo-wrapper .text').innerText(), 'C++14 (GCC 9)');
});
await test('custom dropdown ignores aggregate ancestor and unrelated C++ prose', async page => {
  await page.setContent('<div>C++ tutorial <div class="language"><button role="combobox" aria-label="Language" aria-controls="langs">C (GCC)</button><div id="langs" role="listbox" hidden><div role="option">C (GCC)</div><div role="option">C++14 (GCC)</div></div></div></div>');
  await page.evaluate(() => {
    const trigger = document.querySelector('[role=combobox]');
    trigger.onclick = () => document.querySelector('[role=listbox]').hidden = false;
    document.querySelectorAll('[role=option]').forEach(option => option.onclick = () => setTimeout(() => { trigger.textContent = option.textContent; document.querySelector('[role=listbox]').hidden = true; }, 30));
  });
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), false, 'click alone must not count as confirmed selection');
  await page.waitForTimeout(80);
  assert.match(await page.locator('[role=combobox]').innerText(), /^C\+\+/);
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), true);
});
await test('native C does not select a GCC C++ option', async page => {
  await page.setContent('<select aria-label="Language"><option>C++14 (GCC)</option><option>C (GCC)</option></select>');
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('c')), true);
  assert.equal(await page.locator('select').inputValue(), 'C (GCC)');
});
await test('unknown language fails closed', async page => {
  await page.setContent(native);
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('rust')), false);
});
await test('missing language control never submits and reports mismatch', async page => {
  await page.setContent('<a href="/user/1">user</a><textarea></textarea><button>提交</button><div>C++</div>');
  await page.evaluate(() => { document.querySelector('button').onclick = () => window.clicks++; const original = window.setTimeout; window.setTimeout = (fn, ms) => original(fn, ms === 1000 ? 1 : ms); helperTest.startSubmitFlow(); });
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.clicks), 0);
  assert.equal(await page.evaluate(() => requests.some(r => r.failureCode === 'LANGUAGE_MISMATCH')), true);
});
await test('selection reset during deferred submit never clicks or marks submitted', async page => {
  await page.setContent('<a href="/user/1">user</a><textarea></textarea>' + native + '<button>提交</button>');
  await page.evaluate(() => { document.querySelector('button').onclick = () => window.clicks++; helperTest.startSubmitFlow(); setTimeout(() => document.querySelector('select').value = 'c', 100); });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.clicks), 0);
  assert.equal(await page.evaluate(() => GM_getValue('swufe_luogu_submit_once_1', '')), '');
  assert.equal(await page.evaluate(() => requests.some(r => r.failureCode === 'LANGUAGE_MISMATCH')), true);
});
await test('verified native selection submits once', async page => {
  await page.setContent('<a href="/user/1">user</a><textarea></textarea>' + native + '<button>提交</button>');
  await page.evaluate(() => { document.querySelector('button').onclick = () => window.clicks++; helperTest.startSubmitFlow(); });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.clicks), 1);
  assert.equal(await page.locator('select').inputValue(), 'cpp');
});
await test('submit navigation and code tabs are not the judge button', async page => {
  await page.setContent('<a href="/user/1">user</a><a href="#submit">提交</a><button>提交代码</button><textarea></textarea>' + native + '<button id="judge">提交评测</button>');
  await page.evaluate(() => { document.querySelector('#judge').onclick = () => window.clicks++; helperTest.startSubmitFlow(); });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.clicks), 1);
});
await test('Clang C is not accepted for C++ and JavaScript is not Java', async page => {
  await page.setContent('<select><option>C (Clang)</option><option>JavaScript</option></select>');
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), false);
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('java')), false);
});
await test('multiple visible language controls fail closed', async page => {
  await page.setContent(native + native);
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), false);
});
await test('a clickable option that does not update the selection is not success', async page => {
  await page.setContent('<button role="combobox" aria-label="Language" aria-controls="menu">C</button><ul id="menu"><li role="option">C++14</li></ul>');
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), false);
});
await test('hidden controls and disabled options cannot override selection', async page => {
  await page.setContent('<div hidden>' + native + '</div><select><option>C</option><option disabled>C++14</option></select>');
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('cpp')), false);
});
await test('Python and Java select their own native options', async page => {
  await page.setContent('<select><option>C</option><option>PyPy 3</option><option>JavaScript</option><option>Java 21</option></select>');
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('python')), true);
  assert.equal(await page.locator('select').inputValue(), 'PyPy 3');
  assert.equal(await page.evaluate(() => helperTest.chooseLanguage('java')), true);
  assert.equal(await page.locator('select').inputValue(), 'Java 21');
});
await browser.close();
if (failures) process.exitCode = 1;
