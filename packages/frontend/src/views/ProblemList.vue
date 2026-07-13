<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';

declare global { interface Window { __PROBLEMS__?: any[] } }

const router = useRouter();
const keyword = ref('');
const difficulty = ref('');

const allProblems = ref<any[]>([]);

const filtered = computed(() => {
  let list = allProblems.value;
  if (keyword.value) {
    const kw = keyword.value.toLowerCase();
    list = list.filter((p: any) => p.title.toLowerCase().includes(kw));
  }
  if (difficulty.value) {
    list = list.filter((p: any) => p.difficulty === difficulty.value);
  }
  return list;
});

onMounted(() => {
  // 直接读服务端注入的数据，零 fetch
  if (window.__PROBLEMS__) {
    allProblems.value = window.__PROBLEMS__;
  }
  // 如果意外没有（直接访问），用 fetch 兜底
  if (allProblems.value.length === 0) {
    fetch('/api/problems?pageSize=100')
      .then(r => r.json())
      .then(d => { allProblems.value = d.items || []; })
      .catch(() => {});
  }
});
</script>

<template>
  <div class="problem-list">
    <div class="toolbar">
      <h2>题库 ({{ filtered.length }} 题)</h2>
    </div>

    <div class="search-bar">
      <input v-model="keyword" placeholder="搜索题目..." class="search-input" />
      <select v-model="difficulty" class="filter-select">
        <option value="">全部难度</option>
        <option value="BEGINNER">入门</option>
        <option value="POPULAR">普及</option>
        <option value="IMPROVE">提高</option>
        <option value="PROVINCIAL">省选</option>
        <option value="NOI">NOI</option>
      </select>
    </div>

    <table v-if="filtered.length > 0" class="problem-table">
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
        <tr v-for="p in filtered" :key="p.id" @click="router.push('/problems/' + p.id)" class="clickable-row">
          <td class="title-cell">{{ p.title }}</td>
          <td><span class="badge" :class="p.difficulty?.toLowerCase()">{{ p.difficulty || '-' }}</span></td>
          <td>{{ (p.tags || []).map((t: any) => t.name).join(', ') }}</td>
          <td>{{ p.timeLimit }}ms</td>
          <td>{{ p.memoryLimit }}MB</td>
        </tr>
      </tbody>
    </table>

    <p v-else class="empty">暂无题目</p>
  </div>
</template>

<style scoped>
.problem-list { max-width: 1100px; margin: 0 auto; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.toolbar h2 { margin: 0; }
.search-bar { display: flex; gap: 10px; margin-bottom: 20px; }
.search-input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; }
.filter-select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; }
.problem-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
.problem-table th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; color: #666; font-size: 13px; border-bottom: 2px solid #eee; }
.problem-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f8ff; }
.title-cell { font-weight: 500; color: #1a1a2e; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
.badge.beginner { background: #e8f5e9; color: #2e7d32; }
.badge.popular { background: #e3f2fd; color: #1565c0; }
.badge.improve { background: #fff3e0; color: #e65100; }
.empty { text-align: center; padding: 60px; color: #999; font-size: 16px; }
</style>
