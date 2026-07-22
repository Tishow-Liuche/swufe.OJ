import { readFileSync } from 'node:fs';

const history = readFileSync(new URL('../src/views/admin/ProblemHistory.vue', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/views/ProblemDetail.vue', import.meta.url), 'utf8');
const createProblem = readFileSync(new URL('../src/views/admin/CreateProblem.vue', import.meta.url), 'utf8');
const editProblem = readFileSync(new URL('../src/views/admin/EditProblem.vue', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exitCode = 1;
  }
}

assert(
  history.includes('verifyProblem') && history.includes("query: { preview: '1' }") && history.includes('验题'),
  'Problem history must provide a verify-answer entry for contest reserved problems.',
);
assert(
  detail.includes('isAuthorPreview') && detail.includes('/api/problems/mine/created/') && detail.includes('/api/submissions/preview'),
  'Problem detail must load and submit contest reserved previews through authenticated preview endpoints.',
);
assert(
  detail.includes('preview-banner') && detail.includes('比赛预备题验题模式'),
  'Problem detail must clearly mark contest reserved preview mode.',
);
assert(
  createProblem.includes("preview: '1'") && editProblem.includes("preview: '1'"),
  'Create/Edit problem flows must open non-published local problems in preview mode.',
);

if (!process.exitCode) console.log('Contest reserved preview check passed');
