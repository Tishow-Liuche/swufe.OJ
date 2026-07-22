import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contests = readFileSync(resolve(__dirname, '../src/views/Contests.vue'), 'utf8');
const leaderboard = readFileSync(resolve(__dirname, '../src/views/Leaderboard.vue'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exitCode = 1;
  }
}

assert(
  leaderboard.includes("filter((item: any) => item.state === 'ENDED')"),
  'Leaderboard contest picker must only show ended contests.',
);
assert(
  contests.includes('/submissions') && contests.includes('contestSubmissions'),
  'Contest page must load and render live contest submission records.',
);
assert(
  contests.includes('standingsProblems') && contests.includes('.score-cell.first-blood'),
  'Contest page must render ICPC-style per-problem standing cells with first blood styling.',
);
assert(
  contests.includes('cellClass') && contests.includes('cellText'),
  'Contest page must compute accepted/wrong/pending cell classes and text.',
);
assert(
  contests.includes('boardStats') && contests.includes('rank-legend') && contests.includes('board-summary'),
  'Contest live board must include contest-style summary stats and a color legend.',
);
assert(
  contests.includes('submission-head') && contests.includes('submission-status.system_error'),
  'Contest submission feed must render a table header and cover system error styling.',
);
assert(
  contests.includes('.score-cell.first-blood::after') && contests.includes('FB'),
  'Contest live board must visually mark first blood cells.',
);

if (!process.exitCode) console.log('Contest live board check passed');
