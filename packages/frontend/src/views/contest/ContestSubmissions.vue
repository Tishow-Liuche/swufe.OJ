<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { canViewFeed, problemDisplayTitle, statusText, timeText, verdictClass, type Contest } from './contest';
import { useContestFeed } from './useContestFeed';
import ContestSubmissionDialog from './ContestSubmissionDialog.vue';
const props = defineProps<{ contest: Contest }>(); const auth = useAuthStore();
const allowed = computed(() => canViewFeed(props.contest, auth.user));
const onlyMine = ref(false);
const { data, error, loading, updatedAt, refresh } = useContestFeed<{ items: any[] }>(() => `/api/contests/${props.contest.id}/submissions${onlyMine.value ? '?mine=true' : ''}`, () => allowed.value);
const selectedId = ref('');
</script>
<template>
  <section class="arena-submissions">
    <div class="arena-section-head"><div><h2>提交记录</h2><p class="arena-muted">最近 {{ data?.items?.length || 0 }} 条提交{{ updatedAt ? ` · 更新于 ${timeText(updatedAt)}` : '' }}<span v-if="loading"> · 刷新中</span></p></div><button class="arena-button secondary" :disabled="loading || !allowed" @click="refresh">刷新</button></div>
    <p v-if="!allowed" class="arena-empty">该比赛的提交记录仅限参赛者查看，请先报名。</p>
    <template v-else>
      <button class="arena-button" :class="onlyMine ? 'primary' : 'secondary'" :aria-pressed="onlyMine" @click="onlyMine = !onlyMine; selectedId = ''">仅查看自己的提交</button>
      <p v-if="error" class="arena-error" role="alert">{{ error }}</p>
      <div v-if="data?.items?.length" class="arena-table-wrap">
        <table class="arena-table submissions-table"><thead><tr><th scope="col">时间</th><th scope="col">选手</th><th scope="col">题目</th><th scope="col">语言</th><th scope="col">结果</th><th scope="col">耗时</th><th scope="col">内存</th><th scope="col">详情</th></tr></thead>
          <tbody><tr v-for="submission in data.items" :key="submission.id"><td>{{ timeText(submission.createdAt) }}</td><td>{{ submission.user?.nickname || submission.user?.username }}</td><td>{{ submission.problem?.label }} · {{ problemDisplayTitle(submission.problem) }}</td><td>{{ submission.language }}</td><td><span class="arena-verdict" :class="verdictClass(submission.status)">{{ statusText(submission.status) }}</span></td><td>{{ submission.timeUsed ?? '—' }} ms</td><td>{{ submission.memoryUsed ?? '—' }} KB</td><td><button class="arena-text-button" @click="selectedId = submission.id">查看</button></td></tr></tbody>
        </table>
      </div>
      <p v-else-if="!loading && !error" class="arena-empty">暂无提交记录。</p>
    </template>
    <ContestSubmissionDialog v-if="selectedId" :contest-id="contest.id" :submission-id="selectedId" @close="selectedId = ''" />
  </section>
</template>
