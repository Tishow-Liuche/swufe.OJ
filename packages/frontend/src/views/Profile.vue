<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/client';

interface HeatDay { date: string; count: number; accepted: number; level: number }
interface Stats {
  overview: any; heatmap: HeatDay[];
  languageDist: Array<{ language: string; count: number }>;
  difficultyDist: Array<{ difficulty: string; count: number }>;
  recentSubmissions: any[];
}

const stats = ref<Stats | null>(null);
const profile = ref<any>(null);
const loading = ref(true);
const error = ref('');

// 提交记录
const allSubmissions = ref<any[]>([]);
const subsLoading = ref(false);
const selectedSubmission = ref<any>(null);
const activeTab = ref<'overview' | 'submissions'>('overview');

onMounted(async () => {
  try {
    const [pRes, sRes] = await Promise.all([
      api.get('/api/user/profile'),
      api.get('/api/user/stats'),
    ]);
    profile.value = pRes.data;
    stats.value = sRes.data;
  } catch (e: any) {
    error.value = e.response?.data?.message || '请先登录';
  } finally {
    loading.value = false;
  }
});

async function loadAllSubmissions() {
  subsLoading.value = true;
  activeTab.value = 'submissions';
  try {
    const { data } = await api.get('/api/submissions', { params: { pageSize: 100 } });
    allSubmissions.value = data.items || [];
  } catch (e: any) {
    console.error(e);
  } finally {
    subsLoading.value = false;
  }
}

async function viewDetail(sub: any) {
  try {
    const { data } = await api.get(`/api/submissions/${sub.id}`);
    selectedSubmission.value = data;
  } catch (e: any) {
    console.error(e);
  }
}

const heatmapWeeks = computed(() => {
  if (!stats.value) return [];
  const data = stats.value.heatmap;
  const weeks: HeatDay[][] = [];
  let week: HeatDay[] = [];
  const firstDay = new Date(data[0].date + 'T00:00:00');
  for (let i = 0; i < firstDay.getDay(); i++) week.push(null as any);
  for (const day of data) {
    week.push(day);
    if (new Date(day.date + 'T00:00:00').getDay() === 6) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null as any); weeks.push(week); }
  return weeks;
});

const monthLabels = computed(() => {
  if (!stats.value) return [];
  const labels: Array<{ index: number; label: string }> = [];
  let lastMonth = -1, colIndex = 0;
  for (const day of stats.value.heatmap) {
    const m = parseInt(day.date.slice(5, 7));
    if (m !== lastMonth) { labels.push({ index: colIndex, label: (m < 10 ? '0' : '') + m + '月' }); lastMonth = m; }
    if (new Date(day.date + 'T00:00:00').getDay() === 6) colIndex++;
  }
  return labels;
});

