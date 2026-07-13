<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../api/client';

const router = useRouter();

// 表单
const form = ref({
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
});

const submitting = ref(false);
const result = ref<any>(null);
const error = ref('');
const preview = ref(false);

// 测试数据上传
const testdataFile = ref<File | null>(null);
const testdataResult = ref<any>(null);
const uploadingTestdata = ref(false);
const createdProblemId = ref('');

const difficulties = [
  { value: 'BEGINNER', label: '入门' },
  { value: 'POPULAR', label: '普及' },
  { value: 'IMPROVE', label: '提高' },
  { value: 'PROVINCIAL', label: '省选' },
  { value: 'NOI', label: 'NOI' },
];

async function createProblem() {
  submitting.value = true;
  error.value = '';
  result.value = null;
  try {
    const tags = form.value.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean);
    const { data } = await api.post('/api/problems', {
      ...form.value,
      tags,
      inputFormat: form.value.inputFormat || extractSection(form.value.description, '输入格式'),
      outputFormat: form.value.outputFormat || extractSection(form.value.description, '输出格式'),
    });
    result.value = data;
    createdProblemId.value = data.id;
  } catch (e: any) {
    error.value = e.response?.data?.message || '创建失败';
  } finally {
    submitting.value = false;
  }
}

function extractSection(md: string, heading: string): string {
  const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
  const match = md.match(regex);
  return match ? match[1].trim() : '';
}

async function uploadTestdata() {
  if (!testdataFile.value || !createdProblemId.value) return;
  uploadingTestdata.value = true;
  testdataResult.value = null;
  try {
    const fd = new FormData();
    fd.append('file', testdataFile.value);
    const { data } = await api.post(`/api/problems/${createdProblemId.value}/testdata`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    testdataResult.value = data;
  } catch (e: any) {
    testdataResult.value = { error: e.response?.data?.message || '上传失败' };
  } finally {
    uploadingTestdata.value = false;
  }
}

function onTestdataFile(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) testdataFile.value = input.files[0];
}

async function publishProblem() {
  if (!createdProblemId.value) return;
  await api.patch(`/api/problems/${createdProblemId.value}/status`, { status: 'PUBLISHED' });
  router.push(`/problems/${createdProblemId.value}`);
}

