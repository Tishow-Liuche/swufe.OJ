import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/App.vue'), 'utf8');

const expectations = [
  ['App startup attempts to restore an HttpOnly-Cookie backed session', /auth\.restoreSession\(\)/],
  ['Session restore runs during app mount, not only protected-route navigation', /onMounted\(\s*\(\)\s*=>\s*{[\s\S]*auth\.restoreSession\(\)/],
  ['Session restore is intentionally fire-and-forget on public pages', /void\s+auth\.restoreSession\(\)/],
];

const failures = expectations.filter(([, pattern]) => !pattern.test(source));

if (failures.length) {
  for (const [message] of failures) console.error(`Missing: ${message}`);
  process.exit(1);
}

console.log('Auth session restore checks passed');
