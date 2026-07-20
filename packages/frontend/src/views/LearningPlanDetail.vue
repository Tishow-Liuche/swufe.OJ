<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowLeft, CheckCircle2, Circle, CircleStop, RotateCcw } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import ProblemStateBadges from '../components/ProblemStateBadges.vue';
import { pointDifficultyShortLabel } from '../utils/pointDifficulty';

const route = useRoute();
const router = useRouter();
const plan = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const items = computed(() => plan.value?.items || []);

function fail(err: any, fallback: string) {
  error.value = err?.response?.data?.message || fallback;
}

async function loadPlan() {
  loading.value = true;
  error.value = '';
  try {
    plan.value = (await api.get(`/api/learning/plans/${route.params.id}`)).data;
  } catch (err: any) {
    fail(err, '学习计划加载失败');
  } finally {
    loading.value = false;
  }
}

async function setStatus(status: 'ACTIVE' | 'COMPLETED') {
  if (status === 'COMPLETED' && !window.confirm('确定结束这个学习计划吗？之后仍可重新开始。')) return;
  saving.value = true;
  try {
    plan.value = (await api.patch(`/api/learning/plans/${route.params.id}`, { status })).data;
  } catch (err: any) {
    fail(err, '学习计划更新失败');
  } finally {
    saving.value = false;
  }
}

function openProblem(problemId: string) {
  void router.push(`/problems/${problemId}`);
}

onMounted(loadPlan);
</script>

