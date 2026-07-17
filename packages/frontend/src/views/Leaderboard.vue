<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import FilterSelect from '../components/FilterSelect.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const scope = ref<'GLOBAL' | 'CLASS' | 'LIST' | 'CONTEST'>(route.query.contestId ? 'CONTEST' : 'GLOBAL');
const targetId = ref(String(route.query.contestId || ''));
const rows = ref<any[]>([]);
const options = ref<{ classes: any[]; problemLists: any[] }>({ classes: [], problemLists: [] });
const contest = ref<any>(null);
const loading = ref(true);
const error = ref('');

const scopeLabel = computed(() => ({ GLOBAL: '全站练习榜', CLASS: '班级练习榜', LIST: '题单练习榜', CONTEST: contest.value?.title || '比赛排行榜' } as Record<string, string>)[scope.value]);
const selectableOptions = computed(() => scope.value === 'CLASS' ? options.value.classes : options.value.problemLists);
const selectOptions = computed(() => [
  { value: '', label: scope.value === 'CLASS' ? '选择班级' : '选择题单' },
  ...selectableOptions.value.map((item: any) => ({ value: item.id, label: item.name })),
]);

async function loadOptions() {
  if (!auth.token) return;
  try {
    if (!auth.user) await auth.fetchProfile();
    const { data } = await api.get('/api/contests/leaderboards/options');
    options.value = data;
  } catch { /* 登录用户的可选范围加载失败不影响全站榜 */ }
}
async function load() {
  loading.value = true; error.value = ''; contest.value = null;
  try {
    if (scope.value === 'GLOBAL') {
      const { data } = await api.get('/api/leaderboard');
      rows.value = data;
    } else if (scope.value === 'CONTEST') {
      const { data } = await api.get('/api/contests/' + targetId.value + '/standings');
      contest.value = data.contest;
      rows.value = (data.rows || []).map((row: any) => ({
        ...row,
        nickname: row.user.nickname || row.user.username,
        username: row.user.username,
        solvedCount: row.solvedCount,
        score: row.score,
        penalty: row.penalty,
      }));
    } else {
      if (!targetId.value) { rows.value = []; return; }
      const path = scope.value === 'CLASS'
        ? '/api/contests/classes/' + targetId.value + '/leaderboard'
        : '/api/contests/problem-lists/' + targetId.value + '/leaderboard';
      const { data } = await api.get(path);
      rows.value = data;
    }
  } catch (e: any) {
    error.value = e.response?.data?.message || '排行榜加载失败';
  } finally { loading.value = false; }
}
function switchScope(next: 'GLOBAL' | 'CLASS' | 'LIST') {
  scope.value = next;
  targetId.value = next === 'CLASS' ? options.value.classes[0]?.id || '' : next === 'LIST' ? options.value.problemLists[0]?.id || '' : '';
  router.replace({ query: {} });
  load();
}
function selectTarget(value: string) {
  targetId.value = value;
  load();
}
onMounted(async () => { await loadOptions(); await load(); });
</script>

