<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api/client';
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
const problem = ref<any>(null);
const code = ref('');
const language = ref('cpp');
const result = ref<any>(null);
const submitting = ref(false);
const errorMsg = ref('');
const showAllCases = ref(false);
const isExternal = ref(false);
let cmView: EditorView | null = null;
let pollTimer: any = null;
let visibilityCleanupId: any = null;
const editorHost = ref<HTMLElement | null>(null);
const pollExhausted = ref(false);

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
  PENDING: '等待中', QUEUING: '排队中', JUDGING: '评测中',
  SUBMITTING: '提交中', COMPILING: '编译中', RUNNING: '运行中',
  SYSTEM_ERROR: '系统错误', REMOTE_ERROR: '远程错误', CANCELLED: '已取消',
};
const statusColors: Record<string, string> = {
  ACCEPTED: '#27ae60', WRONG_ANSWER: '#e74c3c', TIME_LIMIT_EXCEEDED: '#f39c12',
  RUNTIME_ERROR: '#9b59b6', COMPILE_ERROR: '#e67e22', MEMORY_LIMIT_EXCEEDED: '#f39c12',
  CANCELLED: '#95a5a6',
  PENDING: '#95a5a6', QUEUING: '#3498db', JUDGING: '#3498db',
  SUBMITTING: '#3498db', COMPILING: '#3498db', RUNNING: '#3498db',
  SYSTEM_ERROR: '#e74c3c', REMOTE_ERROR: '#e74c3c',
};

onMounted(async () => {
  try {
    const { data } = await api.get(`/api/problems/${route.params.id}`);
    problem.value = data;
  } catch (e: any) {
    errorMsg.value = '题目加载失败';
  }
  await nextTick();
  createEditor();
});

