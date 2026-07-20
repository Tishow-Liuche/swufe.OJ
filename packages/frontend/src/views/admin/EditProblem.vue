<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../api/client';
import { renderMarkdownWithMath } from '../../utils/markdown';
import { pointDifficultyOptions } from '../../utils/pointDifficulty';

type JudgeMode = 'STANDARD' | 'SPJ';

const route = useRoute();
const router = useRouter();
const problemId = computed(() => String(route.params.id || ''));
const loading = ref(false);
const saving = ref(false);
const preview = ref(false);
const error = ref('');
const message = ref('');
const testDataFile = ref<File | null>(null);
const existingTestCount = ref(0);

const form = reactive({
  title: '',
  description: '',
  difficulty: 'POINT_1',
  timeLimit: 1000,
  memoryLimit: 256,
  outputLimit: 64,
  tags: '',
  inputFormat: '',
  outputFormat: '',
  sampleInput: '',
  sampleOutput: '',
  hint: '',
  dataRange: '',
  status: 'DRAFT',
  judgeMode: 'STANDARD' as JudgeMode,
  spjLanguage: 'python',
  spjSourceCode: '',
});

const difficulties = pointDifficultyOptions;

const languages = [
  { value: 'python', label: 'Python 3' },
  { value: 'cpp', label: 'C++17' },
  { value: 'c', label: 'C11' },
  { value: 'java', label: 'Java' },
];

const validationError = computed(() => {
  if (!form.title.trim()) return '请填写题目标题';
  if (!form.description.trim()) return '请填写题面';
  if (testDataFile.value && !testDataFile.value.name.toLowerCase().endsWith('.zip')) return '测试数据必须是 ZIP 文件';
  if (form.judgeMode === 'SPJ') {
    if (!form.spjLanguage) return 'SPJ 题目必须选择评测代码语言';
    if (!form.spjSourceCode.trim()) return 'SPJ 题目必须录入评测代码';
  }
  return '';
});

function onZipSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  testDataFile.value = input.files?.[0] || null;
}

function renderMd(text: string) {
  return renderMarkdownWithMath(text);
}

