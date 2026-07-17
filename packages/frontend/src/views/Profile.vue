<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../api/client';

interface HeatDay { date: string; count: number; accepted: number; level: number }
interface Stats {
  overview: any;
  heatmap: HeatDay[];
  languageDist: Array<{ language: string; count: number }>;
  difficultyDist: Array<{ difficulty: string; count: number }>;
  recentSubmissions: any[];
}
interface Award {
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

const stats = ref<Stats | null>(null);
const profile = ref<any>(null);
const loading = ref(true);
const error = ref('');
const activeTab = ref<'overview' | 'submissions' | 'settings'>('overview');

const allSubmissions = ref<any[]>([]);
const subsLoading = ref(false);
const selectedSubmission = ref<any>(null);

const settingsLoading = ref(false);
const settingsMessage = ref('');
const settingsError = ref('');
const profileForm = reactive({ nickname: '', email: '', phone: '' });
const accountForm = reactive({ codeforcesHandle: '', luoguHandle: '' });
const awards = ref<Award[]>([]);
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

onMounted(async () => {
  try {
    const [pRes, sRes, settingRes] = await Promise.all([
      api.get('/api/user/profile'),
      api.get('/api/user/stats'),
      api.get('/api/user/settings'),
    ]);
    profile.value = settingRes.data.profile || pRes.data;
    stats.value = sRes.data;
    fillSettings(settingRes.data);
  } catch (e: any) {
    error.value = e.response?.data?.message || '请先登录';
  } finally {
    loading.value = false;
  }
});

function fillSettings(data: any) {
  const p = data.profile || profile.value || {};
  profileForm.nickname = p.nickname || '';
  profileForm.email = p.email || '';
  profileForm.phone = p.phone || '';
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
  settingsMessage.value = '';
  settingsError.value = '';
  try {
    const { data } = await api.patch('/api/user/profile', profileForm);
    profile.value = { ...profile.value, ...data };
    settingsMessage.value = '基础资料已保存';
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '保存基础资料失败';
  }
}

async function saveAccounts() {
  settingsMessage.value = '';
  settingsError.value = '';
  try {
    const { data } = await api.put('/api/user/external-accounts', accountForm);
    accountForm.codeforcesHandle = data.codeforcesHandle || '';
    accountForm.luoguHandle = data.luoguHandle || '';
    settingsMessage.value = 'OJ 账号绑定已保存';
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '保存 OJ 账号失败';
  }
}

async function saveAward() {
  settingsMessage.value = '';
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
      settingsMessage.value = '奖项认定已更新，状态已回到待认定';
    } else {
      await api.post('/api/user/awards', payload);
      settingsMessage.value = '奖项认定已提交';
    }
    resetAwardForm();
    const { data } = await api.get('/api/user/awards');
    awards.value = data;
  } catch (e: any) {
    settingsError.value = e.response?.data?.message || '保存奖项认定失败';
  }
}