const levelColors = ['#1a1a2e08', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const langColors: Record<string, string> = { cpp: '#f34b7d', c: '#555', python: '#3572A5', java: '#b07219' };
const diffLabels: Record<string, string> = { BEGINNER: '入门', POPULAR: '普及', 'POPULAR-': '普及-', IMPROVE: '提高', 'IMPROVE-': '提高-', PROVINCIAL: '省选', NOI: 'NOI' };
const statusLabels: Record<string, string> = { ACCEPTED: 'AC', WRONG_ANSWER: 'WA', TIME_LIMIT_EXCEEDED: 'TLE', RUNTIME_ERROR: 'RE', COMPILE_ERROR: 'CE', MEMORY_LIMIT_EXCEEDED: 'MLE', PENDING: '等待', QUEUING: '排队', COMPILING: '编译中', RUNNING: '运行中' };
const statusColors: Record<string, string> = { ACCEPTED: '#27ae60', WRONG_ANSWER: '#e74c3c', TIME_LIMIT_EXCEEDED: '#f39c12', RUNTIME_ERROR: '#9b59b6', COMPILE_ERROR: '#e67e22', MEMORY_LIMIT_EXCEEDED: '#f39c12', PENDING: '#95a5a6', QUEUING: '#3498db', COMPILING: '#3498db', RUNNING: '#3498db', SYSTEM_ERROR: '#e74c3c' };
const weekDays = ['一', '', '三', '', '五', '', '日'];

function tooltip(day: HeatDay) { return day && day.count > 0 ? day.date + '  |  ' + day.count + ' 次提交  |  AC×' + day.accepted : '无提交'; }
</script>

<template>
  <div class="profile-page">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-if="profile && stats">
      <!-- 头部 -->
      <div class="profile-header">
        <div class="avatar">{{ (profile.nickname || profile.username).charAt(0).toUpperCase() }}</div>
        <div class="user-info">
          <h2>{{ profile.nickname || profile.username }}</h2>
          <p class="username">@{{ profile.username }}</p>
          <span class="role-badge" :class="profile.role?.toLowerCase()">
            {{ profile.role === 'ADMIN' ? '管理员' : profile.role === 'TEACHER' ? '教师' : '学生' }}
          </span>
          <p class="join-date">加入于 {{ new Date(profile.createdAt).toLocaleDateString('zh-CN') }}</p>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">{{ stats.overview.totalSubmissions }}</div><div class="stat-label">总提交</div></div>
        <div class="stat-card accent-green"><div class="stat-value">{{ stats.overview.acceptRate }}%</div><div class="stat-label">通过率</div></div>
        <div class="stat-card accent-blue"><div class="stat-value">{{ stats.overview.solvedCount }}</div><div class="stat-label">已解决</div></div>
        <div class="stat-card accent-orange"><div class="stat-value">{{ stats.overview.triedCount }}</div><div class="stat-label">尝试过</div></div>
        <div class="stat-card accent-purple"><div class="stat-value">{{ stats.overview.activeDays }}</div><div class="stat-label">活跃天数</div></div>
        <div class="stat-card accent-teal"><div class="stat-value">{{ stats.overview.currentStreak }}<span class="stat-unit">天</span></div><div class="stat-label">连续打卡</div></div>
      </div>

      <div class="content-grid">
        <div class="panel heatmap-panel">
          <h3>📊 全年提交热力图</h3>
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
                    <div v-for="(day, di) in week" :key="di" class="heatmap-cell" :class="{ empty: !day }"
                      :style="day ? { background: levelColors[day.level] || levelColors[0] } : {}" :title="tooltip(day)"></div>
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

        <div class="panel-group">
          <div class="panel dist-panel">
            <h3>🔤 语言分布</h3>
            <div class="dist-bars">
              <div v-for="l in stats.languageDist" :key="l.language" class="dist-row">
                <span class="dist-label">{{ l.language.toUpperCase() }}</span>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" :style="{ width: (l.count / stats.overview.totalSubmissions * 100) + '%', background: langColors[l.language] || '#666' }"></div>
                </div>
                <span class="dist-count">{{ l.count }}</span>
              </div>
            </div>
          </div>
          <div class="panel dist-panel">
            <h3>🎯 难度分布</h3>
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

      <!-- 提交记录 Tab 切换 -->
      <div class="panel submissions-panel">
        <div class="sub-header">
          <div class="tabs">
            <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">最近提交</button>
            <button :class="{ active: activeTab === 'submissions' }" @click="loadAllSubmissions">全部记录</button>
          </div>
          <span class="sub-count" v-if="activeTab === 'submissions'">{{ allSubmissions.length }} 条</span>
        </div>

        <!-- 最近提交 -->
        <div v-if="activeTab === 'overview'" class="sub-list">
          <div v-for="sub in stats.recentSubmissions" :key="sub.id" class="sub-row clickable" @click="viewDetail(sub)">
            <span class="sub-status" :style="{ background: statusColors[sub.status] || '#999' }">{{ statusLabels[sub.status] || sub.status }}</span>
            <span class="sub-title">{{ sub.problem.title }}</span>
            <span class="sub-lang">{{ sub.language }}</span>
            <span class="sub-meta">{{ sub.timeUsed }}ms · {{ (sub.memoryUsed / 1024).toFixed(1) }}MB</span>
            <span class="sub-time">{{ new Date(sub.createdAt).toLocaleString('zh-CN') }}</span>
            <span class="sub-arrow">→</span>
          </div>
          <div v-if="stats.recentSubmissions.length === 0" class="no-data">暂无提交记录</div>
        </div>

        <!-- 全部提交 -->
        <div v-if="activeTab === 'submissions'" class="sub-list">
          <div v-if="subsLoading" class="no-data">加载中...</div>
          <div v-for="sub in allSubmissions" :key="sub.id" class="sub-row clickable" @click="viewDetail(sub)">
            <span class="sub-status" :style="{ background: statusColors[sub.status] || '#999' }">{{ statusLabels[sub.status] || sub.status }}</span>
            <span class="sub-title">{{ sub.problem?.title || '-' }}</span>
            <span class="sub-lang">{{ sub.language }}</span>
            <span class="sub-meta">{{ sub.score }}分</span>
            <span class="sub-time">{{ new Date(sub.createdAt).toLocaleString('zh-CN') }}</span>
            <span class="sub-arrow">→</span>
          </div>
          <div v-if="!subsLoading && allSubmissions.length === 0" class="no-data">暂无提交记录</div>
        </div>
      </div>

      <!-- 提交详情弹窗 -->
      <div v-if="selectedSubmission" class="modal-overlay" @click.self="selectedSubmission = null">
        <div class="modal-card">
          <div class="modal-header">
            <h3>提交详情</h3>
            <button class="modal-close" @click="selectedSubmission = null">✕</button>
          </div>
          <div class="modal-body">
            <div class="detail-meta">
              <span v-if="selectedSubmission.problem"><b>题目:</b> {{ selectedSubmission.problem.title }}</span>
              <span><b>状态:</b> <span :style="{ color: statusColors[selectedSubmission.status] }">{{ selectedSubmission.status }}</span></span>
              <span><b>得分:</b> {{ selectedSubmission.score }}</span>
              <span v-if="selectedSubmission.timeUsed"><b>用时:</b> {{ selectedSubmission.timeUsed }}ms</span>
              <span v-if="selectedSubmission.memoryUsed"><b>内存:</b> {{ (selectedSubmission.memoryUsed / 1024).toFixed(1) }}MB</span>
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
.profile-page { max-width: 1020px; margin: 0 auto; padding: 20px; }
.loading, .error-msg { text-align: center; padding: 60px; color: #999; }
.error-msg { color: #e74c3c; }

.profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.avatar { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #4fc3f7, #1a1a2e); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; flex-shrink: 0; }
.user-info h2 { margin: 0; font-size: 24px; }
.username { color: #999; margin: 4px 0; font-size: 14px; }
.role-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; margin: 4px 0; }
.role-badge.admin { background: #fce4ec; color: #c62828; }
.role-badge.teacher { background: #e3f2fd; color: #1565c0; }
.role-badge.student { background: #e8f5e9; color: #2e7d32; }
.join-date { color: #aaa; font-size: 13px; margin-top: 6px; }

.stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card { background: #fff; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-top: 3px solid #ddd; }
.stat-card.accent-green { border-top-color: #27ae60; } .stat-card.accent-blue { border-top-color: #3498db; }
.stat-card.accent-orange { border-top-color: #e67e22; } .stat-card.accent-purple { border-top-color: #9b59b6; }
.stat-card.accent-teal { border-top-color: #1abc9c; }
.stat-value { font-size: 28px; font-weight: bold; color: #1a1a2e; }
.stat-unit { font-size: 14px; font-weight: normal; color: #999; margin-left: 2px; }
.stat-label { font-size: 13px; color: #888; margin-top: 4px; }

.content-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; margin-bottom: 24px; }
.panel { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.panel h3 { margin: 0 0 16px; font-size: 16px; color: #333; }
.panel-group { display: flex; flex-direction: column; gap: 16px; }

/* 热力图 */
.heatmap-container { display: flex; flex-direction: column; align-items: flex-start; }
.heatmap-wrapper { width: 100%; overflow-x: auto; padding-bottom: 4px; }
.month-row { display: flex; margin-bottom: 2px; }
.weekday-gutter { width: 20px; flex-shrink: 0; }
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

.dist-bars { display: flex; flex-direction: column; gap: 8px; }
.dist-row { display: flex; align-items: center; gap: 8px; }
.dist-label { width: 50px; font-size: 12px; color: #666; text-align: right; }
.dist-bar-track { flex: 1; height: 18px; background: #f0f0f0; border-radius: 3px; overflow: hidden; }
.dist-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.diff-bar { background: linear-gradient(90deg, #4fc3f7, #1a1a2e); }
.dist-count { width: 30px; font-size: 13px; font-weight: 600; color: #333; text-align: right; }

/* 提交记录 */
.submissions-panel { margin-bottom: 24px; }
.sub-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tabs { display: flex; gap: 4px; background: #f5f5f5; border-radius: 8px; padding: 3px; }
.tabs button {
  padding: 7px 18px; border: none; background: none;
  border-radius: 6px; font-size: 14px; cursor: pointer; color: #666; font-weight: 500;
  transition: all 0.2s;
}
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
.sub-arrow { color: #ccc; font-size: 14px; }
.no-data { text-align: center; color: #999; padding: 40px; font-size: 14px; }
.no-data-sm { text-align: center; color: #bbb; padding: 20px 10px; font-size: 12px; }

/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-card { background: #fff; border-radius: 12px; max-width: 780px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; position: sticky; top: 0; background: #fff; border-radius: 12px 12px 0 0; z-index: 1; }
.modal-header h3 { margin: 0; font-size: 17px; }
.modal-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #999; padding: 4px 8px; }
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

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .content-grid { grid-template-columns: 1fr; }
  .modal-card { max-width: 100%; max-height: 90vh; }
}
</style>
