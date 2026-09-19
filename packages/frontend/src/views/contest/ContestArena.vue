<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../api/client';
import { contestKind, dateText, errorText, nextContestTransition, stateText, type Contest } from './contest';
import '../../styles/contest-arena.css';
const route = useRoute();
const contest = ref<Contest | null>(null);
const loading = ref(true);
const error = ref('');
const tabs = [{ path: 'register', label: '报名' }, { path: 'problems', label: '比赛题目' }, { path: 'standings', label: '排名' }, { path: 'submissions', label: '提交记录' }];
let controller: AbortController | undefined;
let version = 0;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  clearTimeout(transitionTimer);
  const current = ++version; controller?.abort(); controller = new AbortController();
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/api/contests/' + encodeURIComponent(String(route.params.id)), { signal: controller.signal });
    if (current === version) {
      contest.value = data;
      const delay = nextContestTransition(data);
      if (delay !== null) transitionTimer = setTimeout(() => void load(), delay);
    }
  } catch (e: any) {
    if (current === version && !controller.signal.aborted) error.value = errorText(e, '比赛加载失败');
  } finally { if (current === version) loading.value = false; }
}
watch(() => route.fullPath, () => {
  if (contest.value?.id !== route.params.id) contest.value = null;
  void load();
}, { immediate: true });
onUnmounted(() => { version++; controller?.abort(); clearTimeout(transitionTimer); });
</script>
<template>
  <main class="contest-arena">
    <router-link class="arena-back" to="/contests">返回比赛列表</router-link>
    <p v-if="loading && !contest" class="arena-empty" role="status">正在加载比赛…</p>
    <div v-else-if="error" class="arena-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></div>
    <template v-if="contest">
      <header class="arena-header">
        <div class="arena-caption"><span>比赛 #{{ contest.contestNo }}</span><span class="contest-kind">{{ contestKind(contest) }}</span><span>{{ contest.mode }}</span><span class="arena-state" :class="contest.state.toLowerCase()">{{ stateText(contest.state) }}</span></div>
        <h1>{{ contest.title }}</h1>
        <div class="arena-meta"><span>{{ dateText(contest.startTime) }} — {{ dateText(contest.endTime) }}</span><span>举办者：{{ contest.organizer?.name || '平台赛事组' }}</span></div>
      </header>
      <nav class="arena-tabs" aria-label="比赛页面">
        <router-link v-for="tab in tabs" :key="tab.path" :to="`/contests/${contest.id}/${tab.path}`">{{ tab.label }}</router-link>
      </nav>
      <div class="arena-content">
        <router-view v-slot="{ Component }"><component :is="Component" :key="`${contest.id}:${String(route.name)}`" :contest="contest" @reload="load" /></router-view>
      </div>
    </template>
  </main>
</template>
