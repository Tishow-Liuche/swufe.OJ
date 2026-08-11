import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../src/views/Contests.vue'), 'utf8');
const detailSource = readFileSync(resolve(__dirname, '../src/views/ProblemDetail.vue'), 'utf8');

if (!source.includes("'/api/problems/mine/created'")) {
  throw new Error('Contest creator must load problems from the authored problem history endpoint.');
}

if (!source.includes("status: 'CONTEST_RESERVED'")) {
  throw new Error('Contest creator must request only CONTEST_RESERVED problems.');
}

if (source.includes("api.get('/api/problems', { params: { page: 1, pageSize: 100 } })")) {
  throw new Error('Contest creator must not load selectable problems from the public problem list.');
}

if (!source.includes('padding:76px 20px 28px') && !source.includes('padding: 76px 20px 28px')) {
  throw new Error('Contest creator backdrop must reserve space for the fixed top menu.');
}

if (!source.includes('max-height:calc(100vh - 104px)') && !source.includes('max-height: calc(100vh - 104px)')) {
  throw new Error('Contest creator modal height must account for the top menu safe area.');
}

if (!detailSource.includes('`/api/contests/${contestId.value}/problems/${route.params.id}`')) {
  throw new Error('Contest problem details must be loaded through the contest-scoped endpoint.');
}

if (
  !detailSource.includes('`/api/contests/${contestId.value}/submit`')
  || !detailSource.includes("isAuthorPreview.value ? '/api/submissions/preview' : '/api/submissions'")
) {
  throw new Error('Contest problem submissions must keep contest-scoped submit and use preview submit only for authored reserved problems.');
}

if (!detailSource.includes('auth.token && !contestId.value && !isAuthorPreview.value')) {
  throw new Error('Contest problem pages must not load regular learning state for reserved problems.');
}

console.log('Contest creator check passed');
