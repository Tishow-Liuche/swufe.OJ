<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../api/client';

type JudgeMode = 'STANDARD' | 'SPJ';

const router = useRouter();

const form = reactive({
  title: '',
  description: `## 题目描述\n\n\n## 输入格式\n\n\n## 输出格式\n\n\n## 样例\n### 输入 #1\n\`\`\`\n\n\`\`\`\n### 输出 #1\n\`\`\`\n\n\`\`\`\n\n## 数据范围\n\n\n## 提示\n`,
  difficulty: 'POPULAR',
  timeLimit: 1000,
  memoryLimit: 256,
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
  spjSourceCode: 'import sys\n# stdin 是用户程序输出\nprint(sys.stdin.read().strip() == "答案")\n',
});

const testDataFile = ref<File | null>(null);
const submitting = ref(false);
const result = ref<any>(null);
const uploadResult = ref<any>(null);
const error = ref('');
const preview = ref(false);

const difficulties = [
  { value: 'BEGINNER', label: '入门' },
  { value: 'POPULAR', label: '普及' },
  { value: 'IMPROVE', label: '提高' },
  { value: 'PROVINCIAL', label: '省选' },
  { value: 'NOI', label: 'NOI' },
];

const languages = [
  { value: 'python', label: 'Python 3' },
  { value: 'cpp', label: 'C++17' },
  { value: 'c', label: 'C11' },
  { value: 'java', label: 'Java' },
];

