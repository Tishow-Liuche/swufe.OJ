<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, BookOpen, MessageCircle, PenLine, Send, Wrench } from '@lucide/vue';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{
  problemId: string;
  problemTitle: string;
  /** Optional: parent can pass PASSED state to avoid an extra request. */
  solved?: boolean;
}>();
const router = useRouter();
const auth = useAuthStore();
const feedbackOpen = ref(false);
const feedback = ref({ type: 'STATEMENT', content: '' });
const message = ref('');
const error = ref('');
const hasSolved = ref(Boolean(props.solved));
const checkingSolved = ref(false);

const isModerator = computed(() => auth.isTeacher() || auth.isAdmin());
const canWriteSolution = computed(() => {
  if (!auth.isLoggedIn()) return false;
  if (isModerator.value) return true;
  return hasSolved.value;
});
const writeSolutionHint = computed(() => {
  if (!auth.isLoggedIn()) return '登录并完成本题后可写题解。';
  if (isModerator.value) return '教师 / 管理员可直接发布本题题解。';
  if (hasSolved.value) return '你已通过本题，可以撰写题解复盘。';
  return '通过本题（Accepted）后可写题解。';
});

function openCommunity(panel: 'feed' | 'solutions', compose = false) {
  void router.push({
    path: '/community',
    query: {
      panel,
      problemId: props.problemId,
      problemTitle: props.problemTitle,
      ...(compose ? { compose: '1' } : {}),
    },
  });
}

function requireLogin() {
  if (auth.isLoggedIn()) return true;
  void router.push({ path: '/login', query: { redirect: `/problems/${props.problemId}` } });
  return false;
}

async function refreshSolvedState() {
  if (typeof props.solved === 'boolean') {
    hasSolved.value = props.solved;
    return;
  }
  if (!auth.isLoggedIn()) {
    hasSolved.value = false;
    return;
  }
  if (isModerator.value) {
    hasSolved.value = true;
    return;
  }
  checkingSolved.value = true;
  try {
    const { data } = await api.get(`/api/learning/problem-states/${props.problemId}`);
    hasSolved.value = data?.status === 'PASSED';
  } catch {
    hasSolved.value = false;
  } finally {
    checkingSolved.value = false;
  }
}

function writeSolution() {
  if (!requireLogin()) return;
  if (!canWriteSolution.value) {
    error.value = writeSolutionHint.value;
    return;
  }
  openCommunity('solutions', true);
}

watch(() => props.solved, (value) => {
  if (typeof value === 'boolean') hasSolved.value = value;
});
watch(() => props.problemId, () => { void refreshSolvedState(); });
onMounted(() => { void refreshSolvedState(); });

async function submitFeedback() {
  if (!requireLogin()) return;
  message.value = '';
  error.value = '';
  try {
    await api.post('/api/community/feedback', { problemId: props.problemId, ...feedback.value });
    feedback.value = { type: 'STATEMENT', content: '' };
    feedbackOpen.value = false;
    message.value = '题目反馈已提交，处理进度会通过站内通知返回。';
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '反馈提交失败。';
  }
}
</script>

<template>
  <section class="problem-community" aria-labelledby="problem-community-title">
    <header class="community-header">
      <div>
        <p>题目社区</p>
        <h2 id="problem-community-title">交流与题解</h2>
      </div>
      <button class="feedback-trigger" type="button" @click="feedbackOpen = !feedbackOpen">
        <Wrench :size="16" />题目纠错
      </button>
    </header>

    <p v-if="message" class="notice success">{{ message }}</p>
    <p v-if="error" class="notice error">{{ error }}</p>

    <div class="community-entries">
      <article class="community-entry">
        <span class="entry-icon discussion"><MessageCircle :size="20" /></span>
        <div>
          <p class="entry-kicker">题目讨论</p>
          <h3>在社区继续交流</h3>
          <p>提问、补充思路或参与已有讨论，所有内容都会关联到当前题目。</p>
          <button type="button" @click="openCommunity('feed', true)">进入讨论 <ArrowRight :size="15" /></button>
        </div>
      </article>

      <article class="community-entry">
        <span class="entry-icon solution"><BookOpen :size="20" /></span>
        <div>
          <p class="entry-kicker">题解复盘</p>
          <h3>查看本题题解</h3>
          <p>题解统一在社区阅读，通过本题后可查看完整内容并参与回复。</p>
          <button type="button" @click="openCommunity('solutions')">查看题解 <ArrowRight :size="15" /></button>
        </div>
      </article>
      <article class="community-entry write-solution">
        <span class="entry-icon write"><PenLine :size="20" /></span>
        <div>
          <p class="entry-kicker">发布题解</p>
          <h3>{{ canWriteSolution ? '写本题题解' : '题解发布条件' }}</h3>
          <p>{{ writeSolutionHint }}</p>
          <button
            type="button"
            :disabled="checkingSolved || (auth.isLoggedIn() && !canWriteSolution)"
            @click="writeSolution"
          >
            <PenLine :size="15" />
            {{ canWriteSolution ? '去写题解' : (auth.isLoggedIn() ? '尚未通过' : '登录后查看') }}
            <ArrowRight :size="15" />
          </button>
        </div>
      </article>
    </div>

    <form v-if="feedbackOpen" class="feedback-form" @submit.prevent="submitFeedback">
      <select v-model="feedback.type">
        <option value="STATEMENT">题面问题</option>
        <option value="SAMPLE">样例问题</option>
        <option value="TESTDATA">测试数据问题</option>
        <option value="OTHER">其他问题</option>
      </select>
      <textarea v-model="feedback.content" maxlength="3000" placeholder="说明发现的问题，并尽量给出可复现的信息" required />
      <footer>
        <button class="plain-button" type="button" @click="feedbackOpen = false">取消</button>
        <button class="submit-button" type="submit"><Send :size="15" />提交反馈</button>
      </footer>
    </form>
  </section>
