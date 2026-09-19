<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { canViewFeed, timeText, type Contest } from './contest';
import { useContestFeed } from './useContestFeed';
import ContestSubmissionDialog from './ContestSubmissionDialog.vue';
const props = defineProps<{ contest: Contest }>(); const auth = useAuthStore();
const allowed = computed(() => canViewFeed(props.contest, auth.user));
const { data, error, loading, updatedAt, refresh } = useContestFeed<any>(() => `/api/contests/${props.contest.id}/standings`, () => allowed.value);
const selectedId = ref('');
function cellText(cell: any) {
  if (cell.status === 'ACCEPTED') return cell.wrongAttempts ? `+${cell.wrongAttempts}` : '+';
  if (cell.status === 'PENDING') return `${cell.attempts || 1}?`;
  if (cell.status === 'WRONG_ANSWER') return `-${cell.wrongAttempts || cell.attempts || 1}`;
  return '—';
}
function cellMinutes(value?: string) { return value ? Math.max(0, Math.floor((Date.parse(value) - Date.parse(props.contest.startTime)) / 60000)) : null; }
</script>
<template>
  <section class="arena-standings">
    <div class="arena-section-head"><div><h2>{{ contest.state === 'ENDED' ? '比赛排名' : '实时排名' }}</h2><p class="arena-muted">{{ updatedAt ? `更新于 ${timeText(updatedAt)}` : '成绩以评测结果为准' }}<span v-if="loading"> · 刷新中</span></p></div><button class="arena-button secondary" :disabled="loading || !allowed" @click="refresh">刷新</button></div>
    <p v-if="!allowed" class="arena-empty">该比赛的排名仅限参赛者查看，请先报名。</p>
    <template v-else>
      <p v-if="error" class="arena-error" role="alert">{{ error }}</p>
      <div class="arena-legend"><span class="accepted">通过</span><span class="wrong">未通过</span><span class="pending">待评测</span><span class="first-blood">首次通过</span><span v-if="data?.contest?.frozen">当前已封榜</span></div>
      <div v-if="data?.rows?.length" class="arena-table-wrap">
        <table class="arena-table standings-table"><thead><tr><th scope="col">排名</th><th scope="col" class="arena-user">选手</th><th scope="col">{{ contest.mode === 'IOI' ? '得分' : '过题' }}</th><th scope="col">{{ contest.mode === 'IOI' ? '最后提交' : '罚时' }}</th><th v-for="p in data.problems" :key="p.problemId" scope="col" :title="p.title">{{ p.label }}</th></tr></thead>
          <tbody><tr v-for="row in data.rows" :key="row.userId"><td>{{ row.rank }}</td><td class="arena-user"><strong>{{ row.user?.nickname || row.user?.username }}</strong><small v-if="contest.visibility !== 'CAMPUS_PRIVATE'">{{ row.user?.username }}</small></td><td>{{ contest.mode === 'IOI' ? row.score : row.solvedCount }}</td><td>{{ contest.mode === 'IOI' ? timeText(row.lastActive) : row.penalty }}</td>
            <td v-for="cell in row.problems" :key="cell.problemId" class="arena-score"><button class="score-cell" :class="{ accepted: cell.status === 'ACCEPTED', wrong: cell.status === 'WRONG_ANSWER', pending: cell.status === 'PENDING', 'first-blood': cell.firstBlood }" :disabled="!cell.viewableSubmissionId" :title="`${cell.label} ${cell.title || ''} · ${cell.status} · ${cell.attempts || 0} 次提交`" @click="selectedId = cell.viewableSubmissionId"><strong>{{ contest.mode === 'IOI' && cell.status !== 'UNTRIED' ? cell.score : cellText(cell) }}</strong><small v-if="cell.acceptedAt && !row.isVirtual">{{ cellMinutes(cell.acceptedAt) }} min</small></button></td>
          </tr></tbody>
        </table>
      </div>
      <p v-else-if="!loading && !error" class="arena-empty">暂无排名数据。</p>
      <p v-if="data?.rows?.length" class="arena-muted">比赛结束后可点击通过题目的色块查看获准公开的源代码。</p>
    </template>
    <ContestSubmissionDialog v-if="selectedId" :contest-id="contest.id" :submission-id="selectedId" @close="selectedId = ''" />
  </section>
</template>
