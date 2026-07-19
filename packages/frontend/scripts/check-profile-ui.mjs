import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../src/views/Profile.vue'), 'utf8');
const appSource = readFileSync(resolve(__dirname, '../src/App.vue'), 'utf8');

for (const token of ['profile-hero', '学习概览', '难度分布', '账号设置', 'ICPC / CCPC 奖项认定']) {
  if (!source.includes(token)) {
    throw new Error(`Profile UI is missing required token: ${token}`);
  }
}

for (const token of [
  'align-items: start;',
  'align-self: start;',
  'grid-template-columns: 72px minmax(0, 1fr) 84px 120px;',
  'grid-template-columns: 106px minmax(0, 1fr) 96px 120px;',
  'box-sizing: border-box;',
  'white-space: nowrap;',
  "REMOTE_ERROR: 'RMR'",
  "REMOTE_REEOR: 'RMR'",
  'syncCodeforcesAccepted',
  '/api/user/external-accounts/codeforces/sync',
  '同步 CF 通过记录',
  'loadAcceptedProblems',
  '/api/user/accepted-problems',
  '已通过题目',
  'accepted-list',
  'avatar-settings-card',
  'avatar-input',
  '/api/user/avatar',
  'uploadAvatar',
]) {
  if (!source.includes(token)) {
    throw new Error(`Profile UI is missing required token: ${token}`);
  }
}

for (const token of [
  '<div class="panel-title"><h2>鏈€杩戞彁浜?/h2><button class="text-btn" @click="loadAllSubmissions">鏌ョ湅鍏ㄩ儴</button></div>',
  '<div class="panel-title"><h2>最近提交</h2><button class="text-btn" @click="loadAllSubmissions">查看全部</button></div>',
]) {
  if (source.includes(token)) {
    throw new Error(`Profile overview recent submissions should not include 查看全部 button: ${token}`);
  }
}

for (const token of [
  "import UserAvatar from './components/UserAvatar.vue';",
  'class="header-avatar-link"',
  ':avatar="auth.user?.avatar"',
]) {
  if (!appSource.includes(token)) {
    throw new Error(`App header is missing persistent avatar token: ${token}`);
  }
}

for (const selector of [
  'tab-nav',
  'panel-title',
  'heatmap-body',
  'heat-week',
  'heat-week i',
  'heatmap-track',
  'difficulty-bars',
  'difficulty-row',
  'difficulty-row span',
  'difficulty-row div',
  'difficulty-row i',
  'difficulty-row b',
  'status-dot',
  'inline-actions',
  'secondary-btn',
  'icon-btn',
  'profile-panel label',
  'award-form label.full',
]) {
  const selectorPattern = new RegExp(`\\.${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*(?:,|\\{)`);
  if (!selectorPattern.test(source)) {
    throw new Error(`Profile UI style is missing required selector: .${selector}`);
  }
}

for (const token of [
  '.heatmap-panel {\n  overflow-x: auto;',
  '.heatmap-wrapper {\n  width: 100%;\n  overflow-x: auto;',
  'width: max-content;',
  'min-width: 810px;',
  'min-width: 837px;',
  'grid-template-columns: repeat(54, 15px);',
]) {
  if (source.includes(token)) {
    throw new Error(`Profile heatmap should fit without horizontal scrolling or fixed wide layout: ${token}`);
  }
}

for (const token of [
  '--heatmap-week-count:',
  '--heatmap-cell-size:',
  '--heatmap-cell-gap:',
  'grid-template-columns: var(--heatmap-weekday-width) repeat(var(--heatmap-week-count), minmax(0, 1fr));',
  'grid-column: 2 / -1;',
  'grid-template-columns: repeat(var(--heatmap-week-count), minmax(0, 1fr));',
  ':style="{ \'--heatmap-week-count\': heatmapWeeks.length }"',
]) {
  if (!source.includes(token)) {
    throw new Error(`Profile heatmap is missing fit-to-panel layout token: ${token}`);
  }
}

for (const token of ['语言分布', 'languageDist', 'success-msg', 'settingsMessage', 'Codeforces 同步完成', 'sync-summary', '鏂', '瀵', '鐮', '鐢', '淇', '濂', '鍒', '鍔', '澶', '辫', '触']) {
  if (source.includes(token)) {
    throw new Error(`Profile UI should not include removed token: ${token}`);
  }
}

console.log('Profile UI check passed');
