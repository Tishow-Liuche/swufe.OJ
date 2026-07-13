<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const problems = ref<any[]>([]);
const total = ref(0);

const keyword = ref('');
const difficulty = ref('');

const difficulties = [
  { value: '', label: '全部难度' },
  { value: 'BEGINNER', label: '入门' },
  { value: 'POPULAR', label: '普及' },
  { value: 'IMPROVE-', label: '提高-' },
  { value: 'IMPROVE', label: '提高' },
];

async function load() {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (keyword.value) params.set('keyword', keyword.value);
  if (difficulty.value) params.set('difficulty', difficulty.value);

  const res = await fetch('http://127.0.0.1:3000/api/problems?' + params.toString());
  const data = await res.json();
  problems.value = data.items || [];
  total.value = data.total || 0;
}

onMounted(load);
</script>

<template>
  <div class="problem-list">
    <div class="toolbar">
      <h2>题库 ({{ total }} 题)</h2>
      <button class="btn-import" @click="router.push('/admin/import')">导入题目</button>
    </div>

    <div class="search-bar">
      <input v-model="keyword" placeholder="搜索题目..." class="search-input" @keyup.enter="load" />
      <select v-model="difficulty" @change="load" class="filter-select">
        <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
      </select>
      <button @click="load" class="btn-search">搜索</button>
    </div>

    <table v-if="problems.length > 0" class="problem-table">
      <thead>
        <tr>
          <th>标题</th>
          <th>难度</th>
          <th>标签</th>
          <th>时限</th>
          <th>内存</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in problems" :key="p.id" @click="router.push('/problems/' + p.id)" class="clickable-row">
          <td class="title-cell">{{ p.title }}</td>
          <td><span class="badge" :class="p.difficulty?.toLowerCase()"> {{ p.difficulty || '-' }} </span></td>
          <td>{{ (p.tags || []).map((t: any) => t.name).join(', ') }}</td>
          <td>{{ p.timeLimit }}ms</td>
          <td>{{ p.memoryLimit }}MB</td>
        </tr>
      </tbody>
    </table>

    <p v-if="problems.length === 0 && total === 0" class="empty">暂无题目</p>
  </div>
</template>

<style scoped>
.problem-list { max-width: 1100px; margin: 0 auto; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.toolbar h2 { margin: 0; }
.btn-import { padding: 8px 20px; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
.search-bar { display: flex; gap: 10px; margin-bottom: 20px; }
.search-input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; }
.filter-select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; }
.btn-search { padding: 8px 16px; background: #1a1a2e; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.problem-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
.problem-table th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; color: #666; font-size: 13px; border-bottom: 2px solid #eee; }
.problem-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f8ff; }
.title-cell { font-weight: 500; color: #1a1a2e; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
.badge.beginner { background: #e8f5e9; color: #2e7d32; }
.badge.popular { background: #e3f2fd; color: #1565c0; }
.badge.improve,
.badge.improve- { background: #fff3e0; color: #e65100; }
.empty { text-align: center; padding: 60px; color: #999; font-size: 16px; }
</style>
