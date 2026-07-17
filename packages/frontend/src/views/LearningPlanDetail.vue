<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import CheckInModal from '../components/CheckInModal.vue';
import LearningProgress from '../components/LearningProgress.vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const plan = ref<any>(null);
const loading = ref(true);
const error = ref('');
const checkInOpen = ref(false);
const checkInSaving = ref(false);

const daily = computed(() => plan.value?.today || { items: [], progress: {} });
const planRange = computed(() => {
  if (!plan.value) return '';
  return `${formatDate(plan.value.startDate)} - ${formatDate(plan.value.endDate)}`;
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

function fail(err: any, fallback: string) {
  error.value = err?.response?.data?.message || fallback;
}

async function loadPlan() {
  loading.value = true;
  error.value = '';
  try {
    if (auth.token && !auth.user) await auth.fetchProfile();
    if (!auth.isLoggedIn()) {
      await router.push('/login');
      return;
    }
    plan.value = (await api.get(`/api/learning/plans/${route.params.id}`)).data;
  } catch (err: any) {
    fail(err, '学习计划加载失败');
  } finally {
    loading.value = false;
  }
}

async function generateDaily() {
  try {
    await api.post('/api/learning/daily/generate');
    await loadPlan();
  } catch (err: any) {
    fail(err, '今日练习生成失败');
  }
}

async function toggleDaily(item: any) {
  const wasEligible = Boolean(daily.value.progress?.canCheckIn);
  try {
    await api.patch(`/api/learning/plans/${item.planId}/items/${item.id}`, { completed: !item.completed });
    await loadPlan();
    if (!wasEligible && daily.value.progress?.canCheckIn && !daily.value.progress?.checkedIn) {
      checkInOpen.value = true;
    }
  } catch (err: any) {
    fail(err, '今日进度更新失败');
  }
}

async function confirmCheckIn() {
  if (!plan.value) return;
  checkInSaving.value = true;
  try {
    await api.post(`/api/learning/plans/${plan.value.id}/check-in`, { date: daily.value.date });
    checkInOpen.value = false;
    await loadPlan();
  } catch (err: any) {
    fail(err, '今日打卡失败');
  } finally {
    checkInSaving.value = false;
  }
}

function openProblem(problemId: string) {
  router.push(`/problems/${problemId}`);
}

onMounted(loadPlan);
</script>

<template>
  <main class="plan-detail-page">
    <button class="back-button" @click="router.push('/problem-lists')">← 返回题单与计划</button>
    <div v-if="error" class="notice">{{ error }}<button aria-label="关闭" @click="error = ''">×</button></div>
    <div v-if="loading" class="loading-state">正在加载学习计划…</div>
    <template v-else-if="plan">
      <header class="plan-header">
        <div>
          <span class="kicker">LEARNING PLAN</span>
          <h1>{{ plan.name }}</h1>
          <p>{{ plan.description || '专注完成每天的计划量。' }}</p>
        </div>
        <div class="plan-range"><span>计划周期</span><strong>{{ planRange }}</strong></div>
      </header>

      <LearningProgress :daily="daily" :plan-progress="plan.progress" />

      <div class="detail-grid">
        <section class="panel today-panel">
          <div class="panel-heading">
            <div><span class="kicker">TODAY</span><h2>今日计划</h2></div>
            <button class="text-button" @click="generateDaily">生成 / 补充</button>
          </div>
          <div v-if="daily.progress?.checkedIn" class="checked-banner"><span>✓</span>今日已打卡</div>
          <div v-if="daily.items?.length" class="daily-list">
            <label v-for="item in daily.items" :key="item.id" class="daily-row" :class="{ done: item.completed }">
              <input type="checkbox" :checked="item.completed" @change="toggleDaily(item)">
              <span class="history-check" :class="{ visible: item.previouslyDone || item.completed }">✓</span>
              <span class="type-tag">{{ item.type === 'REVIEW' ? '复习题' : '新题' }}</span>
              <button class="problem-link" @click.prevent="openProblem(item.problemId)">{{ item.problem?.title || '题目已移除' }}</button>
            </label>
          </div>
          <div v-else class="empty-state">
            <strong>今日还没有题目</strong>
            <p>优先安排未做过的新题，不足时自动补充复习题。</p>
            <button class="primary-button" @click="generateDaily">生成今日计划</button>
          </div>
        </section>

        <aside class="panel checkin-history">
          <div class="panel-heading"><div><span class="kicker">CHECK-IN</span><h2>打卡记录</h2></div><strong>{{ plan.progress?.checkedInDays || 0 }} 天</strong></div>
          <div v-if="plan.checkIns?.length" class="history-list">
            <div v-for="entry in plan.checkIns" :key="entry.id" class="history-row"><span>✓</span><time :datetime="entry.date">{{ formatDate(entry.date) }}</time></div>
          </div>
          <div v-else class="empty-state compact">完成今日目标后开始累计打卡。</div>
        </aside>
      </div>
    </template>

    <CheckInModal
      v-if="checkInOpen"
      :date="daily.date"
      :plan-name="plan?.name"
      :saving="checkInSaving"
      @confirm="confirmCheckIn"
      @close="checkInOpen = false"
    />
  </main>
</template>

<style scoped>
.plan-detail-page { width: min(1120px, calc(100% - 48px)); margin: 0 auto; padding: 34px 0 72px; color: #1f2937; }
.back-button, .text-button { border: 0; background: transparent; color: #0f766e; cursor: pointer; font: inherit; font-size: 13px; font-weight: 700; }
.back-button { padding: 6px 0; }
.plan-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; margin: 24px 0 28px; }
.kicker { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
h1 { margin: 6px 0 8px; color: #0f172a; font-size: 40px; line-height: 1.1; letter-spacing: 0; }
h2 { margin: 4px 0 0; color: #0f172a; font-size: 20px; letter-spacing: 0; }
.plan-header p { margin: 0; color: #64748b; font-size: 14px; }
.plan-range { min-width: 210px; padding-left: 18px; border-left: 3px solid #4fc3f7; }
.plan-range span, .plan-range strong { display: block; }
.plan-range span { color: #64748b; font-size: 11px; }
.plan-range strong { margin-top: 4px; color: #334155; font-size: 14px; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.panel { border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 2px 10px rgba(15, 23, 42, .035); }
.today-panel, .checkin-history { padding: 22px; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.checked-banner { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 10px 12px; border-left: 3px solid #0f766e; background: #f0fdfa; color: #0f766e; font-size: 13px; font-weight: 700; }
.daily-list, .history-list { border-top: 1px solid #e2e8f0; }
.daily-row { display: flex; align-items: center; gap: 9px; min-height: 50px; border-bottom: 1px solid #f1f5f9; color: #475569; }
.daily-row input { width: 16px; height: 16px; accent-color: #0f766e; }
.daily-row.done .problem-link { color: #94a3b8; text-decoration: line-through; }
.history-check { width: 16px; color: transparent; font-weight: 800; }
.history-check.visible { color: #0f766e; }
.type-tag { min-width: 42px; color: #64748b; font-size: 11px; font-weight: 700; }
.problem-link { flex: 1; min-width: 0; overflow: hidden; border: 0; padding: 0; background: transparent; color: #0f766e; cursor: pointer; font: inherit; font-weight: 700; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.history-row { display: flex; align-items: center; gap: 10px; min-height: 44px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 13px; }
.history-row span { color: #0f766e; font-weight: 800; }
.checkin-history .panel-heading > strong { color: #0f766e; font-size: 18px; }
.empty-state, .loading-state { padding: 40px 16px; color: #64748b; text-align: center; }
.empty-state strong { display: block; color: #334155; }
.empty-state p { margin: 6px 0 18px; font-size: 13px; }
.empty-state.compact { padding: 28px 10px; font-size: 13px; }
.primary-button { border: 0; border-radius: 6px; padding: 10px 16px; background: #0f766e; color: #fff; cursor: pointer; font: inherit; font-weight: 700; }
.notice { position: fixed; top: 74px; right: 24px; z-index: 120; display: flex; gap: 12px; max-width: 420px; padding: 12px 16px; border: 1px solid #fecaca; border-radius: 6px; background: #fef2f2; color: #991b1b; box-shadow: 0 8px 24px rgba(15, 23, 42, .14); }
.notice button { border: 0; background: transparent; color: inherit; cursor: pointer; }
@media (max-width: 760px) {
  .plan-detail-page { width: min(100% - 28px, 1120px); padding-top: 24px; }
  .plan-header { align-items: flex-start; flex-direction: column; }
  .detail-grid { grid-template-columns: 1fr; }
  .plan-range { min-width: 0; }
  h1 { font-size: 32px; }
}
</style>
