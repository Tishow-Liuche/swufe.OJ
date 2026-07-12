<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api/client';

const route = useRoute();
const problem = ref<any>(null);
const code = ref('');
const language = ref('cpp');
const result = ref<any>(null);

onMounted(async () => {
  const { data } = await api.get(`/api/problems/${route.params.id}`);
  problem.value = data;
});

async function submitCode() {
  const { data } = await api.post('/api/submissions', {
    problemId: problem.value.id,
    language: language.value,
    sourceCode: code.value,
  });
  result.value = data;
  // Poll for result
  pollResult(data.id);
}

async function pollResult(id: string) {
  const interval = setInterval(async () => {
    const { data } = await api.get(`/api/submissions/${id}`);
    if (['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILE_ERROR'].includes(data.status)) {
      result.value = data;
      clearInterval(interval);
    }
  }, 1000);
}
</script>

<template>
  <div v-if="problem">
    <h2>{{ problem.title }}</h2>
    <p>难度: {{ problem.difficulty || '-' }} | 时间限制: {{ problem.timeLimit }}ms | 内存限制: {{ problem.memoryLimit }}MB</p>
    <div class="description" v-html="problem.versions?.[0]?.description"></div>

    <div class="submit-area">
      <h3>提交代码</h3>
      <select v-model="language">
        <option value="cpp">C++</option>
        <option value="c">C</option>
        <option value="python">Python</option>
        <option value="java">Java</option>
      </select>
      <textarea v-model="code" rows="12" placeholder="在此输入代码..."></textarea>
      <button @click="submitCode">提交评测</button>
    </div>

    <div v-if="result" class="result">
      <p>状态: <strong>{{ result.status }}</strong></p>
      <p v-if="result.timeUsed">用时: {{ result.timeUsed }}ms | 内存: {{ result.memoryUsed }}KB</p>
    </div>
  </div>
</template>

<style scoped>
.description { margin: 16px 0; padding: 16px; background: #f8f9fa; border-radius: 4px; }
.submit-area { margin-top: 24px; }
select, textarea, button { display: block; width: 100%; margin-bottom: 12px; }
textarea { font-family: 'Courier New', monospace; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
button { padding: 10px; background: #27ae60; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.result { margin-top: 16px; padding: 12px; background: #e3f2fd; border-radius: 4px; }
</style>
