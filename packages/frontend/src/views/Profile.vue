<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Activity,
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Code2,
  Flame,
  History,
  KeyRound,
  Link2,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
} from '@lucide/vue';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import UserAvatar from '../components/UserAvatar.vue';
import { pointDifficultyShortLabel } from '../utils/pointDifficulty';

interface HeatDay { date: string; count: number; accepted: number; level: number }
interface Stats {
  overview: {
    totalSubmissions?: number;
    acceptRate?: number;
    solvedCount?: number;
    triedCount?: number;
    activeDays?: number;
    currentStreak?: number;
  };
  heatmap: HeatDay[];
  difficultyDist: Array<{ difficulty: string; count: number }>;
  recentSubmissions: any[];
}
interface AwardRecord {
  id: string;
  competition: 'ICPC' | 'CCPC';
  year?: number | null;
  season?: string | null;
  region?: string | null;
  awardLevel: string;
  teamName?: string | null;
  rank?: number | null;
  certificateUrl?: string | null;
  status: string;
}

const router = useRouter();
const auth = useAuthStore();
const stats = ref<Stats | null>(null);
const profile = ref<any>(null);
const loading = ref(true);
const error = ref('');
const activeTab = ref<'overview' | 'accepted' | 'submissions' | 'settings'>('overview');

const allSubmissions = ref<any[]>([]);
const subsLoading = ref(false);
const acceptedProblems = ref<any[]>([]);
const acceptedLoading = ref(false);
const selectedSubmission = ref<any>(null);

const settingsLoading = ref(false);
const settingsError = ref('');
const avatarInput = ref<HTMLInputElement | null>(null);
const avatarUploading = ref(false);
const avatarError = ref('');
const profileForm = reactive({ nickname: '', email: '', phone: '', studentId: '' });
const accountForm = reactive({ codeforcesHandle: '', luoguHandle: '' });
const cfSyncing = ref(false);
const passwordForm = reactive({ currentPassword: '', password: '', confirmPassword: '' });
const passwordSaving = ref(false);
const awards = ref<AwardRecord[]>([]);
const awardForm = reactive({
  id: '',
  competition: 'ICPC' as 'ICPC' | 'CCPC',
  year: new Date().getFullYear(),
  season: '',
  region: '',
  awardLevel: '',
  teamName: '',
  rank: null as number | null,
  certificateUrl: '',
});

const overview = computed(() => stats.value?.overview || {});
const displayName = computed(() => profile.value?.nickname || profile.value?.username || 'OJ 用户');
const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase());
const isStudentAccount = computed(() => profile.value?.role === 'STUDENT' || profile.value?.requestedRole === 'STUDENT');
const studentIdDisplay = computed(() => profile.value?.studentId || profileForm.studentId || '未绑定学号');
const maxDifficultyCount = computed(() => Math.max(...(stats.value?.difficultyDist || []).map((item) => item.count), 1));
const solvedRate = computed(() => {
  const tried = Number(overview.value.triedCount || 0);
  const solved = Number(overview.value.solvedCount || 0);
  return tried ? Math.round((solved / tried) * 100) : 0;
});

onMounted(async () => {
  try {
    const [profileRes, statsRes, settingsRes] = await Promise.allSettled([
      api.get('/api/user/profile'),
      api.get('/api/user/stats'),
      api.get('/api/user/settings'),
    ]);

    if (profileRes.status === 'fulfilled') profile.value = profileRes.value.data;
    if (statsRes.status === 'fulfilled') stats.value = statsRes.value.data;
    if (settingsRes.status === 'fulfilled') {
      profile.value = settingsRes.value.data.profile || profile.value;
      fillSettings(settingsRes.value.data);
    } else if (profile.value) {
      fillSettings({ profile: profile.value, externalAccounts: {}, awards: [] });
    }

    if (!profile.value || !stats.value) throw new Error('missing required profile data');
  } catch (e: any) {
    error.value = e.response?.data?.message || '请先登录后查看个人中心';
  } finally {
    loading.value = false;
  }
});

function fillSettings(data: any) {
  const p = data.profile || profile.value || {};
  profileForm.nickname = p.nickname || '';
  profileForm.email = p.email || '';
  profileForm.phone = p.phone || '';
  profileForm.studentId = p.studentId || '';
  accountForm.codeforcesHandle = data.externalAccounts?.codeforcesHandle || '';
  accountForm.luoguHandle = data.externalAccounts?.luoguHandle || '';
  awards.value = data.awards || [];
}

async function loadSettings() {
  activeTab.value = 'settings';
  settingsLoading.value = true;
  settingsError.value = '';
  try {
    const { data } = await api.get('/api/user/settings');
    profile.value = data.profile;
    fillSettings(data);
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '加载设置失败';
  } finally {
    settingsLoading.value = false;
  }
}

async function saveProfile() {
  settingsError.value = '';
  if (isStudentAccount.value && profileForm.studentId && !/^\d{8}$/.test(profileForm.studentId)) {
    settingsError.value = '学号必须为 8 位数字';
    return;
  }
  try {
    const payload: Record<string, string> = {
      nickname: profileForm.nickname,
      email: profileForm.email,
      phone: profileForm.phone,
    };
    if (isStudentAccount.value && profileForm.studentId.trim()) {
      payload.studentId = profileForm.studentId.trim();
    }
    const { data } = await api.patch('/api/user/profile', payload);
    profile.value = { ...profile.value, ...data };
    await auth.fetchProfile();
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '保存基础资料失败';
  }
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  avatarError.value = '';
  avatarUploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/api/user/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    profile.value = { ...profile.value, ...data };
    await auth.fetchProfile();
  } catch (e: any) {
    const message = e.response?.data?.message;
    avatarError.value = Array.isArray(message) ? message.join('；') : message || '头像上传失败';
  } finally {
    avatarUploading.value = false;
    input.value = '';
  }
}

