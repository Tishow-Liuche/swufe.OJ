<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';

const router = useRouter();

interface HeatDay { date: string; count: number; accepted: number; level: number }
interface Stats {
  overview: any;
  heatmap: HeatDay[];
  languageDist: Array<{ language: string; count: number }>;
  difficultyDist: Array<{ difficulty: string; count: number }>;
  recentSubmissions: any[];
}
const stats = ref<Stats | null>(null);
const profile = ref<any>(null);
const loading = ref(true);
const error = ref('');

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

// 热力图数据：按周分组
const heatmapWeeks = computed(() => {
  if (!stats.value) return [];
  const data = stats.value.heatmap;
  const weeks: HeatDay[][] = [];
  let week: HeatDay[] = [];
  // 找到第一个周日作为起点填充空位
  const firstDay = new Date(data[0].date + 'T00:00:00');
  const firstDow = firstDay.getDay();
  for (let i = 0; i < firstDow; i++) week.push(null as any);

  for (const day of data) {
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
  if (!stats.value) return [];
  const labels: Array<{ index: number; label: string }> = [];
  const data = stats.value.heatmap;
  let lastMonth = -1;
  let colIndex = 0;
  for (const day of data) {
    const m = parseInt(day.date.slice(5, 7));
    if (m !== lastMonth) {
      labels.push({ index: colIndex, label: (m < 10 ? '0' : '') + m + '月' });
      lastMonth = m;
    }
    if (new Date(day.date + 'T00:00:00').getDay() === 6) colIndex++;
  }
  return labels;
});

const levelColors = ['#1a1a2e08', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

const langColors: Record<string, string> = {
  cpp: '#f34b7d', c: '#555', python: '#3572A5', java: '#b07219',
};
const diffLabels: Record<string, string> = {
  BEGINNER: '入门', POPULAR: '普及', 'POPULAR-': '普及-', IMPROVE: '提高', 'IMPROVE-': '提高-', PROVINCIAL: '省选', NOI: 'NOI',
};
const statusLabels: Record<string, string> = {
  ACCEPTED: 'AC', WRONG_ANSWER: 'WA', TIME_LIMIT_EXCEEDED: 'TLE',
  RUNTIME_ERROR: 'RE', COMPILE_ERROR: 'CE', MEMORY_LIMIT_EXCEEDED: 'MLE',
};
const statusColors: Record<string, string> = {
  ACCEPTED: '#27ae60', WRONG_ANSWER: '#e74c3c', TIME_LIMIT_EXCEEDED: '#f39c12',
  RUNTIME_ERROR: '#9b59b6', COMPILE_ERROR: '#e67e22', MEMORY_LIMIT_EXCEEDED: '#f39c12',
  PENDING: '#95a5a6', QUEUING: '#3498db', SYSTEM_ERROR: '#e74c3c',
};

const weekDays = ['一', '', '三', '', '五', '', '日'];

function tooltip(day: HeatDay) {
  if (!day || day.count === 0) return '无提交';
  return day.date + '  |  ' + day.count + ' 次提交  |  AC ×' + day.accepted;
}
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
        <!-- 左：热力图 -->
        <div class="panel heatmap-panel">
          <h3>📊 全年提交热力图</h3>
          <div class="heatmap-container">
            <div class="heatmap-wrapper">
              <!-- 月份标签 -->
              <div class="month-row">
                <div class="weekday-gutter"></div>
                <div class="month-cells">
                  <span v-for="m in monthLabels" :key="m.index" class="month-label" :style="{ gridColumn: m.index + 1 }">
                    {{ m.label }}
                  </span>
                </div>
              </div>
              <!-- 网格 -->
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
                      :title="day ? tooltip(day) : ''"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            <!-- 图例 -->
            <div class="heatmap-legend">
              <span>Less</span>
              <span v-for="(c, i) in levelColors" :key="i" class="legend-cell" :style="{ background: c }"></span>
              <span>More</span>
            </div>
          </div>
        </div>

        <!-- 右：分布面板 -->
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
          </div>
        </div>
      </div>

      <!-- 最近提交 -->
      <div class="panel recent-panel">
        <h3>📝 最近提交</h3>
        <div class="submission-list">
          <div v-for="sub in stats.recentSubmissions" :key="sub.id" class="sub-row clickable" @click="router.push('/submissions/' + sub.id)">
            <span class="sub-status" :style="{ background: statusColors[sub.status] || '#999' }">{{ statusLabels[sub.status] || sub.status }}</span>
            <span class="sub-title">{{ sub.problem.title }}</span>
            <span class="sub-lang">{{ sub.language }}</span>
            <span class="sub-meta">{{ sub.timeUsed }}ms · {{ (sub.memoryUsed / 1024).toFixed(1) }}MB</span>
            <span class="sub-time">{{ new Date(sub.createdAt).toLocaleString('zh-CN') }}</span>
          </div>
          <div v-if="stats.recentSubmissions.length === 0" class="no-data">暂无提交记录</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile-page { max-width: 1020px; margin: 0 auto; padding: 20px; }
.loading, .error-msg { text-align: center; padding: 60px; color: #999; }
.error-msg { color: #e74c3c; }

/* 头部 */
.profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.avatar { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #4fc3f7, #1a1a2e); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; flex-shrink: 0; }
.user-info h2 { margin: 0; font-size: 24px; }
.username { color: #999; margin: 4px 0; font-size: 14px; }
.role-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; margin: 4px 0; }
.role-badge.admin { background: #fce4ec; color: #c62828; }
.role-badge.teacher { background: #e3f2fd; color: #1565c0; }
.role-badge.student { background: #e8f5e9; color: #2e7d32; }
.join-date { color: #aaa; font-size: 13px; margin-top: 6px; }

/* 统计卡片 */
.stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card { background: #fff; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-top: 3px solid #ddd; }
.stat-card.accent-green { border-top-color: #27ae60; }
.stat-card.accent-blue { border-top-color: #3498db; }
.stat-card.accent-orange { border-top-color: #e67e22; }
.stat-card.accent-purple { border-top-color: #9b59b6; }
.stat-card.accent-teal { border-top-color: #1abc9c; }
.stat-value { font-size: 28px; font-weight: bold; color: #1a1a2e; }
.stat-unit { font-size: 14px; font-weight: normal; color: #999; margin-left: 2px; }
.stat-label { font-size: 13px; color: #888; margin-top: 4px; }

/* 内容区 */
.content-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; margin-bottom: 24px; }
.panel { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.panel h3 { margin: 0 0 16px; font-size: 16px; color: #333; }
.panel-group { display: flex; flex-direction: column; gap: 16px; }

/* 热力图 */
.heatmap-container { display: flex; flex-direction: column; align-items: flex-start; }
.heatmap-wrapper { width: 100%; overflow-x: auto; padding-bottom: 4px; }
.month-row { display: flex; margin-bottom: 2px; }
.weekday-gutter { width: 20px; flex-shrink: 0; }
.month-cells { display: flex; gap: 0; }
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

/* 分布条 */
.dist-bars { display: flex; flex-direction: column; gap: 8px; }
.dist-row { display: flex; align-items: center; gap: 8px; }
.dist-label { width: 50px; font-size: 12px; color: #666; text-align: right; }
.dist-bar-track { flex: 1; height: 18px; background: #f0f0f0; border-radius: 3px; overflow: hidden; }
.dist-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.diff-bar { background: linear-gradient(90deg, #4fc3f7, #1a1a2e); }
.dist-count { width: 30px; font-size: 13px; font-weight: 600; color: #333; text-align: right; }

/* 提交列表 */
.recent-panel { margin-bottom: 24px; }
.submission-list { max-height: 560px; overflow-y: auto; }
.sub-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
.sub-row:hover { background: #fafafa; }
.clickable { cursor: pointer; }
.sub-status { padding: 2px 8px; border-radius: 3px; color: #fff; font-size: 12px; font-weight: 600; min-width: 36px; text-align: center; }
.sub-title { flex: 1; font-weight: 500; color: #1a1a2e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-lang { color: #888; font-size: 12px; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
.sub-meta, .sub-time { color: #aaa; font-size: 12px; }
.sub-time { white-space: nowrap; }
.no-data { text-align: center; color: #999; padding: 30px; font-size: 14px; }

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .content-grid { grid-template-columns: 1fr; }
}
</style>