async function loadProblem() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/api/problems/mine/created/${problemId.value}`);
    const version = data.versions?.[0] || {};
    const checker = version.checker || {};
    form.title = data.title || '';
    form.description = version.description || '';
    form.difficulty = data.difficulty || 'POINT_1';
    form.timeLimit = data.timeLimit || 1000;
    form.memoryLimit = data.memoryLimit || 256;
    form.outputLimit = data.outputLimit || 64;
    form.tags = (data.tags || []).map((tag: any) => tag.name).join(', ');
    form.inputFormat = version.inputFormat || '';
    form.outputFormat = version.outputFormat || '';
    form.sampleInput = version.sampleInput || '';
    form.sampleOutput = version.sampleOutput || '';
    form.hint = version.hint || '';
    form.dataRange = version.dataRange || '';
    form.status = data.status || 'DRAFT';
    form.judgeMode = checker.type === 'SPJ' ? 'SPJ' : 'STANDARD';
    form.spjLanguage = checker.language || 'python';
    form.spjSourceCode = checker.sourceCode || '';
    existingTestCount.value = version.testCases?.length || 0;
  } catch (e: any) {
    error.value = e.response?.data?.message || '加载题目失败';
  } finally {
    loading.value = false;
  }
}

async function saveProblem() {
  error.value = validationError.value;
  message.value = '';
  if (error.value) return;

  saving.value = true;
  try {
    const tags = form.tags.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean);
    const targetStatus = form.status;
    await api.patch(`/api/problems/${problemId.value}`, {
      title: form.title,
      difficulty: form.difficulty,
      timeLimit: form.timeLimit,
      memoryLimit: form.memoryLimit,
      outputLimit: form.outputLimit,
      description: form.description,
      inputFormat: form.inputFormat,
      outputFormat: form.outputFormat,
      sampleInput: form.sampleInput,
      sampleOutput: form.sampleOutput,
      hint: form.hint,
      dataRange: form.dataRange,
      tags,
      judgeMode: form.judgeMode,
      spjLanguage: form.judgeMode === 'SPJ' ? form.spjLanguage : undefined,
      spjSourceCode: form.judgeMode === 'SPJ' ? form.spjSourceCode : undefined,
      status: targetStatus === 'DRAFT' ? 'DRAFT' : undefined,
    });

    if (testDataFile.value) {
      const fd = new FormData();
      fd.append('file', testDataFile.value);
      const { data } = await api.post(`/api/problems/${problemId.value}/testdata`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      existingTestCount.value = data.testCount || existingTestCount.value;
    }

    if (['PUBLISHED', 'CONTEST_RESERVED'].includes(targetStatus)) {
      await api.patch(`/api/problems/${problemId.value}/status`, { status: targetStatus });
    }

    message.value = '题目已保存';
    testDataFile.value = null;
    await loadProblem();
  } catch (e: any) {
    error.value = e.response?.data?.message || '保存题目失败';
  } finally {
    saving.value = false;
  }
}

onMounted(loadProblem);
</script>

<template>
  <div class="edit-page">
    <div class="page-header">
      <div>
        <h2>编辑历史录题</h2>
        <p>修改题面、样例、SPJ 配置，并可重新上传 ZIP 替换测试数据。</p>
      </div>
      <button class="btn-back" @click="router.push('/admin/problems/history')">返回历史录题</button>
    </div>

    <div v-if="loading" class="card">正在加载题目...</div>
    <template v-else>
      <div class="card">
        <h3>基础信息</h3>
        <div class="form-grid">
          <label class="full">题目标题<input v-model="form.title" /></label>
          <label>评测方式
            <select v-model="form.judgeMode">
              <option value="STANDARD">普通题</option>
              <option value="SPJ">SPJ</option>
            </select>
          </label>
          <label>状态
            <select v-model="form.status">
              <option value="DRAFT">草稿</option>
              <option value="CONTEST_RESERVED">比赛预备题库</option>
              <option value="PUBLISHED">发布</option>
            </select>
          </label>
          <label>难度
            <select v-model="form.difficulty">
              <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
            </select>
          </label>
          <label>标签<input v-model="form.tags" placeholder="动态规划, 图论" /></label>
          <label>时间限制(ms)<input v-model.number="form.timeLimit" type="number" min="100" /></label>
          <label>内存限制(MB)<input v-model.number="form.memoryLimit" type="number" min="16" /></label>
          <label>输出限制(MB)<input v-model.number="form.outputLimit" type="number" min="4" /></label>
        </div>
      </div>

      <div class="card">
        <h3>替换测试数据 ZIP</h3>
        <p class="hint">当前测试点：{{ existingTestCount }} 组。选择新 ZIP 后保存，会替换旧测试点；不选择则保留旧测试点。</p>
        <div class="format-box" v-if="form.judgeMode === 'STANDARD'">
          普通题：ZIP 内使用 1.in + 1.out / 1.ans，2.in + 2.out ...
        </div>
        <div class="format-box spj" v-else>
          SPJ：ZIP 内只需要 1.in、2.in ...，判题由下方 SPJ 代码完成。
        </div>
        <input type="file" accept=".zip" @change="onZipSelected" />
        <p v-if="testDataFile" class="file-name">已选择：{{ testDataFile.name }}</p>
      </div>

      <div v-if="form.judgeMode === 'SPJ'" class="card">
        <h3>SPJ 评测代码</h3>
        <label>语言
          <select v-model="form.spjLanguage">
            <option v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
          </select>
        </label>
        <label>代码<textarea v-model="form.spjSourceCode" rows="10" class="code-editor"></textarea></label>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>题面 Markdown</h3>
          <button class="btn-toggle" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</button>
        </div>
        <textarea v-if="!preview" v-model="form.description" rows="18" class="main-editor"></textarea>
        <div v-else class="preview-area" v-html="renderMd(form.description)"></div>
      </div>

      <div class="card">
        <h3>格式、样例与提示</h3>
        <div class="form-grid">
          <label class="full">输入格式<textarea v-model="form.inputFormat" rows="3"></textarea></label>
          <label class="full">输出格式<textarea v-model="form.outputFormat" rows="3"></textarea></label>
          <label class="full">样例输入<textarea v-model="form.sampleInput" rows="4"></textarea></label>
          <label class="full">样例输出<textarea v-model="form.sampleOutput" rows="4"></textarea></label>
          <label class="full">数据范围<textarea v-model="form.dataRange" rows="3"></textarea></label>
          <label class="full">提示<textarea v-model="form.hint" rows="3"></textarea></label>
        </div>
      </div>

      <div class="actions">
        <button class="btn-primary" :disabled="saving || Boolean(validationError)" @click="saveProblem">
          {{ saving ? '保存中...' : '保存修改' }}
        </button>
        <button class="btn-secondary" @click="router.push(`/problems/${problemId}`)">查看题目</button>
      </div>
      <p v-if="validationError" class="hint danger">{{ validationError }}</p>
      <div v-if="message" class="card success">{{ message }}</div>
      <div v-if="error" class="card error-card">{{ error }}</div>
    </template>
  </div>
</template>

<style scoped>
.edit-page { max-width: 1040px; margin: 0 auto; padding: 22px; }
.page-header, .card-header, .actions { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 6px; }
.page-header p, .hint { color: #7b8493; font-size: 13px; margin: 0 0 12px; }
.card { background: #fff; border-radius: 12px; padding: 22px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.card h3 { margin: 0 0 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
label { display: block; color: #56606f; font-size: 13px; font-weight: 700; }
label.full { grid-column: 1 / -1; }
input, select, textarea { width: 100%; margin-top: 5px; padding: 10px 12px; border: 1px solid #dbe1ea; border-radius: 8px; font: inherit; background: #fff; box-sizing: border-box; }
textarea, .main-editor, .code-editor { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; line-height: 1.6; resize: vertical; }
.main-editor { width: 100%; min-height: 360px; background: #fafbfc; }
.preview-area { min-height: 360px; border: 1px solid #dbe1ea; border-radius: 8px; padding: 16px; background: #fafbfc; line-height: 1.75; overflow-x: auto; }
.preview-area :deep(pre), .format-box { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; overflow-x: auto; }
.preview-area :deep(.katex-display > .katex) { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
.format-box { margin-bottom: 12px; background: #f7fbff; color: #3a4a5f; border: 1px dashed #9cc7ff; }
.format-box.spj { background: #fbf8ff; border-color: #c7a4ff; }
.file-name { color: #2e7d32; font-size: 13px; margin-top: 10px; }
.btn-back, .btn-toggle, .btn-secondary, .btn-primary { border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; font-weight: 800; }
.btn-back, .btn-toggle, .btn-secondary { background: #f1f5f9; color: #334155; }
.btn-primary { background: #4fc3f7; color: #102033; min-width: 160px; }
.btn-primary:disabled { opacity: .55; cursor: default; }
.success { color: #1b7f3a; background: #e8f5e9; }
.error-card, .danger { color: #c62828; }
@media (max-width: 720px) {
  .page-header, .card-header, .actions { flex-direction: column; align-items: stretch; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
