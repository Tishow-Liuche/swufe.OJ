<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRoute, useRouter } from 'vue-router';
import {
  Bell, BookmarkCheck, Check, ChevronRight, CircleHelp, FileWarning, Flame,
  LockKeyhole, Megaphone, MessageCircle, MessageSquarePlus, PanelLeftClose,
  PanelLeftOpen, Search, Send, ShieldCheck, ThumbsUp, Users, X,
} from '@lucide/vue';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import FilterSelect from '../components/FilterSelect.vue';

type Panel = 'feed' | 'solutions' | 'announcements' | 'help';
type Post = Record<string, any>;

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const panel = ref<Panel>('feed');
const scopedProblemId = computed(() => {
  const value = route.query.problemId;
  return Array.isArray(value) ? value[0] : value;
});
const scopedProblemTitle = computed(() => {
  const value = route.query.problemTitle;
  return Array.isArray(value) ? value[0] : value;
});
const communitySidebarCollapsed = useStorage('swufe-oj:community-sidebar-collapsed', false);
const sort = ref<'LATEST' | 'HOT' | 'UNANSWERED'>('LATEST');
const category = ref('');
const keyword = ref('');
const posts = ref<Post[]>([]);
const announcements = ref<any[]>([]);
const notifications = ref<any[]>([]);
const unreadCount = ref(0);
const selectedPost = ref<any | null>(null);
const showComposer = ref(false);
const showAnnouncementComposer = ref(false);
const notificationsOpen = ref(false);
const moderationOpen = ref(false);
const reports = ref<any[]>([]);
const feedbacks = ref<any[]>([]);
const loading = ref(false);
const feedbackMessage = ref('');
const errorMessage = ref('');
const replyContent = ref('');
const postForm = ref({ title: '', content: '', category: '学习交流' });
const announcementForm = ref({ title: '', content: '', isPinned: false });

const isModerator = computed(() => auth.isTeacher() || auth.isAdmin());
const isFeed = computed(() => panel.value === 'feed' || panel.value === 'solutions');
const feedTitle = computed(() => panel.value === 'solutions' ? '题解复盘' : (scopedProblemId.value ? '题目讨论' : '学习讨论'));
const feedDescription = computed(() => panel.value === 'solutions'
  ? '题解以通过题目后解锁为默认规则，保留独立思考空间。'
  : scopedProblemId.value
    ? '围绕当前题目交流思路、提问和回复，内容会集中归档到题目社区。'
    : '提问、拆解思路、分享训练经验。题目内讨论请在对应题目页发起。');
const authorName = computed(() => auth.user?.nickname || auth.user?.username || '未登录');
const categoryOptions = ['全部', '学习交流', '算法讨论', '平台建议', '组队交流'];
const composerCategoryOptions = categoryOptions.slice(1).map((item) => ({ value: item, label: item }));
const topicFilterOptions = [
  { value: '', label: '全部话题' },
  ...composerCategoryOptions,
];

function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function initials(value?: string) {
  const text = (value || 'OJ').trim();
  return text.slice(0, 2).toUpperCase();
}

function requireLogin() {
  if (auth.isLoggedIn()) return true;
  void router.push({ path: '/login', query: { redirect: route.fullPath } });
  return false;
}

function applyRouteScope() {
  const requestedPanel = Array.isArray(route.query.panel) ? route.query.panel[0] : route.query.panel;
  if (requestedPanel === 'feed' || requestedPanel === 'solutions') panel.value = requestedPanel;
  const requestedComposer = Array.isArray(route.query.compose) ? route.query.compose[0] : route.query.compose;
  showComposer.value = panel.value === 'feed' && requestedComposer === '1';
}

function resetMessage() {
  feedbackMessage.value = '';
  errorMessage.value = '';
}

