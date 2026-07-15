<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookmarkCheck, BookOpen, CheckCircle2, Flag, LockKeyhole, MessageCircle,
  Send, ThumbsUp, Wrench,
} from '@lucide/vue';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ problemId: string }>();
const auth = useAuthStore();
const router = useRouter();
const activeTab = ref<'DISCUSSION' | 'SOLUTION'>('DISCUSSION');
const posts = ref<any[]>([]);
const content = ref('');
const title = ref('');
const feedbackOpen = ref(false);
const feedback = ref({ type: 'STATEMENT', content: '' });
const loading = ref(false);
const message = ref('');
const error = ref('');
const selectedPost = ref<any | null>(null);
const replyContent = ref('');
const reportOpen = ref(false);
const reportForm = ref({ reason: '剧透或不当内容', detail: '' });

const isSolution = computed(() => activeTab.value === 'SOLUTION');
const canResolveSelectedPost = computed(() => {
  if (!selectedPost.value || selectedPost.value.type === 'SOLUTION') return false;
  return selectedPost.value.authorId === auth.user?.id || auth.isTeacher() || auth.isAdmin();
});

function requireLogin() {
  if (auth.isLoggedIn()) return true;
  void router.push({ path: '/login', query: { redirect: `/problems/${props.problemId}` } });
  return false;
}

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
}

function initials(name?: string) {
  return (name || 'OJ').trim().slice(0, 2).toUpperCase();
}

function replyCount(post: any) {
  return post.replyCount ?? post._count?.replies ?? 0;
}

async function loadPosts() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/community/posts', { params: { problemId: props.problemId, type: activeTab.value } });
    posts.value = data;
  } catch {
    error.value = '讨论内容加载失败。';
  } finally {
    loading.value = false;
  }
}

async function createPost() {
  if (!requireLogin()) return;
  error.value = '';
  message.value = '';
  try {
    await api.post('/api/community/posts', {
      type: activeTab.value,
      problemId: props.problemId,
      title: isSolution.value ? title.value : undefined,
      content: content.value,
      spoilerLevel: isSolution.value ? 'SOLUTION' : 'NONE',
    });
    title.value = '';
    content.value = '';
    message.value = isSolution.value ? '题解已发布，将对未通过本题的同学保持隐藏。' : '讨论已发布。';
    await loadPosts();
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '发布失败。';
  }
}

async function openPost(post: any) {
  if (!requireLogin()) return;
  error.value = '';
  try {
    const { data } = await api.get(`/api/community/posts/${post.id}`);
    selectedPost.value = data;
    replyContent.value = '';
    reportOpen.value = false;
    reportForm.value = { reason: '剧透或不当内容', detail: '' };
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '无法打开内容。';
  }
}

async function createReply() {
  if (!selectedPost.value || !replyContent.value.trim()) return;
  try {
    await api.post(`/api/community/posts/${selectedPost.value.id}/replies`, { content: replyContent.value });
    const { data } = await api.get(`/api/community/posts/${selectedPost.value.id}`);
    selectedPost.value = data;
    replyContent.value = '';
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '回复失败。';
  }
}

async function toggleReaction(post: any) {
  if (!requireLogin()) return;
  try {
    const { data } = await api.post(`/api/community/posts/${post.id}/reaction`);
    post.reactionCount = data.reactionCount;
    post.viewerReacted = data.reacted;
    const source = posts.value.find((item) => item.id === post.id);
    if (source && source !== post) {
      source.reactionCount = data.reactionCount;
      source.viewerReacted = data.reacted;
    }
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '点赞操作失败。';
  }
}

async function toggleResolved() {
  if (!selectedPost.value || !canResolveSelectedPost.value) return;
  try {
    const { data } = await api.patch(`/api/community/posts/${selectedPost.value.id}/resolved`, {
      resolved: !selectedPost.value.isResolved,
    });
    selectedPost.value.isResolved = data.isResolved;
    const source = posts.value.find((item) => item.id === data.id);
    if (source) source.isResolved = data.isResolved;
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '无法更新解决状态。';
  }
}

