<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowLeft, CalendarCheck, Check, Flame, Trophy } from '@lucide/vue';
import { useRouter } from 'vue-router';
import api from '../api/client';

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const checkIn = ref<any>({ checkedToday: false, totalDays: 0, streak: 0, recentDates: [] });

const todayLabel = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date());

const monthLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date());
const calendarDays = computed(() => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const checked = new Set(checkIn.value.recentDates || []);
  const days: Array<any> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= total; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({ day, checked: checked.has(key), today: day === now.getDate() });
  }
  return days;
});

async function loadCheckIn() {
  loading.value = true;
  error.value = '';
  try {
    checkIn.value = (await api.get('/api/learning/check-in')).data;
  } catch (err: any) {
    error.value = err?.response?.data?.message || '签到数据加载失败';
  } finally {
    loading.value = false;
  }
}

async function submitCheckIn() {
  if (checkIn.value.checkedToday) return;
  saving.value = true;
  error.value = '';
  try {
    checkIn.value = (await api.post('/api/learning/check-in')).data;
  } catch (err: any) {
    error.value = err?.response?.data?.message || '签到失败';
  } finally {
    saving.value = false;
  }
}

onMounted(loadCheckIn);
</script>

<template>
  <main class="checkin-page">
    <button class="back-button" @click="router.back()"><ArrowLeft :size="17" />返回</button>
    <div v-if="error" class="notice">{{ error }}<button aria-label="关闭" @click="error = ''">×</button></div>
    <div v-if="loading" class="loading-state">正在加载签到记录...</div>

    <template v-else>
      <section class="checkin-layout">
        <div class="checkin-scene">
          <div class="scene-copy">
            <span>DAILY CHECK-IN</span>
            <h1>{{ checkIn.checkedToday ? '今日已签到' : '今日签到' }}</h1>
            <time>{{ todayLabel }}</time>
            <button :disabled="saving || checkIn.checkedToday" @click="submitCheckIn">
              <Check :size="19" />{{ checkIn.checkedToday ? '今日已签到' : (saving ? '正在签到...' : '立即签到') }}
            </button>
          </div>
        </div>

        <div class="checkin-data">
          <header><span>CHECK-IN RECORD</span><h2>签到记录</h2></header>
          <div class="metric-row">
            <div><span class="metric-icon total"><Trophy :size="18" /></span><p>累计签到</p><strong>{{ checkIn.totalDays }} <small>天</small></strong></div>
            <div><span class="metric-icon streak"><Flame :size="18" /></span><p>连续签到</p><strong>{{ checkIn.streak }} <small>天</small></strong></div>
          </div>

          <section class="calendar-section">
            <div class="calendar-heading"><h3>{{ monthLabel }}</h3><span><CalendarCheck :size="15" />已签到日期</span></div>
            <div class="weekdays"><span v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day">{{ day }}</span></div>
            <div class="calendar-grid">
              <span v-for="(day, index) in calendarDays" :key="index" :class="{ checked: day?.checked, today: day?.today, empty: !day }">
                <template v-if="day">{{ day.day }}<Check v-if="day.checked" :size="10" /></template>
              </span>
            </div>
          </section>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.checkin-page { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 28px 0 68px; color: #27394b; }
.back-button { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 18px; padding: 6px 0; border: 0; color: #316d9f; background: transparent; cursor: pointer; font: inherit; font-size: 12px; font-weight: 750; }
.checkin-layout { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(390px, .92fr); min-height: 680px; overflow: hidden; border: 1px solid #dbe4ed; border-radius: 8px; background: #fff; box-shadow: 0 14px 36px rgba(31, 66, 104, .1); }
.checkin-scene { position: relative; min-height: 680px; background-image: linear-gradient(180deg, rgba(16, 31, 47, .08), rgba(16, 31, 47, .82)), url('../assets/checkin-background.jpg'); background-position: center; background-size: cover; }
.scene-copy { position: absolute; right: 0; bottom: 0; left: 0; padding: 42px; color: #fff; }
.scene-copy > span, .checkin-data header span { color: #a9d8ff; font-size: 10px; font-weight: 850; letter-spacing: 0; }
.scene-copy h1 { margin: 7px 0 8px; color: #fff; font-size: 40px; line-height: 1.1; letter-spacing: 0; }
.scene-copy time { display: block; color: #d9e4ec; font-size: 13px; }
.scene-copy button { display: inline-flex; min-height: 43px; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; padding: 0 18px; border: 1px solid #fff; border-radius: 6px; color: #153148; background: #fff; cursor: pointer; font: inherit; font-size: 12px; font-weight: 850; }
.scene-copy button:disabled { border-color: #169363; color: #fff; background: #169363; box-shadow: 0 7px 18px rgba(8, 76, 49, .28); cursor: default; opacity: 1; }
.checkin-data { padding: 34px; }
.checkin-data header span { color: #3977aa; }
.checkin-data h2 { margin-top: 5px; font-size: 24px; letter-spacing: 0; }
.metric-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 26px 0; }
.metric-row > div { min-height: 122px; padding: 17px; border: 1px solid #dbe4ed; border-radius: 8px; }
.metric-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 7px; }
.metric-icon.total { color: #886600; background: #fff4c5; }
.metric-icon.streak { color: #a7443f; background: #fff0ef; }
.metric-row p { margin: 13px 0 5px; color: #778697; font-size: 10px; }
.metric-row strong { color: #2b4f70; font-size: 24px; line-height: 1; }
.metric-row small { color: #8794a3; font-size: 10px; }
.calendar-section { padding-top: 23px; border-top: 1px solid #dbe4ed; }
.calendar-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
.calendar-heading h3 { font-size: 14px; letter-spacing: 0; }
.calendar-heading span { display: inline-flex; align-items: center; gap: 5px; color: #4d7c69; font-size: 9px; }
.weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.weekdays { margin-bottom: 5px; }
.weekdays span { color: #8a97a6; font-size: 9px; text-align: center; }
.calendar-grid > span { position: relative; display: grid; aspect-ratio: 1; place-items: center; border: 1px solid #e2e8ee; border-radius: 6px; color: #65778a; background: #fafcfd; font-size: 10px; }
.calendar-grid > span.empty { visibility: hidden; }
.calendar-grid > span.checked { border-color: #a9d4c2; color: #1e7356; background: #eaf8f1; font-weight: 800; }
.calendar-grid > span.today { outline: 2px solid #72a0e5; outline-offset: 1px; }
.calendar-grid svg { position: absolute; right: 3px; bottom: 3px; }
.loading-state { padding: 80px 20px; color: #718094; text-align: center; }
.notice { position: fixed; z-index: 150; top: 74px; right: 24px; display: flex; gap: 12px; padding: 12px 16px; border: 1px solid #efc0bd; border-radius: 7px; color: #9d342e; background: #fff5f4; box-shadow: 0 8px 24px rgba(15, 23, 42, .14); }
.notice button { border: 0; color: inherit; background: transparent; cursor: pointer; }
@media (max-width: 860px) {
  .checkin-page { width: min(100% - 28px, 1180px); padding-top: 20px; }
  .checkin-layout { grid-template-columns: 1fr; }
  .checkin-scene { min-height: 480px; }
}
@media (max-width: 520px) {
  .checkin-scene { min-height: 410px; }
  .scene-copy { padding: 27px 22px; }
  .scene-copy h1 { font-size: 32px; }
  .checkin-data { padding: 26px 18px; }
  .metric-row { grid-template-columns: 1fr 1fr; gap: 8px; }
  .metric-row > div { min-height: 112px; padding: 13px; }
}
</style>