async function saveAccounts() {
  settingsError.value = '';
  try {
    const { data } = await api.put('/api/user/external-accounts', accountForm);
    accountForm.codeforcesHandle = data.codeforcesHandle || '';
    accountForm.luoguHandle = data.luoguHandle || '';
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '保存远程 OJ 账号失败';
  }
}

async function syncCodeforcesAccepted() {
  settingsError.value = '';
  cfSyncing.value = true;
  try {
    await api.post('/api/user/external-accounts/codeforces/sync');
    const statsRes = await api.get('/api/user/stats');
    stats.value = statsRes.data;
    if (activeTab.value === 'accepted') await loadAcceptedProblems();
  } catch (e: any) {
    const message = e.response?.data?.message;
    settingsError.value = Array.isArray(message) ? message.join('，') : message || '同步 Codeforces 通过记录失败';
  } finally {
    cfSyncing.value = false;
  }
}

function passwordValidationMessage() {
  if (!passwordForm.currentPassword) return '请输入当前密码';
  if (passwordForm.password.length < 8) return '新密码至少需要 8 位';
  if (!/[A-Za-z]/.test(passwordForm.password) || !/\d/.test(passwordForm.password)) return '新密码需要同时包含字母和数字';
  if (passwordForm.password !== passwordForm.confirmPassword) return '两次输入的新密码不一致';
  if (passwordForm.currentPassword === passwordForm.password) return '新密码不能与当前密码相同';
  return '';
}

async function changePassword() {
  settingsError.value = '';
  const validationError = passwordValidationMessage();
  if (validationError) {
    settingsError.value = validationError;
    return;
  }

  passwordSaving.value = true;
  try {
    await api.post('/api/user/password', {
      currentPassword: passwordForm.currentPassword,
      password: passwordForm.password,
    });
    passwordForm.currentPassword = '';
    passwordForm.password = '';
    passwordForm.confirmPassword = '';
    auth.clearAuth();
    await router.push({ path: '/login', query: { passwordChanged: '1' } });
  } catch (e: any) {
    const message = e.response?.data?.message;
    settingsError.value = Array.isArray(message) ? message.join('，') : message || '修改密码失败';
  } finally {
    passwordSaving.value = false;
  }
}

async function saveAward() {
  settingsError.value = '';
  const payload = {
    competition: awardForm.competition,
    year: awardForm.year ? Number(awardForm.year) : null,
    season: awardForm.season,
    region: awardForm.region,
    awardLevel: awardForm.awardLevel,
    teamName: awardForm.teamName,
    rank: awardForm.rank ? Number(awardForm.rank) : null,
    certificateUrl: awardForm.certificateUrl,
  };
  try {
    if (awardForm.id) {
      await api.patch(`/api/user/awards/${awardForm.id}`, payload);
    } else {
      await api.post('/api/user/awards', payload);
    }
    resetAwardForm();
    const { data } = await api.get('/api/user/awards');
    awards.value = data;
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '保存奖项认定失败';
  }
}

function editAward(award: AwardRecord) {
  awardForm.id = award.id;
  awardForm.competition = award.competition;
  awardForm.year = award.year || new Date().getFullYear();
  awardForm.season = award.season || '';
  awardForm.region = award.region || '';
  awardForm.awardLevel = award.awardLevel || '';
  awardForm.teamName = award.teamName || '';
  awardForm.rank = award.rank || null;
  awardForm.certificateUrl = award.certificateUrl || '';
  activeTab.value = 'settings';
}

async function deleteAward(id: string) {
  settingsError.value = '';
  try {
    await api.delete(`/api/user/awards/${id}`);
    awards.value = awards.value.filter((item) => item.id !== id);
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '删除奖项认定失败';
  }
}

function resetAwardForm() {
  awardForm.id = '';
  awardForm.competition = 'ICPC';
  awardForm.year = new Date().getFullYear();
  awardForm.season = '';
  awardForm.region = '';
  awardForm.awardLevel = '';
  awardForm.teamName = '';
  awardForm.rank = null;
  awardForm.certificateUrl = '';
}

async function loadAllSubmissions() {
  subsLoading.value = true;
  activeTab.value = 'submissions';
  try {
    const { data } = await api.get('/api/submissions', { params: { pageSize: 100 } });
    allSubmissions.value = data.items || [];
  } finally {
    subsLoading.value = false;
  }
}

async function loadAcceptedProblems() {
  acceptedLoading.value = true;
  activeTab.value = 'accepted';
  try {
    const { data } = await api.get('/api/user/accepted-problems');
    acceptedProblems.value = data.items || [];
  } finally {
    acceptedLoading.value = false;
  }
}

async function viewDetail(sub: any) {
  const { data } = await api.get(`/api/submissions/${sub.id}`);
  selectedSubmission.value = data;
}

