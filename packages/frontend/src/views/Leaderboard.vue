<script setup lang="ts">
import { ref, onMounted } from 'vue';

const users = ref<any[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const res = await fetch('/api/leaderboard');
    users.value = await res.json();
  } catch (e: any) {
    error.value = '排行榜加载失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="leaderboard-page">
    <h2>🏆 全站排行榜</h2>
    <p class="subtitle">按已解决题目数排名</p>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <table v-else class="board-table">
      <thead>
        <tr>
          <th style="width:60px">排名</th>
          <th>用户</th>
          <th style="width:100px">已解决</th>
          <th style="width:100px">提交数</th>
          <th style="width:100px">通过率</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.userId" :class="{ highlight: u.rank <= 3 }">
          <td class="rank-cell">
            <span v-if="u.rank === 1" class="medal">🥇</span>
            <span v-else-if="u.rank === 2" class="medal">🥈</span>
            <span v-else-if="u.rank === 3" class="medal">🥉</span>
            <span v-else class="rank-num">{{ u.rank }}</span>
          </td>
          <td>
            <span class="nickname">{{ u.nickname }}</span>
            <span class="username">@{{ u.username }}</span>
            <span class="role-tag" :class="u.role?.toLowerCase()">{{ u.role === 'ADMIN' ? '管理员' : u.role === 'TEACHER' ? '教师' : '' }}</span>
          </td>
          <td class="num-cell">{{ u.solvedCount }}</td>
          <td class="num-cell">{{ u.submissionCount }}</td>
          <td class="num-cell">{{ u.acceptRate }}%</td>
        </tr>
      </tbody>
    </table>

    <div v-if="!loading && users.length === 0" class="empty">
      暂无提交数据
    </div>
  </div>
</template>

<style scoped>
.leaderboard-page { max-width: 760px; margin: 0 auto; padding: 30px 20px; }
h2 { text-align: center; font-size: 28px; color: #1a1a2e; margin: 0; }
.subtitle { text-align: center; color: #888; font-size: 14px; margin: 4px 0 24px; }
.loading, .error, .empty { text-align: center; padding: 60px; color: #999; }

.board-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.board-table th { background: #f8f9fa; padding: 12px 16px; text-align: left; font-weight: 600; color: #666; font-size: 13px; border-bottom: 2px solid #eee; }
.board-table td { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
tr:hover { background: #fafafa; }
tr.highlight { background: #fffde7; }
tr.highlight:hover { background: #fff9c4; }

.rank-cell { font-size: 16px; }
.medal { font-size: 22px; }
.rank-num { color: #999; font-weight: 600; }
.nickname { font-weight: 600; color: #1a1a2e; margin-right: 6px; }
.username { color: #aaa; font-size: 12px; }
.role-tag { margin-left: 8px; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
.role-tag.admin { background: #fce4ec; color: #c62828; }
.role-tag.teacher { background: #e3f2fd; color: #1565c0; }
.num-cell { font-weight: 600; color: #333; }
</style>