async function loadPosts() {
  if (!isFeed.value) return;
  loading.value = true;
  try {
    const { data } = await api.get('/api/community/posts', {
      params: {
        type: panel.value === 'solutions' ? 'SOLUTION' : 'FORUM',
        problemId: scopedProblemId.value || undefined,
        sort: sort.value,
        category: category.value || undefined,
        keyword: keyword.value.trim() || undefined,
      },
    });
    posts.value = data;
  } catch {
    errorMessage.value = '社区内容暂时无法加载，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

async function loadAnnouncements() {
  try {
    const { data } = await api.get('/api/community/announcements');
    announcements.value = data;
  } catch {
    errorMessage.value = '公告暂时无法加载。';
  }
}

async function loadNotifications() {
  if (!auth.isLoggedIn()) return;
  try {
    const { data } = await api.get('/api/community/notifications');
    notifications.value = data.items;
    unreadCount.value = data.unread;
  } catch {
    notifications.value = [];
    unreadCount.value = 0;
  }
}

async function switchPanel(nextPanel: Panel) {
  panel.value = nextPanel;
  resetMessage();
  if (nextPanel === 'announcements') await loadAnnouncements();
  if (nextPanel === 'feed' || nextPanel === 'solutions') await loadPosts();
}

async function openDiscussionComposer() {
  const needsFeedReload = panel.value !== 'feed';
  panel.value = 'feed';
  showComposer.value = true;
  resetMessage();
  if (needsFeedReload) await loadPosts();
  await nextTick();
  document.querySelector('.discussion-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function publishPost() {
  if (!requireLogin()) return;
  resetMessage();
  try {
    await api.post('/api/community/posts', {
      type: 'FORUM',
      problemId: scopedProblemId.value || undefined,
      ...postForm.value,
    });
    postForm.value = { title: '', content: '', category: '学习交流' };
    showComposer.value = false;
    feedbackMessage.value = '已发布到学习社区。';
    await loadPosts();
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '发布失败。';
  }
}

async function openPost(post: Post) {
  if (!requireLogin()) return;
  resetMessage();
  try {
    const { data } = await api.get(`/api/community/posts/${post.id}`);
    selectedPost.value = data;
    replyContent.value = '';
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '无法打开该内容。';
  }
}

async function openPostFromRoute(postId: unknown) {
  const id = Array.isArray(postId) ? postId[0] : postId;
  if (!id) return;
  if (!auth.isLoggedIn() && auth.token) await auth.fetchProfile();
  if (!auth.isLoggedIn()) return;
  applyRouteScope();
  await openPost({ id: String(id) });
}

function closePost() {
  selectedPost.value = null;
  if (!route.query.post) return;
  const query = { ...route.query };
  delete query.post;
  void router.replace({ query });
}

async function toggleReaction(post: any) {
  if (!requireLogin()) return;
  try {
    const { data } = await api.post(`/api/community/posts/${post.id}/reaction`);
    post.reactionCount = data.reactionCount;
    post.viewerReacted = data.reacted;
    const source = posts.value.find((item) => item.id === post.id);
    if (source) {
      source.reactionCount = data.reactionCount;
      source.viewerReacted = data.reacted;
    }
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '操作失败。';
  }
}

async function replyToPost() {
  if (!selectedPost.value || !replyContent.value.trim()) return;
  try {
    await api.post(`/api/community/posts/${selectedPost.value.id}/replies`, { content: replyContent.value });
    const { data } = await api.get(`/api/community/posts/${selectedPost.value.id}`);
    selectedPost.value = data;
    replyContent.value = '';
    await loadNotifications();
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '回复失败。';
  }
}

async function resolvePost() {
  if (!selectedPost.value) return;
  try {
    const { data } = await api.patch(`/api/community/posts/${selectedPost.value.id}/resolved`, { resolved: !selectedPost.value.isResolved });
    selectedPost.value.isResolved = data.isResolved;
    const source = posts.value.find((item) => item.id === data.id);
    if (source) source.isResolved = data.isResolved;
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '更新状态失败。';
  }
}

async function publishAnnouncement() {
  resetMessage();
  try {
    await api.post('/api/community/announcements', { ...announcementForm.value, audience: 'ALL' });
    announcementForm.value = { title: '', content: '', isPinned: false };
    showAnnouncementComposer.value = false;
    feedbackMessage.value = '公告已发布。';
    await loadAnnouncements();
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '公告发布失败。';
  }
}

async function markNotificationRead(notification: any) {
  if (!notification.readAt) {
    await api.patch(`/api/community/notifications/${notification.id}/read`);
    notification.readAt = new Date().toISOString();
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }
  notificationsOpen.value = false;
  if (notification.link) void router.push(notification.link);
}

async function toggleModeration() {
  if (!isModerator.value) return;
  moderationOpen.value = !moderationOpen.value;
  if (!moderationOpen.value) return;
  const [reportResponse, feedbackResponse] = await Promise.all([
    api.get('/api/community/moderation/reports', { params: { status: 'OPEN' } }),
    api.get('/api/community/moderation/feedback', { params: { status: 'OPEN' } }),
  ]);
  reports.value = reportResponse.data;
  feedbacks.value = feedbackResponse.data;
}

async function handleReport(report: any, hideTarget: boolean) {
  await api.patch(`/api/community/moderation/reports/${report.id}`, {
    status: 'RESOLVED', hideTarget,
    reviewerNote: hideTarget ? '内容已隐藏并完成处理。' : '已审核，当前不隐藏内容。',
  });
  reports.value = reports.value.filter((item) => item.id !== report.id);
}

async function handleFeedback(item: any) {
  await api.patch(`/api/community/moderation/feedback/${item.id}`, {
    status: 'IN_PROGRESS', reviewerNote: '已收到，正在核实题目内容。',
  });
  feedbacks.value = feedbacks.value.filter((feedback) => feedback.id !== item.id);
}

watch([sort, category], () => { void loadPosts(); });
watch(() => [route.query.panel, route.query.problemId, route.query.problemTitle, route.query.compose], () => {
  applyRouteScope();
  void loadPosts();
});
watch(() => route.query.post, (postId, previousPostId) => {
  if (postId && postId !== previousPostId) void openPostFromRoute(postId);
});
onMounted(async () => {
  applyRouteScope();
  await Promise.all([loadPosts(), loadAnnouncements(), loadNotifications()]);
  await openPostFromRoute(route.query.post);
});
</script>

<template>
  <div class="community-hub" :class="{ 'sidebar-collapsed': communitySidebarCollapsed }">
    <aside class="community-nav">
      <div class="community-nav-title"><span class="community-nav-icon"><Users :size="19" /></span><span class="community-nav-copy"><strong>社区导航</strong><small>交流与共学</small></span><button class="community-nav-collapse" type="button" :title="communitySidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-label="communitySidebarCollapsed ? '展开社区侧栏' : '收起社区侧栏'" @click="communitySidebarCollapsed = !communitySidebarCollapsed"><PanelLeftOpen v-if="communitySidebarCollapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button></div>
      <p class="nav-caption">社区模块</p>
      <button type="button" :title="communitySidebarCollapsed ? '学习讨论' : undefined" :class="{ active: panel === 'feed' }" @click="switchPanel('feed')"><MessageCircle :size="18" /><span><strong>学习讨论</strong><small>提问与交流</small></span></button>
      <button type="button" :title="communitySidebarCollapsed ? '题解复盘' : undefined" :class="{ active: panel === 'solutions' }" @click="switchPanel('solutions')"><LockKeyhole :size="18" /><span><strong>题解复盘</strong><small>通过后解锁</small></span></button>
      <button type="button" :title="communitySidebarCollapsed ? '平台公告' : undefined" :class="{ active: panel === 'announcements' }" @click="switchPanel('announcements')"><Megaphone :size="18" /><span><strong>平台公告</strong><small>规则与动态</small></span><b>{{ announcements.length }}</b></button>
      <button type="button" :title="communitySidebarCollapsed ? '帮助中心' : undefined" :class="{ active: panel === 'help' }" @click="switchPanel('help')"><CircleHelp :size="18" /><span><strong>帮助中心</strong><small>使用指引</small></span></button>
      <div class="nav-rule"></div>
      <button class="create-discussion" type="button" title="发起讨论" @click="openDiscussionComposer"><MessageSquarePlus :size="18" /><span><strong>发起讨论</strong><small>发布新话题</small></span></button>
      <p class="signed-state"><Users :size="15" /><span>{{ auth.isLoggedIn() ? `当前：${authorName}` : '登录后可发帖、点赞和回复' }}</span></p>
    </aside>

    <main class="community-main">
      <header class="community-topbar">
      <div class="brand-block"><p>WESTFIN OJ · LEARNING NETWORK</p><div class="brand-title-row"><h1>社区工作台</h1><span><i></i>实时同步</span></div></div>
      <div class="topbar-actions">
        <div class="search-field"><Search :size="17" /><input v-model="keyword" type="search" placeholder="搜索帖子、关键词" @keyup.enter="loadPosts"></div>
        <div class="notification-anchor"><button class="icon-command" type="button" title="站内通知" @click="notificationsOpen = !notificationsOpen"><Bell :size="19" /><span v-if="unreadCount" class="counter">{{ unreadCount > 9 ? '9+' : unreadCount }}</span></button><div v-if="notificationsOpen" class="notification-popover"><header>站内通知</header><button v-for="item in notifications" :key="item.id" type="button" :class="{ unread: !item.readAt }" @click="markNotificationRead(item)"><strong>{{ item.title }}</strong><span>{{ item.content || '点击查看' }}</span><time>{{ formatDate(item.createdAt) }}</time></button><p v-if="!notifications.length">暂无新通知</p></div></div>
        <button v-if="isModerator" class="icon-command" type="button" title="审核中心" @click="toggleModeration"><ShieldCheck :size="19" /></button>
      </div>
    </header>

    <p v-if="feedbackMessage" class="toast success"><Check :size="16" />{{ feedbackMessage }}</p>
    <p v-if="errorMessage" class="toast error"><FileWarning :size="16" />{{ errorMessage }}</p>

      <div class="community-layout">
      <section class="community-feed">
        <template v-if="isFeed">
          <div v-if="scopedProblemId" class="problem-scope">
            <div><span>当前题目</span><strong>{{ scopedProblemTitle || '题目社区' }}</strong></div>
            <div class="scope-actions">
              <button type="button" @click="router.push(`/problems/${scopedProblemId}`)">返回题面</button>
              <button type="button" @click="router.replace({ path: '/community', query: { panel } })">查看全部社区</button>
            </div>
          </div>
          <div class="feed-heading"><div><p class="section-kicker">{{ panel === 'solutions' ? '通过后解锁' : '学习社区' }}</p><h2>{{ feedTitle }}</h2><p>{{ feedDescription }}</p></div><button v-if="panel === 'feed'" class="primary-command" type="button" @click="showComposer = !showComposer"><MessageSquarePlus :size="17" />发起讨论</button></div>
          <form v-if="showComposer && panel === 'feed'" class="discussion-composer" @submit.prevent="publishPost"><input v-model="postForm.title" maxlength="120" placeholder="用一句话说清你的讨论主题" required><div><FilterSelect v-model="postForm.category" class="composer-category-select" :options="composerCategoryOptions" label="讨论分类" /><span>公开发布，请勿在普通讨论区直接公布完整题解。</span></div><textarea v-model="postForm.content" maxlength="12000" placeholder="描述背景、尝试过的方法或你的思路" required /><footer><button type="button" class="plain-command" @click="showComposer = false">取消</button><button class="primary-command" type="submit"><Send :size="16" />发布</button></footer></form>
          <div class="feed-toolbar"><div class="sort-tabs"><button type="button" :class="{ active: sort === 'LATEST' }" @click="sort = 'LATEST'">最新</button><button type="button" :class="{ active: sort === 'HOT' }" @click="sort = 'HOT'"><Flame :size="15" />热门</button><button type="button" :class="{ active: sort === 'UNANSWERED' }" @click="sort = 'UNANSWERED'">未回复</button></div><FilterSelect v-model="category" class="topic-filter-select" :options="topicFilterOptions" label="话题筛选" /></div>
          <div v-if="loading" class="empty-feed">正在加载社区内容...</div>
          <article v-for="post in posts" :key="post.id" class="feed-post"><button class="post-body" type="button" @click="openPost(post)"><div class="author-avatar" :title="post.author?.nickname || post.author?.username">{{ initials(post.author?.nickname || post.author?.username) }}</div><div class="post-copy"><div class="post-labels"><span>{{ post.category || (post.type === 'SOLUTION' ? '题解复盘' : '学习交流') }}</span><span v-if="post.problem" class="problem-link">关联题目：{{ post.problem.title }}</span><span v-if="post.isResolved" class="resolved"><BookmarkCheck :size="13" />已解决</span><span v-if="post.contentLocked" class="locked"><LockKeyhole :size="13" />通过后可见</span></div><h3>{{ post.title || (post.type === 'SOLUTION' ? '题解复盘' : '题目讨论') }}</h3><p>{{ post.contentPreview }}</p><footer><span>{{ post.author?.nickname || post.author?.username }}</span><span class="author-separator"></span><time>{{ formatDate(post.updatedAt) }}</time></footer></div></button><div class="post-metrics"><button type="button" :class="{ reacted: post.viewerReacted }" title="点赞" @click="toggleReaction(post)"><ThumbsUp :size="16" />{{ post.reactionCount || 0 }}</button><button type="button" title="查看回复" @click="openPost(post)"><MessageCircle :size="16" />{{ post.replyCount || 0 }}</button><span>{{ post.viewCount || 0 }} 浏览</span></div></article>
          <div v-if="!loading && !posts.length" class="empty-feed"><MessageCircle :size="26" /><b>{{ panel === 'solutions' ? '暂无可展示的题解' : '还没有讨论' }}</b><span>{{ panel === 'solutions' ? '在题目页通过题目后可发布题解。' : '发起一个有上下文的问题，通常更容易获得有效回复。' }}</span></div>
        </template>

        <template v-else-if="panel === 'announcements'">
          <div class="feed-heading"><div><p class="section-kicker">平台动态</p><h2>公告</h2><p>课程安排、功能更新和社区规则会在这里发布。</p></div><button v-if="isModerator" class="primary-command" type="button" @click="showAnnouncementComposer = !showAnnouncementComposer"><Megaphone :size="17" />发布公告</button></div>
          <form v-if="showAnnouncementComposer" class="discussion-composer" @submit.prevent="publishAnnouncement"><input v-model="announcementForm.title" maxlength="120" placeholder="公告标题" required><label class="pin-option"><input v-model="announcementForm.isPinned" type="checkbox">置顶显示</label><textarea v-model="announcementForm.content" maxlength="6000" placeholder="面向全体用户发布的公告正文" required /><footer><button type="button" class="plain-command" @click="showAnnouncementComposer = false">取消</button><button class="primary-command" type="submit"><Megaphone :size="16" />发布</button></footer></form>
          <article v-for="item in announcements" :key="item.id" class="announcement-item"><div class="announcement-mark"><Megaphone :size="18" /></div><div><header><h3>{{ item.title }}</h3><span v-if="item.isPinned">置顶</span></header><p>{{ item.content }}</p><footer>{{ item.author?.nickname || item.author?.username }} · {{ formatDate(item.publishAt) }}</footer></div></article><div v-if="!announcements.length" class="empty-feed"><Megaphone :size="26" />暂无公告</div>
        </template>

        <template v-else>
          <div class="feed-heading"><div><p class="section-kicker">快速上手</p><h2>帮助中心</h2><p>围绕社区交流、题解解锁和内容反馈的常用说明。</p></div></div>
          <div class="help-list"><article><LockKeyhole :size="20" /><div><h3>为什么题解被锁定？</h3><p>题目关联的题解必须在通过该题后才能阅读全文，作者、教师和管理员除外。</p></div></article><article><MessageCircle :size="20" /><div><h3>题目讨论和论坛有什么区别？</h3><p>题目页讨论用于某道题的提问、思路和纠错；这里用于训练经验、算法话题和平台交流。</p></div></article><article><FileWarning :size="20" /><div><h3>发现题目错误怎么办？</h3><p>在题目页的“讨论与反馈”中提交纠错。审核状态会通过站内通知返回。</p></div></article><article><ShieldCheck :size="20" /><div><h3>如何处理违规内容？</h3><p>教师和管理员可通过审核中心查看举报、隐藏内容并保留处理记录。</p></div></article></div>
        </template>
      </section>

      <aside class="community-aside">
        <section><h3>社区准则</h3><ol><li>先说明问题与已尝试的方法。</li><li>题解、关键代码与最终答案请放到题解区。</li><li>尊重他人，避免人身攻击和灌水。</li></ol><button type="button" @click="switchPanel('help')">查看帮助 <ChevronRight :size="15" /></button></section>
        <section><h3>推荐入口</h3><button type="button" @click="router.push('/problems')">去题库练习 <ChevronRight :size="15" /></button><button type="button" @click="router.push('/problem-lists')">查看题单 <ChevronRight :size="15" /></button><button type="button" @click="switchPanel('announcements')">平台公告 <ChevronRight :size="15" /></button></section>
        <section v-if="isModerator" class="moderation-shortcut"><h3>内容审核</h3><p>{{ reports.length + feedbacks.length }} 项待处理内容</p><button type="button" @click="toggleModeration">打开审核中心 <ChevronRight :size="15" /></button></section>
      </aside>
      </div>

      <section v-if="moderationOpen" class="moderation-drawer"><header><div><p>教师 / 管理员</p><h2>审核中心</h2></div><button class="icon-command" type="button" title="关闭" @click="moderationOpen = false"><X :size="18" /></button></header><div class="moderation-columns"><div><h3>内容举报 <span>{{ reports.length }}</span></h3><article v-for="item in reports" :key="item.id"><b>{{ item.reason }}</b><p>{{ item.detail || '未填写补充说明' }}</p><small>举报人：{{ item.reporter?.nickname || item.reporter?.username }}</small><footer><button type="button" @click="handleReport(item, false)">保留</button><button type="button" class="danger" @click="handleReport(item, true)">隐藏内容</button></footer></article><p v-if="!reports.length" class="no-item">暂无待处理举报</p></div><div><h3>题目纠错 <span>{{ feedbacks.length }}</span></h3><article v-for="item in feedbacks" :key="item.id"><b>{{ item.problem?.title }} · {{ item.type }}</b><p>{{ item.content }}</p><small>反馈人：{{ item.reporter?.nickname || item.reporter?.username }}</small><footer><button type="button" @click="handleFeedback(item)">开始核实</button></footer></article><p v-if="!feedbacks.length" class="no-item">暂无待处理反馈</p></div></div></section>
    </main>

    <div v-if="selectedPost" class="dialog-backdrop" @click.self="closePost"><article class="post-dialog"><button class="icon-command close-dialog" type="button" title="关闭" @click="closePost"><X :size="18" /></button><div class="post-labels"><span>{{ selectedPost.category || selectedPost.type }}</span><span v-if="selectedPost.isResolved" class="resolved"><BookmarkCheck :size="13" />已解决</span></div><h2>{{ selectedPost.title || (selectedPost.type === 'SOLUTION' ? '题解复盘' : '讨论') }}</h2><div v-if="selectedPost.contentLocked" class="spoiler-state"><LockKeyhole :size="22" /><div><b>题解内容尚未解锁</b><p>{{ selectedPost.lockReason }}</p></div></div><template v-else><p class="post-content">{{ selectedPost.content }}</p><footer class="dialog-actions"><button type="button" :class="{ reacted: selectedPost.viewerReacted }" @click="toggleReaction(selectedPost)"><ThumbsUp :size="16" />{{ selectedPost.reactionCount || 0 }}</button><button v-if="selectedPost.authorId === auth.user?.id || isModerator" type="button" @click="resolvePost"><BookmarkCheck :size="16" />{{ selectedPost.isResolved ? '重新打开讨论' : '标记为已解决' }}</button></footer><section class="reply-list"><h3>回复 {{ selectedPost.replyCount || selectedPost.replies?.length || 0 }}</h3><article v-for="reply in selectedPost.replies" :key="reply.id"><b>{{ reply.author?.nickname || reply.author?.username }}</b><p>{{ reply.content }}</p><time>{{ formatDate(reply.createdAt) }}</time></article><form @submit.prevent="replyToPost"><textarea v-model="replyContent" maxlength="4000" placeholder="补充思路、给出建议或回答问题" required /><button class="primary-command" type="submit"><Send :size="16" />回复</button></form></section></template></article></div>
  </div>
</template>

<style scoped>
.community-hub { width: min(1360px, calc(100% - 40px)); margin: 0 auto; padding: 28px 0 60px; color: #243145; }.community-topbar { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 22px; }.brand-block p, .section-kicker, .moderation-drawer header p { margin: 0 0 5px; color: #087f5b; font-size: 12px; font-weight: 800; }.brand-block h1 { margin: 0; color: #182230; font-size: 27px; }.topbar-actions { display: flex; align-items: center; gap: 9px; }.search-field { display: flex; width: min(310px, 28vw); height: 38px; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid #d5dee8; border-radius: 6px; background: #fff; color: #667085; }.search-field input { width: 100%; border: 0; outline: 0; color: #344054; font: inherit; }.icon-command { position: relative; display: inline-grid; width: 38px; height: 38px; place-items: center; border: 1px solid #d5dee8; border-radius: 6px; background: #fff; color: #475467; cursor: pointer; }.icon-command:hover { border-color: #0d9273; background: #f0faf7; color: #087f5b; }.counter { position: absolute; top: -7px; right: -7px; min-width: 18px; padding: 1px 4px; border-radius: 10px; background: #c2410c; color: #fff; font-size: 10px; font-weight: 800; }.notification-anchor { position: relative; }.notification-popover { position: absolute; z-index: 20; top: 45px; right: 0; width: min(360px, calc(100vw - 30px)); overflow: hidden; border: 1px solid #d5dee8; border-radius: 8px; background: #fff; box-shadow: 0 16px 34px rgba(16, 24, 40, .16); }.notification-popover header { padding: 12px 14px; border-bottom: 1px solid #edf1f5; color: #344054; font-weight: 800; }.notification-popover button { display: grid; width: 100%; gap: 3px; padding: 11px 14px; border: 0; border-bottom: 1px solid #edf1f5; background: #fff; color: #475467; text-align: left; cursor: pointer; }.notification-popover button.unread, .notification-popover button:hover { background: #effaf6; }.notification-popover span, .notification-popover time, .notification-popover > p { overflow: hidden; color: #667085; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.notification-popover > p { padding: 16px; text-align: center; }.toast { display: flex; align-items: center; gap: 7px; margin: 0 0 14px; padding: 9px 11px; border-radius: 6px; font-size: 14px; }.toast.success { background: #ecfdf3; color: #067647; }.toast.error { background: #fff1f2; color: #b42318; }
.community-layout { display: grid; grid-template-columns: 196px minmax(0, 1fr) 244px; gap: 22px; align-items: start; }.community-nav { position: sticky; top: 74px; display: grid; gap: 4px; }.community-nav > button { display: flex; min-height: 39px; align-items: center; gap: 10px; padding: 0 11px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #5d6b7b; font: inherit; text-align: left; cursor: pointer; }.community-nav > button:hover { background: #edf7f3; color: #087f5b; }.community-nav > button.active { border-color: #c6e1d6; background: #eaf7f1; color: #087f5b; font-weight: 800; }.community-nav .create-discussion { justify-content: center; border-color: #087f5b; background: #087f5b; color: #fff; font-weight: 800; }.community-nav .create-discussion:hover { background: #056d4e; color: #fff; }.nav-rule { height: 1px; margin: 9px 4px; background: #dce4ed; }.signed-state { display: flex; align-items: flex-start; gap: 6px; margin: 6px 8px; color: #7b8794; font-size: 12px; line-height: 1.45; }
.community-feed { min-width: 0; border: 1px solid #dce4ed; border-radius: 8px; background: #fff; }.feed-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 22px 18px; border-bottom: 1px solid #edf1f5; }.feed-heading h2 { margin: 0; color: #253346; font-size: 22px; }.feed-heading p:not(.section-kicker) { max-width: 560px; margin: 7px 0 0; color: #667085; line-height: 1.55; font-size: 14px; }.primary-command { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border: 0; border-radius: 6px; background: #087f5b; color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }.primary-command:hover { background: #056d4e; }.discussion-composer { display: grid; gap: 10px; margin: 16px 22px; padding: 15px; border: 1px solid #c4e1d5; border-radius: 7px; background: #f6fcf9; }.discussion-composer input, .discussion-composer textarea, .discussion-composer select, .reply-list textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #1f2937; font: inherit; }.discussion-composer input, .discussion-composer select { min-height: 36px; padding: 0 9px; }.discussion-composer textarea, .reply-list textarea { min-height: 98px; padding: 9px; line-height: 1.5; resize: vertical; }.discussion-composer > div { display: flex; align-items: center; justify-content: space-between; gap: 9px; color: #667085; font-size: 12px; }.discussion-composer select { width: 130px; }.discussion-composer footer { display: flex; justify-content: flex-end; gap: 10px; }.plain-command { border: 0; background: transparent; color: #087f5b; font: inherit; cursor: pointer; }.pin-option { display: flex; align-items: center; gap: 7px; color: #475467; font-size: 13px; }.feed-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 22px; border-top: 1px solid #edf1f5; border-bottom: 1px solid #edf1f5; }.sort-tabs { display: flex; gap: 4px; }.sort-tabs button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border: 0; border-radius: 4px; background: transparent; color: #667085; font: inherit; font-size: 13px; cursor: pointer; }.sort-tabs button.active, .sort-tabs button:hover { background: #edf7f3; color: #087f5b; font-weight: 800; }.feed-toolbar select { height: 30px; border: 1px solid #d5dee8; border-radius: 5px; background: #fff; color: #475467; font: inherit; font-size: 13px; }.feed-post { border-bottom: 1px solid #edf1f5; }.post-body { display: block; width: 100%; padding: 18px 22px 12px; border: 0; background: #fff; color: inherit; text-align: left; cursor: pointer; }.post-body:hover h3 { color: #087f5b; }.post-labels { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }.post-labels > span { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; background: #eef5ff; color: #2764a8; font-size: 11px; font-weight: 800; }.post-labels > .resolved { background: #eaf7f1; color: #087f5b; }.post-labels > .locked { background: #fff7e8; color: #94620a; }.post-body h3 { margin: 9px 0 6px; color: #253346; font-size: 17px; }.post-body > p { display: -webkit-box; overflow: hidden; margin: 0; color: #667085; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.post-body footer { display: flex; gap: 10px; margin-top: 10px; color: #98a2b3; font-size: 12px; }.post-metrics { display: flex; align-items: center; gap: 10px; padding: 0 22px 14px; color: #98a2b3; font-size: 12px; }.post-metrics button, .dialog-actions button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: #7b8794; font: inherit; font-size: 12px; cursor: pointer; }.post-metrics button:hover, .post-metrics button.reacted, .dialog-actions button.reacted { color: #c2410c; }.empty-feed { display: grid; min-height: 220px; place-content: center; justify-items: center; gap: 9px; padding: 20px; color: #7b8794; text-align: center; }.empty-feed b { color: #475467; }
.community-aside { display: grid; gap: 14px; }.community-aside section { padding: 15px; border: 1px solid #dce4ed; border-radius: 8px; background: #fff; }.community-aside h3 { margin: 0 0 10px; color: #344054; font-size: 14px; }.community-aside ol { margin: 0; padding-left: 18px; color: #667085; font-size: 13px; line-height: 1.7; }.community-aside section > button { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 8px 0; border: 0; border-top: 1px solid #edf1f5; background: transparent; color: #087f5b; font: inherit; font-size: 13px; cursor: pointer; }.community-aside section > button:first-of-type { margin-top: 11px; }.moderation-shortcut { border-color: #ead9be !important; background: #fffaf2 !important; }.moderation-shortcut p { margin: 0 0 8px; color: #8a6d3b; font-size: 13px; }
.announcement-item { display: grid; grid-template-columns: 38px 1fr; gap: 12px; padding: 18px 22px; border-bottom: 1px solid #edf1f5; }.announcement-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 6px; background: #fff3da; color: #a05a00; }.announcement-item header { display: flex; align-items: center; gap: 7px; }.announcement-item h3 { margin: 0; color: #344054; font-size: 16px; }.announcement-item header span { padding: 2px 6px; border-radius: 4px; background: #fff1cd; color: #966000; font-size: 11px; font-weight: 800; }.announcement-item p { margin: 8px 0; color: #475467; line-height: 1.65; white-space: pre-wrap; }.announcement-item footer { color: #98a2b3; font-size: 12px; }.help-list { padding: 8px 22px 22px; }.help-list article { display: flex; gap: 12px; padding: 17px 0; border-bottom: 1px solid #edf1f5; }.help-list article:last-child { border-bottom: 0; }.help-list svg { color: #087f5b; }.help-list h3 { margin: 0 0 5px; color: #344054; font-size: 15px; }.help-list p { margin: 0; color: #667085; line-height: 1.6; font-size: 14px; }
.moderation-drawer { width: min(1120px, calc(100% - 40px)); margin: 24px auto 0; padding: 20px; border: 1px solid #e4d7c3; border-radius: 8px; background: #fffaf4; }.moderation-drawer header { display: flex; align-items: center; justify-content: space-between; }.moderation-drawer header h2 { margin: 0; color: #344054; font-size: 20px; }.moderation-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 16px; }.moderation-columns > div { padding: 14px; border: 1px solid #eadfcf; border-radius: 6px; background: #fff; }.moderation-columns h3 { margin: 0 0 9px; color: #344054; font-size: 15px; }.moderation-columns h3 span { color: #b42318; }.moderation-columns article { padding: 11px 0; border-bottom: 1px solid #edf1f5; }.moderation-columns p { margin: 6px 0; color: #667085; font-size: 13px; }.moderation-columns small { color: #98a2b3; }.moderation-columns footer { display: flex; gap: 8px; margin-top: 9px; }.moderation-columns footer button { padding: 5px 9px; border: 1px solid #bcd9cd; border-radius: 5px; background: #fff; color: #087f5b; font: inherit; font-size: 12px; cursor: pointer; }.moderation-columns footer .danger { border-color: #f2c1c4; color: #b42318; }.no-item { color: #98a2b3; text-align: center; }
.dialog-backdrop { position: fixed; z-index: 50; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(16, 24, 40, .52); }.post-dialog { position: relative; width: min(760px, 100%); max-height: 90vh; overflow: auto; padding: 25px; border-radius: 8px; background: #fff; box-shadow: 0 22px 52px rgba(16, 24, 40, .25); }.close-dialog { position: absolute; top: 13px; right: 13px; }.post-dialog h2 { margin: 12px 30px 16px 0; color: #253346; font-size: 21px; }.post-content { margin: 0; color: #344054; line-height: 1.75; white-space: pre-wrap; }.spoiler-state { display: flex; gap: 11px; align-items: flex-start; padding: 15px; border: 1px solid #efd29c; border-radius: 7px; background: #fff9ea; color: #7a4f00; }.spoiler-state p { margin: 5px 0 0; color: #8b6b32; line-height: 1.5; }.dialog-actions { display: flex; gap: 15px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #edf1f5; }.dialog-actions button { font-size: 13px; }.reply-list { margin-top: 18px; }.reply-list h3 { margin: 0 0 8px; font-size: 16px; }.reply-list > article { padding: 12px 0; border-bottom: 1px solid #edf1f5; }.reply-list > article p { margin: 5px 0; color: #475467; line-height: 1.55; white-space: pre-wrap; }.reply-list time { color: #98a2b3; font-size: 11px; }.reply-list form { display: grid; gap: 9px; margin-top: 15px; }.reply-list form .primary-command { justify-self: end; }
@media (max-width: 1050px) { .community-layout { grid-template-columns: 170px minmax(0, 1fr); }.community-aside { display: none; } }
@media (max-width: 720px) { .community-hub { width: min(100% - 28px, 1360px); padding-top: 18px; }.community-topbar { align-items: flex-start; }.brand-block h1 { font-size: 23px; }.search-field { display: none; }.community-layout { grid-template-columns: 1fr; }.community-nav { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }.community-nav .nav-rule, .community-nav .signed-state { display: none; }.community-nav > button { justify-content: center; padding: 0 8px; }.community-nav .create-discussion { grid-column: 1 / -1; }.feed-heading { padding: 18px 16px 15px; }.feed-heading h2 { font-size: 20px; }.discussion-composer, .feed-toolbar { margin-left: 16px; margin-right: 16px; }.discussion-composer > div { align-items: flex-start; flex-direction: column; }.feed-toolbar { padding: 10px 0; }.post-body { padding: 16px 16px 10px; }.post-metrics { padding: 0 16px 13px; }.announcement-item { padding: 16px; }.help-list { padding: 6px 16px 18px; }.moderation-drawer { width: min(100% - 28px, 1120px); }.moderation-columns { grid-template-columns: 1fr; }.post-dialog { padding: 21px 16px; } }

/* Community workbench visual system */
.community-hub { width: min(1440px, calc(100% - 56px)); padding-top: 30px; font-family: 'Manrope', 'Noto Sans SC', 'Microsoft YaHei', sans-serif; }
.community-topbar { min-height: 80px; padding: 2px 2px 26px; border-bottom: 1px solid #cfd8e3; }
.brand-block p { color: #3f6f77; font-size: 11px; letter-spacing: 0; }
.brand-title-row { display: flex; align-items: center; gap: 13px; }
.brand-block h1 { color: #17212d; font-size: 31px; font-weight: 800; line-height: 1.18; }
.brand-title-row span { display: inline-flex; align-items: center; gap: 6px; color: #536271; font-size: 12px; font-weight: 700; }
.brand-title-row i { width: 7px; height: 7px; border-radius: 50%; background: #0b8b72; box-shadow: 0 0 0 4px #e2f3ec; }
.search-field { width: min(342px, 30vw); height: 40px; border-color: #c5d0dc; border-radius: 5px; background: #fbfcfe; }
.search-field:focus-within { border-color: #0b7a75; background: #fff; box-shadow: 0 0 0 3px rgba(11, 122, 117, .1); }
.icon-command { border-color: #c5d0dc; border-radius: 5px; background: #fbfcfe; }
.community-layout { grid-template-columns: 204px minmax(520px, 1fr) 254px; gap: 28px; margin-top: 25px; }
.community-nav { gap: 3px; padding-right: 15px; border-right: 1px solid #d9e1ea; }
.nav-caption { margin: 0 0 8px 11px; color: #98a4b3; font-size: 10px; font-weight: 800; text-transform: uppercase; }
.community-nav > button { min-height: 42px; border-radius: 4px; color: #536271; font-size: 13px; }
.community-nav > button.active { border-color: #c6dfd8; background: #e7f3ef; color: #0b6e65; }
.community-nav .create-discussion { margin-top: 4px; border: 1px solid #132c39; border-radius: 5px; background: #132c39; color: #fff; letter-spacing: 0; }
.community-nav .create-discussion:hover { border-color: #0b7a75; background: #0b7a75; }
.community-nav .signed-state { margin: 13px 8px 0; padding-top: 13px; border-top: 1px solid #e2e8ef; }
.community-feed { overflow: hidden; border: 1px solid #d7e0e9; border-radius: 6px; background: #fff; box-shadow: 0 8px 22px rgba(20, 37, 56, .045); }
.problem-scope { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 26px; border-bottom: 1px solid #dbe8e5; background: #f4faf8; }
.problem-scope > div:first-child { display: flex; align-items: baseline; gap: 9px; min-width: 0; }
.problem-scope span { color: #087f5b; font-size: 12px; font-weight: 800; }
.problem-scope strong { overflow: hidden; color: #294256; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.scope-actions { display: flex; flex: 0 0 auto; gap: 8px; }
.scope-actions button { border: 0; background: transparent; color: #087f5b; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.scope-actions button:hover { color: #056d4e; text-decoration: underline; }
.feed-heading { padding: 25px 26px 20px; background: #fff; }
@media (max-width: 720px) { .problem-scope { align-items: flex-start; flex-direction: column; padding: 12px 16px; } .scope-actions { width: 100%; justify-content: space-between; } }
.section-kicker { color: #0b7a75; font-size: 11px; letter-spacing: 0; }
.feed-heading h2 { font-size: 23px; font-weight: 800; }
.feed-heading p:not(.section-kicker) { max-width: 600px; color: #738091; }
.primary-command { min-height: 38px; border-radius: 5px; background: #0b766e; box-shadow: none; }
.primary-command:hover { background: #075d57; }
.discussion-composer { margin: 18px 26px; border-color: #bfd8d1; border-radius: 5px; background: #f7fbfa; }
.discussion-composer input, .discussion-composer textarea, .discussion-composer select, .reply-list textarea { border-radius: 4px; }
.feed-toolbar { padding: 11px 26px; background: #f9fbfc; }
.sort-tabs button { border-radius: 3px; }
.feed-post { position: relative; transition: background 140ms ease; }
.feed-post:hover { background: #fbfdfd; }
.post-body { display: flex; gap: 13px; padding: 19px 26px 10px; }
.author-avatar { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 1px solid #a7d1c7; border-radius: 5px; background: #e3f3ee; color: #0a675f; font-size: 12px; font-weight: 800; }
.post-copy { min-width: 0; flex: 1; }
.post-body h3 { margin-top: 8px; color: #1f2d3d; font-size: 17px; font-weight: 750; }
.post-body > p { color: #647284; }
.post-copy > p { display: -webkit-box; overflow: hidden; margin: 0; color: #647284; line-height: 1.58; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.post-copy footer { display: flex; align-items: center; gap: 9px; margin-top: 11px; color: #8290a0; font-size: 12px; }
.author-separator { width: 3px; height: 3px; border-radius: 50%; background: #b4bec9; }
.post-labels > span { border-radius: 3px; background: #edf3fb; color: #38689c; font-weight: 750; }
.post-labels > .problem-link { background: #f4f1fb; color: #6b5a9a; }
.post-labels > .resolved { background: #e6f6ef; color: #08775e; }
.post-labels > .locked { background: #fff5e4; color: #9a6711; }
.post-metrics { gap: 14px; padding: 0 26px 15px 73px; color: #94a0ad; }
.post-metrics button { min-height: 26px; padding: 0 4px; border-radius: 3px; }
.post-metrics button:hover { background: #edf7f4; color: #08775e; }
.post-metrics button.reacted { background: #fff5eb; color: #c35c18; }
.empty-feed { min-height: 300px; color: #7d8a99; }
.community-aside { gap: 16px; }
.community-aside section { padding: 17px 16px; border: 1px solid #d9e2eb; border-radius: 5px; background: #fbfcfe; }
.community-aside section:first-child { border-top: 3px solid #0b7a75; }
.community-aside h3 { color: #263648; font-size: 13px; letter-spacing: 0; }
.community-aside ol { color: #637183; line-height: 1.82; }
.community-aside section > button { color: #1d6371; }
.moderation-shortcut { border-color: #eadbc6 !important; border-top-color: #b9792c !important; background: #fffcf8 !important; }
.announcement-item { padding: 20px 26px; }
.help-list { padding: 8px 26px 24px; }
.notification-popover { border-radius: 6px; box-shadow: 0 18px 40px rgba(16, 24, 40, .18); }
.post-dialog { border-radius: 6px; }
@media (max-width: 1050px) { .community-layout { grid-template-columns: 188px minmax(0, 1fr); gap: 20px; } }
@media (max-width: 720px) { .community-hub { width: min(100% - 28px, 1440px); }.community-topbar { min-height: 64px; padding-bottom: 18px; }.brand-block h1 { font-size: 25px; }.brand-title-row { gap: 10px; }.community-layout { margin-top: 18px; }.community-nav { padding-right: 0; border-right: 0; }.nav-caption { display: none; }.community-feed { border-radius: 5px; }.feed-heading, .post-body { padding-left: 16px; padding-right: 16px; }.post-body { gap: 10px; }.post-metrics { padding-left: 60px; padding-right: 16px; }.discussion-composer { margin-left: 16px; margin-right: 16px; }.feed-toolbar { padding-left: 16px; padding-right: 16px; }.announcement-item, .help-list { padding-left: 16px; padding-right: 16px; } }

/* Community workspace skin shared with Home and Contests. */
.community-hub { --community-navy:#173b66; --community-blue:#2469ad; --community-pale:#eaf3fc; --community-line:#dfe7ef; display:flex; width:100%; max-width:none; min-height:calc(100vh - 56px); margin:0; padding:0; background:#f3f5f7; font-family:'Manrope Variable','Noto Sans SC Variable',sans-serif; }
.community-main { min-width:0; flex:1; padding:26px 28px 60px; }.community-main>.community-topbar,.community-main>.toast,.community-main>.community-layout,.community-main>.moderation-drawer { width:min(1180px,100%); margin-right:auto; margin-left:auto; }
.community-topbar { min-height:128px; margin-bottom:0; padding:24px 28px; border-radius:8px; background:var(--community-navy); box-shadow:0 14px 32px rgba(23,59,102,.16); }
.brand-block p { color:#8fc2ec; letter-spacing:0; }
.brand-block h1 { color:#fff; font-size:31px; letter-spacing:0; }
.brand-title-row>span { color:#d6e6f4; }
.brand-title-row>span i { background:#f2c66d; }
.search-field { width:min(360px,32vw); border-color:rgba(255,255,255,.28); background:#fff; }
.icon-command { border-color:rgba(255,255,255,.3); color:#e6f1fb; background:rgba(255,255,255,.1); }
.icon-command:hover { border-color:rgba(255,255,255,.5); color:#fff; background:rgba(255,255,255,.18); }
.notification-popover .icon-command,.post-dialog .icon-command,.moderation-drawer .icon-command { color:#475467; background:#fff; }
.community-layout { grid-template-columns:minmax(0,1fr)244px; gap:18px; margin-top:22px; }
.community-nav { position:sticky; top:56px; display:flex; width:264px; height:calc(100vh - 56px); flex:0 0 264px; align-self:flex-start; padding:22px 14px; overflow:hidden; flex-direction:column; border-right:1px solid var(--community-line); border-radius:0; background:#f8fbfe; transition:width .18s,flex-basis .18s; }
.community-nav-title { display:flex; align-items:center; gap:10px; padding:0 7px 18px; }.community-nav-icon { display:grid; width:38px; height:38px; flex:0 0 38px; place-items:center; border-radius:8px; color:#1c5688; background:#dcecf9; }.community-nav-copy { display:grid; min-width:0; gap:2px; }.community-nav-copy strong { color:#29435d; font-size:13px; }.community-nav-copy small { color:#8492a2; font-size:10px; }.community-nav-collapse { display:grid; width:34px; height:34px; flex:0 0 34px; margin-left:auto; place-items:center; border:0; border-radius:7px; color:#6e7f91; background:transparent; cursor:pointer; }.community-nav-collapse:hover { color:#245f94; background:#e7f0f8; }
.community-nav .nav-caption { margin:4px 9px 9px; color:#8493a5; font-size:10px; font-weight:900; }.community-nav>button { display:grid; grid-template-columns:22px minmax(0,1fr) auto; min-height:52px; gap:9px; padding:7px 10px; border-radius:7px; }.community-nav>button>span { display:grid; gap:2px; min-width:0; }.community-nav>button strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }.community-nav>button small { color:#8a98a8; font-size:9px; }.community-nav>button.active small { color:#cbddee; }.community-nav>button b { display:grid; min-width:21px; height:20px; place-items:center; border-radius:5px; color:#356b99; background:#e1edf8; font-size:10px; }.community-nav>button.active b { color:#fff; background:rgba(255,255,255,.15); }
.community-nav>button:hover { color:#1d5d94; background:#eaf3fb; }
.community-nav>button.active { border-color:transparent; color:#fff; background:var(--community-navy); box-shadow:0 5px 12px rgba(23,59,102,.16); }
.community-nav .create-discussion { border-color:var(--community-blue); background:var(--community-blue); }
.community-nav .create-discussion:hover { background:#1b578f; }
.community-nav .nav-rule { width:100%; }.community-nav .signed-state span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.community-hub.sidebar-collapsed .community-nav { width:72px; flex-basis:72px; padding-right:10px; padding-left:10px; }.community-hub.sidebar-collapsed .community-nav-icon,.community-hub.sidebar-collapsed .community-nav-copy,.community-hub.sidebar-collapsed .nav-caption,.community-hub.sidebar-collapsed .nav-rule,.community-hub.sidebar-collapsed .signed-state { display:none; }.community-hub.sidebar-collapsed .community-nav-title { justify-content:center; padding-right:0; padding-left:0; }.community-hub.sidebar-collapsed .community-nav-collapse { margin-left:0; }.community-hub.sidebar-collapsed .community-nav>button { grid-template-columns:1fr; justify-items:center; padding-right:0; padding-left:0; }.community-hub.sidebar-collapsed .community-nav>button>span,.community-hub.sidebar-collapsed .community-nav>button>b { display:none; }
.community-feed { border-color:var(--community-line); border-radius:8px; box-shadow:0 8px 24px rgba(23,59,102,.05); }
.section-kicker { color:#3977aa; letter-spacing:0; }
.primary-command { background:var(--community-blue); }
.primary-command:hover { background:#1b578f; }
.discussion-composer { border-color:#bcd5ea; background:#f3f8fd; }
.plain-command,.sort-tabs button.active,.sort-tabs button:hover { color:#1f6098; }
.sort-tabs button.active,.sort-tabs button:hover { background:#eaf3fb; }
.post-body:hover h3 { color:#1f6098; }
.author-avatar { border-color:#aecce5; color:#205f96; background:#e5f1fb; }
.post-metrics button:hover { color:#1f6098; background:#eaf3fb; }
.community-aside section { border-color:var(--community-line); border-radius:8px; background:#fff; box-shadow:0 6px 16px rgba(23,59,102,.04); }
.community-aside section:first-child { border-top-color:var(--community-blue); }
.community-aside section>button { color:#245f92; }
.notification-popover,.post-dialog { border-radius:8px; }
@media(max-width:1050px){.community-layout{grid-template-columns:minmax(0,1fr)}.community-aside{display:none}}
@media(max-width:860px){.community-hub{display:block}.community-main{padding:18px 16px 46px}.community-nav,.community-hub.sidebar-collapsed .community-nav{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:auto;height:auto;padding:12px;border-right:0}.community-nav-title,.community-nav .nav-rule,.community-nav .signed-state{display:none}.community-nav>button,.community-hub.sidebar-collapsed .community-nav>button{grid-template-columns:22px minmax(0,1fr) auto;justify-items:initial;padding:7px 10px}.community-nav>button>span,.community-hub.sidebar-collapsed .community-nav>button>span{display:grid}.community-nav>button>b,.community-hub.sidebar-collapsed .community-nav>button>b{display:grid}.community-nav .create-discussion{grid-column:1/-1}.community-topbar{align-items:stretch;flex-direction:column;padding:20px}.topbar-actions{width:100%}.search-field{width:auto;flex:1}.community-layout{display:block;margin-top:18px}.community-feed{width:100%}}
/* Community keeps its information architecture while sharing the light library skin. */
.community-topbar {
  border: 1px solid #dce5ef;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 66, 104, 0.08);
}
.brand-block p { color: #3977aa; }
.brand-block h1 { color: #1f2a37; }
.brand-title-row span { color: #66778a; }
.brand-title-row i { background: #1f5eff; box-shadow: 0 0 0 4px #e7efff; }
.community-nav > button.active {
  border-color: #aec7f4;
  background: #e7efff;
  color: #1f5eff;
  box-shadow: none;
}
.community-nav > button.active small { color: #1f5eff; }
.community-nav > button.active b { background: #dce9ff; color: #1f5eff; }
.community-nav .create-discussion {
  border-color: #aec7f4;
  background: #e7efff;
  color: #1f5eff;
}
.community-nav .create-discussion:hover { border-color: #8fb8ef; background: #dce9ff; color: #164fc9; }
/* The white header needs stronger utility contrast than the former dark treatment. */
.topbar-actions .search-field {
  border-color: #bfd0e1;
  background: #f8fbfe;
  color: #34536f;
}
.topbar-actions .search-field svg { color: #34536f; }
.topbar-actions .search-field input { color: #24364b; }
.topbar-actions .search-field input::placeholder { color: #5e7087; opacity: 1; }
.topbar-actions .icon-command {
  border-color: #bfd0e1;
  background: #f8fbfe;
  color: #34536f;
}
.topbar-actions .icon-command:hover {
  border-color: #8fb8ef;
  background: #e7efff;
  color: #1f5eff;
}
.discussion-composer .composer-category-select { width: 148px; height: 36px; flex: 0 0 148px; }
.discussion-composer .composer-category-select :deep(.filter-select__trigger) { padding: 0 9px; border-color: #bcd5ea; border-radius: 6px; background: #fff; color: #34536f; font-size: 12px; }
.discussion-composer .composer-category-select :deep(.filter-select__trigger:hover),
.discussion-composer .composer-category-select :deep(.filter-select.is-open .filter-select__trigger) { border-color: #8fb8ef; background: #f8fbfe; box-shadow: 0 0 0 3px rgba(31, 94, 255, .09); }
.discussion-composer .composer-category-select :deep(.filter-select__menu) { border-color: #bfd0e1; border-radius: 7px; box-shadow: 0 10px 24px rgba(31, 66, 104, .12); }
.discussion-composer .composer-category-select :deep(.filter-select__option.is-selected) { background: #e7efff; color: #1f5eff; }
.feed-toolbar .topic-filter-select { width: 124px; height: 32px; flex: 0 0 124px; }
.feed-toolbar .topic-filter-select :deep(.filter-select__trigger) { padding: 0 8px; border-color: #bfd0e1; border-radius: 6px; background: #fff; color: #34536f; font-size: 12px; }
.feed-toolbar .topic-filter-select :deep(.filter-select__trigger:hover),
.feed-toolbar .topic-filter-select :deep(.filter-select.is-open .filter-select__trigger) { border-color: #8fb8ef; background: #f8fbfe; box-shadow: 0 0 0 3px rgba(31, 94, 255, .09); }
.feed-toolbar .topic-filter-select :deep(.filter-select__menu) { min-width: 148px; border-color: #bfd0e1; border-radius: 7px; }
.feed-toolbar .topic-filter-select :deep(.filter-select__option.is-selected) { background: #e7efff; color: #1f5eff; }
@media (max-width: 720px) {
  .discussion-composer .composer-category-select { flex: 0 0 36px; }
}
</style>
