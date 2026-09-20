<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import FilterSelect from '../components/FilterSelect.vue';

type LeaderboardScope = 'GLOBAL' | 'CONTEST' | 'OVERALL';

const route = useRoute();
const router = useRouter();
const scope = ref<LeaderboardScope>(route.query.contestId ? 'CONTEST' : 'GLOBAL');
const targetId = ref(String(route.query.contestId || ''));
const rows = ref<any[]>([]);
const contests = ref<any[]>([]);
const contest = ref<any>(null);
const loading = ref(true);
const error = ref('');

const currentScopeTitle = computed(() => ({
  GLOBAL: '全站过题数排名',
  CONTEST: contest.value?.title || '比赛排名',
  OVERALL: '综合排名',
})[scope.value]);

const contestOptions = computed(() => [
  { value: '', label: '选择比赛' },
  ...contests.value.map((item: any) => ({ value: item.id, label: item.title })),
]);

const boardColumns = computed(() => {
  if (scope.value === 'CONTEST' && contest.value?.mode === 'ACM') {
    return ['排名', '选手', '已解决', '罚时'];
  }
  if (scope.value === 'CONTEST' && contest.value?.mode === 'IOI') {
    return ['排名', '选手', '得分', '已解决'];
  }
  if (scope.value === 'OVERALL') {
    return ['排名', '用户', '综合得分', '构成'];
  }
  return ['排名', '用户', '已解决', '提交数', '通过率'];
});

const displayBoardColumns = computed(() => (
  scope.value === 'OVERALL' ? ['排名', '用户', '综合得分', '构成'] : boardColumns.value
));

