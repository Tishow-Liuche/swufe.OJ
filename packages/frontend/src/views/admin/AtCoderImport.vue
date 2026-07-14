<script setup lang="ts">
import { onMounted, ref } from 'vue';
import api from '../../api/client';

const platform = ref<any>(null);
const remoteUrl = ref('');
const loading = ref(false);
const updating = ref(false);
const error = ref('');
const result = ref<any>(null);

onMounted(loadPlatform);

async function loadPlatform() {
  try {
    const { data } = await api.get('/api/atcoder/platform');
    platform.value = data;
  } catch (e: any) {
    error.value = e.response?.data?.message || '无法读取 AtCoder 平台状态';
  }
}

async function importProblem() {
  if (!remoteUrl.value || loading.value) return;
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const { data } = await api.post('/api/atcoder/problems/import', { url: remoteUrl.value });
    result.value = data;
    remoteUrl.value = data.remoteUrl;
  } catch (e: any) {
    error.value = e.response?.data?.message || 'AtCoder 元数据导入失败';
  } finally {
    loading.value = false;
  }
}

async function setEnabled(enabled: boolean) {
  updating.value = true;
  error.value = '';
  try {
    await api.patch('/api/atcoder/platform', {
      enabled,
      reason: enabled ? undefined : '管理员从 AtCoder 导入页面暂停同步',
    });
    await loadPlatform();
  } catch (e: any) {
    error.value = e.response?.data?.message || '平台开关更新失败';
  } finally {
    updating.value = false;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2>AtCoder 题目导入</h2>
        <p>只保存公开题目的最小元数据和原站链接。</p>
      </div>
      <div v-if="platform" class="status-block">
        <span :class="['status-dot', platform.enabled ? 'active' : 'paused']"></span>
        <span>{{ platform.enabled ? '只读同步已启用' : '同步已暂停' }}</span>
        <button
          class="icon-command"
          :disabled="updating"
          @click="setEnabled(!platform.enabled)"
        >
          {{ platform.enabled ? '暂停' : '恢复' }}
        </button>
      </div>
    </header>

    <section class="import-tool">
      <label for="atcoder-url">AtCoder 公开题目 URL</label>
      <div class="input-row">
        <input
          id="atcoder-url"
          v-model.trim="remoteUrl"
          type="url"
          placeholder="https://atcoder.jp/contests/abc400/tasks/abc400_a"
          :disabled="loading || platform?.enabled === false"
          @keyup.enter="importProblem"
        />
        <button
          class="primary-command"
          :disabled="loading || !remoteUrl || platform?.enabled === false"
          @click="importProblem"
        >
          {{ loading ? '读取中...' : '导入元数据' }}
        </button>
      </div>
      <div class="policy-row">
        <span>完整题面不落库</span>
        <span>自动提交关闭</span>
        <span>单次人工触发</span>
        <span>最短请求间隔 2 秒</span>
      </div>
    </section>

    <section v-if="result" class="result-panel">
      <div>
        <span class="result-label">{{ result.created ? '已创建' : '已更新' }}</span>
        <h3>{{ result.title }}</h3>
        <p>{{ result.remoteProblemId }} · {{ result.timeLimitMs }}ms · {{ result.memoryLimitMb }}MB</p>
      </div>
      <div class="result-actions">
        <router-link :to="`/problems/${result.problemId}`">查看本地记录</router-link>
        <a :href="result.remoteUrl" target="_blank" rel="noopener noreferrer">打开 AtCoder</a>
      </div>
    </section>

    <p v-if="platform?.killSwitchReason" class="notice">{{ platform.killSwitchReason }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; padding: 28px 24px 48px; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: center; margin-bottom: 28px; }
.page-header h2 { margin: 0 0 6px; font-size: 24px; }
.page-header p { margin: 0; color: #65707d; font-size: 14px; }
.status-block { display: flex; align-items: center; gap: 8px; color: #374151; font-size: 13px; white-space: nowrap; }
.status-dot { width: 9px; height: 9px; border-radius: 50%; }
.status-dot.active { background: #16803c; }
.status-dot.paused { background: #c2413b; }
.icon-command { border: 1px solid #cfd5dc; background: #fff; padding: 5px 10px; border-radius: 6px; cursor: pointer; color: #374151; }
.import-tool { border-top: 1px solid #dfe3e8; border-bottom: 1px solid #dfe3e8; padding: 24px 0; }
.import-tool label { display: block; margin-bottom: 8px; color: #303744; font-size: 13px; font-weight: 600; }
.input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.input-row input { min-width: 0; height: 42px; padding: 0 12px; border: 1px solid #bfc7d1; border-radius: 6px; font-size: 14px; }
.input-row input:focus { outline: 2px solid rgba(28, 126, 214, 0.18); border-color: #1c7ed6; }
.primary-command { height: 42px; padding: 0 18px; border: none; border-radius: 6px; background: #166534; color: #fff; font-weight: 600; cursor: pointer; }
.primary-command:disabled, .icon-command:disabled { opacity: 0.5; cursor: default; }
.policy-row { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 12px; color: #667085; font-size: 12px; }
.result-panel { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 20px 0; border-bottom: 1px solid #dfe3e8; }
.result-label { color: #166534; font-size: 12px; font-weight: 700; }
.result-panel h3 { margin: 4px 0; font-size: 18px; }
.result-panel p { margin: 0; color: #667085; font-size: 13px; }
.result-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.result-actions a { padding: 7px 11px; border: 1px solid #bfc7d1; border-radius: 6px; color: #1f5f8b; text-decoration: none; font-size: 13px; }
.notice, .error { margin-top: 16px; padding: 10px 12px; border-radius: 6px; font-size: 13px; }
.notice { background: #fff7e6; color: #8a4b08; }
.error { background: #fff0f0; color: #b42318; }
@media (max-width: 720px) {
  .page-header, .result-panel { align-items: flex-start; flex-direction: column; }
  .input-row { grid-template-columns: 1fr; }
  .primary-command { width: 100%; }
}
</style>
