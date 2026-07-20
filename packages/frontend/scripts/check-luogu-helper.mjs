import fs from 'node:fs';
import path from 'node:path';

const helperPath = path.resolve('public/luogu-helper.user.js');
const source = fs.readFileSync(helperPath, 'utf8');

const expectations = [
  ['helper version is bumped for login retry fix', /@version\s+1\.4/],
  ['login wait clears stale task state', /markLoginRequired\(\)/],
  ['result reporting requires active state', /isActiveTaskState\(loadState\(\)\)/],
  ['script records helper version in state', /helperVersion:\s*HELPER_VERSION/],
  ['stale record pages do not report results', /No active OJ Luogu submission state/],
];

const failures = expectations.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error('Luogu helper checks failed:');
  for (const [name] of failures) console.error(`- ${name}`);
  process.exit(1);
}

console.log('Luogu helper checks passed');
