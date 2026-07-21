<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { useRouter } from 'vue-router';
import { CalendarClock, Flag, ListFilter, PanelLeftClose, PanelLeftOpen, PlayCircle, Trophy } from '@lucide/vue';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import { pointDifficultyShortLabel } from '../utils/pointDifficulty';

type Contest = {
  id: string; contestNo: number; title: string; description?: string; mode: 'ACM' | 'IOI'; visibility: string;
  startTime: string; endTime: string; freezeTime?: string | null; allowUpsolve: boolean; penaltyTime: number;
  teamMode: boolean; isRated: boolean; organizer?: { id: string; name: string };
  state: 'UPCOMING' | 'RUNNING' | 'ENDED';
  participant?: { isVirtual: boolean } | null;
  problems: Array<{ id: string; problemId: string; order: number; score: number; problem: { id: string; title: string; difficulty: string } }>;
  _count?: { problems: number; participants: number };
};

const router = useRouter();
const auth = useAuthStore();
const contests = ref<Contest[]>([]);
const selected = ref<Contest | null>(null);
const standings = ref<any[]>([]);
const filter = ref('ALL');
const loading = ref(true);
const actionLoading = ref(false);
const error = ref('');
const showCreator = ref(false);
const problems = ref<any[]>([]);
const form = ref({ title: '', description: '', mode: 'ACM', startTime: '', endTime: '', registerStart: '', registerEnd: '', freezeTime: '', penaltyTime: 20, allowUpsolve: true, teamMode: false, isRated: false, problemIds: [] as string[] });
let standingTimer: ReturnType<typeof setInterval> | null = null;
const sidebarCollapsed = useStorage('swufe-oj:contest-sidebar-collapsed-v2', true);

const isTeacher = computed(() => auth.isTeacher());
const filtered = computed(() => filter.value === 'ALL' ? contests.value : contests.value.filter((item) => item.state === filter.value));
const labels: Record<string, string> = { ALL: '全部赛事', UPCOMING: '即将开始', RUNNING: '进行中', ENDED: '已结束' };
const filterIcons: Record<string, any> = { ALL: ListFilter, UPCOMING: CalendarClock, RUNNING: PlayCircle, ENDED: Flag };

function dateText(value?: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '未设置';
}
function stateText(value: string) { return ({ UPCOMING: '报名中', RUNNING: '进行中', ENDED: '已结束' } as Record<string, string>)[value]; }

async function load() {
  loading.value = true; error.value = '';
  try {
    if (auth.token && !auth.user) await auth.fetchProfile();
    let data: Contest[];
    try {
      const response = await api.get(auth.token ? '/api/contests/mine' : '/api/contests');
      data = response.data;
    } catch (requestError: any) {
      if (requestError.response?.status !== 404) throw requestError;
      const fallback = await api.get('/api/contests');
      data = fallback.data;
      error.value = '比赛服务已更新：登录后的报名、虚拟赛和个人赛事状态需要重启后端后才可使用。';
    }
    contests.value = data;
    const next = selected.value ? data.find((item: Contest) => item.id === selected.value?.id) : null;
    if (next) await selectContest(next);
  } catch (e: any) {
    error.value = e.response?.status === 404
      ? '当前后端尚未加载比赛模块，请重启后端服务后重试。'
      : e.response?.data?.message || '比赛列表加载失败';
  } finally { loading.value = false; }
}
async function selectContest(contest: Contest) {
  selected.value = contest; standings.value = [];
  await refreshStandings();
}
function showOverview(nextFilter: string) {
  filter.value = nextFilter;
  selected.value = null;
  standings.value = [];
}
async function refreshStandings() {
  if (!selected.value) return;
  try {
    const { data } = await api.get('/api/contests/' + selected.value.id + '/standings');
    standings.value = data.rows || [];
  } catch { standings.value = []; }
}
async function register() {
  if (!selected.value) return;
  if (!auth.token) { router.push({ path: '/login', query: { redirect: '/contests' } }); return; }
  const password = selected.value.visibility === 'PASSWORD' ? window.prompt('请输入比赛密码') || '' : '';
  actionLoading.value = true;
  try {
    await api.post('/api/contests/' + selected.value.id + '/register', { password });
    await load();
  } catch (e: any) { error.value = e.response?.data?.message || '报名失败'; }
  finally { actionLoading.value = false; }
}
async function virtualContest() {
  if (!selected.value) return;
  if (!auth.token) { router.push({ path: '/login', query: { redirect: '/contests' } }); return; }
  actionLoading.value = true;
  try {
    await api.post('/api/contests/' + selected.value.id + '/virtual');
    await load();
  } catch (e: any) { error.value = e.response?.data?.message || '无法开始虚拟比赛'; }
  finally { actionLoading.value = false; }
}
function enterProblem(problemId: string) {
  if (selected.value) router.push({ path: '/problems/' + problemId, query: { contestId: selected.value.id } });
}
async function openCreator() {
  showCreator.value = true;
  if (problems.value.length) return;
  try {
    const { data } = await api.get('/api/problems', { params: { page: 1, pageSize: 100 } });
    problems.value = data.items || data || [];
  } catch { error.value = '题库加载失败，暂不能创建比赛'; }
}
function iso(value: string) { return value ? new Date(value).toISOString() : undefined; }
async function createContest() {
  if (!form.value.title || !form.value.startTime || !form.value.endTime) { error.value = '请填写比赛名称、开始时间和结束时间'; return; }
  actionLoading.value = true;
  try {
    await api.post('/api/teacher/contests', {
      ...form.value,
      startTime: iso(form.value.startTime), endTime: iso(form.value.endTime),
      registerStart: iso(form.value.registerStart), registerEnd: iso(form.value.registerEnd), freezeTime: iso(form.value.freezeTime),
    });
    showCreator.value = false;
    form.value = { title: '', description: '', mode: 'ACM', startTime: '', endTime: '', registerStart: '', registerEnd: '', freezeTime: '', penaltyTime: 20, allowUpsolve: true, teamMode: false, isRated: false, problemIds: [] };
    await load();
  } catch (e: any) { error.value = e.response?.data?.message || '创建比赛失败'; }
  finally { actionLoading.value = false; }
}
onMounted(async () => {
  await load();
  standingTimer = setInterval(refreshStandings, 15000);
});
onUnmounted(() => {
  if (standingTimer) clearInterval(standingTimer);
});
</script>

