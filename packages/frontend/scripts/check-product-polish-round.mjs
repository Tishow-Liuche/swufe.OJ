import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relativePath) {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exitCode = 1;
  }
}

const installer = read('public/install-oj-helpers.html');
const community = read('src/views/CommunityHub.vue');
const problemDetail = read('src/views/ProblemDetail.vue');
const contests = read('src/views/Contests.vue');
const createProblem = read('src/views/admin/CreateProblem.vue');
const editProblem = read('src/views/admin/EditProblem.vue');
const problemList = read('src/views/ProblemList.vue');

assert(installer.includes('installAllHelpers') && installer.includes('installer-status'), 'One-click helper installer must expose a single install-all button with progress status.');
assert(installer.includes('一键安装三个脚本') || installer.includes('Install all three helpers'), 'Unified helper installer must label the primary action as installing all three helpers.');

assert(community.includes('editingAnnouncementId') && community.includes('deleteAnnouncement'), 'Announcements must support owner/moderator edit and one-click delete in the community UI.');
assert(community.includes('editingPostId') && community.includes('deletePost'), 'Posts/solutions/discussions must support owner/moderator edit and one-click delete in the community UI.');
assert(community.includes('editingReplyId') && community.includes('deleteReply'), 'Discussion replies must support owner/moderator edit and one-click delete in the community UI.');

assert(problemDetail.includes('problemSubmissions') && problemDetail.includes('loadProblemSubmissions'), 'Problem detail must load submissions scoped to the current problem.');
assert(problemDetail.includes('selectedSubmission') && problemDetail.includes('sourceCode'), 'Problem detail must show clicked submission source code.');

assert(contests.includes('openContestAcceptedSubmission') && contests.includes('viewableSubmissionId'), 'Contest standings accepted cells must open the accepted submission detail after contest end.');
assert(contests.includes('selectedSubmissionDetail') && contests.includes('sourceCode'), 'Contest standings/submission feed must render source code and metrics in a detail dialog.');

assert(createProblem.includes('insertImageIntoDescription') && createProblem.includes('insertImageIntoSample'), 'CreateProblem must support image insertion into statement and sample areas.');
assert(editProblem.includes('insertImageIntoDescription') && editProblem.includes('insertImageAfterSamples'), 'EditProblem must support image insertion into statement and after samples.');
assert(createProblem.includes('/api/problems/images/upload') && editProblem.includes('/api/problems/images/upload'), 'Problem authoring image insertion must upload through the problem image endpoint.');

assert(problemList.includes('showTagDialog') && problemList.includes('tag-dialog-panel'), 'Problem tag filtering must use a quarter-page dialog for all tags.');
assert(!problemList.includes('tag-select"') || problemList.includes('openTagDialog'), 'Problem tag filtering must not rely on the old oversized tag dropdown.');

assert(contests.includes('freezeMode') && contests.includes('NO_FREEZE'), 'Contest creator must provide an explicit no-freeze option.');

if (!process.exitCode) console.log('Product polish round checks passed');