const validationError = computed(() => {
  if (!form.title.trim()) return '请填写题目标题';
  if (!form.description.trim()) return '请填写题面';
  if (!testDataFile.value) return '请上传测试数据 ZIP 包';
  if (!testDataFile.value.name.toLowerCase().endsWith('.zip')) return '测试数据必须是 ZIP 文件';
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

async function createProblem() {
  error.value = validationError.value;
  if (error.value) return;

  submitting.value = true;
  result.value = null;
  uploadResult.value = null;
  try {
    const tags = form.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    const payload = {
      ...form,
      status: 'DRAFT',
      tags,
      inputFormat: form.inputFormat || extractSection(form.description, '输入格式'),
      outputFormat: form.outputFormat || extractSection(form.description, '输出格式'),
    };
    const { data: created } = await api.post('/api/problems', payload);
    result.value = created;

    const fd = new FormData();
    fd.append('file', testDataFile.value as File);
    const { data: imported } = await api.post(`/api/problems/${created.id}/testdata`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    uploadResult.value = imported;

    if (form.status === 'PUBLISHED') {
      await api.patch(`/api/problems/${created.id}/status`, { status: 'PUBLISHED' });
      result.value = { ...created, status: 'PUBLISHED' };
    }
  } catch (e: any) {
    error.value = e.response?.data?.message || '创建或上传测试数据失败';
  } finally {
    submitting.value = false;
  }
}

function extractSection(md: string, heading: string): string {
  const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
  const match = md.match(regex);
  return match ? match[1].trim() : '';
}

async function publishProblem() {
  if (!result.value?.id) return;
  await api.patch(`/api/problems/${result.value.id}/status`, { status: 'PUBLISHED' });
  result.value.status = 'PUBLISHED';
  router.push(`/problems/${result.value.id}`);
}

function renderMd(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/\n/g, '<br>');
}
</script>

<template>
  <div class="editor-page">
    <div class="page-header">
      <div>
        <p class="workspace-kicker">PROBLEM STUDIO</p>
        <h2>录入题目</h2>
        <p>在一个工作区内完成命题、测试数据和题面编辑。</p>
      </div>
      <button class="btn-back" @click="router.push('/problems')">返回题库</button>
    </div>

    <div class="card">
      <h3>基础信息</h3>
      <div class="form-grid">
        <div class="form-group full">
          <label>题目标题 <span class="required">*</span></label>
          <input v-model="form.title" placeholder="例如：A+B Problem" />
        </div>
        <div class="form-group">
          <label>评测方式 <span class="required">*</span></label>
          <select v-model="form.judgeMode">
            <option value="STANDARD">普通题：1.in + 1.out / 1.ans</option>
            <option value="SPJ">SPJ：只需要 1.in，使用评测代码判定</option>
          </select>
        </div>
        <div class="form-group">
          <label>初始状态</label>
          <select v-model="form.status">
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">上传成功后直接发布</option>
          </select>
        </div>
        <div class="form-group">
          <label>难度</label>
          <select v-model="form.difficulty">
            <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>标签（逗号或空格分隔）</label>
          <input v-model="form.tags" placeholder="动态规划, 背包, NOIP" />
        </div>
        <div class="form-group">
          <label>时间限制 (ms)</label>
          <input v-model.number="form.timeLimit" type="number" min="100" max="60000" />
        </div>
        <div class="form-group">
          <label>内存限制 (MB)</label>
          <input v-model.number="form.memoryLimit" type="number" min="16" max="4096" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>测试数据 ZIP 包</h3>
      </div>
      <div v-if="form.judgeMode === 'STANDARD'" class="format-box">
        <strong>普通题 ZIP 格式：</strong>
        <pre>1.in
1.out
2.in
2.out
...
100.in
100.out</pre>
        <p>也支持 `.ans` 作为输出文件，例如 `1.ans`。每个 `.in` 必须有同编号 `.out` 或 `.ans`。</p>
      </div>
      <div v-else class="format-box spj">
        <strong>SPJ ZIP 格式：</strong>
        <pre>1.in
2.in
3.in
...
100.in</pre>
        <p>SPJ 不需要输出文件。用户程序输出会作为评测代码的标准输入。</p>
      </div>
      <input type="file" accept=".zip" @change="onZipSelected" />
      <p v-if="testDataFile" class="file-name">已选择：{{ testDataFile.name }}</p>
    </div>

    <div v-if="form.judgeMode === 'SPJ'" class="card">
      <h3>SPJ 评测代码</h3>
      <p class="hint">
        评测代码从标准输入读取用户程序输出；输出 true / 1 / yes / AC / accepted / correct 表示通过，其它输出表示 WA。
      </p>
      <div class="form-group">
        <label>评测代码语言</label>
        <select v-model="form.spjLanguage">
          <option v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>评测代码</label>
        <textarea v-model="form.spjSourceCode" rows="12" class="code-editor"></textarea>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>题面编辑（Markdown）</h3>
        <button class="btn-toggle" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</button>
      </div>
      <textarea v-if="!preview" v-model="form.description" rows="18" class="main-editor" spellcheck="false"></textarea>
      <div v-else class="preview-area" v-html="renderMd(form.description)"></div>
    </div>

    <div class="card">
      <h3>样例</h3>
      <div class="form-grid">
        <div class="form-group full">
          <label>样例输入</label>
          <textarea v-model="form.sampleInput" rows="4" placeholder="1 2"></textarea>
        </div>
        <div class="form-group full">
          <label>样例输出</label>
          <textarea v-model="form.sampleOutput" rows="4" placeholder="3"></textarea>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" @click="createProblem" :disabled="submitting || Boolean(validationError)">
        {{ submitting ? '创建并导入中...' : '创建题目并导入 ZIP 测试数据' }}
      </button>
      <p v-if="validationError" class="hint danger">{{ validationError }}</p>
    </div>

    <div v-if="result" class="card result-card">
      <h3>题目创建成功</h3>
      <p><b>ID:</b> {{ result.id }}</p>
      <p><b>标题:</b> {{ result.title }}</p>
      <p v-if="uploadResult"><b>测试点：</b>{{ uploadResult.testCount }} 组（{{ uploadResult.judgeMode }}）</p>
      <div class="publish-section" v-if="result.status !== 'PUBLISHED'">
        <button class="btn-publish" @click="publishProblem">发布题目</button>
      </div>
      <div v-else>
        <button class="btn-publish" @click="router.push(`/problems/${result.id}`)">查看题目</button>
      </div>
    </div>

    <div v-if="error" class="card error-card">
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.editor-page { max-width: 1040px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 16px; }
.page-header h2 { margin: 0; }
.page-header p { margin: 6px 0 0; color: #7b8493; font-size: 13px; }
.btn-back { padding: 7px 16px; background: #f5f5f5; border: none; border-radius: 6px; cursor: pointer; color: #666; font-size: 14px; }
.card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.card h3 { margin: 0 0 16px; font-size: 16px; color: #333; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 16px; }
.btn-toggle { padding: 5px 14px; background: #f0f0f0; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.form-group.full { grid-column: 1 / -1; }
.form-group label { display: block; margin-bottom: 4px; font-size: 13px; color: #666; font-weight: 600; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 7px;
  font-size: 14px; box-sizing: border-box; font-family: inherit; background: #fff;
}
.form-group textarea, .main-editor, .code-editor {
  font-family: 'Cascadia Code', 'Fira Code', 'Courier New', monospace;
  font-size: 13px; resize: vertical; line-height: 1.6;
}
.required { color: #e74c3c; }
.main-editor {
  width: 100%; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px;
  box-sizing: border-box; background: #fafbfc;
}
.main-editor:focus, textarea:focus, input:focus, select:focus {
  outline: none; border-color: #4fc3f7; box-shadow: 0 0 0 3px rgba(79,195,247,0.14);
}
.preview-area { padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; min-height: 300px; background: #fafbfc; line-height: 1.7; }
.preview-area :deep(h3) { font-size: 17px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 4px; }
.preview-area :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
.preview-area :deep(pre), .format-box pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; }
.hint { font-size: 13px; color: #888; margin: 0 0 12px; line-height: 1.6; }
.hint.danger { color: #d93025; text-align: center; margin-top: 10px; }
.format-box { border: 1px dashed #9cc7ff; background: #f7fbff; border-radius: 10px; padding: 14px; margin-bottom: 14px; color: #3a4a5f; }
.format-box.spj { border-color: #c7a4ff; background: #fbf8ff; }
.format-box p { margin: 8px 0 0; color: #66717e; font-size: 13px; }
.file-name { color: #2e7d32; font-size: 13px; margin: 10px 0 0; }
.actions { margin-bottom: 20px; }
.btn-primary {
  width: 100%; padding: 14px; background: #4fc3f7; color: #1a1a2e;
  border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;
}
.btn-primary:hover { background: #29b6f6; }
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-publish { padding: 12px 32px; background: #27ae60; color: #fff; font-size: 15px; border: none; border-radius: 7px; cursor: pointer; font-weight: 600; }
.btn-publish:hover { background: #219a52; }
.result-card { background: #e8f5e9; border: 1px solid #a5d6a7; }
.error-card { background: #fce4ec; border: 1px solid #ef9a9a; color: #c62828; }
.publish-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid #c8e6c9; }
@media (max-width: 700px) {
  .page-header, .card-header { flex-direction: column; align-items: stretch; }
  .form-grid { grid-template-columns: 1fr; }
}

/* Recording problems shares the same quiet workspace language as the main product. */
.editor-page { width: min(1180px, calc(100% - 40px)); max-width: none; padding: 28px 0 64px; font-family: 'Manrope Variable', 'Noto Sans SC Variable', 'Microsoft YaHei', sans-serif; }
.page-header { min-height: 158px; margin-bottom: 20px; padding: 28px 32px; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 10px 24px rgba(31, 66, 104, .08); }
.workspace-kicker { margin: 0 0 7px; color: #3977aa; font-size: 11px; font-weight: 850; letter-spacing: 0; }
.page-header h2 { color: #1f2a37; font-size: 34px; letter-spacing: 0; }
.page-header p:not(.workspace-kicker) { color: #66778a; font-size: 14px; line-height: 1.65; }
.btn-back { border: 1px solid #aec7f4; border-radius: 6px; background: #e7efff; color: #1f5eff; font-weight: 750; }
.btn-back:hover { border-color: #8fb8ef; background: #dce9ff; }
.card { margin-bottom: 18px; padding: 24px; border: 1px solid #dfe7ef; border-radius: 8px; box-shadow: 0 7px 20px rgba(31, 66, 104, .04); }
.card h3 { color: #24364b; font-size: 17px; }
.card-header { padding-bottom: 14px; border-bottom: 1px solid #e6edf4; }
.btn-toggle { border: 1px solid #c6daf2; border-radius: 6px; background: #f4f8ff; color: #1f5eff; font-weight: 750; }
.form-group label { color: #52677c; }
.form-group input, .form-group select, .form-group textarea { border-color: #ccd9e6; border-radius: 6px; color: #24364b; }
.main-editor { border-color: #ccd9e6; border-radius: 7px; background: #fbfcfe; }
.main-editor:focus, textarea:focus, input:focus, select:focus { border-color: #3979ad; box-shadow: 0 0 0 3px #deedf9; }
.preview-area { border-color: #dce5ef; border-radius: 7px; background: #fbfcfe; }
.preview-area :deep(h3) { color: #24364b; border-bottom-color: #e6edf4; }
.preview-area :deep(code) { background: #edf3fa; color: #34536f; }
.format-box, .format-box.spj { border-color: #b9d3ef; border-radius: 7px; background: #f5f9fe; color: #34536f; }
.format-box pre { border: 1px solid #d6e3f0; background: #eef4fb; color: #34536f; }
.btn-primary { border-radius: 7px; background: #2469ad; color: #fff; box-shadow: none; }
.btn-primary:hover { background: #1b578f; }
.result-card { border-color: #b9dec9; background: #f3fbf6; }
.error-card { border-color: #f0c8c6; background: #fff5f4; }
@media (max-width: 700px) { .editor-page { width: min(100% - 28px, 1180px); padding-top: 18px; }.page-header { min-height: auto; padding: 22px; }.page-header h2 { font-size: 29px; }.btn-back { width: fit-content; } }
</style>