</template>

<style scoped>
.problem-community {
  margin-top: 4px;
  padding: 16px 18px;
  border: 1px solid #dfe7ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(23, 59, 102, .04);
}
.community-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.community-header p,
.entry-kicker {
  margin: 0;
  color: #2f6fa8;
  font-size: 11px;
  font-weight: 900;
}
.community-header h2 {
  margin: 4px 0 0;
  color: #1f3145;
  font-size: 18px;
}
.feedback-trigger,
.plain-button,
.submit-button,
.community-entry button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  font: inherit;
  cursor: pointer;
}
.feedback-trigger {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #d4dce5;
  border-radius: 8px;
  color: #526579;
  background: #f7fafd;
  font-size: 12px;
  font-weight: 750;
}
.feedback-trigger:hover { border-color: #9fc0de; color: #2469ad; background: #edf5fc; }
.community-entries {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 900px) {
  .community-entries { grid-template-columns: 1fr; }
}
.community-entry {
  display: flex;
  gap: 12px;
  min-height: 0;
  padding: 14px;
  border: 1px solid #e3ebf2;
  border-radius: 10px;
  background: #f8fbfe;
}
.entry-icon {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 9px;
}
.entry-icon.discussion { color: #2469ad; background: #e5f0fb; }
.entry-icon.solution { color: #5267a5; background: #edf1fb; }
.entry-icon.write { color: #0f766e; background: #e7f8f4; }
.community-entry button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.community-entry div { min-width: 0; }
.community-entry h3 {
  margin: 4px 0 6px;
  color: #24384f;
  font-size: 14px;
}
.community-entry p:not(.entry-kicker) {
  margin: 0;
  color: #66788c;
  font-size: 12px;
  line-height: 1.55;
}
.community-entry button {
  margin-top: 10px;
  padding: 0;
  color: #2469ad;
  background: transparent;
  font-size: 12px;
  font-weight: 800;
}
.community-entry button:hover { color: #174f84; }
.notice {
  margin: 0 0 12px;
  padding: 9px 11px;
  border-radius: 7px;
  font-size: 13px;
}
.notice.success { background: #eaf8f1; color: #087447; }
.notice.error { background: #fff1f2; color: #b42318; }
.feedback-form {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 14px;
  border: 1px solid #d7e5f0;
  border-radius: 10px;
  background: #f5f9fd;
}
.feedback-form select,
.feedback-form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd7e1;
  border-radius: 7px;
  background: #fff;
  color: #253447;
  font: inherit;
}
.feedback-form select { min-height: 36px; padding: 0 9px; }
.feedback-form textarea { min-height: 94px; padding: 9px; resize: vertical; }
.feedback-form footer { display: flex; justify-content: flex-end; gap: 8px; }
.plain-button { padding: 8px 11px; color: #607287; background: transparent; }
.submit-button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 7px;
  color: #fff;
  background: #2469ad;
  font-weight: 800;
}
.submit-button:hover { background: #1d5a96; }
@media (max-width: 720px) {
  .community-entries { grid-template-columns: 1fr; }
  .community-header { align-items: center; }
}
</style>
