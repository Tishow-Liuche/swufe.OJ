<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/client';

const submissions = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  const { data } = await api.get('/api/submissions', { params: { pageSize: 50 } });
  submissions.value = data.items;
  loading.value = false;
});
</script>

<template>
  <div>
    <h2>提交记录</h2>
    <table v-if="!loading">
      <thead>
        <tr>
          <th>#</th>
          <th>题目</th>
          <th>用户</th>
          <th>语言</th>
          <th>状态</th>
          <th>时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(s, i) in submissions" :key="s.id">
          <td>{{ i + 1 }}</td>
          <td><router-link :to="`/problems/${s.problem.id}`">{{ s.problem.title }}</router-link></td>
          <td>{{ s.user.username }}</td>
          <td>{{ s.language }}</td>
          <td><router-link :to="`/submissions/${s.id}`">{{ s.status }}</router-link></td>
          <td>{{ new Date(s.createdAt).toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>加载中...</p>
  </div>
</template>

<style scoped>
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
th { background: #f8f9fa; }
</style>