function editAward(award: Award) {
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
  settingsMessage.value = '';
  settingsError.value = '';
  try {
    await api.delete(`/api/user/awards/${id}`);
    awards.value = awards.value.filter((item) => item.id !== id);
    settingsMessage.value = '奖项认定已删除';
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

async function viewDetail(sub: any) {
  const { data } = await api.get(`/api/submissions/${sub.id}`);
  selectedSubmission.value = data;
}

const heatmapWeeks = computed(() => {
  if (!stats.value?.heatmap?.length) return [];
  const weeks: HeatDay[][] = [];
  let week: HeatDay[] = [];
  const firstDay = new Date(stats.value.heatmap[0].date + 'T00:00:00');
  for (let i = 0; i < firstDay.getDay(); i++) week.push(null as any);
  for (const day of stats.value.heatmap) {
    week.push(day);
    if (new Date(day.date + 'T00:00:00').getDay() === 6) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null as any);
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

const levelColors = ['#1a1a2e08', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const diffLabels: Record<string, string> = { BEGINNER: '入门', POPULAR: '普及', 'POPULAR-': '普及-', IMPROVE: '提高', 'IMPROVE-': '提高-', PROVINCIAL: '省选', NOI: 'NOI' };
const statusLabels: Record<string, string> = { ACCEPTED: 'AC', WRONG_ANSWER: 'WA', TIME_LIMIT_EXCEEDED: 'TLE', RUNTIME_ERROR: 'RE', COMPILE_ERROR: 'CE', MEMORY_LIMIT_EXCEEDED: 'MLE', PENDING: '等待', QUEUING: '排队', COMPILING: '编译中', RUNNING: '运行中', SYSTEM_ERROR: '系统错误' };
const statusColors: Record<string, string> = { ACCEPTED: '#27ae60', WRONG_ANSWER: '#e74c3c', TIME_LIMIT_EXCEEDED: '#f39c12', RUNTIME_ERROR: '#9b59b6', COMPILE_ERROR: '#e67e22', MEMORY_LIMIT_EXCEEDED: '#f39c12', PENDING: '#95a5a6', QUEUING: '#3498db', COMPILING: '#3498db', RUNNING: '#3498db', SYSTEM_ERROR: '#e74c3c' };
const awardStatusLabels: Record<string, string> = { PENDING: '待认定', APPROVED: '已认定', REJECTED: '未通过' };
const weekDays = ['一', '', '三', '', '五', '', '日'];

function tooltip(day: HeatDay) {
  return day && day.count > 0 ? `${day.date} | ${day.count} 次提交 | AC×${day.accepted}` : '无提交';
}
function hasMetric(value: unknown) {
  return value !== null && value !== undefined;
}
function formatMemoryKb(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n / 1024).toFixed(1)}MB` : '-';
}
</script>

<template>
  <div class="profile-page">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-if="profile && stats">
      <div class="profile-header">
        <div class="avatar">{{ (profile.nickname || profile.username).charAt(0).toUpperCase() }}</div>
        <div class="user-info">
          <h2>{{ profile.nickname || profile.username }}</h2>
          <p class="username">@{{ profile.username }}</p>
          <div class="identity-row">
            <span class="role-badge" :class="profile.role?.toLowerCase()">
              {{ profile.role === 'ADMIN' ? '管理员' : profile.role === 'TEACHER' ? '教师' : '学生' }}
            </span>
            <span v-if="profile.school" class="school-name">{{ profile.school }}</span>
            <span v-if="profile.email" class="school-name">{{ profile.email }}</span>
          </div>
          <p class="join-date">加入于 {{ new Date(profile.createdAt).toLocaleDateString('zh-CN') }}</p>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">{{ stats.overview.totalSubmissions }}</div><div class="stat-label">总提交</div></div>
        <div class="stat-card accent-green"><div class="stat-value">{{ stats.overview.acceptRate }}%</div><div class="stat-label">通过率</div></div>
        <div class="stat-card accent-blue"><div class="stat-value">{{ stats.overview.solvedCount }}</div><div class="stat-label">已解决</div></div>
        <div class="stat-card accent-orange"><div class="stat-value">{{ stats.overview.triedCount }}</div><div class="stat-label">尝试过</div></div>
        <div class="stat-card accent-purple"><div class="stat-value">{{ stats.overview.activeDays }}</div><div class="stat-label">活跃天数</div></div>
        <div class="stat-card accent-teal"><div class="stat-value">{{ stats.overview.currentStreak }}<span class="stat-unit">天</span></div><div class="stat-label">连续打卡</div></div>
      </div>

      <div class="panel submissions-panel">
        <div class="sub-header">
          <div class="tabs">
            <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">数据概览</button>
            <button :class="{ active: activeTab === 'submissions' }" @click="loadAllSubmissions">提交记录</button>
            <button :class="{ active: activeTab === 'settings' }" @click="loadSettings">设置</button>
          </div>
          <span v-if="activeTab === 'submissions'" class="sub-count">{{ allSubmissions.length }} 条</span>
        </div>

        <template v-if="activeTab === 'overview'">
          <div class="content-grid">
            <div class="panel inner-panel heatmap-panel">
              <h3>全年提交热力图</h3>
              <div class="heatmap-container">
                <div class="heatmap-wrapper">
                  <div class="month-row">
                    <div class="weekday-gutter"></div>
                    <div class="month-cells">
                      <span v-for="m in monthLabels" :key="m.index" class="month-label" :style="{ gridColumn: m.index + 1 }">{{ m.label }}</span>
                    </div>
                  </div>
                  <div class="heatmap-grid">
                    <div class="weekday-col">
                      <span v-for="(d, i) in weekDays" :key="i" class="weekday-label">{{ d }}</span>
                    </div>
                    <div class="cells-grid">
                      <div v-for="(week, wi) in heatmapWeeks" :key="wi" class="heatmap-week">
                        <div
                          v-for="(day, di) in week"
                          :key="di"
                          class="heatmap-cell"
                          :class="{ empty: !day }"
                          :style="day ? { background: levelColors[day.level] || levelColors[0] } : {}"
                          :title="tooltip(day)"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="heatmap-legend">
                  <span>Less</span>
                  <span v-for="(c, i) in levelColors" :key="i" class="legend-cell" :style="{ background: c }"></span>
                  <span>More</span>
                </div>
              </div>
            </div>

            <div class="difficulty-column">
              <div class="panel inner-panel difficulty-panel">
                <h3>难度分布</h3>
                <div class="dist-bars">
                  <div v-for="d in stats.difficultyDist" :key="d.difficulty" class="dist-row">
                    <span class="dist-label">{{ diffLabels[d.difficulty] || d.difficulty }}</span>
                    <div class="dist-bar-track">
                      <div class="dist-bar-fill diff-bar" :style="{ width: (d.count / Math.max(...stats.difficultyDist.map((x:any)=>x.count), 1) * 100) + '%' }"></div>
                    </div>
                    <span class="dist-count">{{ d.count }}</span>
                  </div>
                </div>
                <div v-if="stats.difficultyDist.length === 0" class="no-data-sm">解决题目后显示难度分布</div>
              </div>
            </div>
          </div>

          <h3 class="section-title">最近提交</h3>
          <div class="sub-list">
            <div v-for="sub in stats.recentSubmissions" :key="sub.id" class="sub-row clickable" @click="viewDetail(sub)">
              <span class="sub-status" :style="{ background: statusColors[sub.status] || '#999' }">{{ statusLabels[sub.status] || sub.status }}</span>
              <span class="sub-title">{{ sub.problem.title }}</span>
              <span class="sub-lang">{{ sub.language }}</span>
              <span class="sub-meta">
                <template v-if="hasMetric(sub.timeUsed)">{{ sub.timeUsed }}ms</template>
                <template v-if="hasMetric(sub.timeUsed) && hasMetric(sub.memoryUsed)"> · </template>
                <template v-if="hasMetric(sub.memoryUsed)">{{ formatMemoryKb(sub.memoryUsed) }}</template>
                <template v-if="!hasMetric(sub.timeUsed) && !hasMetric(sub.memoryUsed)">-</template>
              </span>
              <span class="sub-time">{{ new Date(sub.createdAt).toLocaleString('zh-CN') }}</span>
            </div>
            <div v-if="stats.recentSubmissions.length === 0" class="no-data">暂无提交记录</div>
          </div>
        </template>

        <div v-if="activeTab === 'submissions'" class="sub-list">
          <div v-if="subsLoading" class="no-data">加载中...</div>
          <div v-for="sub in allSubmissions" :key="sub.id" class="sub-row clickable" @click="viewDetail(sub)">
            <span class="sub-status" :style="{ background: statusColors[sub.status] || '#999' }">{{ statusLabels[sub.status] || sub.status }}</span>
            <span class="sub-title">{{ sub.problem?.title || '-' }}</span>
            <span class="sub-lang">{{ sub.language }}</span>
            <span class="sub-meta">
              <template v-if="hasMetric(sub.timeUsed)">{{ sub.timeUsed }}ms</template>
              <template v-if="hasMetric(sub.timeUsed) && hasMetric(sub.memoryUsed)"> · </template>
              <template v-if="hasMetric(sub.memoryUsed)">{{ formatMemoryKb(sub.memoryUsed) }}</template>
              <template v-if="!hasMetric(sub.timeUsed) && !hasMetric(sub.memoryUsed)">{{ sub.score }}分</template>
            </span>
            <span class="sub-time">{{ new Date(sub.createdAt).toLocaleString('zh-CN') }}</span>
          </div>
          <div v-if="!subsLoading && allSubmissions.length === 0" class="no-data">暂无提交记录</div>
        </div>

        <div v-if="activeTab === 'settings'" class="settings">
          <div v-if="settingsLoading" class="no-data">加载设置中...</div>
          <div v-if="settingsMessage" class="success-msg">{{ settingsMessage }}</div>
          <div v-if="settingsError" class="error-msg compact">{{ settingsError }}</div>

          <div class="settings-grid">
            <section class="settings-card">
              <h3>基础资料</h3>
              <label>昵称<input v-model="profileForm.nickname" placeholder="显示在个人中心和榜单上的名字" /></label>
              <label>邮箱<input v-model="profileForm.email" type="email" placeholder="用于绑定和通知" /></label>
              <label>电话号码<input v-model="profileForm.phone" placeholder="可选，用于身份联系" /></label>
              <button class="primary-btn" @click="saveProfile">保存基础资料</button>
            </section>

            <section class="settings-card">
              <h3>OJ 账号绑定</h3>
              <label>Codeforces 账号<input v-model="accountForm.codeforcesHandle" placeholder="例如 tourist" /></label>
              <label>洛谷账号<input v-model="accountForm.luoguHandle" placeholder="填写洛谷用户名或 UID" /></label>
              <p class="hint">这里保存的是你的远程 OJ 身份，提交跳转和结果回传会优先使用这些绑定信息。</p>
              <button class="primary-btn" @click="saveAccounts">保存 OJ 账号</button>
            </section>
          </div>

          <section class="settings-card awards-card">
            <div class="card-header">
              <h3>ICPC / CCPC 奖项认定</h3>
              <button v-if="awardForm.id" class="ghost-btn" @click="resetAwardForm">取消编辑</button>
            </div>
            <div class="award-form">
              <label>赛事
                <select v-model="awardForm.competition">
                  <option value="ICPC">ICPC</option>
                  <option value="CCPC">CCPC</option>
                </select>
              </label>
              <label>年份<input v-model.number="awardForm.year" type="number" min="1970" max="2100" /></label>
              <label>赛季/届次<input v-model="awardForm.season" placeholder="如 2025-2026" /></label>
              <label>赛区<input v-model="awardForm.region" placeholder="如 成都、沈阳、女生赛" /></label>
              <label>奖项<input v-model="awardForm.awardLevel" placeholder="如 金奖 / 银奖 / 铜奖" /></label>
              <label>队名<input v-model="awardForm.teamName" placeholder="可选" /></label>
              <label>排名<input v-model.number="awardForm.rank" type="number" min="1" placeholder="可选" /></label>
              <label>证书/榜单链接<input v-model="awardForm.certificateUrl" placeholder="可选，建议填写证明链接" /></label>
            </div>
            <button class="primary-btn" @click="saveAward">{{ awardForm.id ? '更新认定' : '提交认定' }}</button>

            <div class="award-list">
              <div v-for="award in awards" :key="award.id" class="award-row">
                <div>
                  <strong>{{ award.competition }} {{ award.year || '' }} {{ award.awardLevel }}</strong>
                  <p>{{ award.region || '未填赛区' }} · {{ award.teamName || '未填队名' }}<span v-if="award.rank"> · 第 {{ award.rank }} 名</span></p>
                </div>
                <span class="award-status" :class="award.status.toLowerCase()">{{ awardStatusLabels[award.status] || award.status }}</span>
                <button class="ghost-btn" @click="editAward(award)">编辑</button>
                <button class="danger-btn" @click="deleteAward(award.id)">删除</button>
              </div>
              <div v-if="awards.length === 0" class="no-data-sm">还没有提交 ICPC/CCPC 奖项认定</div>
            </div>
          </section>
        </div>
      </div>

      <div v-if="selectedSubmission" class="modal-overlay" @click.self="selectedSubmission = null">
        <div class="modal-card">
          <div class="modal-header">
            <h3>提交详情</h3>
            <button class="modal-close" @click="selectedSubmission = null">×</button>
          </div>
          <div class="modal-body">
            <div class="detail-meta">
              <span v-if="selectedSubmission.problem"><b>题目:</b> {{ selectedSubmission.problem.title }}</span>
              <span><b>状态:</b> <span :style="{ color: statusColors[selectedSubmission.status] }">{{ selectedSubmission.status }}</span></span>
              <span><b>得分:</b> {{ selectedSubmission.score }}</span>
              <span v-if="hasMetric(selectedSubmission.timeUsed)"><b>用时:</b> {{ selectedSubmission.timeUsed }}ms</span>
              <span v-if="hasMetric(selectedSubmission.memoryUsed)"><b>内存:</b> {{ formatMemoryKb(selectedSubmission.memoryUsed) }}</span>
              <span><b>语言:</b> {{ selectedSubmission.language }}</span>
              <span><b>提交时间:</b> {{ new Date(selectedSubmission.createdAt).toLocaleString('zh-CN') }}</span>
            </div>
            <div v-if="selectedSubmission.compileMessage" class="compile-box">
              <strong>编译信息:</strong>
              <pre>{{ selectedSubmission.compileMessage }}</pre>
            </div>
            <h4>源代码</h4>
            <pre class="code-block"><code>{{ selectedSubmission.sourceCode }}</code></pre>
            <div v-if="selectedSubmission.cases?.length">
              <h4>测试点详情 ({{ selectedSubmission.cases.length }} 个)</h4>
              <table class="cases-table">
                <thead><tr><th>#</th><th>状态</th><th>用时</th><th>内存</th></tr></thead>
                <tbody>
                  <tr v-for="c in selectedSubmission.cases" :key="c.caseIndex">
                    <td>{{ c.caseIndex }}</td>
                    <td :style="{ color: statusColors[c.status] }">{{ c.status }}</td>
                    <td>{{ c.timeUsed }}ms</td>
                    <td>{{ c.memoryUsed }}KB</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile-page { max-width: 1080px; margin: 0 auto; padding: 20px; }
.loading, .error-msg { text-align: center; padding: 60px; color: #999; }
.error-msg { color: #e74c3c; }
.error-msg.compact { padding: 10px 12px; text-align: left; background: #fff1f0; border-radius: 8px; margin-bottom: 12px; }
.success-msg { padding: 10px 12px; color: #1f8f4d; background: #eefaf2; border-radius: 8px; margin-bottom: 12px; }

.profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; padding: 24px; background: #fff; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.avatar { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #4fc3f7, #1a1a2e); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; flex-shrink: 0; }
.user-info h2 { margin: 0; font-size: 24px; }
.username { color: #999; margin: 4px 0; font-size: 14px; }
.role-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; margin: 4px 0; }
.role-badge.admin { background: #fce4ec; color: #c62828; }
.role-badge.teacher { background: #e3f2fd; color: #1565c0; }
.role-badge.student { background: #e8f5e9; color: #2e7d32; }
.identity-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.school-name { color: #66717e; font-size: 12px; }
.join-date { color: #aaa; font-size: 13px; margin-top: 6px; }

.stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card { background: #fff; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-top: 3px solid #ddd; }
.stat-card.accent-green { border-top-color: #27ae60; } .stat-card.accent-blue { border-top-color: #3498db; }
.stat-card.accent-orange { border-top-color: #e67e22; } .stat-card.accent-purple { border-top-color: #9b59b6; }
.stat-card.accent-teal { border-top-color: #1abc9c; }
.stat-value { font-size: 28px; font-weight: bold; color: #1a1a2e; }
.stat-unit { font-size: 14px; font-weight: normal; color: #999; margin-left: 2px; }
.stat-label { font-size: 13px; color: #888; margin-top: 4px; }

.panel { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.inner-panel { box-shadow: none; border: 1px solid #f0f2f5; }
.panel h3 { margin: 0 0 16px; font-size: 16px; color: #333; }
.content-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); gap: 16px; margin-bottom: 24px; align-items: start; }
.difficulty-column { min-width: 0; }
.difficulty-panel { overflow: hidden; background: linear-gradient(180deg, #fff, #fbfdff); }
.section-title { margin: 8px 0 12px; font-size: 16px; }

.heatmap-container { display: flex; flex-direction: column; align-items: flex-start; }
.heatmap-panel { min-width: 0; }
.heatmap-wrapper { width: 100%; overflow-x: auto; padding-bottom: 4px; }
.month-row { display: flex; margin-bottom: 2px; }
.weekday-gutter { width: 20px; flex-shrink: 0; }
.month-cells { display: grid; grid-template-columns: repeat(54, 15px); }
.month-label { font-size: 10px; color: #888; }
.heatmap-grid { display: flex; }
.weekday-col { display: flex; flex-direction: column; gap: 3px; padding-right: 4px; padding-top: 2px; }
.weekday-label { font-size: 9px; color: #aaa; height: 12px; line-height: 12px; width: 16px; text-align: right; }
.cells-grid { display: flex; gap: 3px; }
.heatmap-week { display: flex; flex-direction: column; gap: 3px; }
.heatmap-cell { width: 12px; height: 12px; border-radius: 2px; cursor: pointer; transition: transform 0.1s; }
.heatmap-cell:hover { transform: scale(1.5); outline: 1px solid #666; z-index: 2; position: relative; }
.heatmap-cell.empty { background: transparent !important; cursor: default; }
.heatmap-cell.empty:hover { transform: none; outline: none; }
.heatmap-legend { display: flex; align-items: center; gap: 3px; margin-top: 8px; font-size: 10px; color: #888; }
.legend-cell { width: 12px; height: 12px; border-radius: 2px; }

.dist-bars { display: flex; flex-direction: column; gap: 12px; }
.dist-row { display: grid; grid-template-columns: 54px minmax(0, 1fr) 28px; align-items: center; gap: 8px; min-width: 0; }
.dist-label { min-width: 0; font-size: 12px; color: #5f6b7a; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dist-bar-track { min-width: 0; height: 10px; background: #edf1f5; border-radius: 999px; overflow: hidden; }
.dist-bar-fill { height: 100%; border-radius: 999px; transition: width 0.5s; }
.diff-bar { background: linear-gradient(90deg, #4fc3f7, #1a1a2e); box-shadow: 0 4px 10px rgba(79, 195, 247, 0.24); }
.dist-count { font-size: 13px; font-weight: 700; color: #1a1a2e; text-align: right; }

.submissions-panel { margin-bottom: 24px; }
.sub-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tabs { display: flex; gap: 4px; background: #f5f5f5; border-radius: 8px; padding: 3px; }
.tabs button { padding: 7px 18px; border: none; background: none; border-radius: 6px; font-size: 14px; cursor: pointer; color: #666; font-weight: 500; transition: all 0.2s; }
.tabs button.active { background: #fff; color: #1a1a2e; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tabs button:hover:not(.active) { color: #333; }
.sub-count { font-size: 13px; color: #999; }
.sub-list { max-height: 600px; overflow-y: auto; }
.sub-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid #f5f5f5; font-size: 14px; transition: background 0.15s; }
.sub-row:hover { background: #fafbfc; }
.clickable { cursor: pointer; }
.sub-status { padding: 2px 8px; border-radius: 3px; color: #fff; font-size: 12px; font-weight: 600; min-width: 36px; text-align: center; }
.sub-title { flex: 1; font-weight: 500; color: #1a1a2e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-lang { color: #888; font-size: 12px; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; }
.sub-meta, .sub-time { color: #aaa; font-size: 12px; }
.sub-time { white-space: nowrap; }
.no-data { text-align: center; color: #999; padding: 40px; font-size: 14px; }
.no-data-sm { text-align: center; color: #bbb; padding: 20px 10px; font-size: 12px; }

.settings { display: flex; flex-direction: column; gap: 16px; }
.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.settings-card { border: 1px solid #eef0f4; border-radius: 12px; padding: 18px; background: #fcfdff; }
.settings-card h3 { margin: 0 0 14px; }
.settings-card label { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; color: #4b5563; font-size: 13px; font-weight: 600; }
.settings-card input, .settings-card select { height: 38px; border: 1px solid #dce1e8; border-radius: 8px; padding: 0 10px; font-size: 14px; background: #fff; color: #1f2937; }
.settings-card input:focus, .settings-card select:focus { outline: none; border-color: #4fc3f7; box-shadow: 0 0 0 3px rgba(79,195,247,0.16); }
.hint { color: #8a94a6; font-size: 12px; line-height: 1.6; }
.primary-btn, .ghost-btn, .danger-btn { border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; }
.primary-btn { background: #1a1a2e; color: #fff; }
.primary-btn:hover { background: #29294a; }
.ghost-btn { background: #eef2f7; color: #394150; }
.danger-btn { background: #fff1f0; color: #d93025; }
.awards-card { background: #fff; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.award-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.award-list { margin-top: 16px; border-top: 1px solid #f0f2f5; }
.award-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 10px; align-items: center; padding: 12px 0; border-bottom: 1px solid #f5f5f5; }
.award-row p { margin: 4px 0 0; color: #8a94a6; font-size: 12px; }
.award-status { padding: 3px 9px; border-radius: 999px; background: #fff7e6; color: #ad6800; font-size: 12px; font-weight: 700; }
.award-status.approved { background: #f0fff4; color: #218c4a; }
.award-status.rejected { background: #fff1f0; color: #d93025; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-card { background: #fff; border-radius: 12px; max-width: 780px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; position: sticky; top: 0; background: #fff; border-radius: 12px 12px 0 0; z-index: 1; }
.modal-header h3 { margin: 0; font-size: 17px; }
.modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 4px 8px; }
.modal-close:hover { color: #333; }
.modal-body { padding: 20px; }
.detail-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; font-size: 13px; color: #666; }
.detail-meta b { color: #333; }
.compile-box { background: #fff3e0; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
.compile-box pre { margin: 4px 0 0; font-size: 12px; white-space: pre-wrap; }
h4 { font-size: 15px; color: #333; margin: 16px 0 8px; }
.code-block { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; font-size: 13px; line-height: 1.5; overflow-x: auto; max-height: 400px; }
.cases-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
.cases-table th { background: #f8f9fa; padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #eee; }
.cases-table td { padding: 7px 12px; border-bottom: 1px solid #f0f0f0; }

@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .content-grid, .settings-grid { grid-template-columns: 1fr; }
  .award-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .profile-header { align-items: flex-start; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .award-form { grid-template-columns: 1fr; }
  .award-row { grid-template-columns: 1fr; }
  .sub-time { display: none; }
}
</style>
