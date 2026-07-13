<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';

const router = useRouter();
const problems = ref<any[]>([]);
const loading = ref(true);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const keyword = ref('');
const difficulty = ref('');
const tag = ref('');

const allTags = ref<string[]>([]);
const tagInput = ref('');

const difficulties = [
  { value: '', label: '全部难度' },
  { value: 'BEGINNER', label: '入门' },
  { value: 'POPULAR', label: '普及' },
  { value: 'IMPROVE', label: '提高' },
  { value: 'PROVINCIAL', label: '省选' },
  { value: 'NOI', label: 'NOI' },
];

async function fetchProblems() {
  loading.value = true;
  const params: any = { page: page.value, pageSize: pageSize.value };
  if (keyword.value) params.keyword = keyword.value;
  if (difficulty.value) params.difficulty = difficulty.value;
  if (tag.value) params.tag = tag.value;

  const { data } = await api.get('/api/problems', { params });
  problems.value = data.items;
  total.value = data.total;
  allTags.value = [...new Set(data.items.flatMap((p: any) => p.tags?.map((t: any) => t.name) || []))] as string[];
  loading.value = false;
}

function search() {
  page.value = 1;
  fetchProblems();
}

function clearFilters() {
  keyword.value = '';
  difficulty.value = '';
  tag.value = '';
  page.value = 1;
  fetchProblems();
}

function goToImport() {
  router.push('/admin/import');
}

onMounted(fetchProblems);
watch([keyword, difficulty, tag], () => { page.value = 1; });
</script>

<template>
  <div class="problem-list">
    <div class="toolbar">
      <h2>题库 ({{ total }} 题)</h2>
      <div class="toolbar-right">
        <button class="btn-import" @click="goToImport">导入题目</button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <input
        v-model="keyword"
        type="text"
        placeholder="搜索题目名称..."
        @keyup.enter="search"
        class="search-input"
      />
      <select v-model="difficulty" @change="fetchProblems" class="filter-select">
        <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
      </select>
      <select v-model="tag" @change="fetchProblems" class="filter-select">
        <option value="">全部标签</option>
        <option v-for="t in allTags" :key="t" :value="t">{{ t }}</option>
      </select>
      <button @click="search" class="btn-search">搜索</button>
      <button @click="clearFilters" class="btn-clear">清除</button>
    </div>

    <!-- 题目表格 -->
    <table v-if="!loading && problems.length > 0" class="problem-table">
      <thead>
        <tr>
          <th style="width:60px">状态</th>
          <th>标题</th>
          <th style="width:100px">难度</th>
          <th style="width:120px">标签</th>
          <th style="width:100px">时间</th>
          <th style="width:100px">内存</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in problems" :key="p.id" @click="$router.push(`/problems/${p.id}`)" class="clickable-row">
          <td><span class="status-dot"></span></td>
          <td class="title-cell">{{ p.title }}</td>
          <td>
            <span class="difficulty-badge" :class="p.difficulty?.toLowerCase() || ''">
              {{ p.difficulty || '-' }}
            </span>
          </td>
          <td class="tags-cell">
            <span v-for="t in (p.tags || [])" :key="t.name" class="tag-chip">{{ t.name }}</span>
          </td>
          <td>{{ p.timeLimit }}ms</td>
          <td>{{ p.memoryLimit }}MB</td>
        </tr>
      </tbody>
    </table>

    <div v-if="!loading && problems.length === 0" class="empty">
      <p>暂无题目，点击「导入题目」添加第一批题目。</p>
    </div>

    <p v-if="loading" class="loading">加载中...</p>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="pagination">
      <button :disabled="page <= 1" @click="page--; fetchProblems()">上一页</button>
      <span class="page-info">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button :disabled="page >= Math.ceil(total / pageSize)" @click="page++; fetchProblems()">下一页</button>
    </div>
  </div>
</template>

<style scoped>
.problem-list { max-width: 1100px; margin: 0 auto; }

.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.toolbar h2 { margin: 0; }

.btn-import {
  padding: 8px 20px;
  background: #4fc3f7; color: #1a1a2e;
  border: none; border-radius: 4px;
  font-weight: bold; cursor: pointer;
}
.btn-import:hover { background: #29b6f6; }

.search-bar {
  display: flex; gap: 10px; margin-bottom: 20px;
  align-items: center;
}
.search-input {
  flex: 1; padding: 8px 12px;
  border: 1px solid #ddd; border-radius: 4px;
  font-size: 14px;
}
.filter-select {
  padding: 8px 12px; border: 1px solid #ddd;
  border-radius: 4px; font-size: 14px;
  background: #fff;
}
.btn-search, .btn-clear {
  padding: 8px 16px; border: none; border-radius: 4px;
  cursor: pointer; font-size: 14px;
}
.btn-search { background: #1a1a2e; color: #fff; }
.btn-clear { background: #f5f5f5; color: #666; }

.problem-table {
  width: 100%; border-collapse: collapse;
  background: #fff; border-radius: 8px;
  overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.problem-table th {
  background: #f8f9fa; padding: 12px;
  text-align: left; font-weight: 600;
  color: #666; font-size: 13px;
  border-bottom: 2px solid #eee;
}
.problem-table td {
  padding: 10px 12px; border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f8ff; }
.title-cell { font-weight: 500; color: #1a1a2e; }

.difficulty-badge {
  padding: 2px 8px; border-radius: 10px;
  font-size: 12px; font-weight: 600;
}
.difficulty-badge.beginner { background: #e8f5e9; color: #2e7d32; }
.difficulty-badge.popular { background: #e3f2fd; color: #1565c0; }
.difficulty-badge.improve { background: #fff3e0; color: #e65100; }
.difficulty-badge.provincial { background: #fce4ec; color: #c62828; }
.difficulty-badge.noi { background: #ede7f6; color: #4527a0; }

.tags-cell { display: flex; flex-wrap: wrap; gap: 4px; }
.tag-chip {
  padding: 1px 6px; background: #f0f0f0;
  border-radius: 3px; font-size: 11px; color: #666;
}

.status-dot {
  display: inline-block; width: 8px; height: 8px;
  border-radius: 50%; background: #ccc;
}

.empty {
  text-align: center; padding: 60px 20px;
  color: #999; font-size: 16px;
}
.loading { text-align: center; color: #999; padding: 40px; }

.pagination {
  display: flex; justify-content: center; align-items: center;
  gap: 12px; margin-top: 20px;
}
.pagination button {
  padding: 6px 16px; border: 1px solid #ddd;
  border-radius: 4px; background: #fff;
  cursor: pointer;
}
.pagination button:disabled { opacity: 0.4; cursor: default; }
.page-info { font-size: 14px; color: #666; }
</style>
