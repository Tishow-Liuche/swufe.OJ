<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/client';

const problems = ref<any[]>([]);
const loading = ref(true);
const keyword = ref('');

async function fetchProblems() {
  loading.value = true;
  const { data } = await api.get('/api/problems', { params: { keyword: keyword.value, pageSize: 50 } });
  problems.value = data.items;
  loading.value = false;
}

onMounted(fetchProblems);
</script>

<template>
  <div>
    <div class="toolbar">
      <h2>题库</h2>
      <input v-model="keyword" placeholder="搜索题目..." @keyup.enter="fetchProblems" />
    </div>
    <table v-if="!loading">
      <thead>
        <tr>
          <th>#</th>
          <th>标题</th>
          <th>难度</th>
          <th>来源</th>
          <th>时间限制</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in problems" :key="p.id">
          <td>{{ i + 1 }}</td>
          <td><router-link :to="`/problems/${p.id}`">{{ p.title }}</router-link></td>
          <td>{{ p.difficulty || '-' }}</td>
          <td>{{ p.source }}</td>
          <td>{{ p.timeLimit }}ms</td>
        </tr>
      </tbody>
    </table>
    <p v-else>加载中...</p>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; }
.toolbar input { padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; width: 240px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
th { background: #f8f9fa; }
</style>
