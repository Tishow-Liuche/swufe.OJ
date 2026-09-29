<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { canViewFeed, problemDisplayTitle, statusText, timeText, verdictClass, type Contest } from './contest';
import { useContestFeed } from './useContestFeed';
import ContestSubmissionDialog from './ContestSubmissionDialog.vue';
const props = defineProps<{ contest: Contest }>(); const auth = useAuthStore();
const allowed = computed(() => canViewFeed(props.contest, auth.user));
const onlyMine = ref(false);
const problemId = ref('');
const nickname = ref('');
const appliedNickname = ref('');
const page = ref(1);
watch([onlyMine, problemId, appliedNickname, () => props.contest.id], () => { page.value = 1; }, { flush: 'sync' });
watch(() => auth.user, user => { if (!user) onlyMine.value = false; });
const { data, error, loading, updatedAt, refresh } = useContestFeed<{ items: any[]; page: number; hasMore: boolean; problems: Array<{ id: string; label: string; title: string }> }>(() => {
  const params = new URLSearchParams();
  if (problemId.value) params.set('problemId', problemId.value);
  if (onlyMine.value) params.set('mine', 'true');
  if (appliedNickname.value) params.set('nickname', appliedNickname.value);
  if (page.value > 1) params.set('page', String(page.value));
  return `/api/contests/${props.contest.id}/submissions${params.size ? '?' + params.toString() : ''}`;
}, () => allowed.value);
const selectedId = ref('');
</script>
<template>
  <section class="arena-submissions">
    <div class="arena-section-head"><div><h2>提交记录</h2><p class="arena-muted">本页 {{ data?.items?.length || 0 }} 条提交{{ updatedAt ? ` · 更新于 ${timeText(updatedAt)}` : '' }}<span v-if="loading"> · 刷新中</span></p></div><button class="arena-button secondary" :disabled="loading || !allowed" @click="refresh">刷新</button></div>
    <p v-if="!allowed" class="arena-empty">该比赛的提交记录仅限参赛者查看，请先报名。</p>
    <template v-else>
      <div class="submission-filter-toolbar">
        <form class="submission-search" @submit.prevent="appliedNickname = nickname.trim(); selectedId = ''">
          <input v-model="nickname" maxlength="100" :aria-label="contest.visibility === 'CAMPUS_PRIVATE' ? '搜索报名姓名或学号' : '搜索选手昵称'" :placeholder="contest.visibility === 'CAMPUS_PRIVATE' ? '输入报名姓名或学号' : '输入选手昵称'" />
          <button class="arena-button secondary" type="submit">搜索</button>
          <button class="arena-button secondary" type="button" @click="nickname = ''; appliedNickname = ''; selectedId = ''">重置</button>
        </form>
        <button v-if="auth.user" class="arena-button" :class="onlyMine ? 'primary' : 'secondary'" :aria-pressed="onlyMine" @click="onlyMine = !onlyMine; selectedId = ''">仅查看自己的提交</button>
      </div>
      <nav class="submission-pagination" aria-label="提交记录分页">
        <button class="arena-button secondary" :disabled="loading || page <= 1" @click="page--; selectedId = ''">上一页</button>
        <span>第 {{ page }} 页</span>
        <button class="arena-button secondary" :disabled="loading || !!error || data?.page !== page || !data?.hasMore" @click="page++; selectedId = ''">下一页</button>
      </nav>
      <p v-if="error" class="arena-error" role="alert">{{ error }}</p>
      <div class="arena-table-wrap" role="region" aria-label="比赛提交记录列表" tabindex="0">
        <table class="arena-table submissions-table"><thead><tr><th scope="col">时间</th><th scope="col">选手</th><th scope="col"><div class="submission-problem-heading"><span>题目</span><select v-model="problemId" class="submission-problem-filter" aria-label="筛选题目" @change="selectedId = ''">
          <option value="">全部题目</option>
          <option v-for="problem in data?.problems || []" :key="problem.id" :value="problem.id">{{ problem.label }} · {{ problem.title }}</option>
        </select></div></th><th scope="col">语言</th><th scope="col">结果</th><th scope="col">耗时</th><th scope="col">内存</th><th scope="col">详情</th></tr></thead>
          <tbody><tr v-for="submission in data?.items || []" :key="submission.id"><td>{{ timeText(submission.createdAt) }}</td><td>{{ submission.user?.displayName || submission.user?.nickname || submission.user?.username }}</td><td>{{ submission.problem?.label }} · {{ problemDisplayTitle(submission.problem) }}</td><td>{{ submission.language }}</td><td><span class="arena-verdict" :class="verdictClass(submission.status)">{{ statusText(submission.status) }}</span></td><td>{{ submission.timeUsed ?? '—' }} ms</td><td>{{ submission.memoryUsed ?? '—' }} KB</td><td><button class="arena-text-button" @click="selectedId = submission.id">查看</button></td></tr>
            <tr v-if="!data?.items?.length"><td colspan="8"><p class="submission-empty" role="status">{{ loading ? '正在加载提交记录…' : error ? '暂时无法加载提交记录，请重试。' : '暂无提交记录。' }}</p></td></tr>
          </tbody>
        </table>
      </div>
    </template>
    <ContestSubmissionDialog v-if="selectedId" :contest-id="contest.id" :submission-id="selectedId" @close="selectedId = ''" />
  </section>
</template>
<style scoped>
.arena-submissions .arena-section-head { margin-bottom: 0; }
.submission-filter-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-block: 16px; }
.arena-submissions .submission-search { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.arena-submissions .submission-search input { width: 320px; min-width: 0; max-width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid #dbe3eb; border-radius: 8px; background: transparent; color: inherit; }
.submission-filter-toolbar > button { margin-left: auto; }
.submission-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding-block: 16px; color: #667b9a; }
.submission-problem-heading { display: flex; align-items: center; gap: 10px; }
.submission-problem-filter { width: 160px; min-width: 0; padding: 6px 9px; border: 1px solid #ccdbef; border-radius: 7px; background: #fff; color: #435e84; font: inherit; font-weight: 400; text-overflow: ellipsis; }
.submission-problem-filter:focus-visible { outline: 2px solid #2874eb; outline-offset: 2px; }
.submissions-table { min-width: 820px; }
.submission-empty { margin: 12px 0; text-align: center; color: #667b9a; }
.arena-submissions .arena-table-wrap { max-height: min(520px, 55vh); max-height: min(520px, 55dvh); min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.arena-submissions .arena-table-wrap:focus-visible { outline: 2px solid #2874eb; outline-offset: 2px; }
.submissions-table th { position: sticky; top: 0; z-index: 1; }
</style>
