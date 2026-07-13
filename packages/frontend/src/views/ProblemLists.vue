<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>
<template>
  <div class="placeholder-page">
    <div class="icon">📋</div>
    <h2>题单功能即将上线</h2>
    <p>教师创建分层题单 · 学生按阶段训练 · 完成进度追踪</p>
    <button @click="router.push('/problems')">先去题库看看 →</button>
  </div>
</template>
<style scoped>
.placeholder-page { text-align: center; padding: 100px 20px; }
.icon { font-size: 64px; margin-bottom: 16px; }
h2 { font-size: 24px; color: #1a1a2e; }
p { color: #888; margin: 8px 0 24px; }
button { padding: 12px 32px; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
</style>
