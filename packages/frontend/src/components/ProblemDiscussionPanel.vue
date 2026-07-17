<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, BookOpen, MessageCircle, Send, Wrench } from '@lucide/vue';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ problemId: string; problemTitle: string }>();
const router = useRouter();
const auth = useAuthStore();
const feedbackOpen = ref(false);
const feedback = ref({ type: 'STATEMENT', content: '' });
const message = ref('');
const error = ref('');

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
.problem-community { margin-top: 30px; border-top: 1px solid #dce5eb; padding-top: 24px; }
.community-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.community-header p, .entry-kicker { margin: 0; color: #087a70; font-size: 12px; font-weight: 800; }
.community-header h2 { margin: 5px 0 0; color: #203247; font-size: 21px; }
.feedback-trigger, .plain-button, .submit-button, .community-entry button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; font: inherit; cursor: pointer; }
.feedback-trigger { padding: 7px 4px; background: transparent; color: #087a70; font-weight: 700; }
.community-entries { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.community-entry { display: flex; gap: 13px; min-height: 170px; padding: 18px; border: 1px solid #d7e3e8; border-radius: 6px; background: #f9fbfc; }
.entry-icon { display: grid; flex: 0 0 40px; width: 40px; height: 40px; place-items: center; border-radius: 5px; }
.entry-icon.discussion { background: #e4f4f1; color: #087a70; }
.entry-icon.solution { background: #edf1fb; color: #5267a5; }
.community-entry div { min-width: 0; }
.community-entry h3 { margin: 5px 0 7px; color: #2a3b50; font-size: 16px; }
.community-entry p:not(.entry-kicker) { margin: 0; color: #66788c; font-size: 13px; line-height: 1.6; }
.community-entry button { margin-top: 14px; padding: 0; background: transparent; color: #087a70; font-size: 13px; font-weight: 800; }
.community-entry button:hover, .feedback-trigger:hover { color: #055f57; }
.notice { margin: 0 0 12px; padding: 9px 11px; border-radius: 5px; font-size: 13px; }
.notice.success { background: #eaf8f1; color: #087447; }
.notice.error { background: #fff1f2; color: #b42318; }
.feedback-form { display: grid; gap: 10px; margin-top: 14px; padding: 14px; border: 1px solid #cce0dc; border-radius: 6px; background: #f5fbf9; }
.feedback-form select, .feedback-form textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd7e1; border-radius: 4px; background: #fff; color: #253447; font: inherit; }
.feedback-form select { min-height: 36px; padding: 0 9px; }
.feedback-form textarea { min-height: 94px; padding: 9px; resize: vertical; }
.feedback-form footer { display: flex; justify-content: flex-end; gap: 8px; }
.plain-button { padding: 8px 11px; background: transparent; color: #607287; }
.submit-button { min-height: 34px; padding: 0 12px; border-radius: 4px; background: #087a70; color: #fff; font-weight: 800; }
.submit-button:hover { background: #05645c; }
@media (max-width: 720px) { .community-entries { grid-template-columns: 1fr; } .community-header { align-items: center; } }
</style>