<template>
  <main class="contest-page">
    <div v-if="loading" class="loading page-loading">正在加载赛事日历…</div>
    <div v-else class="contest-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <aside class="contest-sidebar">
        <div class="sidebar-title">
          <span class="sidebar-title-icon"><Trophy :size="19" aria-hidden="true" /></span>
          <span class="sidebar-title-copy"><strong>赛事导航</strong><small>比赛与训练</small></span>
          <button
            type="button"
            class="sidebar-collapse-button"
            :aria-label="sidebarCollapsed ? '展开比赛侧栏' : '收起比赛侧栏'"
            :aria-expanded="!sidebarCollapsed"
            aria-controls="contest-sidebar-navigation"
            :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <PanelLeftOpen v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
            <PanelLeftClose v-else :size="18" aria-hidden="true" />
          </button>
        </div>
        <p class="sidebar-label">赛事筛选</p>
        <nav id="contest-sidebar-navigation" class="filters" aria-label="比赛状态筛选">
          <button v-for="(_, key) in labels" :key="key" :class="{ active: filter === key }" :title="sidebarCollapsed ? labels[key] : undefined" @click="showOverview(key)">
            <component :is="filterIcons[key]" :size="18" aria-hidden="true" />
            <span>{{ labels[key] }}</span>
            <small>{{ key === 'ALL' ? contests.length : contests.filter((item) => item.state === key).length }}</small>
          </button>
        </nav>
        <div class="sidebar-divider"></div>
        <p class="sidebar-label">赛事列表</p>
        <div class="contest-list">
          <button v-for="contest in filtered" :key="contest.id" class="contest-card" :class="{ selected: selected?.id === contest.id }" @click="selectContest(contest)">
            <span class="mode">{{ contest.mode }}</span>
            <span class="state" :class="contest.state.toLowerCase()">{{ stateText(contest.state) }}</span>
            <b>{{ contest.title }}</b>
            <small>{{ dateText(contest.startTime) }} — {{ dateText(contest.endTime) }}</small>
            <em>{{ contest._count?.problems || contest.problems.length }} 题 · {{ contest._count?.participants || 0 }} 人报名</em>
          </button>
          <div v-if="!filtered.length" class="empty">暂无符合条件的比赛</div>
        </div>
      </aside>
      <div class="contest-main">
    <section class="hero">
      <div>
        <p class="eyebrow">COMPETE · LEARN · REPLAY</p>
        <h1>比赛中心</h1>
        <p>用真实排名检验训练成果。正式赛结束后，还可以通过虚拟比赛重走完整赛程。</p>
      </div>
      <div class="hero-actions">
        <button v-if="isTeacher" class="gold" @click="openCreator">＋ 创建比赛</button>
        <button class="ghost" @click="router.push('/leaderboard')">练习排行榜 →</button>
      </div>
      <i class="ring one"></i><i class="ring two"></i>
    </section>

    <p v-if="error" class="notice">{{ error }}</p>

    <section class="workspace">

      <section v-if="selected" class="detail">
        <header class="detail-head">
          <div>
            <div class="badges"><span class="mode">{{ selected.mode }}</span><span class="contest-kind">{{ selected.teamMode ? '团队公开赛' : '个人公开赛' }}</span><span v-if="selected.isRated" class="rated">Rated</span><span class="state" :class="selected.state.toLowerCase()">{{ stateText(selected.state) }}</span><span v-if="selected.participant?.isVirtual" class="virtual">虚拟参赛</span></div>
            <h2>{{ selected.title }}</h2>
            <p>{{ selected.description || '一场等待你加入的编程挑战。' }}</p>
          </div>
          <button v-if="selected.state === 'UPCOMING' && !selected.participant" class="gold" :disabled="actionLoading" @click="register">报名参赛</button>
          <button v-else-if="selected.state === 'RUNNING' && !selected.participant" class="gold" :disabled="actionLoading" @click="register">现在报名</button>
          <button v-else-if="selected.state === 'ENDED' && selected.allowUpsolve" class="gold" :disabled="actionLoading" @click="virtualContest">开始虚拟比赛</button>
          <span v-else class="joined">✓ 已加入赛事</span>
        </header>

        <div class="rules">
          <span>🗓 {{ dateText(selected.startTime) }} 至 {{ dateText(selected.endTime) }}</span>
          <span>⏱ {{ selected.mode === 'ACM' ? '错误罚时 ' + selected.penaltyTime + ' 分钟' : '按最高得分计分' }}</span>
          <span v-if="selected.freezeTime">🔒 {{ dateText(selected.freezeTime) }} 起封榜</span><span v-else>📊 实时公开排行</span>
        </div>

        <div class="contest-facts" aria-label="比赛基本信息">
          <div><small>比赛编号</small><strong>#{{ selected.contestNo }}</strong></div>
          <div><small>举办者</small><strong>{{ selected.organizer?.name || '平台赛事组' }}</strong></div>
          <div><small>比赛类型</small><span><b>{{ selected.mode }}</b><b>{{ selected.teamMode ? '团队公开赛' : '个人公开赛' }}</b><b v-if="selected.isRated" class="rated">Rated</b></span></div>
        </div>

        <div class="boards">
          <div class="panel">
            <div class="panel-title">比赛题目 <small>{{ selected.problems.length }} PROBLEMS</small></div>
            <button v-for="(item, index) in selected.problems" :key="item.id" class="problem" :disabled="selected.state !== 'RUNNING' || !selected.participant" @click="enterProblem(item.problem.id)">
              <strong>{{ String.fromCharCode(65 + index) }}</strong><span>{{ item.problem.title }}</span><small>{{ selected.mode === 'IOI' ? item.score + ' 分' : pointDifficultyShortLabel(item.problem.difficulty) }}</small>
            </button>
            <p v-if="selected.state !== 'RUNNING'" class="tip">比赛开始后可进入题目；赛后可通过虚拟比赛补题。</p>
          </div>
          <div class="panel">
            <div class="panel-title">实时战报 <small>{{ selected.mode }} RANKING</small></div>
            <div v-if="!standings.length" class="tip">还没有可展示的排名数据</div>
            <div v-for="row in standings.slice(0, 8)" :key="row.userId" class="rank-row">
              <b :class="{ podium: row.rank <= 3 }">{{ row.rank }}</b><span>{{ row.user.nickname || row.user.username }}</span>
              <strong>{{ selected.mode === 'ACM' ? row.solvedCount + ' 题' : row.score + ' 分' }}</strong><small v-if="selected.mode === 'ACM'">{{ row.penalty }} min</small>
            </div>
            <button class="rank-button" @click="router.push('/leaderboard?contestId=' + selected?.id)">完整排行榜 →</button>
          </div>
        </div>
      </section>
      <section v-else class="contest-overview">
        <header class="overview-head">
          <div>
            <p class="eyebrow">{{ filter === 'ALL' ? 'ALL CONTESTS' : 'CONTEST STATUS' }}</p>
            <h2>{{ labels[filter] }}</h2>
            <p>{{ filter === 'ALL' ? '浏览全部比赛，选择一场即可查看赛程、题目与实时排行。' : `这里展示所有${labels[filter]}的比赛。` }}</p>
          </div>
          <strong>{{ filtered.length }} <small>场比赛</small></strong>
        </header>
        <div v-if="filtered.length" class="overview-grid">
          <button v-for="contest in filtered" :key="contest.id" class="overview-card" @click="selectContest(contest)">
            <div class="overview-card-top"><span class="mode">{{ contest.mode }}</span><span class="state" :class="contest.state.toLowerCase()">{{ stateText(contest.state) }}</span></div>
            <h3>{{ contest.title }}</h3>
            <p>{{ contest.description || '查看比赛安排、题目与排名信息。' }}</p>
            <div class="overview-meta"><span>#{{ contest.contestNo }}</span><span>{{ contest.organizer?.name || '平台赛事组' }}</span><span>{{ contest.teamMode ? '团队公开赛' : '个人公开赛' }}</span><span v-if="contest.isRated" class="rated">Rated</span></div>
            <span class="overview-enter">查看比赛 <span aria-hidden="true">→</span></span>
          </button>
        </div>
        <div v-else class="overview-empty"><span>🏁</span><h3>暂无{{ labels[filter] }}的比赛</h3><p>换一个状态查看，或等待教师发布新的比赛。</p></div>
      </section>
    </section>
      </div>
    </div>

    <div v-if="showCreator" class="backdrop" @click.self="showCreator = false">
      <form class="creator" @submit.prevent="createContest">
        <header><div><p class="eyebrow">TEACHER CONSOLE</p><h2>创建一场比赛</h2></div><button type="button" @click="showCreator = false">×</button></header>
        <div class="form-grid">
          <label class="wide">比赛名称<input v-model="form.title" required placeholder="例如：2026 夏季算法挑战赛" /></label>
          <label>计分模式<select v-model="form.mode"><option value="ACM">ACM / ICPC</option><option value="IOI">IOI / 得分制</option></select></label>
          <label>每次错误罚时<input v-model.number="form.penaltyTime" type="number" min="0" /></label>
          <label class="wide">比赛说明<textarea v-model="form.description" rows="3" placeholder="说明比赛范围、注意事项与参赛要求"></textarea></label>
          <label>开始时间<input v-model="form.startTime" type="datetime-local" required /></label><label>结束时间<input v-model="form.endTime" type="datetime-local" required /></label>
          <label>报名开始<input v-model="form.registerStart" type="datetime-local" /></label><label>报名截止<input v-model="form.registerEnd" type="datetime-local" /></label>
          <label>封榜时间<input v-model="form.freezeTime" type="datetime-local" /></label><label class="check"><input v-model="form.allowUpsolve" type="checkbox" /> 允许赛后虚拟比赛</label>
          <label class="check"><input v-model="form.teamMode" type="checkbox" /> 团队公开赛</label><label class="check"><input v-model="form.isRated" type="checkbox" /> Rated（计入评级标识）</label>
        </div>
        <div class="picker"><b>选择比赛题目</b><small>可多选</small><label v-for="problem in problems" :key="problem.id"><input v-model="form.problemIds" type="checkbox" :value="problem.id" /> {{ problem.title }} <em>{{ pointDifficultyShortLabel(problem.difficulty) }}</em></label><p v-if="!problems.length">暂无已发布题目，请先在题库中发布题目。</p></div>
        <footer><button type="button" class="cancel" @click="showCreator = false">取消</button><button class="gold" :disabled="actionLoading">创建比赛</button></footer>
      </form>
    </div>
  </main>
