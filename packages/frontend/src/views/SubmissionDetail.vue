<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api/client';

const route = useRoute();
const submission = ref<any>(null);

onMounted(async () => {
  const { data } = await api.get(`/api/submissions/${route.params.id}`);
  submission.value = data;
});
</script>

<template>
  <div v-if="submission">
    <h2>提交详情</h2>
    <p>题目: {{ submission.problem.title }}</p>
    <p>状态: <strong>{{ submission.status }}</strong></p>
    <p>得分: {{ submission.score }} | 用时: {{ submission.timeUsed }}ms | 内存: {{ submission.memoryUsed }}KB</p>
    <p v-if="submission.compileMessage" class="compile-msg">{{ submission.compileMessage }}</p>

    <h3>源代码</h3>
    <pre><code>{{ submission.sourceCode }}</code></pre>

    <h3 v-if="submission.cases?.length">测试点详情</h3>
    <table v-if="submission.cases?.length">
      <thead>
        <tr><th>测试点</th><th>状态</th><th>用时</th><th>内存</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in submission.cases" :key="c.caseIndex">
          <td>#{{ c.caseIndex }}</td>
          <td>{{ c.status }}</td>
          <td>{{ c.timeUsed }}ms</td>
          <td>{{ c.memoryUsed }}KB</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px; overflow-x: auto; }
.compile-msg { padding: 12px; background: #fff3e0; border-radius: 4px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
</style>