onUnmounted(() => {
  cmView?.destroy();
  if (pollTimer) clearInterval(pollTimer);
  if (visibilityCleanupId) clearInterval(visibilityCleanupId);
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

const cfDialog = ref(false);
const cfData = ref<any>(null);
const copySuccess = ref(false);
const cfOpenBlocked = ref(false);
const cfAutoMessage = ref('');

function openExternalUrl(url?: string): boolean {
  if (!url) return false;
  const opened = globalThis.window?.open(url, '_blank', 'noopener,noreferrer');
  return !!opened;
}

function retryOpenCf() {
  cfOpenBlocked.value = !openExternalUrl(cfData.value?.url);
}

async function copyCfCode() {
  try {
    await globalThis.navigator?.clipboard?.writeText(cfData.value?.code || '');
    copySuccess.value = true;
  } catch {
    copySuccess.value = false;
  }
}

function refreshPage() {
  globalThis.location?.reload();
}

async function submitCode() {
  if (submitting.value || !problem.value) return;
  submitting.value = true;
  errorMsg.value = '';
  result.value = null;
  isExternal.value = false;
  try {
    const { data } = await api.post('/api/submissions', {
      problemId: problem.value.id,
      language: language.value,
      sourceCode: code.value,
    });
    result.value = { id: data.submissionId || data.id, status: 'QUEUING', mode: data.mode || 'LOCAL' };

    // CF 远程提交: 自动复制代码 + 打开 CF 页面
    if ((data.mode === 'CODEFORCES' && data.cfSubmitUrl) || (data.mode === 'LUOGU' && data.luoguSubmitUrl)) {
      isExternal.value = true;
      const langNames: Record<string, string> = { cpp:'GNU G++17', c:'GNU GCC C11', python:'Python 3', java:'Java 11' };
      const luoguLangNames: Record<string, string> = { cpp:'C++', c:'C', python:'Python 3', java:'Java' };
      const isLuogu = data.mode === 'LUOGU';
      cfData.value = {
        url: isLuogu ? data.luoguSubmitUrl : data.cfSubmitUrl,
        platform: isLuogu ? '洛谷' : 'Codeforces',
        language: isLuogu ? (luoguLangNames[language.value] || language.value) : (langNames[language.value] || language.value),
        code: code.value,
        submissionId: data.submissionId,
      };
      cfDialog.value = true;
      cfAutoMessage.value = '正在打开 Codeforces 并自动提交。完成后标签页会自动关闭，结果会回到这里。';
      copyCfCode();
      cfOpenBlocked.value = !openExternalUrl(cfData.value.url);
      startPolling(data.submissionId);
    } else {
      startPolling(data.submissionId || data.id);
    }
  } catch (e: any) {
    errorMsg.value = e.response?.data?.message || '提交失败';
  } finally {
    submitting.value = false;
  }
}

function startPolling(id: string) {
  if (pollTimer) clearInterval(pollTimer);
  if (visibilityCleanupId) clearInterval(visibilityCleanupId);
  pollExhausted.value = false;

  let attempts = 0;
  let errorCount = 0;
  // CF: 10 min (400 x 1.5s), local: 45s (30 x 1.5s)
  const maxAttempts = isExternal.value ? 400 : 30;
  const maxErrors = isExternal.value ? 60 : 10;

  function doPoll() {
    attempts++;
    api.get(`/api/submissions/${id}`).then(({ data }) => {
      errorCount = 0; // reset on success
      // Preserve mode from the initial submission response if the poll
      // response does not include it (raw Prisma data has no mode field)
      if (!data.mode && result.value?.mode) {
        data.mode = result.value.mode;
      }
      result.value = data;
      const finalStatuses = [
        'ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILE_ERROR',
        'SYSTEM_ERROR', 'REMOTE_ERROR', 'CANCELLED',
      ];
      if (finalStatuses.includes(data.status)) {
        clearInterval(pollTimer);
        pollTimer = null;
        clearInterval(visibilityCleanupId);
        visibilityCleanupId = null;
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(pollTimer);
        pollTimer = null;
        clearInterval(visibilityCleanupId);
        visibilityCleanupId = null;
        pollExhausted.value = true;
      }
    }).catch(() => {
      errorCount++;
      // Don't kill CF polling on transient API errors — the backend
      // worker may still be processing. Only stop if errors are
      // persistently high relative to the polling window.
      if (errorCount >= maxErrors) {
        clearInterval(pollTimer);
        pollTimer = null;
        clearInterval(visibilityCleanupId);
        visibilityCleanupId = null;
        pollExhausted.value = true;
      }
    });
  }

  doPoll();
  pollTimer = setInterval(doPoll, 1500);

  // Refresh immediately when the user switches back to this tab
  const onVisible = () => {
    if (document.visibilityState === 'visible' && pollTimer) doPoll();
  };
  document.addEventListener('visibilitychange', onVisible);
  // Clean up visibility listener when polling stops
  visibilityCleanupId = setInterval(() => {
    if (!pollTimer) {
      clearInterval(visibilityCleanupId);
      visibilityCleanupId = null;
      document.removeEventListener('visibilitychange', onVisible);
    }
  }, 1000);
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
        <h2>{{ problem.title }}</h2>
        <div class="problem-meta">
          <span class="meta-item">⏱ {{ problem.timeLimit }}ms</span>
          <span class="meta-item">📦 {{ problem.memoryLimit }}MB</span>
          <span class="meta-item">🎯 {{ problem.difficulty || '-' }}</span>
          <span class="meta-item">📝 {{ (problem.tags || []).map((t: any) => t.name).join(', ') || '-' }}</span>
        </div>
      </div>

      <div class="content-split">
        <div class="problem-content">
          <div class="card">
            <div class="desc" v-html="renderMd(problem.versions?.[0]?.description)"></div>
          </div>
        </div>

        <div class="editor-panel">
          <div class="card editor-card">
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

          <div v-if="pollExhausted" class="card exhausted-card" style="border-left:4px solid #f39c12; background:#fff8e1;">
            <p style="margin:0; color:#e65100; font-size:14px;">
              Polling stopped — the backend has not returned a result within the time limit.
              <a href="javascript:void(0)" style="text-decoration:underline; color:#3498db;"
                 @click="refreshPage">Refresh the page</a> to check the latest status.
            </p>
          </div>
          <div v-if="errorMsg" class="card error-card">{{ errorMsg }}</div>
        </div>
      </div>

      <ProblemDiscussionPanel :problem-id="problem.id" />
    </template>

    <!-- CF 远程提交引导弹窗 -->
    <div v-if="cfDialog" class="cf-overlay" @click.self="cfDialog = false">
      <div class="cf-dialog">
        <div class="cf-dialog-header">
          <span>🔗 Codeforces 远程提交</span>
          <button class="cf-close" @click="cfDialog = false">✕</button>
        </div>
        <div class="cf-dialog-body">
          <p style="margin-bottom:12px">{{ cfAutoMessage }}</p>
          <p v-if="cfOpenBlocked" style="margin:0 0 12px; color:#e65100; font-size:14px;">
            浏览器拦截了新标签页。点击下方按钮继续同一个提交任务。
          </p>

          <div class="cf-step">
            <span class="cf-step-num">1</span>
            <span class="cf-step-text">Codeforces 页面会自动选择语言: <b>{{ cfData?.language }}</b></span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">2</span>
            <span class="cf-step-text">辅助脚本会自动填入代码并点击 Submit</span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">3</span>
            <span class="cf-step-text">识别 SID 并回传成功后，Codeforces 标签页会自动关闭</span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">4</span>
            <span class="cf-step-text">此页面持续轮询并展示最终评测结果</span>
          </div>
          <div class="cf-code-preview">
            <pre>{{ cfData?.code }}</pre>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px">
            <button class="cf-btn cf-btn-primary" @click="copyCfCode">
              📋 再次复制代码
            </button>
            <button class="cf-btn cf-btn-secondary" @click="retryOpenCf">
              🔗 重新打开 CF 页面
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.problem-page { max-width: 100%; margin: 0; padding: 20px 24px; }
.problem-header { margin-bottom: 20px; }
.problem-header h2 { font-size: 24px; margin: 0 0 8px; color: #1a1a2e; }
.problem-meta { display: flex; gap: 16px; flex-wrap: wrap; }
.meta-item { font-size: 13px; color: #666; background: #f0f0f0; padding: 3px 10px; border-radius: 4px; }
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

.external-card { border-left: 4px solid #e67e22; background: #fff8e1; }
.external-card h3 { color: #e65100; margin-bottom: 8px; }
.external-card p { margin: 4px 0 10px; font-size: 14px; color: #666; }
.luogu-link { display: inline-block; padding: 8px 16px; background: #3498db; color: #fff; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; margin: 8px 0; }
.luogu-link:hover { background: #2980b9; }
.tip { font-size: 12px; color: #888; margin: 8px 0; }
.fill-form { margin-top: 16px; padding-top: 16px; border-top: 1px solid #ffe0b2; }
.fill-form h4 { margin: 0 0 8px; font-size: 14px; }
.fill-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.fill-row select, .fill-row input { padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 120px; }
.fill-row input[placeholder] { width: 110px; }
.btn-fill { padding: 6px 16px; background: #27ae60; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
.btn-fill:hover { background: #219a52; }

/* CF 远程提交弹窗 */
.cf-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.cf-dialog { background: #fff; border-radius: 12px; width: 560px; max-width: 90vw; max-height: 85vh; overflow: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.cf-dialog-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; font-size: 16px; font-weight: 600; }
.cf-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #999; }
.cf-close:hover { color: #333; }
.cf-dialog-body { padding: 16px 20px; }
.cf-step { display: flex; align-items: center; gap: 10px; margin: 10px 0; font-size: 14px; }
.cf-step-num { width: 24px; height: 24px; border-radius: 50%; background: #3498db; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.cf-step-text { flex: 1; }
.cf-code-preview { margin-top: 8px; background: #1e1e1e; border-radius: 8px; padding: 12px; max-height: 200px; overflow: auto; }
.cf-code-preview pre { margin: 0; color: #d4d4d4; font-size: 12px; font-family: Consolas, monospace; white-space: pre-wrap; }
.cf-btn { padding: 8px 18px; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
.cf-btn-primary { background: #3498db; color: #fff; }
.cf-btn-primary:hover { background: #2980b9; }
.cf-btn-secondary { background: #f0f0f0; color: #333; border: 1px solid #ddd; }
.cf-btn-secondary:hover { background: #e0e0e0; }

@media (max-width: 1000px) { .content-split { grid-template-columns: 1fr; } }
</style>
