<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import ProblemDiscussionPanel from '../components/ProblemDiscussionPanel.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const problem = ref<any>(null);
const code = ref('');
const language = ref('cpp');
const result = ref<any>(null);
const submitting = ref(false);
const errorMsg = ref('');
const showAllCases = ref(false);
const isAtCoder = computed(() => problem.value?.sourceInfo?.platform === 'ATCODER');
const favorite = ref(false);
const inWrongBook = ref(false);
const learningBusy = ref(false);
const noteModalOpen = ref(false);
const quickNote = ref('');
const learningNotice = ref('');
let cmView: EditorView | null = null;
let pollTimer: any = null;
const editorHost = ref<HTMLElement | null>(null);

const languageTemplates: Record<string, string> = {
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
  python: '# 输入用 input().split()\n\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n',
};

const langExtensions: Record<string, () => any> = {
  cpp: () => cpp(),
  c: () => cpp(),
  python: () => python(),
  java: () => java(),
};

const statusLabels: Record<string, string> = {
  ACCEPTED: 'AC', WRONG_ANSWER: 'WA', TIME_LIMIT_EXCEEDED: 'TLE',
  RUNTIME_ERROR: 'RE', COMPILE_ERROR: 'CE', MEMORY_LIMIT_EXCEEDED: 'MLE',
  PENDING: '等待中', QUEUING: '排队中', COMPILING: '编译中', RUNNING: '运行中',
};
const statusColors: Record<string, string> = {
  ACCEPTED: '#27ae60', WRONG_ANSWER: '#e74c3c', TIME_LIMIT_EXCEEDED: '#f39c12',
  RUNTIME_ERROR: '#9b59b6', COMPILE_ERROR: '#e67e22', MEMORY_LIMIT_EXCEEDED: '#f39c12',
  PENDING: '#95a5a6', QUEUING: '#3498db', COMPILING: '#3498db', RUNNING: '#3498db',
  SYSTEM_ERROR: '#e74c3c',
};

onMounted(async () => {
  try {
    const { data } = await api.get(`/api/problems/${route.params.id}`);
    problem.value = data;
    if (auth.token && !auth.user) await auth.fetchProfile();
    if (auth.isLoggedIn()) await loadLearningState();
  } catch (e: any) {
    errorMsg.value = '题目加载失败';
  }
  await nextTick();
  if (!isAtCoder.value) createEditor();
});

onUnmounted(() => {
  cmView?.destroy();
  if (pollTimer) clearInterval(pollTimer);
});

function createEditor() {
  if (!editorHost.value) return;
  const templateCode = languageTemplates[language.value];
  code.value = templateCode;

  const state = EditorState.create({
    doc: templateCode,
    extensions: [
      basicSetup,
      langExtensions[language.value]?.() || cpp(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) code.value = update.state.doc.toString();
      }),
      
    ],
  });
  cmView = new EditorView({ state, parent: editorHost.value });
}

async function loadLearningState() {
  if (!problem.value || !auth.isLoggedIn()) return;
  try {
    const [favorites, wrong] = await Promise.all([
      api.get('/api/learning/favorites'),
      api.get('/api/learning/wrong-book'),
    ]);
    favorite.value = favorites.data.some((item: any) => item.problemId === problem.value.id);
    inWrongBook.value = wrong.data.some((item: any) => item.problemId === problem.value.id);
  } catch { /* 快捷状态失败不影响题目与判题 */ }
}

function requireLogin() {
  if (auth.isLoggedIn()) return true;
  router.push('/login');
  return false;
}

async function toggleFavorite() {
  if (!requireLogin() || learningBusy.value) return;
  learningBusy.value = true;
  try {
    if (favorite.value) await api.delete(`/api/learning/favorites/${problem.value.id}`);
    else await api.post('/api/learning/favorites', { problemId: problem.value.id });
    favorite.value = !favorite.value;
    learningNotice.value = favorite.value ? '已收藏' : '已取消收藏';
  } finally { learningBusy.value = false; }
}

