<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  ArrowLeft, BookOpen, Clock3, HardDrive, MessageCircle, Play, RefreshCw, Send, Star, Tag, Target, Wrench, X,
} from '@lucide/vue';
import { sanitizeStatementHtml } from '../security/sanitize-statement';
import 'katex/dist/katex.min.css';
import { renderMarkdownWithMath } from '../utils/markdown';
import { pointDifficultyLabel } from '../utils/pointDifficulty';
import ProblemStateBadges from '../components/ProblemStateBadges.vue';
import ProblemDiscussionPanel from '../components/ProblemDiscussionPanel.vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const contestId = computed(() => String(route.query.contestId || ''));
const isContestMode = computed(() => Boolean(contestId.value));
const isAuthorPreview = computed(() => String(route.query.preview || '') === '1');
const problem = ref<any>(null);
const problemState = ref<any>(null);
const code = ref('');
const language = ref('cpp');
const result = ref<any>(null);
const submitting = ref(false);
const errorMsg = ref('');
const showAllCases = ref(false);
const isExternal = ref(false);
const feedbackOpen = ref(false);
const feedbackSubmitting = ref(false);
const feedbackMessage = ref('');
const feedbackError = ref('');
const feedback = ref({ type: 'STATEMENT', content: '' });
let cmView: EditorView | null = null;
let pollTimer: any = null;
let visibilityCleanupId: any = null;
const editorHost = ref<HTMLElement | null>(null);
const pollExhausted = ref(false);
const wrongResolvedOpen = ref(false);
const resolvingWrong = ref(false);
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
const currentVersion = computed(() => problem.value?.versions?.[0] || {});
const sampleExamples = computed(() => {
  const version = currentVersion.value;
  const inputs = splitSampleSections(version.sampleInput);
  const outputs = splitSampleSections(version.sampleOutput);
  const count = Math.max(inputs.length, outputs.length);
  const examples = [];
  for (let i = 0; i < count; i += 1) {
    const input = inputs[i] || '';
    const output = outputs[i] || '';
    if (!input.trim() && !output.trim()) continue;
    if (descriptionAlreadyContainsSample(version.description, input, output)) continue;
    examples.push({ index: i + 1, input, output });
  }
  return examples;
});

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
  SYSTEM_ERROR: '系统错误', REMOTE_ERROR: 'RMR', REMOTE_REEOR: 'RMR', CANCELLED: '已取消',
};
const statusColors: Record<string, string> = {
  ACCEPTED: '#27ae60', WRONG_ANSWER: '#e74c3c', TIME_LIMIT_EXCEEDED: '#f39c12',
  RUNTIME_ERROR: '#9b59b6', COMPILE_ERROR: '#e67e22', MEMORY_LIMIT_EXCEEDED: '#f39c12',
  CANCELLED: '#95a5a6',
  PENDING: '#95a5a6', QUEUING: '#3498db', JUDGING: '#3498db',
  SUBMITTING: '#3498db', COMPILING: '#3498db', RUNNING: '#3498db',
  SYSTEM_ERROR: '#e74c3c', REMOTE_ERROR: '#e74c3c', REMOTE_REEOR: '#e74c3c',
};

function hasMetric(value: unknown) {
  return value !== null && value !== undefined;
}

/** In-progress judge statuses should not display a provisional 0 score. */
const JUDGING_STATUSES = new Set([
  'PENDING', 'QUEUING', 'COMPILING', 'RUNNING', 'JUDGING', 'SUBMITTING',
]);

function isJudgingStatus(status?: string | null) {
  return Boolean(status && JUDGING_STATUSES.has(status));
}

function shouldShowScore(status?: string | null, score?: unknown) {
  if (isJudgingStatus(status)) return false;
  return score !== undefined && score !== null;
}

function formatMemoryKb(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? (n / 1024).toFixed(1) + 'MB' : '-';
}

onMounted(async () => {
  try {
    const problemUrl = contestId.value
      ? `/api/contests/${contestId.value}/problems/${route.params.id}`
      : isAuthorPreview.value
        ? `/api/problems/mine/created/${route.params.id}`
      : `/api/problems/${route.params.id}`;
    const { data } = await api.get(problemUrl);
    problem.value = data;
    if (auth.token && !contestId.value && !isAuthorPreview.value) {
      problemState.value = (await api.get(`/api/learning/problem-states/${route.params.id}`)).data;
      if (problemState.value?.draft?.language) language.value = problemState.value.draft.language;
      if (problemState.value?.status === 'PASSED' && problemState.value?.wrong) wrongResolvedOpen.value = true;
    }
  } catch (e: any) {
    errorMsg.value = '题目加载失败';
  }
  await nextTick();
  createEditor(problemState.value?.draft?.sourceCode);
});