/** 简易 Markdown 渲染 */
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
      <h2>创建题目</h2>
      <button class="btn-back" @click="router.push('/problems')">← 返回题库</button>
    </div>

    <!-- 基本信息 -->
    <div class="card">
      <h3>📋 基本信息</h3>
      <div class="form-grid">
        <div class="form-group full">
          <label>题目标题 <span class="required">*</span></label>
          <input v-model="form.title" placeholder="例如：A+B Problem" />
        </div>
        <div class="form-group">
          <label>难度</label>
          <select v-model="form.difficulty">
            <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>标签（逗号分隔）</label>
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
        <div class="form-group">
          <label>初始状态</label>
          <select v-model="form.status">
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">直接发布</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 题面编辑 -->
    <div class="card">
      <div class="card-header">
        <h3>📝 题面编辑（Markdown）</h3>
        <button class="btn-toggle" @click="preview = !preview">
          {{ preview ? '编辑' : '预览' }}
        </button>
      </div>
      <div v-if="!preview" class="editor-area">
        <textarea
          v-model="form.description"
          rows="20"
          placeholder="支持 Markdown 语法：## 标题、**加粗**、`代码`、```代码块```、$数学公式$"
          spellcheck="false"
        ></textarea>
      </div>
      <div v-else class="preview-area" v-html="renderMd(form.description)"></div>
    </div>

    <!-- 样例 -->
    <div class="card">
      <h3>📌 样例</h3>
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

    <!-- 操作按钮 -->
    <div class="actions">
      <button class="btn-primary" @click="createProblem" :disabled="submitting || !form.title">
        {{ submitting ? '创建中...' : '创建题目' }}
      </button>
    </div>

    <!-- 创建成功 -->
    <div v-if="result" class="card result-card">
      <h3>✅ 题目创建成功</h3>
      <p><b>ID:</b> {{ result.id }}</p>
      <p><b>标题:</b> {{ result.title }}</p>

      <!-- 上传测试数据 -->
      <div class="testdata-section">
        <h4>📦 上传测试数据（ZIP 格式）</h4>
        <p class="hint">每个测试点包含 .in 和 .out/.ans 文件，全部打包为 ZIP</p>
        <div class="upload-row">
          <input type="file" accept=".zip" @change="onTestdataFile" />
          <button class="btn-secondary" @click="uploadTestdata" :disabled="uploadingTestdata || !testdataFile">
            {{ uploadingTestdata ? '上传中...' : '上传' }}
          </button>
        </div>
        <div v-if="testdataResult && !testdataResult.error" class="success-msg">
          ✅ 测试数据已上传 ({{ (testdataResult.size / 1024).toFixed(1) }}KB)
        </div>
        <div v-if="testdataResult?.error" class="error-msg">{{ testdataResult.error }}</div>
      </div>

      <!-- 发布 -->
      <div class="publish-section" v-if="form.status !== 'PUBLISHED'">
        <button class="btn-publish" @click="publishProblem">🚀 发布题目</button>
      </div>
    </div>

    <div v-if="error" class="card error-card">
      <p>❌ {{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.editor-page { max-width: 900px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.btn-back { padding: 6px 16px; background: #f5f5f5; border: none; border-radius: 4px; cursor: pointer; color: #666; font-size: 14px; }

.card { background: #fff; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.card h3 { margin: 0 0 16px; font-size: 16px; color: #333; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h3 { margin: 0; }
.btn-toggle { padding: 4px 14px; background: #f0f0f0; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-group.full { grid-column: 1 / -1; }
.form-group label { display: block; margin-bottom: 4px; font-size: 13px; color: #666; font-weight: 500; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 14px; box-sizing: border-box; font-family: inherit;
}
.form-group textarea { font-family: 'Cascadia Code', 'Fira Code', 'Courier New', monospace; font-size: 13px; resize: vertical; }
.form-group select { background: #fff; }
.required { color: #e74c3c; }

.editor-area textarea {
  width: 100%; padding: 16px; border: 1px solid #e0e0e0; border-radius: 6px;
  font-family: 'Cascadia Code', 'Fira Code', 'Courier New', monospace;
  font-size: 14px; line-height: 1.7; resize: vertical; box-sizing: border-box;
  background: #fafbfc;
}
.editor-area textarea:focus { outline: none; border-color: #4fc3f7; background: #fff; }

.preview-area {
  padding: 16px; border: 1px solid #e0e0e0; border-radius: 6px; min-height: 300px;
  background: #fafbfc; line-height: 1.7;
}
.preview-area :deep(h2) { font-size: 20px; margin-top: 0; }
.preview-area :deep(h3) { font-size: 17px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 4px; }
.preview-area :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
.preview-area :deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; overflow-x: auto; }
.preview-area :deep(pre code) { background: none; padding: 0; color: inherit; }

.actions { margin-bottom: 20px; }
.btn-primary {
  width: 100%; padding: 14px; background: #4fc3f7; color: #1a1a2e;
  border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;
}
.btn-primary:hover { background: #29b6f6; }
.btn-primary:disabled { opacity: 0.5; cursor: default; }

.result-card { background: #e8f5e9; border: 1px solid #a5d6a7; }
.error-card { background: #fce4ec; border: 1px solid #ef9a9a; }

.testdata-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #c8e6c9; }
.testdata-section h4 { margin: 0 0 4px; }
.hint { font-size: 13px; color: #888; margin: 0 0 12px; }
.upload-row { display: flex; gap: 12px; align-items: center; }
.upload-row input[type="file"] { font-size: 13px; }
.btn-secondary {
  padding: 8px 20px; background: #3498db; color: #fff;
  border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
}
.btn-secondary:disabled { opacity: 0.5; }
.success-msg { margin-top: 8px; color: #2e7d32; font-weight: 500; }

.publish-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #c8e6c9; }
.btn-publish {
  padding: 12px 32px; background: #27ae60; color: #fff;
  border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer;
}
.btn-publish:hover { background: #219a52; }

@media (max-width: 600px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