async function submitReport() {
  if (!selectedPost.value || !requireLogin()) return;
  try {
    await api.post('/api/community/reports', {
      targetType: 'POST',
      targetId: selectedPost.value.id,
      reason: reportForm.value.reason,
      detail: reportForm.value.detail,
    });
    reportOpen.value = false;
    reportForm.value = { reason: '剧透或不当内容', detail: '' };
    message.value = '举报已提交，教师会在审核中心处理。';
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '举报提交失败。';
  }
}

async function submitFeedback() {
  if (!requireLogin()) return;
  try {
    await api.post('/api/community/feedback', { problemId: props.problemId, ...feedback.value });
    feedback.value = { type: 'STATEMENT', content: '' };
    feedbackOpen.value = false;
    message.value = '纠错反馈已提交，处理进度会通过站内通知告知你。';
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '反馈提交失败。';
  }
}

watch(activeTab, () => { void loadPosts(); });
onMounted(() => { void loadPosts(); });
</script>

<template>
  <section class="discussion-panel">
    <div class="panel-header"><div><p>学习服务</p><h2>讨论与反馈</h2></div><button class="feedback-button" type="button" @click="feedbackOpen = !feedbackOpen"><Wrench :size="16" />题目纠错</button></div>
    <p v-if="message" class="message success">{{ message }}</p><p v-if="error" class="message error">{{ error }}</p>
    <div class="discussion-tabs"><button type="button" :class="{ active: activeTab === 'DISCUSSION' }" @click="activeTab = 'DISCUSSION'"><MessageCircle :size="16" />讨论</button><button type="button" :class="{ active: activeTab === 'SOLUTION' }" @click="activeTab = 'SOLUTION'"><BookOpen :size="16" />题解</button></div>
    <form v-if="feedbackOpen" class="feedback-form" @submit.prevent="submitFeedback"><select v-model="feedback.type"><option value="STATEMENT">题面问题</option><option value="SAMPLE">样例问题</option><option value="TESTDATA">测试数据问题</option><option value="OTHER">其他问题</option></select><textarea v-model="feedback.content" maxlength="3000" placeholder="说明题目中发现的问题，并尽量给出可复现的信息" required /><div><button type="button" class="text-button" @click="feedbackOpen = false">取消</button><button class="primary-button" type="submit"><Send :size="15" />提交反馈</button></div></form>
    <form class="post-form" @submit.prevent="createPost"><input v-if="isSolution" v-model="title" maxlength="120" placeholder="题解标题（可选）"><textarea v-model="content" maxlength="12000" :placeholder="isSolution ? '分享你的解题思路。题解会在通过本题前保持隐藏。' : '提出问题、交换思路，避免直接贴出完整答案。'" required /><div class="post-form-actions"><span v-if="isSolution" class="spoiler-note"><LockKeyhole :size="15" />通过本题后可见</span><button class="primary-button" type="submit"><Send :size="15" />{{ isSolution ? '发布题解' : '发布讨论' }}</button></div></form>
    <div v-if="loading" class="empty">正在加载...</div>
    <article v-for="post in posts" :key="post.id" class="discussion-row">
      <button class="discussion-main" type="button" @click="openPost(post)">
        <span class="author-avatar" :title="post.author?.nickname || post.author?.username">{{ initials(post.author?.nickname || post.author?.username) }}</span>
        <span class="row-copy"><span class="row-meta"><span>{{ post.author?.nickname || post.author?.username }}</span><time>{{ formatDate(post.updatedAt) }}</time><span v-if="post.isResolved" class="resolved-label"><BookmarkCheck :size="13" />已解决</span></span><h3>{{ post.title || (isSolution ? '题解分享' : '题目讨论') }}</h3><p v-if="post.contentLocked" class="locked"><LockKeyhole :size="15" />完成题目后可查看完整题解</p><p v-else>{{ post.contentPreview }}</p></span>
      </button>
      <footer class="row-actions"><button type="button" :class="{ reacted: post.viewerReacted }" title="点赞" aria-label="点赞" @click="toggleReaction(post)"><ThumbsUp :size="15" />{{ post.reactionCount || 0 }}</button><button type="button" title="查看回复" aria-label="查看回复" @click="openPost(post)"><MessageCircle :size="15" />{{ replyCount(post) }}</button><span>{{ post.viewCount || 0 }} 浏览</span></footer>
    </article>
    <div v-if="!loading && !posts.length" class="empty">{{ isSolution ? '暂无题解，成为第一个分享思路的人。' : '暂无讨论，提出你的问题或思路。' }}</div>
    <div v-if="selectedPost" class="detail">
      <div class="detail-title"><div><div class="row-meta"><span>{{ selectedPost.author?.nickname || selectedPost.author?.username }}</span><time>{{ formatDate(selectedPost.updatedAt) }}</time><span v-if="selectedPost.isResolved" class="resolved-label"><BookmarkCheck :size="13" />已解决</span></div><h3>{{ selectedPost.title || (selectedPost.type === 'SOLUTION' ? '题解分享' : '题目讨论') }}</h3></div><button class="text-button" type="button" @click="selectedPost = null">收起</button></div>
      <div v-if="selectedPost.contentLocked" class="detail-lock"><LockKeyhole :size="18" /><span>{{ selectedPost.lockReason }}</span></div>
      <template v-else>
        <p class="detail-content">{{ selectedPost.content }}</p>
        <div class="detail-actions"><button type="button" :class="{ reacted: selectedPost.viewerReacted }" title="点赞" aria-label="点赞" @click="toggleReaction(selectedPost)"><ThumbsUp :size="16" />{{ selectedPost.reactionCount || 0 }}</button><button v-if="canResolveSelectedPost" type="button" :class="{ resolved: selectedPost.isResolved }" :title="selectedPost.isResolved ? '取消已解决标记' : '标记为已解决'" :aria-label="selectedPost.isResolved ? '取消已解决标记' : '标记为已解决'" @click="toggleResolved"><CheckCircle2 :size="16" /></button><button type="button" title="举报内容" aria-label="举报内容" @click="reportOpen = !reportOpen"><Flag :size="16" /></button></div>
        <form v-if="reportOpen" class="report-form" @submit.prevent="submitReport"><select v-model="reportForm.reason"><option>剧透或不当内容</option><option>人身攻击或骚扰</option><option>无关广告或灌水</option><option>其他违规内容</option></select><textarea v-model="reportForm.detail" maxlength="1000" placeholder="补充说明（可选）" /><div><button class="text-button" type="button" @click="reportOpen = false">取消</button><button class="report-button" type="submit"><Flag :size="14" />提交举报</button></div></form>
        <div class="replies"><h4>回复 · {{ selectedPost.replyCount || selectedPost._count?.replies || 0 }}</h4><article v-for="reply in selectedPost.replies" :key="reply.id"><b>{{ reply.author?.nickname || reply.author?.username }}</b><p>{{ reply.content }}</p><time>{{ formatDate(reply.createdAt) }}</time></article><form @submit.prevent="createReply"><textarea v-model="replyContent" maxlength="4000" placeholder="回复这条内容" required /><button class="primary-button" type="submit"><Send :size="15" />回复</button></form></div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.discussion-panel { margin-top: 22px; padding: 20px; border: 1px solid #d7e0e9; border-radius: 7px; background: #fff; box-shadow: 0 6px 18px rgba(20, 37, 56, .035); }.panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.panel-header p { margin: 0 0 4px; color: #0b766e; font-size: 11px; font-weight: 800; }.panel-header h2 { margin: 0; color: #1f2d3d; font-size: 19px; }.feedback-button, .text-button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #0b766e; font: inherit; cursor: pointer; }.discussion-tabs { display: flex; gap: 4px; margin: 17px 0; border-bottom: 1px solid #e4e9ef; }.discussion-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 11px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #667085; font: inherit; cursor: pointer; }.discussion-tabs button.active { border-color: #0b766e; color: #0b766e; font-weight: 800; }.post-form, .feedback-form, .report-form { display: grid; gap: 9px; padding: 13px; border: 1px solid #cde1da; border-radius: 5px; background: #f7fbfa; }.post-form input, .post-form textarea, .feedback-form select, .feedback-form textarea, .report-form select, .report-form textarea, .replies textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #1f2937; font: inherit; }.post-form input, .feedback-form select, .report-form select { min-height: 36px; padding: 0 9px; }.post-form textarea, .feedback-form textarea, .report-form textarea, .replies textarea { min-height: 88px; padding: 9px; resize: vertical; }.post-form-actions, .feedback-form > div, .report-form > div { display: flex; align-items: center; justify-content: space-between; gap: 9px; }.primary-button, .report-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 11px; border: 0; border-radius: 4px; background: #0b766e; color: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }.primary-button:hover { background: #075d57; }.report-button { background: #9b3d22; }.report-button:hover { background: #7d2f1a; }.spoiler-note, .locked { display: inline-flex; align-items: center; gap: 5px; color: #906b18; font-size: 12px; }.discussion-row { border-bottom: 1px solid #edf1f5; }.discussion-row:hover { background: #fbfdfd; }.discussion-main { display: flex; width: 100%; gap: 11px; padding: 15px 2px 8px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }.discussion-main:hover h3 { color: #0b766e; }.author-avatar { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; border: 1px solid #a7d1c7; border-radius: 5px; background: #e3f3ee; color: #0a675f; font-size: 11px; font-weight: 800; }.row-copy { min-width: 0; flex: 1; }.row-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: #7b8794; font-size: 12px; }.resolved-label { display: inline-flex; align-items: center; gap: 3px; color: #08775e; font-weight: 700; }.discussion-row h3 { margin: 7px 0 5px; color: #344054; font-size: 15px; }.discussion-row p { margin: 0; color: #667085; line-height: 1.55; white-space: pre-wrap; }.row-actions, .detail-actions { display: flex; align-items: center; gap: 12px; padding: 0 0 12px 43px; color: #98a2b3; font-size: 12px; }.row-actions button, .detail-actions button { display: inline-flex; align-items: center; gap: 5px; min-height: 27px; padding: 0 4px; border: 0; border-radius: 3px; background: transparent; color: #7b8794; font: inherit; font-size: 12px; cursor: pointer; }.row-actions button:hover, .detail-actions button:hover { background: #edf7f4; color: #08775e; }.row-actions button.reacted, .detail-actions button.reacted { background: #fff5eb; color: #c35c18; }.detail-actions button.resolved { background: #e6f6ef; color: #08775e; }.empty { padding: 26px 0; color: #7b8794; text-align: center; }.message { margin: 12px 0; padding: 8px 10px; border-radius: 5px; font-size: 13px; }.success { background: #ecfdf3; color: #067647; }.error { background: #fff1f2; color: #b42318; }.detail { margin-top: 16px; padding: 15px; border: 1px solid #cde1da; border-radius: 6px; background: #fbfefc; }.detail-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 9px; }.detail-title h3 { margin: 6px 0 0; color: #253346; }.detail-content { margin: 13px 0; color: #344054; line-height: 1.7; white-space: pre-wrap; }.detail-actions { padding: 0 0 12px; border-bottom: 1px solid #e4e9ef; }.detail-lock { display: flex; gap: 9px; align-items: flex-start; margin-top: 13px; padding: 12px; border: 1px solid #efd19b; border-radius: 5px; background: #fff9e9; color: #7a4e00; line-height: 1.5; }.report-form { margin-top: 12px; border-color: #eccfc5; background: #fffaf8; }.replies { margin-top: 16px; padding-top: 14px; border-top: 1px solid #e4e7ec; }.replies h4 { margin: 0 0 8px; color: #344054; }.replies article { padding: 10px 0; border-bottom: 1px solid #edf1f5; }.replies article p { margin: 5px 0; color: #475467; white-space: pre-wrap; }.replies time { color: #98a2b3; font-size: 11px; }.replies form { display: grid; gap: 8px; margin-top: 12px; }.replies .primary-button { justify-self: end; } @media (max-width: 640px) { .discussion-panel { padding: 15px; }.panel-header { align-items: flex-start; }.post-form-actions { align-items: flex-start; flex-direction: column; }.post-form-actions .primary-button { align-self: flex-end; }.row-actions { padding-left: 43px; }.detail-title { align-items: flex-start; }.feedback-button { white-space: nowrap; } }
</style>
