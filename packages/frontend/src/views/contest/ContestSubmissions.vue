<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { canViewFeed, problemDisplayTitle, statusText, timeText, verdictClass, type Contest } from './contest';
import { useContestFeed } from './useContestFeed';
import ContestSubmissionDialog from './ContestSubmissionDialog.vue';
const props = defineProps<{ contest: Contest }>(); const auth = useAuthStore();
const allowed = computed(() => canViewFeed(props.contest, auth.user));
const onlyMine = ref(false);
const nickname = ref('');
const appliedNickname = ref('');
const { data, error, loading, updatedAt, refresh } = useContestFeed<{ items: any[] }>(() => {
  const params = new URLSearchParams();
  if (onlyMine.value) params.set('mine', 'true');
  if (appliedNickname.value) params.set('nickname', appliedNickname.value);
  return `/api/contests/${props.contest.id}/submissions${params.size ? '?' + params.toString() : ''}`;
}, () => allowed.value);
const selectedId = ref('');
</script>
<template>
  <section class="arena-submissions">
    <div class="arena-section-head"><div><h2>提交记录</h2><p class="arena-muted">最近 {{ data?.items?.length || 0 }} 条提交{{ updatedAt ? ` · 更新于 ${timeText(updatedAt)}` : '' }}<span v-if="loading"> · 刷新中</span></p></div><button class="arena-button secondary" :disabled="loading || !allowed" @click="refresh">刷新</button></div>
    <p v-if="!allowed" class="arena-empty">该比赛的提交记录仅限参赛者查看，请先报名。</p>
    <template v-else>
      <div class="submission-filter-toolbar">
        <form class="submission-search" @submit.prevent="appliedNickname = nickname.trim(); selectedId = ''">
          <input v-model="nickname" maxlength="100" aria-label="搜索选手昵称" placeholder="输入选手昵称" />
          <button class="arena-button secondary" type="submit">搜索</button>
          <button class="arena-button secondary" type="button" @click="nickname = ''; appliedNickname = ''; selectedId = ''">重置</button>
        </form>
        <button class="arena-button" :class="onlyMine ? 'primary' : 'secondary'" :aria-pressed="onlyMine" @click="onlyMine = !onlyMine; selectedId = ''">仅查看自己的提交</button>
      </div>
      <p v-if="error" class="arena-error" role="alert">{{ error }}</p>
      <div v-if="data?.items?.length" class="arena-table-wrap" role="region" aria-label="比赛提交记录列表" tabindex="0">
        <table class="arena-table submissions-table"><thead><tr><th scope="col">时间</th><th scope="col">选手</th><th scope="col">题目</th><th scope="col">语言</th><th scope="col">结果</th><th scope="col">耗时</th><th scope="col">内存</th><th scope="col">详情</th></tr></thead>
          <tbody><tr v-for="submission in data.items" :key="submission.id"><td>{{ timeText(submission.createdAt) }}</td><td>{{ submission.user?.nickname || submission.user?.username }}</td><td>{{ submission.problem?.label }} · {{ problemDisplayTitle(submission.problem) }}</td><td>{{ submission.language }}</td><td><span class="arena-verdict" :class="verdictClass(submission.status)">{{ statusText(submission.status) }}</span></td><td>{{ submission.timeUsed ?? '—' }} ms</td><td>{{ submission.memoryUsed ?? '—' }} KB</td><td><button class="arena-text-button" @click="selectedId = submission.id">查看</button></td></tr></tbody>
        </table>
      </div>
      <p v-else-if="!loading && !error" class="arena-empty">暂无提交记录。</p>
    </template>
    <ContestSubmissionDialog v-if="selectedId" :contest-id="contest.id" :submission-id="selectedId" @close="selectedId = ''" />
  </section>
</template>
<style scoped>
.arena-submissions .arena-section-head { margin-bottom: 0; }
.submission-filter-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-block: 16px; }
.submission-search { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.submission-search input { min-width: 0; max-width: 100%; padding: 9px 12px; border: 1px solid #dbe3eb; border-radius: 8px; background: transparent; color: inherit; }
.arena-submissions .arena-table-wrap { max-height: min(520px, 55vh); max-height: min(520px, 55dvh); min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.arena-submissions .arena-table-wrap:focus-visible { outline: 2px solid #2874eb; outline-offset: 2px; }
.submissions-table th { position: sticky; top: 0; z-index: 1; }
</style>