</template>

<style scoped>
.contest-page { --ink:#18253a; --muted:#748197; --line:#e4eaf0; --navy:#173b66; --gold:#f6c15c; max-width:1180px; margin:auto; padding:26px 22px 64px; color:var(--ink); }
.hero { position:relative; isolation:isolate; overflow:hidden; display:flex; justify-content:space-between; gap:30px; min-height:178px; padding:32px 40px; border-radius:26px; color:#fff; background:linear-gradient(120deg,#16385f,#2d6da2); box-shadow:0 18px 42px rgba(23,59,102,.18); }.hero:after { content:""; position:absolute; z-index:-1; inset:0; opacity:.25; background-image:radial-gradient(#fff 1px,transparent 1.6px); background-size:25px 25px; }.eyebrow { margin:0 0 7px; color:#f8cd77; font-size:11px; font-weight:900; letter-spacing:.15em; }.hero h1 { margin:0; font-size:42px; letter-spacing:-.05em; }.hero p:not(.eyebrow) { max-width:610px; margin:11px 0 0; color:#dfedfb; line-height:1.7; }.hero-actions { display:flex; flex-direction:column; justify-content:center; gap:9px; min-width:145px; }.gold,.ghost,.cancel { border:0; border-radius:11px; padding:11px 16px; font:inherit; font-weight:900; cursor:pointer; transition:.2s; }.gold { color:#16395f; background:var(--gold); box-shadow:0 7px 15px rgba(0,0,0,.12); }.gold:hover,.ghost:hover { transform:translateY(-2px); }.ghost { color:#edf7ff; background:rgba(255,255,255,.13); }.ring { position:absolute; z-index:-1; border:1px solid rgba(255,255,255,.23); border-radius:50%; }.one { width:260px; height:260px; top:-130px; right:-70px; }.two { width:450px; height:450px; bottom:-350px; right:-235px; }
.notice { margin-top:20px; padding:11px 14px; color:#a44d35; background:#fff0eb; border-radius:10px; }.loading,.empty { display:grid; place-items:center; min-height:160px; color:var(--muted); border:1px dashed #cbd5df; border-radius:14px; }
.workspace { display:grid; grid-template-columns:300px minmax(0,1fr); gap:20px; margin-top:22px; transition:grid-template-columns 180ms cubic-bezier(.2,0,0,1); }.contest-sidebar { position:sticky; top:18px; display:flex; align-self:start; max-height:calc(100vh - 36px); padding:13px; overflow:hidden; flex-direction:column; border:1px solid var(--line); border-radius:18px; background:#f8fbfe; box-shadow:0 8px 22px rgba(23,59,102,.05); transition:padding 180ms cubic-bezier(.2,0,0,1); }.sidebar-title { display:flex; align-items:center; gap:10px; padding:1px 5px 15px; }.sidebar-title-icon { display:inline-grid; width:34px; height:34px; flex:0 0 34px; place-items:center; color:#1c5688; border-radius:8px; background:#ddecfa; }.sidebar-title-copy { display:flex; min-width:0; flex-direction:column; }.sidebar-title strong { color:var(--ink); font-size:13px; line-height:1.3; }.sidebar-title small { margin-top:2px; color:var(--muted); font-size:10px; }.sidebar-collapse-button { display:inline-grid; width:34px; height:34px; flex:0 0 34px; margin-left:auto; place-items:center; color:#6f7e8f; border:0; border-radius:7px; background:transparent; cursor:pointer; transition:background .15s,color .15s; }.sidebar-collapse-button:hover { color:var(--ink); background:#e8eef4; }.sidebar-collapse-button:focus-visible { outline:2px solid #2b6da5; outline-offset:2px; }.sidebar-label { margin:3px 7px 9px; color:#8493a5; font-size:10px; font-weight:900; letter-spacing:.12em; }.filters { display:flex; gap:4px; flex-direction:column; }.filters button { display:flex; align-items:center; gap:10px; padding:10px 11px; border:0; border-radius:10px; color:#607187; background:transparent; font:inherit; font-size:13px; font-weight:750; cursor:pointer; transition:background .18s,color .18s,transform .18s; }.filters button:hover { color:#1e5688; background:#eaf3fb; }.filters button span { min-width:0; flex:1; text-align:left; }.filters button small { display:grid; min-width:22px; height:20px; place-items:center; color:#8c9bad; border-radius:6px; background:#edf1f5; font-size:10px; }.filters .active { color:#fff; background:var(--navy); box-shadow:0 5px 12px rgba(23,59,102,.18); }.filters .active small { color:#dceeff; background:rgba(255,255,255,.16); }.sidebar-divider { height:1px; margin:13px 4px; background:#dce5ee; }.contest-list { display:flex; max-height:465px; overflow:auto; flex-direction:column; gap:8px; padding:0 3px 2px; }.contest-card { position:relative; display:grid; gap:6px; padding:13px; color:var(--ink); text-align:left; border:1px solid transparent; border-radius:13px; background:#fff; cursor:pointer; transition:.2s; }.contest-card:hover,.contest-card.selected { border-color:#8cb7dc; transform:translateX(2px); box-shadow:0 8px 18px rgba(23,59,102,.09); }.contest-card.selected { background:#f1f8ff; }.mode { width:max-content; padding:3px 7px; color:#285d8e; border-radius:5px; background:#ddecfa; font-size:10px; font-weight:900; letter-spacing:.08em; }.state { font-size:11px; font-weight:900; }.contest-card .state { position:absolute; top:14px; right:12px; }.state.running { color:#10836d; }.state.upcoming { color:#a16600; }.state.ended { color:#8c98a6; }.contest-card b { font-size:14px; }.contest-card small,.contest-card em { color:var(--muted); font-size:11px; font-style:normal; }.contest-card em { color:#53687e; font-weight:700; }
.workspace.sidebar-collapsed { grid-template-columns:72px minmax(0,1fr); }.sidebar-collapsed .contest-sidebar { padding-right:10px; padding-left:10px; }.sidebar-collapsed .sidebar-title { justify-content:center; padding-right:0; padding-left:0; }.sidebar-collapsed .sidebar-title-icon,.sidebar-collapsed .sidebar-title-copy,.sidebar-collapsed .sidebar-label,.sidebar-collapsed .sidebar-divider,.sidebar-collapsed .contest-list { display:none; }.sidebar-collapsed .sidebar-collapse-button { margin-left:0; }.sidebar-collapsed .filters button { justify-content:center; padding-right:0; padding-left:0; }.sidebar-collapsed .filters button span,.sidebar-collapsed .filters button small { display:none; }
.contest-page { max-width:none; min-height:calc(100vh - 56px); margin:0; padding:0; background:#f3f5f7; }.contest-shell { display:flex; min-height:calc(100vh - 56px); }.contest-main { min-width:0; flex:1 1 auto; padding:26px 28px 64px; }.contest-main .hero,.contest-main .notice,.contest-main .workspace { width:min(1440px,100%); max-width:none; margin-right:auto; margin-left:auto; }.contest-sidebar { top:56px; width:300px; height:calc(100vh - 56px); max-height:calc(100vh - 56px); flex:0 0 300px; padding-top:22px; border-top:0; border-bottom:0; border-left:0; border-radius:0 18px 18px 0; transition:width 240ms cubic-bezier(.2,0,0,1),flex-basis 240ms cubic-bezier(.2,0,0,1),padding 240ms cubic-bezier(.2,0,0,1); will-change:width,flex-basis; }.workspace { display:block; margin-top:22px; }.page-loading { min-height:calc(100vh - 56px); border:0; border-radius:0; background:#f3f5f7; }.contest-shell.sidebar-collapsed .contest-sidebar { width:72px; flex-basis:72px; }.contest-shell.sidebar-collapsed .sidebar-title-icon,.contest-shell.sidebar-collapsed .sidebar-title-copy,.contest-shell.sidebar-collapsed .sidebar-label,.contest-shell.sidebar-collapsed .sidebar-divider,.contest-shell.sidebar-collapsed .contest-list { display:none; }.contest-shell.sidebar-collapsed .sidebar-title { justify-content:center; padding-right:0; padding-left:0; }.contest-shell.sidebar-collapsed .sidebar-collapse-button { margin-left:0; }.contest-shell.sidebar-collapsed .filters button { justify-content:center; padding-right:0; padding-left:0; }.contest-shell.sidebar-collapsed .filters button span,.contest-shell.sidebar-collapsed .filters button small { display:none; }
.detail { min-width:0; padding:28px; border:1px solid var(--line); border-radius:21px; background:#fffdf8; box-shadow:0 10px 30px rgba(22,42,70,.05); }.detail-head { display:flex; justify-content:space-between; gap:20px; }.badges { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.contest-kind,.rated { padding:3px 7px; border-radius:5px; font-size:10px; font-weight:900; letter-spacing:.03em; }.contest-kind { color:#247457; background:#e3f4ea; }.rated { color:#fff; background:#43b925; }.virtual { color:#6a4c9d; font-size:11px; font-weight:900; }.detail h2 { margin:11px 0 7px; font-size:27px; letter-spacing:-.03em; }.detail-head p { margin:0; color:var(--muted); line-height:1.65; }.joined { color:#13806b; font-weight:900; white-space:nowrap; }.rules { display:flex; flex-wrap:wrap; gap:14px; margin:22px 0; padding:12px 0; color:#53677d; border-top:1px solid var(--line); border-bottom:1px solid var(--line); font-size:12px; font-weight:700; }.contest-facts { display:grid; grid-template-columns:.7fr 1fr 1.8fr; gap:1px; margin:0 0 20px; overflow:hidden; border:1px solid #e0e8ef; border-radius:12px; background:#e0e8ef; }.contest-facts>div { display:grid; gap:5px; padding:13px 15px; background:#fff; }.contest-facts small { color:#8492a1; font-size:10px; font-weight:900; letter-spacing:.08em; }.contest-facts strong { color:#344f69; font-size:14px; }.contest-facts>div>span { display:flex; flex-wrap:wrap; gap:6px; }.contest-facts b { padding:3px 6px; color:#285d8e; border-radius:4px; background:#e4f0fb; font-size:10px; }.contest-facts b.rated { color:#fff; background:#43b925; }.boards { display:grid; grid-template-columns:1.25fr .85fr; gap:17px; }.panel { padding:17px; border:1px solid #e9edf1; border-radius:15px; background:#fff; }.panel-title { display:flex; justify-content:space-between; margin-bottom:11px; font-weight:900; }.panel-title small { color:#9da8b6; font-size:10px; letter-spacing:.1em; }.problem { display:grid; grid-template-columns:30px 1fr auto; align-items:center; width:100%; gap:9px; padding:11px 0; color:var(--ink); text-align:left; border:0; border-top:1px solid #f0f2f5; background:transparent; cursor:pointer; }.problem:disabled { cursor:not-allowed; }.problem:not(:disabled):hover span { color:#1764a7; }.problem strong { display:grid; place-items:center; width:25px; height:25px; color:#fff; border-radius:6px; background:var(--navy); font-size:12px; }.problem small,.tip { color:#91a0af; font-size:11px; }.rank-row { display:grid; grid-template-columns:29px 1fr auto 52px; align-items:center; gap:7px; padding:10px 0; border-top:1px solid #f0f2f5; font-size:13px; }.rank-row>b { color:#92a0af; }.rank-row>b.podium { color:#ce8814; }.rank-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.rank-row strong { color:#1b4f83; }.rank-row small { color:#8b98a7; text-align:right; }.rank-button { width:100%; margin-top:12px; padding:9px; color:#245b8e; border:1px solid #c9ddec; border-radius:9px; background:#f3f9ff; font-weight:900; cursor:pointer; }.blank { min-height:390px; display:grid; place-items:center; align-content:center; text-align:center; color:var(--muted); }.blank span { font-size:42px; }
.contest-overview { min-width:0; padding:28px; border:1px solid var(--line); border-radius:21px; background:#fffdf8; box-shadow:0 10px 30px rgba(22,42,70,.05); }.overview-head { display:flex; align-items:end; justify-content:space-between; gap:24px; padding-bottom:22px; border-bottom:1px solid var(--line); }.overview-head .eyebrow { color:#4e87b6; }.overview-head h2 { margin:0 0 7px; font-size:29px; letter-spacing:-.04em; }.overview-head p:not(.eyebrow) { max-width:620px; margin:0; color:var(--muted); line-height:1.65; }.overview-head>strong { color:#1d5789; font-size:30px; line-height:1; white-space:nowrap; }.overview-head>strong small { color:#8d9bab; font-size:12px; }.overview-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; margin-top:22px; }.overview-card { display:flex; min-height:205px; flex-direction:column; align-items:stretch; padding:19px; color:var(--ink); text-align:left; border:1px solid #e2eaf1; border-radius:16px; background:#fff; cursor:pointer; transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }.overview-card:hover { border-color:#82b1d7; transform:translateY(-3px); box-shadow:0 12px 25px rgba(23,59,102,.1); }.overview-card-top { display:flex; align-items:center; justify-content:space-between; }.overview-card h3 { margin:15px 0 6px; font-size:17px; line-height:1.4; }.overview-card>p { display:-webkit-box; margin:0; overflow:hidden; color:var(--muted); -webkit-box-orient:vertical; -webkit-line-clamp:2; font-size:12px; line-height:1.6; }.overview-meta { display:flex; flex-wrap:wrap; gap:7px 13px; margin-top:auto; padding-top:18px; color:#718095; font-size:11px; font-weight:700; }.overview-meta span { display:flex; align-items:center; gap:4px; }.overview-enter { margin-top:15px; color:#24649b; font-size:12px; font-weight:900; }.overview-enter span { display:inline-block; margin-left:3px; transition:transform .18s ease; }.overview-card:hover .overview-enter span { transform:translateX(4px); }.overview-empty { display:grid; min-height:310px; place-items:center; align-content:center; text-align:center; color:var(--muted); }.overview-empty span { font-size:40px; }.overview-empty h3 { margin:10px 0 4px; color:#506277; font-size:17px; }.overview-empty p { margin:0; font-size:12px; }
.backdrop { position:fixed; z-index:20; inset:0; display:grid; place-items:center; padding:20px; overflow:auto; background:rgba(14,29,49,.45); backdrop-filter:blur(4px); }.creator { width:min(750px,100%); max-height:calc(100vh - 40px); overflow:auto; padding:26px; border-radius:20px; background:#fffdf8; box-shadow:0 24px 70px rgba(0,0,0,.28); }.creator header { display:flex; justify-content:space-between; align-items:start; }.creator h2 { margin:0; }.creator header button { border:0; color:#7e8a98; background:transparent; font-size:28px; cursor:pointer; }.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px; margin:22px 0; }.form-grid label { display:grid; gap:6px; color:#5c6b7d; font-size:12px; font-weight:900; }.form-grid .wide { grid-column:1/-1; }.form-grid input,.form-grid select,.form-grid textarea { box-sizing:border-box; width:100%; padding:10px; color:var(--ink); border:1px solid #dce3ea; border-radius:9px; background:#fff; font:inherit; font-size:13px; }.form-grid .check { display:flex; align-items:center; gap:8px; }.form-grid .check input { width:auto; }.picker { padding:14px; border:1px solid #e5ebf0; border-radius:12px; }.picker>small { margin-left:7px; color:#96a2b0; font-size:11px; }.picker label { display:flex; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid #f0f2f4; font-size:13px; }.picker em { margin-left:auto; color:#8492a3; font-style:normal; font-size:11px; }.creator footer { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }.cancel { color:#667687; background:#edf1f5; }
@media(max-width:860px){.contest-shell{display:block}.contest-main{padding:18px 16px 46px}.hero,.detail-head,.overview-head{flex-direction:column;align-items:start}.hero-actions{flex-direction:row}.workspace,.workspace.sidebar-collapsed,.boards{grid-template-columns:1fr}.contest-facts{grid-template-columns:1fr}.contest-sidebar,.contest-shell.sidebar-collapsed .contest-sidebar{position:static;width:auto;height:auto;max-height:none;padding:13px;border:1px solid var(--line);border-radius:18px}.contest-shell.sidebar-collapsed .sidebar-title-icon,.contest-shell.sidebar-collapsed .sidebar-title-copy,.contest-shell.sidebar-collapsed .sidebar-label,.contest-shell.sidebar-collapsed .sidebar-divider,.contest-shell.sidebar-collapsed .contest-list{display:initial}.contest-shell.sidebar-collapsed .sidebar-title{justify-content:initial;padding:1px 5px 15px}.contest-shell.sidebar-collapsed .sidebar-collapse-button{margin-left:auto}.sidebar-collapse-button{display:none}.filters{display:grid;grid-template-columns:repeat(4,1fr)}.filters button,.contest-shell.sidebar-collapsed .filters button{display:grid;justify-items:center;padding:9px 6px;font-size:12px}.filters button span,.contest-shell.sidebar-collapsed .filters button span{display:block;min-width:auto;text-align:center}.filters button small,.contest-shell.sidebar-collapsed .filters button small{display:none}.contest-list{max-height:none}.contest-card:hover,.contest-card.selected{transform:none}}@media(max-width:560px){.contest-main{padding:15px 12px 42px}.hero{padding:26px 23px;border-radius:20px}.hero h1{font-size:35px}.hero-actions button{flex:1}.detail,.contest-overview{padding:20px}.overview-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.filters{grid-template-columns:repeat(2,1fr)}}
/* Light workspace treatment for the contest hero and selected navigation. */
.hero {
  border: 1px solid #dce5ef;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 66, 104, 0.08);
  color: #1f2a37;
}
.hero::after { opacity: 0; }
.eyebrow { color: #3977aa; }
.hero p:not(.eyebrow) { color: #66778a; }
.ghost {
  border: 1px solid #aec7f4;
  background: #e7efff;
  color: #1f5eff;
}
.ring { border-color: #dce9ff; }
.filters .active {
  background: #e7efff;
  color: #1f5eff;
  box-shadow: none;
}
.filters .active small { background: #dce9ff; color: #1f5eff; }
.problem strong { background: #e7efff; color: #1f5eff; }
</style>