<template>
  <main class="plan-detail-page">
    <button class="back-button" @click="router.push({ path: '/problem-lists', query: { tab: 'plans' } })"><ArrowLeft :size="17" />返回学习计划</button>
    <div v-if="error" class="notice">{{ error }}<button aria-label="关闭" @click="error = ''">×</button></div>
    <div v-if="loading" class="loading-state">正在加载学习计划...</div>

    <template v-else-if="plan">
      <header class="plan-header">
        <div>
          <span class="kicker">LEARNING PLAN</span>
          <div class="status-line"><span :class="['status', plan.status.toLowerCase()]">{{ plan.status === 'ACTIVE' ? '进行中' : '已结束' }}</span><span>题单学习计划</span></div>
          <h1>{{ plan.problemList?.name }}</h1>
          <p>{{ plan.problemList?.description || '按题单顺序完成每一道题。' }}</p>
        </div>
        <button v-if="plan.status === 'ACTIVE'" class="secondary-button stop" :disabled="saving" @click="setStatus('COMPLETED')"><CircleStop :size="17" />结束计划</button>
        <button v-else class="primary-button" :disabled="saving" @click="setStatus('ACTIVE')"><RotateCcw :size="17" />重新开始</button>
      </header>

      <section class="progress-band">
        <div><span>已完成题目</span><strong>{{ plan.progress?.solved || 0 }} <small>/ {{ plan.progress?.total || 0 }}</small></strong></div>
        <div class="progress-visual"><div class="track"><i :style="{ width: `${plan.progress?.percent || 0}%` }"></i></div><b>{{ plan.progress?.percent || 0 }}%</b></div>
      </section>

      <section class="problem-section">
        <div class="section-heading"><div><span class="kicker">PROBLEMS</span><h2>题单内容</h2></div><span>{{ items.length }} 道题</span></div>
        <div v-if="items.length" class="problem-list">
          <button v-for="(item, index) in items" :key="item.id" class="problem-row" :class="{ solved: item.solved }" @click="openProblem(item.problemId)">
            <span class="order">{{ index + 1 }}</span>
            <CheckCircle2 v-if="item.solved" :size="18" />
            <Circle v-else :size="18" />
            <span class="problem-copy"><strong>{{ item.problem?.title || '题目已移除' }}</strong><ProblemStateBadges :state="item.state" compact /></span>
            <span class="difficulty">{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span>
          </button>
        </div>
        <div v-else class="empty-state">这个题单还没有题目。</div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.plan-detail-page { width: min(1120px, calc(100% - 48px)); margin: 0 auto; padding: 32px 0 72px; color: #26384d; }
.back-button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 0; border: 0; color: #316d9f; background: transparent; cursor: pointer; font: inherit; font-size: 12px; font-weight: 750; }
.plan-header { display: flex; min-height: 210px; align-items: flex-end; justify-content: space-between; gap: 30px; margin: 20px 0 18px; padding: 30px; border: 1px solid #dbe4ed; border-radius: 8px; background: #fff; box-shadow: 0 10px 24px rgba(31, 66, 104, .07); }
.kicker { color: #3977aa; font-size: 10px; font-weight: 850; letter-spacing: 0; }
.status-line { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: #8492a2; font-size: 10px; }
.status { padding: 4px 7px; border-radius: 5px; font-weight: 800; }
.status.active { color: #1e7356; background: #e6f6ef; }
.status.completed { color: #69798a; background: #edf1f4; }
h1 { margin: 10px 0 8px; color: #203247; font-size: 36px; line-height: 1.12; letter-spacing: 0; }
h2 { margin-top: 4px; font-size: 19px; letter-spacing: 0; }
.plan-header p { max-width: 680px; color: #718094; font-size: 13px; }
.primary-button, .secondary-button { display: inline-flex; min-height: 39px; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; white-space: nowrap; }
.primary-button { border: 1px solid #1f5eff; color: #fff; background: #1f5eff; }
.secondary-button { border: 1px solid #e5bfbc; color: #9b3d37; background: #fff7f6; }
.primary-button:disabled, .secondary-button:disabled { opacity: .6; cursor: wait; }
.progress-band { display: grid; grid-template-columns: minmax(180px, .35fr) minmax(0, 1fr); align-items: center; gap: 30px; margin-bottom: 18px; padding: 22px 25px; border: 1px solid #dbe4ed; border-left: 4px solid #4f83d8; border-radius: 8px; background: #fff; box-shadow: 0 7px 20px rgba(31, 66, 104, .04); }
.progress-band > div:first-child span { display: block; color: #718094; font-size: 11px; }
.progress-band strong { display: block; margin-top: 5px; color: #244f7d; font-size: 28px; line-height: 1; }
.progress-band strong small { color: #8794a3; font-size: 13px; }
.progress-visual { display: flex; align-items: center; gap: 13px; }
.track { height: 8px; flex: 1; overflow: hidden; border-radius: 4px; background: #e5ebf0; }
.track i { display: block; height: 100%; border-radius: inherit; background: #1f5eff; }
.progress-visual b { min-width: 42px; color: #365c82; font-size: 12px; text-align: right; }
.problem-section { padding: 23px 25px; border: 1px solid #dbe4ed; border-radius: 8px; background: #fff; box-shadow: 0 7px 20px rgba(31, 66, 104, .04); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.section-heading > span { color: #7c8998; font-size: 10px; }
.problem-list { overflow: hidden; border: 1px solid #dbe4ed; border-radius: 7px; }
.problem-row { display: grid; grid-template-columns: 34px 20px minmax(0, 1fr) auto; min-height: 58px; align-items: center; gap: 10px; width: 100%; padding: 0 13px; border: 0; border-bottom: 1px solid #e9eef3; color: #8190a0; text-align: left; background: #fff; cursor: pointer; }
.problem-row:last-child { border-bottom: 0; }
.problem-row:hover { background: #f8fafc; }
.problem-row.solved { color: #2f8a69; }
.order { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 6px; color: #697b8e; background: #edf2f6; font-size: 10px; }
.problem-copy { display: grid; min-width: 0; gap: 3px; }
.problem-copy strong { overflow: hidden; color: #2a5279; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.problem-copy small { color: #8895a4; font-size: 9px; }
.problem-row.solved .problem-copy strong { color: #50715f; }
.difficulty { padding: 4px 7px; border-radius: 5px; color: #557086; background: #eef3f7; font-size: 9px; white-space: nowrap; }
.empty-state, .loading-state { padding: 48px 18px; color: #718094; text-align: center; font-size: 12px; }
.notice { position: fixed; z-index: 150; top: 74px; right: 24px; display: flex; align-items: center; gap: 12px; max-width: 420px; padding: 12px 16px; border: 1px solid #efc0bd; border-radius: 7px; color: #9d342e; background: #fff5f4; box-shadow: 0 8px 24px rgba(15, 23, 42, .14); }
.notice button { border: 0; color: inherit; background: transparent; cursor: pointer; }
@media (max-width: 700px) {
  .plan-detail-page { width: min(100% - 28px, 1120px); padding-top: 22px; }
  .plan-header { min-height: 0; align-items: flex-start; flex-direction: column; padding: 23px 20px; }
  h1 { font-size: 29px; }
  .progress-band { grid-template-columns: 1fr; gap: 15px; }
  .problem-section { padding: 19px 14px; }
  .problem-row { grid-template-columns: 31px 20px minmax(0, 1fr); padding: 0 9px; }
  .difficulty { display: none; }
}
</style>