async function toggleWrongBook() {
  if (!requireLogin() || learningBusy.value) return;
  learningBusy.value = true;
  try {
    if (inWrongBook.value) await api.delete(`/api/learning/wrong-book/${problem.value.id}`);
    else await api.post('/api/learning/wrong-book', { problemId: problem.value.id, errorType: result.value?.status || 'MANUAL' });
    inWrongBook.value = !inWrongBook.value;
    learningNotice.value = inWrongBook.value ? '已加入错题本' : '已移出错题本';
  } finally { learningBusy.value = false; }
}

function openNoteModal() {
  if (!requireLogin()) return;
  quickNote.value = '';
  noteModalOpen.value = true;
}

async function saveQuickNote() {
  if (!quickNote.value.trim() || learningBusy.value) return;
  learningBusy.value = true;
  try {
    await api.post('/api/learning/notes', { problemId: problem.value.id, content: quickNote.value });
    noteModalOpen.value = false;
    learningNotice.value = '笔记已保存，明天复习';
  } finally { learningBusy.value = false; }
}

watch(language, () => {
  if (!cmView) return;
  const currentCode = cmView.state.doc.toString();
  // Check if current code matches any template — if so, switch to new template
  const isTemplate = Object.values(languageTemplates).some(t => t.trim() === currentCode.trim());
  const newCode = isTemplate ? (languageTemplates[language.value] || currentCode) : currentCode;
  cmView.destroy();
  cmView = null;
  if (!editorHost.value) return;
  const state = EditorState.create({
    doc: newCode,
    extensions: [
      basicSetup,
      langExtensions[language.value]?.() || cpp(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) code.value = update.state.doc.toString();
      }),
      
    ],
  });
  cmView = new EditorView({ state, parent: editorHost.value });
  code.value = newCode;
});

async function submitCode() {
  if (submitting.value || !problem.value) return;
  submitting.value = true;
  errorMsg.value = '';
  result.value = null;
  try {
    const { data } = await api.post('/api/submissions', {
      problemId: problem.value.id,
      language: language.value,
      sourceCode: code.value,
    });
    result.value = { id: data.id, status: 'QUEUING', mode: data.mode || 'LOCAL' };
    // 本地评测和远程评测都自动轮询
    startPolling(data.id);
  } catch (e: any) {
    errorMsg.value = e.response?.data?.message || '提交失败';
  } finally {
    submitting.value = false;
  }
}

function startPolling(id: string) {
  if (pollTimer) clearInterval(pollTimer);
  let attempts = 0;
  pollTimer = setInterval(async () => {
    attempts++;
    try {
      const { data } = await api.get(`/api/submissions/${id}`);
      result.value = data;
      const finalStatuses = ['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILE_ERROR', 'SYSTEM_ERROR', 'REMOTE_ERROR'];
      if (finalStatuses.includes(data.status) || attempts > 30) {
        if (data.status !== 'ACCEPTED' && !['SYSTEM_ERROR', 'REMOTE_ERROR'].includes(data.status)) inWrongBook.value = true;
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch (e) {
      if (attempts > 10) { clearInterval(pollTimer); pollTimer = null; }
    }
  }, 1500);
}

function renderMd(text: string): string {
  if (!text) return '';
  try {
    // Step 1: 在 raw Markdown 上先渲染 LaTeX，用唯一占位符保护
    const placeholderMap = new Map<string, string>();
    let counter = 0;

    let raw = text;
    // 先处理块级公式 $$...$$（保护起来避免 marked 破坏 $/$ 符号）
    raw = raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
      const key = `[[KATEX:${counter++}]]`;
      try {
        placeholderMap.set(key, katex.renderToString(formula.trim(), { throwOnError: false, displayMode: true }));
      } catch { placeholderMap.set(key, `<div style="text-align:center"><em>${formula}</em></div>`); }
      return key;
    });
    // 再处理行内公式 $...$
    raw = raw.replace(/\$([^$]+?)\$/g, (_, formula) => {
      const key = `[[KATEX:${counter++}]]`;
      try {
        placeholderMap.set(key, katex.renderToString(formula.trim(), { throwOnError: false, displayMode: false }));
      } catch { placeholderMap.set(key, `<em>${formula}</em>`); }
      return key;
    });

    // Step 2: 用 marked 渲染剩余 Markdown
    let html = marked.parse(raw, { async: false }) as string;

    // Step 3: 把占位符替换回 KaTeX HTML
    placeholderMap.forEach((rendered, key) => {
      html = html.replace(key, rendered);
    });

    return html;
  } catch {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/\n/g, '<br>');
  }
}
</script>

