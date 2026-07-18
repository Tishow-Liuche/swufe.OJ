<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../api/client';
import { pointDifficultyShortLabel } from '../../utils/pointDifficulty';

interface AuthoredProblem {
  id: string;
  title: string;
  status: string;
  difficulty?: string;
  timeLimit: number;
  memoryLimit: number;
  updatedAt: string;
  tags?: Array<{ name: string }>;
  versions?: Array<{ checker?: { type?: string } | null; _count?: { testCases: number } }>;
  _count?: { submissions: number };
}

const router = useRouter();
const loading = ref(false);
const error = ref('');
const keyword = ref('');
const status = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const items = ref<AuthoredProblem[]>([]);
const releasingId = ref('');

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'CONTEST_RESERVED', label: '比赛预备' },
  { value: 'PUBLISHED', label: '已发布' },
];

function currentVersion(problem: AuthoredProblem) {
  return problem.versions?.[0] || {};
}

function judgeMode(problem: AuthoredProblem) {
  return currentVersion(problem).checker?.type === 'SPJ' ? 'SPJ' : '普通题';
}

function testCount(problem: AuthoredProblem) {
  return currentVersion(problem)._count?.testCases || 0;
}

function statusLabel(value: string) {
  if (value === 'PUBLISHED') return '已发布';
  if (value === 'CONTEST_RESERVED') return '比赛预备';
  if (value === 'DRAFT') return '草稿';
  return value || '-';
}

async function loadProblems() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/api/problems/mine/created', {
      params: {
        keyword: keyword.value.trim() || undefined,
        status: status.value || undefined,
        page: page.value,
        pageSize,
      },
    });
    items.value = data.items || [];
    total.value = data.total || 0;
  } catch (e: any) {
    error.value = e.response?.data?.message || '加载历史录题失败';
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void loadProblems();
}

function editProblem(id: string) {
  void router.push(`/admin/problems/${id}/edit`);
}

function openProblem(id: string) {
  void router.push(`/problems/${id}`);
}

async function releaseProblem(problem: AuthoredProblem) {
  if (!confirm(`确认将“${problem.title}”加入正式题库吗？加入后学生即可在公开题库中看到并提交。`)) return;
  releasingId.value = problem.id;
  error.value = '';
  try {
    await api.patch(`/api/problems/${problem.id}/status`, { status: 'PUBLISHED' });
    await loadProblems();
  } catch (e: any) {
    error.value = e.response?.data?.message || '加入题库失败，请确认题目已上传测试数据';
  } finally {
    releasingId.value = '';
  }
}

onMounted(loadProblems);
</script>

<template>
  <div class="history-page">
    <div class="page-header">
      <div>
        <span>AUTHORING HISTORY</span>
        <h2>历史录题</h2>
        <p>查看并修正你曾经录入的本地原创题；管理员可查看全部本地题。</p>
      </div>
      <button class="primary" @click="router.push('/admin/create-problem')">新建题目</button>
    </div>

    <section class="toolbar">
      <input v-model="keyword" placeholder="搜索题目标题或 ID" @keyup.enter="search" />
      <select v-model="status" @change="search">
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <button @click="search" :disabled="loading">{{ loading ? '加载中...' : '搜索' }}</button>
    </section>

    <section class="panel">
      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="!items.length && !loading" class="empty">还没有历史录题。</div>
      <div v-else class="problem-table">
        <div class="table-head">
          <span>题目</span>
          <span>状态</span>
          <span>类型</span>
          <span>测试点</span>
          <span>提交</span>
          <span>操作</span>
        </div>
        <div v-for="problem in items" :key="problem.id" class="table-row">
          <div class="title-cell">
            <strong>{{ problem.title }}</strong>
            <small>{{ problem.id }} · {{ pointDifficultyShortLabel(problem.difficulty) }} · {{ problem.timeLimit }}ms / {{ problem.memoryLimit }}MB</small>
            <div class="tags">
              <span v-for="tag in problem.tags || []" :key="tag.name">{{ tag.name }}</span>
            </div>
          </div>
          <span class="status" :class="problem.status.toLowerCase()">{{ statusLabel(problem.status) }}</span>
          <span>{{ judgeMode(problem) }}</span>
          <span>{{ testCount(problem) }}</span>
          <span>{{ problem._count?.submissions || 0 }}</span>
          <div class="actions">
            <button @click="editProblem(problem.id)">编辑</button>
            <button v-if="problem.status === 'CONTEST_RESERVED'" class="release" :disabled="releasingId === problem.id" @click="releaseProblem(problem)">
              {{ releasingId === problem.id ? '加入中...' : '加入题库' }}
            </button>
            <button v-if="problem.status === 'PUBLISHED'" class="ghost" @click="openProblem(problem.id)">查看</button>
          </div>
        </div>
      </div>
    </section>

    <footer class="pager" v-if="total > pageSize">
      <button :disabled="page <= 1 || loading" @click="page--; loadProblems()">上一页</button>
      <span>第 {{ page }} 页 / 共 {{ total }} 题</span>
      <button :disabled="page * pageSize >= total || loading" @click="page++; loadProblems()">下一页</button>
    </footer>
  </div>
</template>

<style scoped>
.history-page { max-width: 1180px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 20px; }
.page-header span { color: #4f8cff; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
.page-header h2 { margin: 4px 0 6px; font-size: 28px; }
.page-header p { margin: 0; color: #6b7280; }
.primary, .toolbar button, .actions button, .pager button {
  border: 0; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 700;
}
.primary, .toolbar button { background: #4fc3f7; color: #102033; }
.toolbar { display: grid; grid-template-columns: 1fr 160px auto; gap: 10px; margin-bottom: 16px; }
.toolbar input, .toolbar select { border: 1px solid #dbe1ea; border-radius: 8px; padding: 10px 12px; background: #fff; }
.panel { background: #fff; border-radius: 14px; box-shadow: 0 1px 4px rgba(15,23,42,.08); overflow: hidden; }
.table-head, .table-row { display: grid; grid-template-columns: 1fr 90px 80px 80px 70px 150px; gap: 12px; align-items: center; padding: 14px 18px; }
.table-head { background: #f7f9fc; color: #64748b; font-size: 13px; font-weight: 800; }
.table-row { border-top: 1px solid #edf0f4; }
.title-cell strong { display: block; color: #162033; }
.title-cell small { display: block; margin-top: 4px; color: #7b8493; font-size: 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.tags span { background: #edf6ff; color: #24639b; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
.status { width: fit-content; border-radius: 999px; padding: 4px 10px; background: #eef2f7; color: #475569; font-size: 12px; font-weight: 800; }
.status.published { background: #e8f5e9; color: #1b7f3a; }
.status.draft { background: #fff8e1; color: #a16207; }
.status.contest_reserved { background: #eef2ff; color: #4338ca; }
.actions { display: flex; gap: 8px; }
.actions button { background: #2563eb; color: #fff; padding: 7px 12px; }
.actions .ghost { background: #f1f5f9; color: #334155; }
.actions .release { background: #16a34a; color: #fff; }
.empty, .error { padding: 36px; text-align: center; color: #64748b; }
.error { color: #c62828; }
.pager { display: flex; justify-content: center; align-items: center; gap: 14px; margin-top: 16px; color: #64748b; }
.pager button { background: #fff; color: #334155; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
@media (max-width: 860px) {
  .page-header, .toolbar { grid-template-columns: 1fr; display: grid; align-items: stretch; }
  .table-head { display: none; }
  .table-row { grid-template-columns: 1fr; align-items: start; }
}
</style>