<template>
  <main class="leaderboard-page">
    <section class="head">
      <div><p class="eyebrow">LEARN · SOLVE · RISE</p><h1>{{ scopeLabel }}</h1><p>按真实提交与解决题目统计。不同训练范围各自拥有独立的成长坐标。</p></div>
      <div class="trophy">🏆</div>
    </section>

    <div class="scope-bar">
      <button :class="{ active: scope === 'GLOBAL' }" @click="switchScope('GLOBAL')">全站</button>
      <button :class="{ active: scope === 'CLASS' }" :disabled="!auth.token" @click="switchScope('CLASS')">班级</button>
      <button :class="{ active: scope === 'LIST' }" :disabled="!auth.token" @click="switchScope('LIST')">题单</button>
      <FilterSelect
        v-if="scope === 'CLASS' || scope === 'LIST'"
        class="scope-select"
        :model-value="targetId"
        :options="selectOptions"
        :label="scope === 'CLASS' ? '选择班级' : '选择题单'"
        @update:model-value="selectTarget"
      />
      <button v-if="scope === 'CONTEST'" class="back" @click="switchScope('GLOBAL')">← 返回练习榜</button>
    </div>

    <p v-if="error" class="notice">{{ error }}</p>
    <div v-if="loading" class="state">正在计算排行榜…</div>
    <div v-else-if="!rows.length" class="state">暂无可展示的提交数据</div>
    <section v-else class="board">
      <div class="board-head"><span>排名</span><span>学习者</span><span v-if="scope === 'CONTEST' && contest?.mode === 'IOI'">得分</span><span v-else>已解决</span><span v-if="scope === 'CONTEST' && contest?.mode === 'ACM'">罚时</span><span v-else-if="scope !== 'CONTEST'">提交数</span><span v-if="scope !== 'CONTEST'">通过率</span></div>
      <div v-for="row in rows" :key="row.userId" class="board-row" :class="{ top: row.rank <= 3 }">
        <span class="rank"><i v-if="row.rank <= 3">{{ ['🥇','🥈','🥉'][row.rank - 1] }}</i><b v-else>{{ row.rank }}</b></span>
        <span class="user"><strong>{{ row.nickname }}</strong><small>@{{ row.username }}</small></span>
        <strong>{{ scope === 'CONTEST' && contest?.mode === 'IOI' ? row.score + ' 分' : row.solvedCount }}</strong>
        <span v-if="scope === 'CONTEST' && contest?.mode === 'ACM'">{{ row.penalty }} min</span>
        <span v-else-if="scope !== 'CONTEST'">{{ row.submissionCount }}</span>
        <span v-if="scope !== 'CONTEST'">{{ row.acceptRate }}%</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.leaderboard-page { --ink:#18253a; --muted:#728096; --line:#e5eaf0; --navy:#173b66; --primary:#245d91; --primary-strong:#173b66; --primary-container:#e8f3fc; --surface:#fff; --surface-low:#f5f8fb; --outline:#d7e2ec; max-width:940px; margin:auto; padding:30px 20px 60px; color:var(--ink); }.head { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:28px 34px; overflow:hidden; border-radius:23px; color:#fff; background:linear-gradient(125deg,#183b64,#3677a9); }.eyebrow { margin:0 0 7px; color:#f8cc75; font-size:11px; font-weight:900; letter-spacing:.15em; }.head h1 { margin:0; font-size:31px; letter-spacing:-.04em; }.head p:not(.eyebrow) { margin:9px 0 0; color:#dcebf9; line-height:1.65; }.trophy { font-size:66px; filter:drop-shadow(0 8px 8px rgba(0,0,0,.2)); }.scope-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:22px 0 14px; }.scope-bar button { padding:8px 13px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:#fff; font:inherit; font-size:13px; cursor:pointer; }.scope-bar button.active { color:#fff; border-color:var(--navy); background:var(--navy); }.scope-bar button:disabled { opacity:.45; cursor:not-allowed; }.scope-select { width:178px; height:36px; }.scope-select :deep(.filter-select__trigger) { padding:0 12px; border-radius:10px; box-shadow:0 2px 7px rgba(23,59,102,.05); }.scope-select :deep(.filter-select__menu) { border-color:#c8dbea; border-radius:11px; }.scope-select :deep(.filter-select__option.is-selected) { color:#173b66; background:#e8f3fc; }.scope-bar .back { margin-left:auto; color:#245d91; }.notice { padding:11px 14px; color:#a84f35; border-radius:10px; background:#fff0eb; }.state { display:grid; min-height:230px; place-items:center; color:var(--muted); border:1px dashed #cbd5de; border-radius:16px; }.board { overflow:hidden; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 10px 26px rgba(23,49,80,.06); }.board-head,.board-row { display:grid; grid-template-columns:80px minmax(170px,1fr) 120px 100px 100px; align-items:center; gap:10px; padding:13px 18px; }.board-head { color:#6e7d8f; border-bottom:1px solid var(--line); background:#f8fafc; font-size:12px; font-weight:900; }.board-row { min-height:47px; border-bottom:1px solid #f0f2f5; font-size:14px; }.board-row:last-child { border-bottom:0; }.board-row.top { background:linear-gradient(90deg,#fffaf0,#fff); }.rank i { font-size:22px; font-style:normal; }.rank b { color:#98a4b1; }.user { display:flex; flex-direction:column; gap:2px; }.user small { color:#95a0ae; font-size:11px; }.board-row>strong { color:#1e588c; }@media(max-width:620px){.head{padding:24px}.trophy{display:none}.board{overflow:auto}.board-head,.board-row{min-width:620px}.scope-bar .back{margin-left:0}}
/* Keep the leaderboard in the same light workspace family as the problem library. */
.head {
  border: 1px solid #dce5ef;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 66, 104, 0.08);
  color: #1f2a37;
}
.eyebrow { color: #3977aa; }
.head p:not(.eyebrow) { color: #66778a; }
.trophy { filter: none; }
.scope-bar button.active {
  border-color: #aec7f4;
  background: #e7efff;
  color: #1f5eff;
}
</style>