<template>
  <div class="problem-page">
    <div v-if="errorMsg && !problem" class="error-msg">{{ errorMsg }}</div>

    <template v-if="problem">
      <div class="problem-header">
        <div class="problem-heading-row">
          <h2>{{ problem.title }}</h2>
          <div class="learning-actions">
            <span v-if="learningNotice" class="learning-notice">{{ learningNotice }}</span>
            <button :class="['learning-btn', { active: favorite }]" :disabled="learningBusy" @click="toggleFavorite" :title="favorite ? '取消收藏' : '收藏题目'">{{ favorite ? '★ 已收藏' : '☆ 收藏' }}</button>
            <button :class="['learning-btn', { active: inWrongBook }]" :disabled="learningBusy" @click="toggleWrongBook" :title="inWrongBook ? '移出错题本' : '加入错题本'">{{ inWrongBook ? '✓ 错题本' : '! 记错题' }}</button>
            <button class="learning-btn" :disabled="learningBusy" @click="openNoteModal">笔记</button>
          </div>
        </div>
        <div class="problem-meta">
          <span class="meta-item">⏱ {{ problem.timeLimit }}ms</span>
          <span class="meta-item">📦 {{ problem.memoryLimit }}MB</span>
          <span class="meta-item">🎯 {{ problem.difficulty || '-' }}</span>
          <span class="meta-item">📝 {{ (problem.tags || []).map((t: any) => t.name).join(', ') || '-' }}</span>
          <span v-if="isAtCoder" class="meta-item source-atcoder">来源 AtCoder</span>
        </div>
      </div>

      <div class="content-split">
        <div class="problem-content">
          <div class="card">
            <div class="desc" v-html="renderMd(problem.versions?.[0]?.description)"></div>
          </div>
        </div>

        <div class="editor-panel">
          <div v-if="isAtCoder" class="card external-card">
            <div class="source-name">AtCoder</div>
            <h3>{{ problem.sourceInfo?.remoteProblemId }}</h3>
            <p>当前为只读接入，仅保存最小元数据；代码提交和评测请在原站完成。</p>
            <dl class="source-details">
              <div><dt>比赛</dt><dd>{{ problem.sourceInfo?.remoteContestId || '-' }}</dd></div>
              <div><dt>题号</dt><dd>{{ problem.sourceInfo?.remoteProblemIndex || '-' }}</dd></div>
              <div><dt>同步状态</dt><dd>{{ problem.sourceInfo?.syncStatus || '-' }}</dd></div>
            </dl>
            <a
              class="atcoder-link"
              :href="problem.sourceInfo?.remoteUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开 AtCoder 原题
            </a>
          </div>
          <div v-else class="card editor-card">
            <div class="editor-toolbar">
              <select v-model="language" class="lang-select">
                <option value="cpp">C++</option>
                <option value="c">C</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
              </select>
              <button class="btn-submit" @click="submitCode" :disabled="submitting">
                {{ submitting ? '提交中...' : '🚀 提交评测' }}
              </button>
            </div>
            <div ref="editorHost" class="cm-editor-host"></div>
          </div>

          <div v-if="result" class="card result-card">
            <div class="result-header">
              <span class="result-badge" :style="{ background: statusColors[result.status] || '#999' }">
                {{ statusLabels[result.status] || result.status }}
              </span>
              <span v-if="result.score !== undefined" class="result-score">得分: {{ result.score }}</span>
              <span v-if="result.timeUsed" class="result-info">{{ result.timeUsed }}ms · {{ (result.memoryUsed / 1024).toFixed(1) }}MB</span>
            </div>
            <div v-if="result.compileMessage" class="compile-box"><pre>{{ result.compileMessage }}</pre></div>
            <div v-if="result.cases?.length" class="cases">
              <div class="cases-toggle" @click="showAllCases = !showAllCases">
                📊 测试点详情 ({{ result.cases.filter((c: any) => c.status === 'ACCEPTED').length }}/{{ result.cases.length }} 通过)
                <span class="toggle-arrow">{{ showAllCases ? '▼' : '▶' }}</span>
              </div>
              <div v-if="showAllCases" class="cases-grid">
                <div v-for="c in result.cases" :key="c.caseIndex" class="case-dot"
                  :class="c.status === 'ACCEPTED' ? 'ac' : 'wa'"
                  :title="'#' + c.caseIndex + ': ' + c.status + ' (' + c.timeUsed + 'ms)'">
                  {{ c.caseIndex }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="errorMsg" class="card error-card">{{ errorMsg }}</div>
        </div>
      </div>
      <ProblemDiscussionPanel :problem-id="problem.id" />
    </template>
    <div v-if="noteModalOpen" class="note-backdrop" @click.self="noteModalOpen = false">
      <section class="note-modal">
        <button class="note-close" aria-label="关闭" @click="noteModalOpen = false">×</button>
        <span>QUICK NOTE</span>
        <h3>{{ problem?.title }}</h3>
        <textarea v-model="quickNote" rows="7" maxlength="10000" placeholder="记录解题思路、易错点或复习结论…"></textarea>
        <div class="note-modal-actions">
          <button class="learning-btn" @click="noteModalOpen = false">取消</button>
          <button class="btn-save-note" :disabled="!quickNote.trim() || learningBusy" @click="saveQuickNote">保存并安排复习</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.problem-page { max-width: 100%; margin: 0; padding: 20px 24px; }
.problem-header { margin-bottom: 20px; }
.problem-heading-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.problem-header h2 { font-size: 24px; margin: 0 0 8px; color: #1a1a2e; }
.learning-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.learning-btn { min-height: 34px; padding: 6px 11px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #475569; font-size: 12px; font-weight: 700; cursor: pointer; }
.learning-btn:hover { border-color: #0f766e; color: #0f766e; }
.learning-btn.active { border-color: #99f6e4; background: #f0fdfa; color: #0f766e; }
.learning-btn:disabled { opacity: .6; cursor: wait; }
.learning-notice { color: #0f766e; font-size: 12px; font-weight: 700; }
.problem-meta { display: flex; gap: 16px; flex-wrap: wrap; }
.meta-item { font-size: 13px; color: #666; background: #f0f0f0; padding: 3px 10px; border-radius: 4px; }
.source-atcoder { color: #7a1f1f; background: #fff0f0; }
.content-split { display: grid; grid-template-columns: 1fr 480px; gap: 20px; align-items: start; }
.card { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 16px; }
.desc { line-height: 1.8; color: #333; font-size: 15px; overflow-x: auto; }
.desc :deep(h2) { font-size: 20px; margin: 0 0 12px; }
.desc :deep(h3) { font-size: 17px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px; margin: 20px 0 10px; }
.desc :deep(h4) { font-size: 15px; margin: 16px 0 6px; }
.desc :deep(p) { margin: 8px 0; }
.desc :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
.desc :deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 13px; margin: 12px 0; }
.desc :deep(pre code) { background: none; padding: 0; color: inherit; }
.desc :deep(ul), .desc :deep(ol) { padding-left: 24px; margin: 8px 0; }
.desc :deep(li) { margin: 2px 0; }
.desc :deep(table) { border-collapse: collapse; margin: 12px 0; width: auto; }
.desc :deep(th), .desc :deep(td) { border: 1px solid #ddd; padding: 6px 12px; text-align: left; }
.desc :deep(th) { background: #f8f9fa; font-weight: 600; }
.desc :deep(blockquote) { border-left: 3px solid #4fc3f7; padding: 8px 16px; margin: 12px 0; background: #f5f5f5; border-radius: 0 4px 4px 0; color: #555; }
.desc :deep(hr) { border: none; border-top: 1px solid #eee; margin: 16px 0; }
/* KaTeX overlay fix */
.desc :deep(.katex) { font-size: 1.05em; }
.desc :deep(.katex-display) { margin: 12px 0; text-align: center; }
/* handle overflow for wide formulas */
.desc :deep(.katex-display > .katex) { max-width: 100%; overflow-x: auto; overflow-y: hidden; }

.editor-card { padding: 0; overflow: hidden; }
.editor-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #282c34; border-bottom: 1px solid #333; }
.lang-select { padding: 6px 12px; background: #333; color: #ccc; border: 1px solid #555; border-radius: 4px; font-size: 13px; }
.btn-submit { padding: 8px 20px; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 6px; font-weight: bold; font-size: 14px; cursor: pointer; }
.btn-submit:hover { background: #29b6f6; }
.btn-submit:disabled { opacity: 0.5; cursor: default; }
.cm-editor-host { height: 420px; }
.cm-editor-host :deep(.cm-editor) { height: 100%; }
.cm-editor-host :deep(.cm-scroller) { overflow: auto; }

.result-card { border-left: 4px solid #3498db; }
.result-header { display: flex; align-items: center; gap: 12px; }
.result-badge { padding: 4px 12px; border-radius: 4px; color: #fff; font-weight: bold; font-size: 16px; }
.result-score { font-weight: bold; color: #1a1a2e; font-size: 16px; }
.result-info { color: #888; font-size: 13px; }
.compile-box { margin-top: 12px; background: #fff3e0; padding: 10px; border-radius: 4px; font-size: 12px; }
.compile-box pre { margin: 0; white-space: pre-wrap; font-family: monospace; }
.cases { margin-top: 12px; }
.cases-toggle { cursor: pointer; font-size: 14px; color: #3498db; font-weight: 500; }
.toggle-arrow { font-size: 10px; margin-left: 4px; }
.cases-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.case-dot { width: 36px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: #fff; }
.case-dot.ac { background: #27ae60; }
.case-dot.wa { background: #e74c3c; }
.error-msg, .error-card { color: #e74c3c; padding: 20px; text-align: center; }
.error-card { background: #fce4ec; }

.external-card { border-top: 4px solid #a51d1d; background: #fff; }
.source-name { color: #a51d1d; font-size: 13px; font-weight: 800; text-transform: uppercase; }
.external-card h3 { margin: 6px 0 10px; color: #20242a; font-size: 18px; }
.external-card p { margin: 0 0 16px; font-size: 14px; color: #5f6772; line-height: 1.6; }
.source-details { margin: 0 0 18px; border-top: 1px solid #eceff2; }
.source-details div { display: grid; grid-template-columns: 72px 1fr; padding: 8px 0; border-bottom: 1px solid #eceff2; font-size: 13px; }
.source-details dt { color: #7b8490; }
.source-details dd { margin: 0; color: #252b33; overflow-wrap: anywhere; }
.atcoder-link { display: block; padding: 10px 14px; background: #a51d1d; color: #fff; border-radius: 6px; text-align: center; text-decoration: none; font-size: 14px; font-weight: 700; }
.atcoder-link:hover { background: #861818; }

.note-backdrop { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .48); }
.note-modal { position: relative; width: min(520px, 100%); padding: 24px; background: #fff; box-shadow: 0 24px 64px rgba(15, 23, 42, .24); }
.note-modal > span { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
.note-modal h3 { margin: 6px 32px 18px 0; color: #0f172a; font-size: 18px; }
.note-modal textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; padding: 11px; resize: vertical; color: #334155; font: inherit; outline: none; }
.note-modal textarea:focus { border-color: #0f766e; box-shadow: 0 0 0 2px #ccfbf1; }
.note-close { position: absolute; top: 12px; right: 14px; border: 0; background: transparent; color: #64748b; font-size: 24px; cursor: pointer; }
.note-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.btn-save-note { border: 0; border-radius: 5px; padding: 8px 14px; background: #0f766e; color: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.btn-save-note:disabled { opacity: .55; cursor: not-allowed; }

@media (max-width: 1000px) { .content-split { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .problem-heading-row { display: block; } .learning-actions { justify-content: flex-start; margin: 10px 0; } }
</style>
