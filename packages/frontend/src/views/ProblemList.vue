<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const problems = ref<any[]>([]);
const loading = ref(true);
const total = ref(0);
const debug = ref<string[]>(['页面已加载', '开始请求 /api/problems...']);

const keyword = ref('');
const difficulty = ref('');

const difficulties = [
  { value: '', label: '全部难度' },
  { value: 'BEGINNER', label: '入门' },
  { value: 'POPULAR', label: '普及' },
  { value: 'IMPROVE', label: '提高' },
];

async function fetchProblems() {
  loading.value = true;
  problems.value = [];
  total.value = 0;
  debug.value = ['发起 GET /api/problems...'];

  try {
    const url = '/api/problems?page=1&pageSize=50' +
      (keyword.value ? '&keyword=' + encodeURIComponent(keyword.value) : '') +
      (difficulty.value ? '&difficulty=' + encodeURIComponent(difficulty.value) : '');

    debug.value.push('URL: ' + url);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    debug.value.push('HTTP 状态: ' + res.status + ' ' + res.statusText);

    const text = await res.text();
    debug.value.push('响应长度: ' + text.length + ' 字节');

    const data = JSON.parse(text);
    debug.value.push('解析成功: total=' + data.total + ', items=' + (data.items?.length || 0));

    problems.value = data.items || [];
    total.value = data.total || 0;
  } catch (e: any) {
    debug.value.push('异常: ' + (e.message || String(e)));
    debug.value.push('异常类型: ' + (e.name || 'unknown'));
    console.error('fetchProblems error:', e);
  } finally {
    loading.value = false;
  }
}

function goToImport() {
  router.push('/admin/import');
}

onMounted(() => {
  debug.value.push('组件已挂载, 调用 fetchProblems');
  fetchProblems();
});
</script>

<template>
  <div class="problem-list">
    <div class="toolbar">
      <h2>题库 ({{ total }} 题)</h2>
      <button class="btn-import" @click="goToImport">导入题目</button>
    </div>

    <div class="search-bar">
      <input v-model="keyword" placeholder="搜索题目..." class="search-input" @keyup.enter="fetchProblems" />
      <select v-model="difficulty" @change="fetchProblems" class="filter-select">
        <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
      </select>
      <button @click="fetchProblems" class="btn-search">搜索</button>
    </div>

    <div class="debug-box">
      <div v-for="(line, i) in debug" :key="i">> {{ line }}</div>
    </div>

    <table v-if="problems.length > 0" class="problem-table">
      <thead>
        <tr>
          <th>标题</th>
          <th>难度</th>
          <th>标签</th>
          <th>时间</th>
          <th>内存</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in problems" :key="p.id" @click="$router.push('/problems/' + p.id)" class="clickable-row">
          <td class="title-cell">{{ p.title }}</td>
          <td>
            <span class="difficulty-badge" :class="p.difficulty?.toLowerCase() || ''">
              {{ p.difficulty || '-' }}
            </span>
          </td>
          <td>{{ (p.tags || []).map((t: any) => t.name).join(', ') }}</td>
          <td>{{ p.timeLimit }}ms</td>
          <td>{{ p.memoryLimit }}MB</td>
        </tr>
      </tbody>
    </table>

    <div v-if="!loading && problems.length === 0" class="empty">暂无题目</div>
    <p v-if="loading" class="loading">加载中...</p>
  </div>
</template>

<style scoped>
.problem-list { max-width: 1100px; margin: 0 auto; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.toolbar h2 { margin: 0; }
.btn-import { padding: 8px 20px; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
.search-bar { display: flex; gap: 10px; margin-bottom: 12px; }
.search-input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; }
.filter-select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; }
.btn-search { padding: 8px 16px; background: #1a1a2e; color: #fff; border: none; border-radius: 4px; cursor: pointer; }

.debug-box {
  padding: 12px 16px; background: #263238; color: #aed581;
  border-radius: 4px; font-size: 12px; margin-bottom: 16px;
  font-family: 'Courier New', monospace; line-height: 1.8;
  max-height: 300px; overflow-y: auto;
}
.debug-box div { white-space: pre-wrap; word-break: break-all; }

.problem-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.problem-table th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; color: #666; font-size: 13px; border-bottom: 2px solid #eee; }
.problem-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f8ff; }
.title-cell { font-weight: 500; color: #1a1a2e; }
.difficulty-badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
.difficulty-badge.beginner { background: #e8f5e9; color: #2e7d32; }
.difficulty-badge.popular { background: #e3f2fd; color: #1565c0; }
.difficulty-badge.improve { background: #fff3e0; color: #e65100; }
.empty { text-align: center; padding: 60px 20px; color: #999; font-size: 16px; }
.loading { text-align: center; color: #999; padding: 40px; }
</style>
