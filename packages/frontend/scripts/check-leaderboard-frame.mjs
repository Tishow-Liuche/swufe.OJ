import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../src/views/Leaderboard.vue'), 'utf8');

const forbidden = [
  "scope === 'CLASS'",
  "switchScope('CLASS')",
  '/api/contests/classes/',
  '班级',
  'CLASS',
];

for (const token of forbidden) {
  if (source.includes(token)) {
    throw new Error(`Leaderboard should not expose class ranking token: ${token}`);
  }
}

for (const token of ['GLOBAL', 'CONTEST', 'OVERALL', '全站过题数排名', '比赛排名', '综合排名']) {
  if (!source.includes(token)) {
    throw new Error(`Leaderboard frame is missing required token: ${token}`);
  }
}

console.log('Leaderboard frame check passed');
