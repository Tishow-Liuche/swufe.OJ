import fs from 'node:fs';
import path from 'node:path';

const helperPath = path.resolve('public/cf-helper.user.js');
const source = fs.readFileSync(helperPath, 'utf8');

const expectations = [
  ['helper version is bumped for login retry fix', /@version\s+7\.3/],
  ['login wait clears stale task state', /markLoginRequired\(\)/],
  ['status page ignores stale submitted state', /isActiveSubmittedState\(loadState\(\)\)/],
  ['script records the helper version in state', /helperVersion:\s*HELPER_VERSION/],
];

const failures = expectations.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error('CF helper checks failed:');
  for (const [name] of failures) console.error(`- ${name}`);
  process.exit(1);
}

console.log('CF helper checks passed');