const heatmapWeeks = computed(() => {
  if (!stats.value?.heatmap?.length) return [];
  const weeks: Array<Array<HeatDay | null>> = [];
  let week: Array<HeatDay | null> = [];
  const firstDay = new Date(stats.value.heatmap[0].date + 'T00:00:00');
  for (let i = 0; i < firstDay.getDay(); i++) week.push(null);
  for (const day of stats.value.heatmap) {
    week.push(day);
    if (new Date(day.date + 'T00:00:00').getDay() === 6) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
});

const monthLabels = computed(() => {
  if (!stats.value?.heatmap?.length) return [];
  const labels: Array<{ index: number; label: string }> = [];
  let lastMonth = -1;
  let colIndex = 0;
  for (const day of stats.value.heatmap) {
    const m = Number(day.date.slice(5, 7));
    if (m !== lastMonth) {
      labels.push({ index: colIndex, label: `${m}月` });
      lastMonth = m;
    }
    if (new Date(day.date + 'T00:00:00').getDay() === 6) colIndex++;
  }
  return labels;
});

const levelColors = ['#edf2f7', '#b8edc3', '#6fdc87', '#2fb45e', '#176b38'];
const statusLabels: Record<string, string> = {
  ACCEPTED: 'AC',
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  RUNTIME_ERROR: 'RE',
  COMPILE_ERROR: 'CE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  PENDING: '等待',
  QUEUING: '排队',
  COMPILING: '编译中',
  RUNNING: '运行中',
  REMOTE_ERROR: 'RMR',
  REMOTE_REEOR: 'RMR',
  SYSTEM_ERROR: '系统错误',
};
const statusColors: Record<string, string> = {
  ACCEPTED: '#20a66a',
  WRONG_ANSWER: '#e8594f',
  TIME_LIMIT_EXCEEDED: '#f0a12a',
  RUNTIME_ERROR: '#8e5bd6',
  COMPILE_ERROR: '#e67e22',
  MEMORY_LIMIT_EXCEEDED: '#f0a12a',
  PENDING: '#8996a6',
  QUEUING: '#2f7cf2',
  COMPILING: '#2f7cf2',
  RUNNING: '#2f7cf2',
  REMOTE_ERROR: '#e8594f',
  REMOTE_REEOR: '#e8594f',
  SYSTEM_ERROR: '#e8594f',
};
const awardStatusLabels: Record<string, string> = { PENDING: '待认定', APPROVED: '已认定', REJECTED: '未通过' };
const weekDays = ['一', '', '三', '', '五', '', '日'];

function tooltip(day: HeatDay | null) {
  return day && day.count > 0 ? `${day.date}：${day.count} 次提交，AC × ${day.accepted}` : '无提交';
}

function hasMetric(value: unknown) {
  return value !== null && value !== undefined;
}

/** In-progress judge statuses should not display a provisional 0 score. */
const JUDGING_STATUSES = new Set([
  'PENDING', 'QUEUING', 'COMPILING', 'RUNNING', 'JUDGING', 'SUBMITTING',
]);

function isJudgingStatus(status?: string | null) {
  return Boolean(status && JUDGING_STATUSES.has(status));
}

function shouldShowScore(status?: string | null, score?: unknown) {
  if (isJudgingStatus(status)) return false;
  return score !== undefined && score !== null;
}

function formatMemoryKb(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n / 1024).toFixed(1)}MB` : '-';
}

function roleLabel(role?: string) {
  if (role === 'ADMIN') return '管理员';
  if (role === 'TEACHER') return '教师';
  return '学生';
}

void [
  Activity,
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Code2,
  Flame,
  History,
  KeyRound,
  Link2,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  pointDifficultyShortLabel,
  avatarText,
  maxDifficultyCount,
  solvedRate,
  loadSettings,
  saveProfile,
  saveAccounts,
  syncCodeforcesAccepted,
  changePassword,
  saveAward,
  editAward,
  deleteAward,
  loadAllSubmissions,
  viewDetail,
  heatmapWeeks,
  monthLabels,
  levelColors,
  statusLabels,
  statusColors,
  awardStatusLabels,
  weekDays,
  tooltip,
  hasMetric,
  formatMemoryKb,
  roleLabel,
];
</script>

<template>
  <main class="profile-page">
    <div v-if="loading" class="page-state">正在加载个人中心…</div>
    <div v-else-if="error" class="page-state error">{{ error }}</div>

    <template v-else-if="profile && stats">
      <section class="profile-hero">
        <div class="hero-copy">
          <p class="eyebrow"><Sparkles :size="16" /> SINGULARITY PROFILE</p>
          <h1>{{ displayName }}</h1>
          <p class="username">@{{ profile.username }}</p>
          <div class="identity-row">
            <span class="role-badge" :class="profile.role?.toLowerCase()"><ShieldCheck :size="14" />{{ roleLabel(profile.role) }}</span>
            <span v-if="isStudentAccount" class="student-id-pill" :class="{ missing: !profile.studentId && !profileForm.studentId }"><UserRound :size="14" />学号：{{ studentIdDisplay }}</span>
            <span v-if="profile.email"><Mail :size="14" />{{ profile.email }}</span>
            <span v-if="profile.phone"><Phone :size="14" />{{ profile.phone }}</span>
            <span v-if="profile.createdAt"><CalendarDays :size="14" />加入于 {{ new Date(profile.createdAt).toLocaleDateString('zh-CN') }}</span>
          </div>
        </div>
        <div class="hero-avatar">
          <UserAvatar :name="displayName" :avatar="profile.avatar" :size="92" label="个人头像" />
        </div>
      </section>

      <section class="metric-grid" aria-label="学习概览">
        <article class="metric-card primary"><span><Target :size="20" /></span><strong>{{ overview.solvedCount || 0 }}</strong><small>已解决</small></article>
        <article class="metric-card"><span><Code2 :size="20" /></span><strong>{{ overview.totalSubmissions || 0 }}</strong><small>总提交</small></article>
        <article class="metric-card"><span><CheckCircle2 :size="20" /></span><strong>{{ overview.acceptRate || 0 }}%</strong><small>提交通过率</small></article>
        <article class="metric-card"><span><Activity :size="20" /></span><strong>{{ solvedRate }}%</strong><small>尝试转化率</small></article>
        <article class="metric-card"><span><Flame :size="20" /></span><strong>{{ overview.currentStreak || 0 }} 天</strong><small>连续活跃</small></article>
      </section>

      <nav class="tab-nav">
        <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'"><BarChart3 :size="16" />总览</button>
        <button :class="{ active: activeTab === 'accepted' }" @click="loadAcceptedProblems"><CheckCircle2 :size="16" />已通过题目</button>
        <button :class="{ active: activeTab === 'submissions' }" @click="loadAllSubmissions"><History :size="16" />提交记录</button>
        <button :class="{ active: activeTab === 'settings' }" @click="loadSettings"><Settings :size="16" />设置</button>
      </nav>

      <section v-if="activeTab === 'overview'" class="overview-layout">
        <article class="profile-panel heatmap-panel">
          <div class="panel-title"><h2>全年提交热力图</h2><span>{{ overview.activeDays || 0 }} 天活跃</span></div>
          <div class="heatmap-track" :style="{ '--heatmap-week-count': heatmapWeeks.length }">
            <div class="month-row"><span v-for="month in monthLabels" :key="month.index" :style="{ gridColumnStart: month.index + 1 }">{{ month.label }}</span></div>
            <div class="heatmap-body">
              <div class="weekday-col"><span v-for="day in weekDays" :key="day">{{ day }}</span></div>
              <div class="heatmap-grid">
                <div v-for="(week, wi) in heatmapWeeks" :key="wi" class="heat-week">
                  <i v-for="(day, di) in week" :key="`${wi}-${di}`" :title="tooltip(day)" :style="day ? { background: levelColors[day.level] || levelColors[0] } : {}"></i>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="profile-panel difficulty-panel">
          <div class="panel-title"><h2>难度分布</h2><span>{{ stats.difficultyDist?.length || 0 }} 档</span></div>
          <div v-if="stats.difficultyDist?.length" class="difficulty-bars">
            <div v-for="item in stats.difficultyDist" :key="item.difficulty" class="difficulty-row">
              <span>{{ pointDifficultyShortLabel(item.difficulty) }}</span>
              <div><i :style="{ width: `${Math.max(8, Math.round(item.count / maxDifficultyCount * 100))}%` }"></i></div>
              <b>{{ item.count }}</b>
            </div>
          </div>
          <div v-else class="empty-mini">解决题目后展示难度分布。</div>
        </article>

        <article class="profile-panel recent-panel">
          <div class="panel-title"><h2>最近提交</h2></div>
          <div v-if="stats.recentSubmissions?.length" class="submission-list">
            <button v-for="sub in stats.recentSubmissions" :key="sub.id" class="submission-row" @click="viewDetail(sub)">
              <span class="status-dot" :style="{ background: statusColors[sub.status] || '#8996a6' }">{{ statusLabels[sub.status] || sub.status }}</span>
              <span class="sub-title">{{ sub.problem?.title || '-' }}</span>
              <span class="sub-meta">{{ sub.language }}</span>
            </button>
          </div>
          <div v-else class="empty-mini">还没有提交记录。</div>
        </article>
      </section>

      <section v-else-if="activeTab === 'accepted'" class="profile-panel">
        <div class="panel-title"><h2>已通过题目</h2><span>{{ acceptedProblems.length }} 题</span></div>
        <div v-if="acceptedLoading" class="empty-state">正在加载已通过题目…</div>
        <div v-else-if="acceptedProblems.length" class="accepted-list">
          <router-link v-for="item in acceptedProblems" :key="item.problemId" class="accepted-row" :to="`/problems/${item.problemId}`">
            <span class="accepted-source">{{ item.source || item.problem?.source || 'LOCAL' }}</span>
            <span class="accepted-title">{{ item.problem?.title || item.problemId }}</span>
            <span class="accepted-difficulty">{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span>
            <span class="accepted-remote">{{ item.remoteProblemId || item.problem?.sourceInfo?.remoteProblemId || '本地题' }}</span>
          </router-link>
        </div>
        <div v-else class="empty-state">暂无已通过题目。</div>
      </section>

      <section v-else-if="activeTab === 'submissions'" class="profile-panel">
        <div class="panel-title"><h2>提交记录</h2><span>{{ allSubmissions.length }} 条</span></div>
        <div v-if="subsLoading" class="empty-state">正在加载提交记录…</div>
        <div v-else-if="allSubmissions.length" class="submission-list">
          <button v-for="sub in allSubmissions" :key="sub.id" class="submission-row" @click="viewDetail(sub)">
            <span class="status-dot" :style="{ background: statusColors[sub.status] || '#8996a6' }">{{ statusLabels[sub.status] || sub.status }}</span>
            <span class="sub-title">{{ sub.problem?.title || '-' }}</span>
            <span class="sub-meta">{{ sub.language }}</span>
            <span class="sub-time" v-if="hasMetric(sub.timeUsed) || hasMetric(sub.memoryUsed)">{{ hasMetric(sub.timeUsed) ? `${sub.timeUsed}ms` : '-' }} / {{ hasMetric(sub.memoryUsed) ? formatMemoryKb(sub.memoryUsed) : '-' }}</span>
            <span class="sub-time" v-else-if="shouldShowScore(sub.status, sub.score)">{{ sub.score }} 分</span>
          </button>
        </div>
        <div v-else class="empty-state">暂无提交记录。</div>
      </section>

      <section v-else class="settings-grid">
        <article class="profile-panel avatar-settings-card">
          <div class="panel-title"><h2>头像设置</h2><UserRound :size="18" /></div>
          <div class="avatar-settings-body">
            <UserAvatar :name="displayName" :avatar="profile.avatar" :size="88" label="当前头像" />
            <div>
              <p class="hint">支持 JPG、PNG、WebP，最大 2MB。上传后顶部菜单栏和个人中心会同步更新。</p>
              <input ref="avatarInput" class="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadAvatar" />
              <div class="inline-actions">
                <button class="primary-btn" :disabled="avatarUploading" @click="avatarInput?.click()">
                  <UserRound :size="16" />{{ avatarUploading ? '上传中...' : '上传头像' }}
                </button>
              </div>
              <p v-if="avatarError" class="error-msg compact">{{ avatarError }}</p>
            </div>
          </div>
        </article>

        <article class="profile-panel">
          <div class="panel-title"><h2>基础资料</h2><UserRound :size="18" /></div>
          <label>昵称<input v-model="profileForm.nickname" placeholder="设置展示昵称" /></label>
          <label v-if="isStudentAccount">学号<input v-model="profileForm.studentId" inputmode="numeric" maxlength="8" placeholder="绑定 8 位数字学号" /></label>
          <label>邮箱<input v-model="profileForm.email" type="email" placeholder="绑定邮箱" /></label>
          <label>电话<input v-model="profileForm.phone" placeholder="绑定电话号码" /></label>
          <button class="primary-btn" @click="saveProfile"><Save :size="16" />保存基础资料</button>
        </article>

        <article class="profile-panel">
          <div class="panel-title"><h2>外站账号</h2><Link2 :size="18" /></div>
          <p class="hint">这里保存远程 OJ 身份，后续跳转提交与结果回传会优先使用这些绑定信息。</p>
          <label>Codeforces<input v-model="accountForm.codeforcesHandle" placeholder="CF handle" /></label>
          <label>洛谷<input v-model="accountForm.luoguHandle" placeholder="洛谷用户名" /></label>
          <div class="inline-actions"><button class="primary-btn" @click="saveAccounts"><Save :size="16" />保存绑定</button><button class="secondary-btn" :disabled="cfSyncing" @click="syncCodeforcesAccepted"><RefreshCw :size="16" :class="{ spinning: cfSyncing }" />{{ cfSyncing ? '同步中…' : '同步 CF 通过记录' }}</button></div>
        </article>

        <article class="profile-panel">
          <div class="panel-title"><h2>修改密码</h2><KeyRound :size="18" /></div>
          <p class="hint">修改成功后会自动退出当前登录，请使用新密码重新登录。</p>
          <label>当前密码<input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" placeholder="请输入当前登录密码" /></label>
          <label>新密码<input v-model="passwordForm.password" type="password" autocomplete="new-password" placeholder="至少 8 位，包含字母和数字" /></label>
          <label>确认新密码<input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" /></label>
          <button class="primary-btn" :disabled="passwordSaving" @click="changePassword"><KeyRound :size="16" />{{ passwordSaving ? '修改中…' : '修改密码' }}</button>
        </article>

        <article class="profile-panel award-panel">
          <div class="panel-title"><h2>ICPC / CCPC 奖项认定</h2><Award :size="18" /></div>
          <div class="award-form">
            <label>赛事<select v-model="awardForm.competition"><option value="ICPC">ICPC</option><option value="CCPC">CCPC</option></select></label>
            <label>年份<input v-model.number="awardForm.year" type="number" min="1970" /></label>
            <label>赛季/届次<input v-model="awardForm.season" placeholder="如 2025-2026" /></label>
            <label>赛区<input v-model="awardForm.region" placeholder="如 成都、沈阳、女生赛" /></label>
            <label>奖项<input v-model="awardForm.awardLevel" placeholder="如 金奖 / 银奖 / 铜奖" /></label>
            <label>队名<input v-model="awardForm.teamName" placeholder="可选" /></label>
            <label>排名<input v-model.number="awardForm.rank" type="number" min="1" placeholder="可选" /></label>
            <label class="full">证书链接<input v-model="awardForm.certificateUrl" placeholder="可选" /></label>
          </div>
          <button class="primary-btn" @click="saveAward"><Save :size="16" />{{ awardForm.id ? '更新认定' : '提交认定' }}</button>
          <div class="award-list">
            <div v-for="award in awards" :key="award.id" class="award-row">
              <div><strong>{{ award.competition }} {{ award.year || '' }} {{ award.awardLevel }}</strong><p>{{ award.region || '未填赛区' }} · {{ award.teamName || '未填队名' }}<span v-if="award.rank"> · 第 {{ award.rank }} 名</span></p></div>
              <span class="award-status" :class="award.status?.toLowerCase()">{{ awardStatusLabels[award.status] || award.status }}</span>
              <button class="icon-btn" @click="editAward(award)">编辑</button>
              <button class="icon-btn danger" @click="deleteAward(award.id)"><Trash2 :size="15" /></button>
            </div>
            <div v-if="!awards.length" class="empty-mini">还没有提交 ICPC/CCPC 奖项认定。</div>
          </div>
        </article>

        <div v-if="settingsLoading" class="empty-state">正在加载账号设置…</div>
        <div v-if="settingsError" class="page-state error">{{ settingsError }}</div>
      </section>

      <div v-if="selectedSubmission" class="modal-overlay" @click.self="selectedSubmission = null">
        <div class="modal-card">
          <div class="modal-header"><h2>提交详情</h2><button @click="selectedSubmission = null">×</button></div>
          <div class="modal-body">
            <div class="detail-meta">
              <span v-if="selectedSubmission.problem"><b>题目：</b>{{ selectedSubmission.problem.title }}</span>
              <span><b>状态：</b>{{ statusLabels[selectedSubmission.status] || selectedSubmission.status }}</span>
              <span v-if="shouldShowScore(selectedSubmission.status, selectedSubmission.score)"><b>得分：</b>{{ selectedSubmission.score }}</span>
              <span v-if="hasMetric(selectedSubmission.timeUsed)"><b>用时：</b>{{ selectedSubmission.timeUsed }}ms</span>
              <span v-if="hasMetric(selectedSubmission.memoryUsed)"><b>内存：</b>{{ formatMemoryKb(selectedSubmission.memoryUsed) }}</span>
              <span><b>语言：</b>{{ selectedSubmission.language }}</span>
            </div>
            <div v-if="selectedSubmission.compileOutput" class="compile-box"><b>编译输出</b><pre>{{ selectedSubmission.compileOutput }}</pre></div>
            <h3>源代码</h3>
            <pre class="code-block">{{ selectedSubmission.sourceCode }}</pre>
            <div v-if="selectedSubmission.cases?.length">
              <h3>测试点</h3>
              <table class="cases-table"><thead><tr><th>#</th><th>状态</th><th>用时</th><th>内存</th></tr></thead><tbody><tr v-for="item in selectedSubmission.cases" :key="item.id"><td>{{ item.index }}</td><td>{{ statusLabels[item.status] || item.status }}</td><td>{{ hasMetric(item.timeUsed) ? `${item.timeUsed}ms` : '-' }}</td><td>{{ hasMetric(item.memoryUsed) ? formatMemoryKb(item.memoryUsed) : '-' }}</td></tr></tbody></table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.profile-page {
  --ink: #17233a;
  --muted: #728097;
  --line: #dfe8f5;
  --blue: #2f7cf2;
  --soft: #f5f8ff;
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: 28px 0 70px;
  color: var(--ink);
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}

.page-state {
  display: grid;
  min-height: 360px;
  place-items: center;
  color: var(--muted);
}

.page-state.error,
.error-msg {
  color: #d93025;
}

.error-msg.compact {
  padding: 12px 14px;
  border-radius: 12px;
  margin-bottom: 14px;
}

.error-msg.compact { background: #fff1f0; }

.profile-hero {
  position: relative;
  display: grid;
  min-height: 230px;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: center;
  overflow: hidden;
  padding: 34px 40px;
  border: 1px solid #d7e7ff;
  border-radius: 28px;
  background:
    radial-gradient(circle at 86% 20%, rgba(255, 255, 255, .76) 0 2px, transparent 3px) 0 0 / 22px 22px,
    radial-gradient(ellipse at 78% 12%, rgba(151, 196, 255, .42), transparent 40%),
    linear-gradient(124deg, #f9fcff 0%, #edf5ff 50%, #d8e9ff 100%);
  box-shadow: 0 18px 38px rgba(47, 99, 180, .12);
}

.profile-hero::before,
.profile-hero::after {
  position: absolute;
  border-radius: 50%;
  content: '';
}

.profile-hero::before {
  right: -115px;
  bottom: -155px;
  width: 390px;
  height: 300px;
  border: 1px solid rgba(255,255,255,.72);
}

.profile-hero::after {
  top: -130px;
  left: -120px;
  width: 300px;
  height: 240px;
  background: rgba(255,255,255,.46);
}

.hero-copy,
.hero-avatar {
  position: relative;
  z-index: 1;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 10px;
  color: #2f70df;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .12em;
}

.profile-hero h1 {
  margin: 0;
  font-size: clamp(34px, 4.6vw, 54px);
  font-weight: 860;
  letter-spacing: -.06em;
}

.username {
  margin: 7px 0 16px;
  color: #61728f;
  font-size: 15px;
}

.identity-row {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.identity-row span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(190, 210, 242, .8);
  border-radius: 999px;
  background: rgba(255,255,255,.68);
  color: #60728e;
  font-size: 12px;
  font-weight: 720;
  backdrop-filter: blur(8px);
}

.role-badge.admin { color: #b5222b; background: #fff0f0; }
.role-badge.teacher { color: #1d63b7; background: #eef6ff; }
.role-badge.student { color: #16834f; background: #eefaf2; }
.student-id-pill { color: #7c3aed; background: #f5f0ff; border-color: rgba(124, 58, 237, .2); }
.student-id-pill.missing { color: #b45309; background: #fff7ed; border-color: rgba(245, 158, 11, .28); }

.hero-avatar {
  display: grid;
  width: 132px;
  height: 132px;
  place-items: center;
  border: 1px solid rgba(255,255,255,.85);
  border-radius: 36px;
  background: linear-gradient(145deg, #ffffff, #8fc5ff);
  box-shadow: 0 22px 34px rgba(54, 111, 203, .18);
}

.hero-avatar span {
  display: grid;
  width: 88px;
  height: 88px;
  place-items: center;
  border-radius: 28px;
  background: linear-gradient(135deg, #2f7cf2, #173b66);
  color: #fff;
  font-size: 40px;
  font-weight: 900;
}

.hero-avatar :deep(.user-avatar) {
  border: 4px solid rgba(255,255,255,.86);
  box-shadow: inset 0 0 0 1px rgba(47,124,242,.14);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0;
}

.metric-card {
  display: grid;
  gap: 8px;
  min-height: 132px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 9px 22px rgba(38, 56, 89, .06);
}

.metric-card.primary {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #2f7cf2, #235fd3);
  box-shadow: 0 14px 28px rgba(47, 124, 242, .22);
}

.metric-card span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: #eef5ff;
  color: #2f70df;
}

.metric-card.primary span {
  background: rgba(255,255,255,.18);
  color: #fff;
}

.metric-card strong {
  font-size: 27px;
  line-height: 1;
}

.metric-card small {
  color: var(--muted);
  font-weight: 720;
}

.metric-card.primary small {
  color: rgba(255,255,255,.78);
}

.profile-panel,
.inner-card,
.settings-card {
  border: 1px solid var(--line);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(23, 49, 80, .065);
}

.profile-panel {
  padding: 18px;
}

.tab-nav,
.panel-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
  padding: 6px;
  border-radius: 16px;
  background: #f4f7fb;
}

.tab-nav button,
.panel-tabs button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 7px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #69778e;
  cursor: pointer;
  font: inherit;
  font-weight: 780;
}

.tab-nav button.active,
.panel-tabs button.active {
  background: #fff;
  color: #1f63c6;
  box-shadow: 0 5px 14px rgba(30, 72, 130, .1);
}

.overview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 330px);
  align-items: start;
  gap: 16px;
}

.inner-card,
.settings-card {
  padding: 20px;
}

.panel-title,
.card-title,
.settings-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}

.panel-title p,
.card-title p {
  margin: 0 0 4px;
  color: #2f70df;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .12em;
}

.panel-title h2,
.card-title h2,
.settings-card h2,
.modal-header h2 {
  margin: 0;
  font-size: 18px;
}

.panel-title > span,
.panel-title > svg,
.card-title > span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #eef5ff;
  color: #2f70df;
  font-size: 12px;
  font-weight: 800;
}

.heatmap-panel {
  overflow: hidden;
}

.heatmap-wrapper {
  width: 100%;
  padding-bottom: 4px;
}

.heatmap-track {
  --heatmap-week-count: 53;
  --heatmap-weekday-width: 22px;
  --heatmap-cell-size: 100%;
  --heatmap-cell-gap: clamp(1px, .22vw, 3px);
  display: grid;
  width: 100%;
  grid-template-columns: var(--heatmap-weekday-width) repeat(var(--heatmap-week-count), minmax(0, 1fr));
  row-gap: 4px;
}

.month-row {
  display: grid;
  grid-column: 2 / -1;
  grid-template-columns: repeat(var(--heatmap-week-count), minmax(0, 1fr));
  margin-bottom: 4px;
}

.month-row span {
  color: #8592a5;
  font-size: 10px;
  white-space: nowrap;
}

.heatmap-body {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: var(--heatmap-weekday-width) repeat(var(--heatmap-week-count), minmax(0, 1fr));
  align-items: start;
}

.weekday-gutter {
  width: 22px;
  flex-shrink: 0;
}

.month-cells {
  display: grid;
  grid-template-columns: repeat(var(--heatmap-week-count), minmax(0, 1fr));
}

.month-label {
  color: #8592a5;
  font-size: 10px;
}

.heatmap-grid {
  display: grid;
  grid-column: 2 / -1;
  grid-template-columns: repeat(var(--heatmap-week-count), minmax(0, 1fr));
  column-gap: var(--heatmap-cell-gap);
}

.weekday-col {
  display: grid;
  grid-template-rows: repeat(7, minmax(0, 1fr));
  gap: var(--heatmap-cell-gap);
  width: var(--heatmap-weekday-width);
  padding-right: 5px;
}

.weekday-col span {
  color: #9aa6b6;
  font-size: 9px;
  line-height: 1;
  text-align: right;
}

.cells-grid {
  display: flex;
  gap: 3px;
}

.heat-week,
.heatmap-week {
  display: grid;
  grid-template-rows: repeat(7, minmax(0, 1fr));
  gap: var(--heatmap-cell-gap);
  min-width: 0;
}

.heat-week i,
.heatmap-cell {
  display: block;
  width: var(--heatmap-cell-size);
  max-width: 12px;
  aspect-ratio: 1;
  border-radius: 3px;
  transition: transform .12s;
}

.heat-week i:hover,
.heatmap-cell:hover {
  position: relative;
  z-index: 2;
  transform: scale(1.55);
  outline: 1px solid #475569;
}

.heatmap-cell.empty {
  background: transparent !important;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  color: #8592a5;
  font-size: 10px;
}

.heatmap-legend i {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.difficulty-card {
  align-self: start;
  overflow: hidden;
  padding-bottom: 22px;
  background: linear-gradient(180deg, #fff, #f8fbff);
}

.difficulty-bars,
.dist-bars {
  display: grid;
  gap: 14px;
}

.difficulty-row,
.dist-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 10px;
}

.difficulty-row span,
.dist-row span {
  overflow: hidden;
  color: #607087;
  font-size: 12px;
  font-weight: 760;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.difficulty-row div,
.dist-row div {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf2f7;
}

.difficulty-row i,
.dist-row i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6bd6ff, #2f7cf2);
}

.difficulty-row b,
.dist-row b {
  color: #17233a;
  font-size: 13px;
  text-align: right;
}

.recent-card {
  margin-top: 16px;
}

.accepted-card {
  overflow: hidden;
}

.accepted-list {
  display: grid;
  max-height: 680px;
  overflow-y: auto;
}

.accepted-row {
  display: grid;
  grid-template-columns: 106px minmax(0, 1fr) 96px 120px;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 11px 0;
  border: 0;
  border-bottom: 1px solid #eef2f6;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.accepted-row:hover {
  background: #fafcff;
}

.accepted-source {
  display: inline-flex;
  width: 94px;
  min-width: 94px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef5ff;
  color: #2f70df;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accepted-source.local {
  background: #eefaf2;
  color: #16834f;
}

.accepted-source.codeforces {
  background: #eef5ff;
  color: #2f70df;
}

.accepted-title {
  overflow: hidden;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accepted-difficulty,
.accepted-remote,
.accepted-time {
  overflow: hidden;
  color: #8a97aa;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accepted-difficulty {
  color: #607087;
  font-weight: 760;
}

.submission-list {
  display: grid;
  max-height: 620px;
  overflow-y: auto;
}

.submission-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 84px 120px;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #eef2f6;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.submission-row:hover {
  background: #fafcff;
}

.status-dot,
.sub-status {
  display: inline-flex;
  width: 58px;
  min-width: 58px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: 7px;
  color: #fff;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.sub-title {
  overflow: hidden;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-lang {
  justify-self: start;
  padding: 3px 7px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #68768a;
  font-size: 12px;
  text-transform: uppercase;
}

.sub-meta,
.sub-time {
  color: #8a97aa;
  font-size: 12px;
}

.sub-time {
  white-space: nowrap;
}

.empty-state,
.empty-mini {
  display: grid;
  place-items: center;
  color: #9aa6b6;
}

.empty-state {
  min-height: 170px;
}

.empty-mini {
  min-height: 76px;
  font-size: 13px;
}

.settings-view {
  display: grid;
  gap: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.avatar-settings-card {
  grid-column: span 1;
  background: linear-gradient(180deg, #fff, #f8fbff);
}

.avatar-settings-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}

.avatar-settings-body :deep(.user-avatar) {
  border: 3px solid #dceaff;
  box-shadow: 0 12px 24px rgba(47, 100, 180, .12);
}

.avatar-input {
  display: none;
}

.settings-card h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.profile-panel label,
.settings-card label {
  display: grid;
  gap: 7px;
  margin-bottom: 13px;
  color: #4b5b72;
  font-size: 13px;
  font-weight: 760;
}

.profile-panel input,
.profile-panel select,
.settings-card input,
.settings-card select {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  border: 1px solid #d9e2ee;
  border-radius: 11px;
  padding: 0 12px;
  background: #fff;
  color: #17233a;
  font: inherit;
}

.profile-panel input:focus,
.profile-panel select:focus,
.settings-card input:focus,
.settings-card select:focus {
  outline: none;
  border-color: #6ca7ff;
  box-shadow: 0 0 0 4px rgba(47,124,242,.12);
}

.hint {
  color: #8290a3;
  font-size: 12px;
  line-height: 1.7;
}

.cf-sync-box {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef2f6;
}

.spinning {
  animation: spin .9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  align-items: center;
}

.primary-btn,
.secondary-btn,
.ghost-btn,
.danger-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 11px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 820;
}

.primary-btn {
  padding: 0 15px;
  background: linear-gradient(135deg, #2f7cf2, #235fd3);
  color: #fff;
  box-shadow: 0 9px 17px rgba(47,124,242,.18);
}

.primary-btn:disabled {
  opacity: .62;
  cursor: not-allowed;
}

.secondary-btn,
.ghost-btn {
  padding: 0 13px;
  background: #eef3f8;
  color: #425169;
}

.danger-btn {
  padding: 0 13px;
  background: #fff1f0;
  color: #d93025;
}

.awards-card {
  background: linear-gradient(180deg, #fff, #fbfdff);
}

.award-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
}

.award-form label.full {
  grid-column: 1 / -1;
}

.award-list {
  display: grid;
  margin-top: 18px;
  border-top: 1px solid #eef2f6;
}

.award-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 13px 0;
  border-bottom: 1px solid #eef2f6;
}

.award-row p {
  margin: 4px 0 0;
  color: #8290a3;
  font-size: 12px;
}

.icon-btn {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: #eef3f8;
  color: #425169;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}

.icon-btn.danger {
  background: #fff1f0;
  color: #d93025;
}

.award-status {
  padding: 5px 10px;
  border-radius: 999px;
  background: #fff7e6;
  color: #ad6800;
  font-size: 12px;
  font-weight: 850;
}

.award-status.approved {
  background: #eefaf2;
  color: #16834f;
}

.award-status.rejected {
  background: #fff1f0;
  color: #d93025;
}

.modal-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, .44);
  backdrop-filter: blur(4px);
}

.modal-card {
  width: min(860px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
}

.modal-header {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f6;
  background: #fff;
}

.modal-header button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: #f1f5f9;
  cursor: pointer;
  font-size: 22px;
}

.modal-body {
  padding: 20px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 11px;
  color: #64748b;
  font-size: 13px;
}

.detail-meta i {
  font-style: normal;
  font-weight: 850;
}

.compile-box {
  margin-top: 16px;
  padding: 14px;
  border-radius: 12px;
  background: #fff7e6;
}

.compile-box pre {
  white-space: pre-wrap;
}

.code-block {
  max-height: 420px;
  overflow: auto;
  padding: 16px;
  border-radius: 14px;
  background: #111827;
  color: #dbeafe;
  font-size: 13px;
  line-height: 1.6;
}

.cases-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cases-table th,
.cases-table td {
  padding: 9px 10px;
  border-bottom: 1px solid #eef2f6;
  text-align: left;
}

.cases-table th {
  background: #f8fafc;
}

@media (max-width: 980px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .overview-layout,
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .award-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .profile-page {
    width: min(100% - 28px, 560px);
    padding-top: 20px;
  }

  .profile-hero {
    grid-template-columns: 1fr;
    padding: 28px;
  }

  .hero-avatar {
    width: 96px;
    height: 96px;
    border-radius: 28px;
  }

  .hero-avatar span {
    width: 66px;
    height: 66px;
    border-radius: 21px;
    font-size: 30px;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .profile-panel {
    padding: 12px;
  }

  .submission-row {
    grid-template-columns: 72px minmax(0, 1fr) 70px;
  }

  .accepted-row {
    grid-template-columns: 92px minmax(0, 1fr) 78px;
  }

  .sub-meta,
  .sub-time,
  .accepted-remote,
  .accepted-time {
    display: none;
  }

  .award-form,
  .award-row {
    grid-template-columns: 1fr;
  }

  .avatar-settings-body {
    grid-template-columns: 1fr;
    justify-items: start;
  }
}
</style>