async function loadContests() {
  try {
    const { data } = await api.get('/api/contests');
    contests.value = (Array.isArray(data) ? data : data.items || [])
      .filter((item: any) => item.state === 'ENDED');
  } catch {
    contests.value = [];
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  contest.value = null;

  try {
    if (scope.value === 'GLOBAL') {
      const { data } = await api.get('/api/leaderboard');
      rows.value = data;
    } else if (scope.value === 'CONTEST') {
      if (!targetId.value) {
        rows.value = [];
        return;
      }
      const { data } = await api.get(`/api/contests/${targetId.value}/standings`);
      contest.value = data.contest;
      rows.value = (data.rows || []).map((row: any) => ({
        ...row,
        nickname: row.user?.nickname || row.user?.username || row.nickname || row.username,
        username: row.user?.username || row.username,
      }));
    } else {
      const { data } = await api.get('/api/leaderboard/overall');
      rows.value = Array.isArray(data) ? data : [];
    }
  } catch (e: any) {
    error.value = e.response?.data?.message || '排行榜加载失败';
  } finally {
    loading.value = false;
  }
}

function switchScope(next: LeaderboardScope) {
  scope.value = next;
  if (next !== 'CONTEST') {
    targetId.value = '';
    contest.value = null;
    void router.replace({ query: {} });
  } else if (targetId.value) {
    void router.replace({ query: { contestId: targetId.value } });
  }
  void load();
}

function selectContest(value: string) {
  targetId.value = value;
  if (value) void router.replace({ query: { contestId: value } });
  else void router.replace({ query: {} });
  void load();
}

onMounted(async () => {
  await loadContests();
  await load();
});
</script>

<template>
  <main class="leaderboard-page">
    <section class="leaderboard-hero">
      <div>
        <p class="eyebrow">LEADERBOARD</p>
        <h1>{{ currentScopeTitle }}</h1>
      </div>
    </section>

    <section class="rank-switcher" aria-label="排行榜类型">
      <button :class="{ active: scope === 'GLOBAL' }" @click="switchScope('GLOBAL')">
        <span>
          <strong>全站过题数排名</strong>
        </span>
      </button>
      <button :class="{ active: scope === 'CONTEST' }" @click="switchScope('CONTEST')">
        <span>
          <strong>比赛排名</strong>
        </span>
      </button>
      <button :class="{ active: scope === 'OVERALL' }" @click="switchScope('OVERALL')">
        <span>
          <strong>综合排名</strong>
        </span>
      </button>
    </section>

    <div v-if="scope === 'CONTEST'" class="contest-picker">
      <FilterSelect
        class="contest-select"
        :model-value="targetId"
        :options="contestOptions"
        label="选择比赛"
        @update:model-value="selectContest"
      />
      <span v-if="!contests.length">暂无可选择比赛，或比赛列表加载失败。</span>
    </div>

    <p v-if="error" class="notice">{{ error }}</p>
    <div v-if="loading" class="state">正在计算排行榜…</div>
    <div v-else-if="!rows.length" class="state">
      {{ scope === 'CONTEST' && !targetId ? '请选择一场比赛查看排名' : '暂无可展示的排名数据' }}
    </div>

    <section v-else class="board">
      <div class="board-head" :class="{ contest: scope === 'CONTEST', overall: scope === 'OVERALL' }">
        <span v-for="column in displayBoardColumns" :key="column">{{ column }}</span>
      </div>
      <div v-for="row in rows" :key="row.userId || row.username" class="board-row" :class="[{ contest: scope === 'CONTEST', overall: scope === 'OVERALL' }, row.rank >= 1 && row.rank <= 3 ? `podium-${row.rank}` : '']">
        <span class="rank">
          <span v-if="row.rank >= 1 && row.rank <= 3" class="rank-medal" :aria-label="`第 ${row.rank} 名，${['金', '银', '铜'][row.rank - 1]}牌`" role="img">
            <b aria-hidden="true">{{ row.rank }}</b>
          </span>
          <b v-else>{{ row.rank }}</b>
        </span>
        <span class="user">
          <strong>{{ row.nickname || row.username }}</strong>
          <small>@{{ row.username }}</small>
        </span>
        <template v-if="scope === 'OVERALL'">
          <strong>{{ row.overallScore }}</strong>
          <span class="score-breakdown">
            做题 {{ row.problemScore }} + 比赛 {{ row.contestScore }}
            <small>{{ row.localSolvedCount }} 题</small>
          </span>
        </template>
        <template v-else>
        <strong v-if="scope === 'CONTEST' && contest?.mode === 'IOI'">{{ row.score }} 分</strong>
        <strong v-else>{{ row.solvedCount }}</strong>
        <span v-if="scope === 'CONTEST' && contest?.mode === 'ACM'">{{ row.penalty }} min</span>
        <span v-else-if="scope === 'CONTEST'">{{ row.solvedCount }}</span>
        <span v-else>{{ row.submissionCount }}</span>
        </template>
        <span v-if="scope === 'GLOBAL'">{{ row.acceptRate }}%</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.leaderboard-page {
  --ink: #17233a;
  --muted: #71809a;
  --line: #dfe8f5;
  --blue: #2f7cf2;
  width: min(1080px, calc(100% - 40px));
  margin: 0 auto;
  padding: 30px 0 64px;
  color: var(--ink);
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}

.leaderboard-hero {
  position: relative;
  display: flex;
  min-height: 168px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  overflow: hidden;
  padding: 34px 40px;
  border: 1px solid #d6e5ff;
  border-radius: 26px;
  background:
    radial-gradient(circle at 82% 18%, rgba(255, 255, 255, .72) 0 2px, transparent 3px) 0 0 / 22px 22px,
    radial-gradient(ellipse at 78% 20%, rgba(158, 198, 255, .42), transparent 42%),
    linear-gradient(124deg, #f8fbff 0%, #eaf3ff 48%, #d7e8ff 100%);
  box-shadow: 0 18px 38px rgba(47, 99, 180, .12);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  color: #2f70df;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .12em;
}

.leaderboard-hero h1 {
  margin: 0;
  font-size: clamp(32px, 4.2vw, 48px);
  font-weight: 860;
  letter-spacing: -.06em;
}

.rank-switcher {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 20px 0;
}

.rank-switcher button {
  display: grid;
  min-height: 64px;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-shadow: 0 8px 20px rgba(38, 56, 89, .055);
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}

.rank-switcher button:hover,
.rank-switcher button.active {
  transform: translateY(-3px);
  border-color: #9fc2ff;
  box-shadow: 0 14px 28px rgba(38, 91, 178, .12);
}

.rank-switcher button.active {
  color: #fff;
  background: linear-gradient(135deg, #2f7cf2, #235fd3);
}

.rank-switcher strong {
  display: block;
}

.rank-switcher strong {
  color: inherit;
  font-size: 15px;
  font-weight: 820;
}

.contest-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -2px 0 18px;
  color: var(--muted);
  font-size: 13px;
}

.contest-select {
  width: min(360px, 100%);
}

.notice {
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff0eb;
  color: #a84f35;
}

.state {
  display: grid;
  min-height: 240px;
  place-items: center;
  border: 1px dashed #cbd5de;
  border-radius: 18px;
  color: var(--muted);
  background: #fff;
}

.board {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 14px 30px rgba(23, 49, 80, .07);
}

.board-head,
.board-row {
  display: grid;
  grid-template-columns: 82px minmax(180px, 1fr) 120px 110px 100px;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
}

.board-head.contest,
.board-row.contest {
  grid-template-columns: 82px minmax(180px, 1fr) 120px 110px;
}

.board-head.overall,
.board-row.overall {
  grid-template-columns: 82px minmax(180px, 1fr) 130px minmax(220px, .8fr);
}

.board-head {
  border-bottom: 1px solid var(--line);
  background: #f8fafc;
  color: #6e7d8f;
  font-size: 12px;
  font-weight: 900;
}

.board-row {
  min-height: 56px;
  border-bottom: 1px solid #f0f2f5;
  font-size: 14px;
}

.board-row:last-child {
  border-bottom: 0;
}

.board-row.podium-1 {
  --medal-ink: #855911;
  --medal-edge: #d6b25c;
  --medal-light: #fff6d5;
  --medal-base: #ecd087;
  background: linear-gradient(90deg, #fffbef, #fff 65%);
}

.board-row.podium-2 {
  --medal-ink: #53657a;
  --medal-edge: #afbdcc;
  --medal-light: #f5f8fc;
  --medal-base: #d0dbe6;
  background: linear-gradient(90deg, #f5f8fb, #fff 65%);
}

.board-row.podium-3 {
  --medal-ink: #8b542f;
  --medal-edge: #ce9c79;
  --medal-light: #fff0e3;
  --medal-base: #e8bb98;
  background: linear-gradient(90deg, #fff7f0, #fff 65%);
}

.rank {
  display: flex;
  align-items: center;
  width: 36px;
  min-height: 38px;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}

.rank b {
  color: #98a4b1;
}

.rank-medal {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--medal-edge);
  border-radius: 50%;
  background: linear-gradient(145deg, var(--medal-light), var(--medal-base));
  box-shadow: inset 0 0 0 3px var(--medal-light), 0 2px 4px rgb(23 35 58 / 6%);
  color: var(--medal-ink);
}

.rank-medal::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 23px 6px -6px;
  background: var(--medal-edge);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%);
}

.rank-medal b {
  color: inherit;
  font-size: 15px;
  font-weight: 850;
}

.user {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.user strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user small {
  color: #95a0ae;
  font-size: 11px;
}

.board-row > strong {
  color: #1e66b4;
}

.score-breakdown {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #4e5f75;
  font-weight: 750;
}

.score-breakdown small {
  padding: 3px 7px;
  border-radius: 999px;
  background: #eef5ff;
  color: #2f70df;
  font-size: 11px;
  font-weight: 850;
}

@media (max-width: 760px) {
  .leaderboard-page {
    width: min(100% - 28px, 680px);
    padding-top: 20px;
  }

  .leaderboard-hero {
    align-items: flex-start;
    flex-direction: column;
    padding: 28px;
  }

  .rank-switcher {
    grid-template-columns: 1fr;
  }

  .board {
    overflow-x: auto;
  }

  .board-head,
  .board-row {
    min-width: 680px;
  }
}
</style>
