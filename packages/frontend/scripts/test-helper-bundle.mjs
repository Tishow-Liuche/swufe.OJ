import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const publicDir = new URL('../public/', import.meta.url);
test('one-click install is one direct bundle link, not a timer popup loop', () => {
  const html = fs.readFileSync(new URL('install-oj-helpers.html', publicDir), 'utf8');
  assert.match(html, /<a[^>]+id="install-all"[^>]+href="\/oj-helpers\.user\.js\?v=1\.0"/);
  assert.doesNotMatch(html, /window\.open\(/);
  assert.match(html, /停用.*独立脚本/);
});
test('bundle contains current standalone code and all metadata matches', () => {
  const bundle = fs.readFileSync(new URL('oj-helpers.user.js', publicDir), 'utf8');
  new vm.Script(bundle);
  for (const file of ['cf-helper.user.js', 'luogu-helper.user.js', 'qoj-helper.user.js']) {
    const source = fs.readFileSync(new URL(file, publicDir), 'utf8').replace(/\r\n/g, '\n');
    const code = source.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '').trim();
    assert(bundle.includes(code), file + ' must not drift from standalone implementation');
    for (const match of source.matchAll(/^\/\/ @match\s+(.+)$/gm)) assert(bundle.includes('// @match        ' + match[1].trim()));
  }
});
test('bundle dispatches only the current external platform', () => {
  const bundle = fs.readFileSync(new URL('oj-helpers.user.js', publicDir), 'utf8');
  // Replace generated source regions, not the real dispatch conditions.
  const dispatched = bundle.replace(/\/\* BEGIN (CODEFORCES|LUOGU|QOJ) \*\/[\s\S]*?\/\* END \1 \*\//g,
    (_, platform) => `calls.push('${platform}');`);
  for (const [hostname, expected] of [
    ['codeforces.com', ['CODEFORCES']], ['www.codeforces.com', ['CODEFORCES']],
    ['www.luogu.com.cn', ['LUOGU']], ['luogu.com.cn', ['LUOGU']], ['qoj.ac', ['QOJ']],
    ['test.singularitylab.online', ['CODEFORCES', 'LUOGU', 'QOJ']], ['evil.example', []],
  ]) {
    const calls = []; vm.runInNewContext(dispatched, { location: { hostname }, calls });
    assert.deepEqual(calls, expected, hostname);
  }
});
test('each platform retains its own API base inside shared bundle storage', () => {
  const bundle = fs.readFileSync(new URL('oj-helpers.user.js', publicDir), 'utf8');
  const keys = [...bundle.matchAll(/var API_BASE_KEY = '([^']+)'/g)].map(m => m[1]);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3, 'one platform must not overwrite another platform callback API');
});
