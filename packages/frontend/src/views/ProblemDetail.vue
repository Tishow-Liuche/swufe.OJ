<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api/client';
import * as monaco from 'monaco-editor';

const route = useRoute();
const problem = ref<any>(null);
const code = ref('');
const language = ref('cpp');
const result = ref<any>(null);
const submitting = ref(false);
const errorMsg = ref('');
const showAllCases = ref(false);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let pollTimer: any = null;

const editorContainer = ref<HTMLElement | null>(null);

const languageTemplates: Record<string, string> = {
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
  python: '# 输入用 input().split()\n\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n',
};

const langMap: Record<string, string> = { cpp: 'cpp', c: 'c', python: 'python', java: 'java' };

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
  } catch (e: any) {
    errorMsg.value = '题目加载失败';
  }
  initEditor();
});

onUnmounted(() => {
  editor?.dispose();
  if (pollTimer) clearInterval(pollTimer);
});

function initEditor() {
  if (!editorContainer.value) return;
  editor = monaco.editor.create(editorContainer.value, {
    value: languageTemplates[language.value],
    language: langMap[language.value],
    theme: 'vs-dark',
    fontSize: 14,
    lineNumbers: 'on',
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 2,
  });
  editor.onDidChangeModelContent(() => {
    code.value = editor!.getValue();
  });
  code.value = languageTemplates[language.value];
}

watch(language, (lang) => {
  if (!editor) return;
  const model = editor.getModel();
  if (model) monaco.editor.setModelLanguage(model, langMap[lang] || 'plaintext');
  const tmpl = languageTemplates[lang] || '';
  editor.setValue(tmpl);
  code.value = tmpl;
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
    result.value = { id: data.id, status: 'QUEUING' };
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
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch (e) {
      if (attempts > 10) { clearInterval(pollTimer); pollTimer = null; result.value = { status: 'SYSTEM_ERROR', error: '获取结果超时' }; }
    }
  }, 1500);
}

function renderMd(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/\n/g, '<br>');
}
</script>

<template>
  <div class="problem-page">
    <div v-if="errorMsg && !problem" class="error-msg">{{ errorMsg }}</div>

    <template v-if="problem">
      <!-- 题目头部 -->
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
        <!-- 左侧：题面 -->
        <div class="problem-content">
          <div class="card">
            <div class="desc" v-html="renderMd(problem.versions?.[0]?.description)"></div>
          </div>
        </div>

        <!-- 右侧：代码编辑器 + 提交 -->
        <div class="editor-panel">
          <div class="card editor-card">
            <div class="editor-toolbar">
              <select v-model="language" class="lang-select">
                <option value="cpp">C++</option>
                <option value="c">C</option>
                <option value="python">Python</option>
                <option value="java" disabled>Java (需安装 JDK)</option>
              </select>
              <button class="btn-submit" @click="submitCode" :disabled="submitting">
                {{ submitting ? '提交中...' : '🚀 提交评测' }}
              </button>
            </div>
            <div ref="editorContainer" class="monaco-container"></div>
          </div>

          <!-- 评测结果 -->
          <div v-if="result" class="card result-card">
            <div class="result-header">
              <span class="result-badge" :style="{ background: statusColors[result.status] || '#999' }">
                {{ statusLabels[result.status] || result.status }}
              </span>
              <span v-if="result.score !== undefined" class="result-score">得分: {{ result.score }}</span>
              <span v-if="result.timeUsed" class="result-info">{{ result.timeUsed }}ms · {{ (result.memoryUsed / 1024).toFixed(1) }}MB</span>
            </div>
            <div v-if="result.compileMessage" class="compile-box">
              <pre>{{ result.compileMessage }}</pre>
            </div>
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
    </template>
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

/* 题面 */
.desc { line-height: 1.8; color: #333; font-size: 15px; }
.desc :deep(h2) { font-size: 20px; margin: 0 0 12px; }
.desc :deep(h3) { font-size: 17px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px; margin: 20px 0 10px; }
.desc :deep(h4) { font-size: 15px; margin: 16px 0 6px; }
.desc :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
.desc :deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
.desc :deep(pre code) { background: none; padding: 0; color: inherit; }

/* 编辑器 */
.editor-card { padding: 0; overflow: hidden; }
.editor-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: #1e1e1e; border-bottom: 1px solid #333;
}
.lang-select {
  padding: 6px 12px; background: #333; color: #ccc;
  border: 1px solid #555; border-radius: 4px; font-size: 13px;
}
.btn-submit {
  padding: 8px 20px; background: #4fc3f7; color: #1a1a2e;
  border: none; border-radius: 6px; font-weight: bold; font-size: 14px; cursor: pointer;
}
.btn-submit:hover { background: #29b6f6; }
.btn-submit:disabled { opacity: 0.5; cursor: default; }
.monaco-container { height: 420px; }

/* 结果 */
.result-card { border-left: 4px solid #3498db; }
.result-header { display: flex; align-items: center; gap: 12px; }
.result-badge { padding: 4px 12px; border-radius: 4px; color: #fff; font-weight: bold; font-size: 16px; }
.result-score { font-weight: bold; color: #1a1a2e; font-size: 16px; }
.result-info { color: #888; font-size: 13px; }
.compile-box { margin-top: 12px; background: #fff3e0; padding: 10px; border-radius: 4px; font-size: 12px; }
.compile-box pre { margin: 0; white-space: pre-wrap; font-family: 'Courier New', monospace; }
.cases { margin-top: 12px; }
.cases-toggle { cursor: pointer; font-size: 14px; color: #3498db; font-weight: 500; }
.toggle-arrow { font-size: 10px; margin-left: 4px; }
.cases-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.case-dot {
  width: 36px; height: 36px; border-radius: 6px; display: flex;
  align-items: center; justify-content: center; font-size: 12px;
  font-weight: bold; cursor: default; color: #fff;
}
.case-dot.ac { background: #27ae60; }
.case-dot.wa { background: #e74c3c; }
.error-msg, .error-card { color: #e74c3c; padding: 20px; text-align: center; }
.error-card { background: #fce4ec; }

@media (max-width: 1000px) {
  .content-split { grid-template-columns: 1fr; }
}
</style>