onUnmounted(() => {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    void persistDraft();
  }
  cmView?.destroy();
  if (pollTimer) clearInterval(pollTimer);
  if (visibilityCleanupId) clearInterval(visibilityCleanupId);
});

function createEditor(initialCode?: string) {
  if (!editorHost.value) return;
  const templateCode = initialCode || languageTemplates[language.value];
  code.value = templateCode;

  const state = EditorState.create({
    doc: templateCode,
    extensions: [
      basicSetup,
      langExtensions[language.value]?.() || cpp(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          code.value = update.state.doc.toString();
          scheduleDraftSave();
        }
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
        if (update.docChanged) {
          code.value = update.state.doc.toString();
          scheduleDraftSave();
        }
      }),
      
    ],
  });
  cmView = new EditorView({ state, parent: editorHost.value });
  code.value = newCode;
  if (!isTemplateCode(newCode)) scheduleDraftSave();
});

function isTemplateCode(value: string) {
  return Object.values(languageTemplates).some((template) => template.trim() === value.trim());
}

function scheduleDraftSave() {
  if (!auth.token || !problem.value || contestId.value || isAuthorPreview.value) return;
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    void persistDraft();
  }, 800);
}

async function persistDraft() {
  if (!auth.token || !problem.value || contestId.value || isAuthorPreview.value) return;
  try {
    if (!code.value.trim() || isTemplateCode(code.value)) {
      if (problemState.value?.hasDraft) {
        problemState.value = (await api.delete(`/api/learning/problem-drafts/${problem.value.id}`)).data;
      }
      return;
    }
    problemState.value = (await api.put(`/api/learning/problem-drafts/${problem.value.id}`, {
      language: language.value,
      sourceCode: code.value,
    })).data;
  } catch {
    // A failed background save must not interrupt editing or submission.
  }
}

async function refreshProblemState() {
  if (!auth.token || !problem.value || contestId.value || isAuthorPreview.value) return;
  problemState.value = (await api.get(`/api/learning/problem-states/${problem.value.id}`)).data;
}

async function toggleFavorite() {
  if (!problem.value || !problemState.value) return;
  try {
    if (problemState.value.favorite) await api.delete(`/api/learning/favorites/${problem.value.id}`);
    else await api.post('/api/learning/favorites', { problemId: problem.value.id });
    await refreshProblemState();
  } catch (error: any) {
    errorMsg.value = error?.response?.data?.message || '收藏状态更新失败';
  }
}

async function resolveWrongBook(favorite: boolean) {
  if (!problem.value || resolvingWrong.value) return;
  resolvingWrong.value = true;
  try {
    problemState.value = (await api.post(`/api/learning/wrong-book/${problem.value.id}/resolve`, { favorite })).data;
    wrongResolvedOpen.value = false;
  } catch (error: any) {
    errorMsg.value = error?.response?.data?.message || '错题状态处理失败';
  } finally {
    resolvingWrong.value = false;
  }
}

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

function getSwufeOjApiBase() {
  return globalThis.location?.origin || 'http://127.0.0.1:3000';
}

function withSwufeOjApiParam(url?: string) {
  if (!url) return url;
  try {
    const next = new URL(url);
    const apiBase = getSwufeOjApiBase();
    next.searchParams.set('swufeOjApi', apiBase);
    // Keep hash fragment (e.g. #submit) while also embedding the API base so
    // Tampermonkey helpers can recover it even if query params are stripped.
    const hashBase = (next.hash || '#submit').replace(/([?&]swufeOjApi=)[^&]*/g, '').replace(/[?&]$/, '');
    const joiner = hashBase.includes('?') ? '&' : '?';
    next.hash = `${hashBase || '#submit'}${joiner}swufeOjApi=${encodeURIComponent(apiBase)}`;
    return next.toString();
  } catch {
    return url;
  }
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
    await persistDraft();
    const submitUrl = contestId.value
      ? `/api/contests/${contestId.value}/submit`
      : (isAuthorPreview.value ? '/api/submissions/preview' : '/api/submissions');
    const { data } = await api.post(submitUrl, {
      problemId: problem.value.id,
      language: language.value,
      sourceCode: code.value,
    });
    result.value = { id: data.submissionId || data.id, status: 'QUEUING', mode: data.mode || 'LOCAL' };

    // 远程提交：自动复制代码 + 打开第三方 OJ 页面
    if (
      (data.mode === 'CODEFORCES' && data.cfSubmitUrl) ||
      (data.mode === 'LUOGU' && data.luoguSubmitUrl) ||
      (data.mode === 'QOJ' && data.qojSubmitUrl)
    ) {
      isExternal.value = true;
      const langNames: Record<string, string> = { cpp:'GNU G++17', c:'GNU GCC C11', python:'Python 3', java:'Java 11' };
      const luoguLangNames: Record<string, string> = { cpp:'C++', c:'C', python:'Python 3', java:'Java' };
      const qojLangNames: Record<string, string> = { cpp:'C++', c:'C', python:'Python', java:'Java' };
      const isLuogu = data.mode === 'LUOGU';
      const isQoj = data.mode === 'QOJ';
      cfData.value = {
        url: withSwufeOjApiParam(isQoj ? data.qojSubmitUrl : (isLuogu ? data.luoguSubmitUrl : data.cfSubmitUrl)),
        platform: isQoj ? 'QOJ' : (isLuogu ? '洛谷' : 'Codeforces'),
        language: isQoj
          ? (qojLangNames[language.value] || language.value)
          : (isLuogu ? (luoguLangNames[language.value] || language.value) : (langNames[language.value] || language.value)),
        code: code.value,
        submissionId: data.submissionId,
      };
      cfDialog.value = true;
      cfAutoMessage.value = isLuogu
        ? '正在打开洛谷。请确认已安装并启用「SWUFE Singularity OJ - Luogu Auto Submit Helper」；页面顶部应出现蓝色 Helper 横幅，随后自动填代码并提交。若只有跳转没有横幅，请先安装 Helper。'
        : ('正在打开 ' + cfData.value.platform + ' 并自动提交。完成后标签页会自动关闭，结果会回到这里。');
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
    api.get(`/api/submissions/${id}`).then(async ({ data }) => {
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
        await refreshProblemState();
        if (data.status === 'ACCEPTED' && problemState.value?.wrong) wrongResolvedOpen.value = true;
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
  return sanitizeStatementHtml(renderMarkdownWithMath(text));
}

function splitSampleSections(text?: string | null): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.trim()) return [];
  return normalized.split(/\n---\n/g).map((part) => part.replace(/^\n+|\n+$/g, ''));
}

function descriptionAlreadyContainsSample(description: string | undefined, input: string, output: string): boolean {
  const normalizedDescription = String(description || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalizedInput = input.trim();
  const normalizedOutput = output.trim();
  return (!normalizedInput || normalizedDescription.includes(normalizedInput))
    && (!normalizedOutput || normalizedDescription.includes(normalizedOutput));
}

function toggleFeedback() {
  feedbackOpen.value = !feedbackOpen.value;
  feedbackMessage.value = '';
  feedbackError.value = '';
}

async function submitFeedback() {
  if (!problem.value) return;
  if (!auth.isLoggedIn()) {
    void router.push({ path: '/login', query: { redirect: `/problems/${problem.value.id}` } });
    return;
  }
  feedbackSubmitting.value = true;
  feedbackMessage.value = '';
  feedbackError.value = '';
  try {
    await api.post('/api/community/feedback', {
      problemId: problem.value.id,
      type: feedback.value.type,
      content: feedback.value.content,
    });
    feedback.value = { type: 'STATEMENT', content: '' };
    feedbackOpen.value = false;
    feedbackMessage.value = '题目反馈已提交，处理进度会通过站内通知返回。';
  } catch (requestError: any) {
    feedbackError.value = requestError.response?.data?.message || '反馈提交失败。';
  } finally {
    feedbackSubmitting.value = false;
  }
}
</script>

<template>
  <div class="problem-page">
    <div v-if="errorMsg && !problem" class="error-msg">{{ errorMsg }}</div>

    <template v-if="problem">
      <div v-if="isAuthorPreview" class="preview-banner" role="status">
        <strong>比赛预备题验题模式</strong>
        <span>当前题目不会出现在公开题库中；这里的提交用于命题人测试数据和判题正确性。</span>
      </div>
      <div v-if="isContestMode" class="contest-mode-bar">
        <RouterLink
          class="contest-back-link"
          :to="{ path: '/contests', query: { contestId } }"
        >
          <ArrowLeft :size="16" />
          返回比赛选题
        </RouterLink>
        <span class="contest-mode-hint">比赛模式 · 仅题面与提交</span>
      </div>
      <header class="problem-header" :class="{ 'contest-header': isContestMode }">
        <div class="problem-title-row">
          <div class="problem-title-block">
            <p class="problem-kicker">
              {{
                isContestMode
                  ? '比赛题目'
                  : (isAuthorPreview ? '比赛预备题 · 验题' : (problem.source === 'LOCAL' ? '原创题目' : (problem.source || '题目')))
              }}
            </p>
            <h1>{{ problem.title }}</h1>
            <ProblemStateBadges v-if="!isContestMode && problemState" class="detail-state" :state="problemState" />
          </div>
          <div v-if="!isContestMode" class="problem-header-actions">
            <RouterLink
              class="header-link"
              :to="{ path: '/community', query: { panel: 'feed', problemId: problem.id, problemTitle: problem.title, compose: '1' } }"
            >
              <MessageCircle :size="16" />讨论
            </RouterLink>
            <RouterLink
              class="header-link"
              :to="{ path: '/community', query: { panel: 'solutions', problemId: problem.id, problemTitle: problem.title } }"
            >
              <BookOpen :size="16" />题解
            </RouterLink>
            <RouterLink
              v-if="problemState?.status === 'PASSED' || auth.isTeacher() || auth.isAdmin()"
              class="header-link"
              :to="{ path: '/community', query: { panel: 'solutions', problemId: problem.id, problemTitle: problem.title, compose: '1' } }"
            >
              <BookOpen :size="16" />写题解
            </RouterLink>
            <button class="header-link" type="button" :class="{ active: feedbackOpen }" @click="toggleFeedback">
              <Wrench :size="16" />题目纠错
            </button>
            <button
              v-if="problemState"
              class="favorite-command"
              :class="{ active: problemState.favorite }"
              type="button"
              @click="toggleFavorite"
            >
              <Star :size="16" :fill="problemState.favorite ? 'currentColor' : 'none'" />
              {{ problemState.favorite ? '已收藏' : '收藏' }}
            </button>
          </div>
        </div>

        <div class="problem-meta">
          <span class="meta-item"><Clock3 :size="14" />{{ problem.timeLimit }} ms</span>
          <span class="meta-item"><HardDrive :size="14" />{{ problem.memoryLimit }} MB</span>
          <template v-if="!isContestMode">
            <span class="meta-item"><Target :size="14" />{{ pointDifficultyLabel(problem.difficulty) }}</span>
            <span v-if="(problem.tags || []).length" class="meta-item tags">
              <Tag :size="14" />
              <i v-for="tag in problem.tags" :key="tag.name || tag">{{ tag.name || tag }}</i>
            </span>
          </template>
        </div>

        <template v-if="!isContestMode">
          <p v-if="feedbackMessage" class="feedback-banner success">{{ feedbackMessage }}</p>
          <p v-if="feedbackError" class="feedback-banner error">{{ feedbackError }}</p>

          <form v-if="feedbackOpen" class="feedback-form" @submit.prevent="submitFeedback">
            <div class="feedback-form-header">
              <strong>题目纠错</strong>
              <button class="feedback-close" type="button" title="关闭" @click="feedbackOpen = false"><X :size="16" /></button>
            </div>
            <select v-model="feedback.type" aria-label="问题类型">
              <option value="STATEMENT">题面问题</option>
              <option value="SAMPLE">样例问题</option>
              <option value="TESTDATA">测试数据问题</option>
              <option value="OTHER">其他问题</option>
            </select>
            <textarea
              v-model="feedback.content"
              maxlength="3000"
              placeholder="说明发现的问题，并尽量给出可复现的信息"
              required
            />
            <footer>
              <button class="plain-button" type="button" @click="feedbackOpen = false">取消</button>
              <button class="submit-button" type="submit" :disabled="feedbackSubmitting">
                <Send :size="15" />{{ feedbackSubmitting ? '提交中...' : '提交反馈' }}
              </button>
            </footer>
          </form>
        </template>
      </header>

      <div class="content-split">
        <div class="problem-content">
          <section class="card statement-card">
            <div class="desc" v-html="renderMd(currentVersion.description)"></div>
            <div v-if="sampleExamples.length" class="sample-section">
              <h3>样例</h3>
              <div v-for="sample in sampleExamples" :key="sample.index" class="sample-pair">
                <div v-if="sample.input.trim()" class="sample-block">
                  <div class="sample-title">输入 #{{ sample.index }}</div>
                  <pre>{{ sample.input }}</pre>
                </div>
                <div v-if="sample.output.trim()" class="sample-block">
                  <div class="sample-title">输出 #{{ sample.index }}</div>
                  <pre>{{ sample.output }}</pre>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside class="editor-panel">
          <div class="editor-sticky">
            <section class="card editor-card">
              <div class="editor-toolbar">
                <div class="editor-toolbar-left">
                  <span class="editor-label">代码编辑</span>
                  <select v-model="language" class="lang-select" aria-label="选择语言">
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                    <option value="python">Python</option>
                    <option value="java">Java</option>
                  </select>
                </div>
                <button class="btn-submit" type="button" :disabled="submitting" @click="submitCode">
                  <RefreshCw v-if="submitting" class="spin" :size="16" />
                  <Play v-else :size="16" />
                  {{ submitting ? '提交中...' : '提交评测' }}
                </button>
              </div>
              <div ref="editorHost" class="cm-editor-host"></div>
            </section>

            <section v-if="result" class="card result-card">
              <div class="result-header">
                <span class="result-badge" :style="{ background: statusColors[result.status] || '#95a5a6' }">
                  {{ statusLabels[result.status] || result.status }}
                </span>
                <span v-if="shouldShowScore(result.status, result.score)" class="result-score">{{ result.score }} 分</span>
                <span v-if="hasMetric(result.timeUsed) || hasMetric(result.memoryUsed)" class="result-info">
                  <template v-if="hasMetric(result.timeUsed)">{{ result.timeUsed }} ms</template>
                  <template v-if="hasMetric(result.timeUsed) && hasMetric(result.memoryUsed)"> · </template>
                  <template v-if="hasMetric(result.memoryUsed)">{{ formatMemoryKb(result.memoryUsed) }}</template>
                </span>
              </div>
              <div v-if="result.compileMessage" class="compile-box"><pre>{{ result.compileMessage }}</pre></div>
              <div v-if="result.cases?.length" class="cases">
                <button class="cases-toggle" type="button" @click="showAllCases = !showAllCases">
                  测试点 {{ result.cases.filter((c: any) => c.status === 'ACCEPTED').length }}/{{ result.cases.length }} 通过
                  <span class="toggle-arrow">{{ showAllCases ? '收起' : '展开' }}</span>
                </button>
                <div v-if="showAllCases" class="cases-grid">
                  <div
                    v-for="c in result.cases"
                    :key="c.caseIndex"
                    class="case-dot"
                    :class="c.status === 'ACCEPTED' ? 'ac' : 'wa'"
                    :title="'#' + c.caseIndex + ': ' + c.status + ' (' + c.timeUsed + 'ms)'"
                  >
                    {{ c.caseIndex }}
                  </div>
                </div>
              </div>
            </section>

            <section v-if="pollExhausted" class="card exhausted-card">
              <p>
                轮询已停止：后端在时限内未返回结果。
                <button type="button" class="link-button" @click="refreshPage">刷新页面</button>
                查看最新状态。
              </p>
            </section>
            <section v-if="errorMsg" class="card error-card">{{ errorMsg }}</section>
          </div>
        </aside>
      </div>

      <ProblemDiscussionPanel
        v-if="!isAuthorPreview && !isContestMode"
        class="problem-discussion-mount"
        :problem-id="problem.id"
        :problem-title="problem.title"
        :solved="problemState?.status === 'PASSED'"
      />
    </template>

    <!-- 第三方 OJ 远程提交引导弹窗 -->
    <div v-if="cfDialog" class="cf-overlay" @click.self="cfDialog = false">
      <div class="cf-dialog">
        <div class="cf-dialog-header">
          <span>🔗 {{ cfData?.platform || '第三方 OJ' }} 远程提交</span>
          <button class="cf-close" @click="cfDialog = false">×</button>
        </div>
        <div class="cf-dialog-body">
          <p style="margin-bottom:12px">{{ cfAutoMessage }}</p>
          <p v-if="cfOpenBlocked" style="margin:0 0 12px; color:#e65100; font-size:14px;">
            浏览器拦截了新标签页。点击下方按钮继续同一个提交任务。
          </p>

          <div class="cf-step">
            <span class="cf-step-num">1</span>
            <span class="cf-step-text">{{ cfData?.platform || '第三方 OJ' }} 页面会自动选择语言: <b>{{ cfData?.language }}</b></span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">2</span>
            <span class="cf-step-text">
              辅助脚本会自动填入代码并点击 Submit
              <a
                v-if="cfData?.platform === '洛谷'"
                href="/install-oj-helpers.html"
                target="_blank"
                rel="noopener noreferrer"
                style="margin-left:6px;color:#1d5a96;font-weight:700;text-decoration:underline"
              >安装 / 更新 Luogu Helper</a>
            </span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">3</span>
            <span class="cf-step-text">识别提交编号并回传成功后，第三方 OJ 标签页会自动关闭</span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">4</span>
            <span class="cf-step-text">此页面会持续轮询并展示最终评测结果</span>
          </div>
          <div class="cf-code-preview">
            <pre>{{ cfData?.code }}</pre>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px">
            <button class="cf-btn cf-btn-primary" @click="copyCfCode">
              📋 再次复制代码
            </button>
            <button class="cf-btn cf-btn-secondary" @click="retryOpenCf">
              🔗 重新打开提交页面
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="wrongResolvedOpen" class="wrong-resolved-overlay" role="dialog" aria-modal="true" aria-labelledby="wrong-resolved-title">
      <section class="wrong-resolved-dialog">
        <span class="resolved-icon">✓</span>
        <h2 id="wrong-resolved-title">这道错题已经通过</h2>
        <p>移出错题本前，是否收藏以便后续回看？</p>
        <div class="resolved-actions">
          <button class="keep-favorite" :disabled="resolvingWrong" @click="resolveWrongBook(true)"><Star :size="16" />收藏并移出错题</button>
          <button class="remove-only" :disabled="resolvingWrong" @click="resolveWrongBook(false)">直接移出错题</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.problem-page {
  --ink: #1f3145;
  --muted: #718396;
  --line: #dfe7ef;
  --blue: #2469ad;
  --navy: #173b66;
  --surface: #fff;
  max-width: 1440px;
  margin: 0 auto;
  padding: 18px 20px 40px;
  color: var(--ink);
}
.preview-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 14px;
  padding: 12px 16px;
  border: 1px solid #c7d2fe;
  border-radius: 14px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 13px;
  line-height: 1.55;
}
.preview-banner strong {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 850;
}
.preview-banner span {
  min-width: 0;
  flex: 1 1 240px;
  color: #4338ca;
}
.problem-header {
  margin-bottom: 16px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fbfe 0%, #fff 100%);
  box-shadow: 0 8px 22px rgba(23, 59, 102, .05);
}
.problem-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.problem-title-block { min-width: 0; flex: 1; }
.problem-kicker {
  margin: 0 0 6px;
  color: #2f6fa8;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .04em;
}
.problem-header h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(22px, 2.2vw, 28px);
  line-height: 1.25;
  letter-spacing: 0;
}
.problem-header-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.header-link,
.favorite-command {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid #d4dce5;
  border-radius: 8px;
  color: #526579;
  background: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  text-decoration: none;
  cursor: pointer;
}
.header-link:hover,
.header-link.active { border-color: #9fc0de; color: var(--blue); background: #edf5fc; }
.favorite-command:hover,
.favorite-command.active {
  border-color: #e2c45c;
  color: #846100;
  background: #fff8d8;
}
.detail-state { margin-top: 10px; }
.feedback-banner {
  margin: 12px 0 0;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
}
.feedback-banner.success { color: #087447; background: #eaf8f1; }
.feedback-banner.error { color: #b42318; background: #fff1f2; }
.feedback-form {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #d7e5f0;
  border-radius: 10px;
  background: #f5f9fd;
}
.feedback-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.feedback-form-header strong { color: #214f79; font-size: 13px; }
.feedback-close {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: #718396;
  background: transparent;
  cursor: pointer;
}
.feedback-close:hover { color: #2469ad; background: #e7efff; }
.feedback-form select,
.feedback-form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd7e1;
  border-radius: 7px;
  background: #fff;
  color: #253447;
  font: inherit;
}
.feedback-form select { min-height: 36px; padding: 0 9px; }
.feedback-form textarea { min-height: 94px; padding: 9px; resize: vertical; }
.feedback-form footer { display: flex; justify-content: flex-end; gap: 8px; }
.plain-button,
.submit-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  font: inherit;
  cursor: pointer;
}
.plain-button { padding: 0 11px; color: #607287; background: transparent; }
.submit-button {
  padding: 0 12px;
  border-radius: 7px;
  color: #fff;
  background: #2469ad;
  font-weight: 800;
}
.submit-button:hover { background: #1d5a96; }
.submit-button:disabled { opacity: .55; cursor: default; }
.problem-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #e3ebf2;
  border-radius: 999px;
  color: #516579;
  background: #f7fafd;
  font-size: 12px;
  font-weight: 650;
}
.meta-item.tags { gap: 5px; }
.meta-item.tags i {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: 999px;
  color: #1f5eff;
  background: #e7efff;
  font-style: normal;
  font-size: 11px;
  font-weight: 750;
}
.content-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(420px, .95fr);
  gap: 16px;
  align-items: start;
}
.card {
  margin-bottom: 14px;
  padding: 18px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 8px 20px rgba(23, 59, 102, .04);
}
.statement-card { padding: 20px 22px; }
.desc { overflow-x: auto; color: #2c3e50; font-size: 15px; line-height: 1.8; }
.desc :deep(h2) { margin: 0 0 12px; color: #1f3145; font-size: 19px; }
.desc :deep(h3) {
  margin: 20px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #edf1f5;
  color: #29475f;
  font-size: 16px;
}
.desc :deep(h4) { margin: 16px 0 6px; font-size: 15px; }
.desc :deep(p) { margin: 8px 0; }
.desc :deep(code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: #eef3f8;
  color: #1f4f7a;
  font-size: 13px;
}
.desc :deep(pre) {
  margin: 12px 0;
  padding: 14px;
  overflow-x: auto;
  border-radius: 8px;
  background: #1e2430;
  color: #d7deea;
  font-size: 13px;
}
.desc :deep(pre code) { padding: 0; background: none; color: inherit; }
.desc :deep(ul), .desc :deep(ol) { margin: 8px 0; padding-left: 24px; }
.desc :deep(li) { margin: 2px 0; }
.desc :deep(table) { width: auto; margin: 12px 0; border-collapse: collapse; }
.desc :deep(th), .desc :deep(td) { padding: 6px 12px; border: 1px solid #dde5ee; text-align: left; }
.desc :deep(th) { background: #f7fafd; font-weight: 700; }
.desc :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid #6aa8e0;
  border-radius: 0 6px 6px 0;
  background: #f5f9fd;
  color: #516579;
}
.desc :deep(hr) { margin: 16px 0; border: none; border-top: 1px solid #edf1f5; }
.desc :deep(.katex) { font-size: 1.05em; }
.desc :deep(.katex-display) { margin: 12px 0; text-align: center; }
.desc :deep(.katex-display > .katex) { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
.sample-section { margin-top: 22px; padding-top: 18px; border-top: 1px solid #edf1f5; }
.sample-section h3 { margin: 0 0 12px; color: #1f3145; font-size: 16px; }
.sample-pair + .sample-pair { margin-top: 14px; }
.sample-block + .sample-block { margin-top: 10px; }
.sample-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sample-title {
  display: inline-flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  color: #24639b;
  background: #edf6ff;
  font-size: 12px;
  font-weight: 800;
}
.sample-block pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  border-radius: 8px;
  color: #d7deea;
  background: #1e2430;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.editor-panel { min-width: 0; }
.editor-sticky {
  position: sticky;
  top: 72px;
}
.editor-card { padding: 0; overflow: hidden; }
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #2c3340;
  background: #232833;
}
.editor-toolbar-left {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.editor-label {
  color: #9fb0c5;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
}
.lang-select {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #424b5c;
  border-radius: 7px;
  color: #d7deea;
  background: #2b3240;
  font: inherit;
  font-size: 13px;
}
.btn-submit {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: linear-gradient(180deg, #2f86d8 0%, #2469ad 100%);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(36, 105, 173, .28);
}
.btn-submit:hover { filter: brightness(1.05); }
.btn-submit:disabled { opacity: .55; cursor: default; box-shadow: none; }
.btn-submit .spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cm-editor-host { height: min(62vh, 560px); min-height: 360px; }
.cm-editor-host :deep(.cm-editor) { height: 100%; }
.cm-editor-host :deep(.cm-scroller) { overflow: auto; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; }
.result-card { border-left: 4px solid #3498db; }
.result-header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.result-badge {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  line-height: 28px;
}
.result-score { color: var(--ink); font-size: 15px; font-weight: 800; }
.result-info { color: var(--muted); font-size: 12px; }
.compile-box {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  background: #fff3e0;
  font-size: 12px;
}
.compile-box pre { margin: 0; white-space: pre-wrap; font-family: Consolas, monospace; }
.cases { margin-top: 12px; }
.cases-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  color: var(--blue);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.toggle-arrow { color: var(--muted); font-size: 12px; font-weight: 650; }
.cases-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.case-dot {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.case-dot.ac { background: #27ae60; }
.case-dot.wa { background: #e74c3c; }
.exhausted-card {
  border-left: 4px solid #f39c12;
  background: #fff8e1;
}
.exhausted-card p {
  margin: 0;
  color: #b35c00;
  font-size: 13px;
  line-height: 1.6;
}
.link-button {
  padding: 0;
  border: 0;
  color: #2469ad;
  background: transparent;
  font: inherit;
  font-weight: 750;
  text-decoration: underline;
  cursor: pointer;
}
.error-msg, .error-card { color: #c0392b; padding: 16px; text-align: center; }
.error-card { background: #fdecea; border-left: 4px solid #e74c3c; }

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

/* 第三方 OJ 远程提交弹窗 */
.cf-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.cf-dialog { background: #fff; border-radius: 12px; width: 560px; max-width: 90vw; max-height: 85vh; overflow: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.cf-dialog-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; font-size: 16px; font-weight: 600; }
.cf-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #999; }
.cf-close:hover { color: #333; }
.cf-dialog-body { padding: 16px 20px; }
.wrong-resolved-overlay { position: fixed; inset: 0; z-index: 11000; display: grid; place-items: center; padding: 20px; background: rgba(18, 31, 43, .58); }
.wrong-resolved-dialog { width: min(430px, 100%); padding: 28px; border: 1px solid #dbe4ed; border-radius: 8px; color: #26384d; text-align: center; background: #fff; box-shadow: 0 22px 60px rgba(18, 31, 43, .24); }
.resolved-icon { display: grid; width: 44px; height: 44px; margin: 0 auto 14px; place-items: center; border-radius: 50%; color: #fff; background: #25815f; font-size: 23px; font-weight: 800; }
.wrong-resolved-dialog h2 { margin: 0 0 8px; font-size: 21px; }
.wrong-resolved-dialog p { color: #718094; font-size: 13px; }
.resolved-actions { display: grid; grid-template-columns: 1.35fr 1fr; gap: 9px; margin-top: 22px; }
.resolved-actions button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 6px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; }
.keep-favorite { border: 1px solid #e2c45c; color: #7b5b00; background: #fff8d8; }
.remove-only { border: 1px solid #cbd6e0; color: #526579; background: #f7f9fb; }
.resolved-actions button:disabled { opacity: .58; cursor: wait; }
.problem-discussion-mount { margin-top: 18px; }
.contest-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid #d7e4f2;
  border-radius: 10px;
  background: linear-gradient(180deg, #f4f9ff 0%, #eef5fc 100%);
}
.contest-back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1d5f98;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}
.contest-back-link:hover { color: #124772; text-decoration: underline; }
.contest-mode-hint {
  color: #6b8198;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.problem-header.contest-header {
  padding-bottom: 14px;
}
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

@media (max-width: 1100px) {
  .content-split { grid-template-columns: 1fr; }
  .editor-sticky { position: static; top: auto; }
  .cm-editor-host { height: 420px; min-height: 320px; }
  .sample-pair { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .problem-page { padding: 12px 12px 28px; }
  .problem-header { padding: 14px; }
  .problem-title-row { flex-direction: column; }
  .problem-header-actions { width: 100%; justify-content: flex-start; }
  .header-link, .favorite-command { flex: 1 1 auto; }
  .statement-card { padding: 14px; }
}
</style>
