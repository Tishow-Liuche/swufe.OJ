<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { BookOpenCheck, CalendarRange, LayoutDashboard, Library, ListChecks, PanelLeftClose, PanelLeftOpen } from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRouter } from 'vue-router';
import api from '../api/client';
import CheckInModal from '../components/CheckInModal.vue';
import LearningProgress from '../components/LearningProgress.vue';
import { useAuthStore } from '../stores/auth';
import { pointDifficultyOrder, pointDifficultyShortLabel } from '../utils/pointDifficulty';

type Tab = 'overview' | 'lists' | 'plans' | 'library';
type ListSort = 'difficulty' | 'number' | 'joined';

const router = useRouter();
const auth = useAuthStore();
const activeTab = ref<Tab>('overview');
const sidebarCollapsed = useStorage('swufe-oj:learning-sidebar-collapsed', false);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');

const lists = ref<any[]>([]);
const publicLists = ref<any[]>([]);
const selectedListId = ref('');
const selectedList = ref<any>(null);
const listForm = ref({ name: '', description: '', isPublic: false });
const listModalOpen = ref(false);
const listSearch = ref('');
const listProblems = ref<any[]>([]);
const listProblemsLoading = ref(false);
const listProblemsLoaded = ref(false);
const listProblemKeyword = ref('');
const listSort = ref<ListSort>('difficulty');
const listSortDirection = ref<'asc' | 'desc'>('asc');

const plans = ref<any[]>([]);
const dashboard = ref<any>(null);
const daily = ref<any>({ items: [], progress: { total: 0, completed: 0 } });
const planForm = ref({ name: '', description: '', startDate: today(), endDate: addDays(7), dailyTarget: 3 });
const planModalOpen = ref(false);
const planSearch = ref('');
const planProblems = ref<any[]>([]);
const checkInOpen = ref(false);
const checkInSaving = ref(false);

const favorites = ref<any[]>([]);
const wrongBook = ref<any[]>([]);

const selectedListItems = computed(() => selectedList.value?.items || []);
const sortedListItems = computed(() => {
  const direction = listSortDirection.value === 'asc' ? 1 : -1;
  return [...selectedListItems.value].sort((left, right) => {
    if (listSort.value === 'difficulty') {
      const a = pointDifficultyOrder(left.problem?.difficulty);
      const b = pointDifficultyOrder(right.problem?.difficulty);
      if (a !== b) return (a - b) * direction;
    } else if (listSort.value === 'number') {
      const numberOf = (title = '') => Number(title.match(/P\s*(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
      const a = numberOf(left.problem?.title);
      const b = numberOf(right.problem?.title);
      if (a !== b) return (a - b) * direction;
    } else {
      const a = new Date(left.createdAt || 0).getTime();
      const b = new Date(right.createdAt || 0).getTime();
      if (a !== b) return (a - b) * direction;
    }
    return String(left.problem?.title || '').localeCompare(String(right.problem?.title || ''), 'zh-CN') * direction;
  });
});
const selectedListOwned = computed(() => lists.value.some((item) => item.id === selectedList.value?.id));
const activePlan = computed(() => plans.value[0] || null);
const workspaceTabs = computed(() => [
  { id: 'overview' as const, label: '总览', detail: '学习进度', icon: LayoutDashboard },
  { id: 'lists' as const, label: '我的题单', detail: '管理与排序', icon: ListChecks, count: lists.value.length },
  { id: 'plans' as const, label: '学习计划', detail: '目标与打卡', icon: CalendarRange, count: plans.value.length },
  { id: 'library' as const, label: '收藏与错题', detail: '重点回顾', icon: Library },
]);
const continueItems = computed(() => {
  const result: any[] = [];
  const byProblem = new Map<string, any>();
  const addItem = (item: any, type: '收藏' | '错题') => {
    if (!item) return;
    const existing = byProblem.get(item.problemId);
    if (existing) {
      if (!existing.types.includes(type)) existing.types.push(type);
      return;
    }
    const entry = { ...item, types: [type] };
    byProblem.set(item.problemId, entry);
    result.push(entry);
  };
  const length = Math.max(favorites.value.length, wrongBook.value.length);
  for (let index = 0; index < length && result.length < 6; index += 1) {
    addItem(favorites.value[index], '收藏');
    addItem(wrongBook.value[index], '错题');
  }
  return result.slice(0, 6);
});
const completionPercent = computed(() => {
  return daily.value?.progress?.percent || 0;
});

const sortDirectionLabel = computed(() => {
  if (listSort.value === 'difficulty') return listSortDirection.value === 'asc' ? '简单到困难' : '困难到简单';
  if (listSort.value === 'number') return listSortDirection.value === 'asc' ? '编号从小到大' : '编号从大到小';
  return listSortDirection.value === 'desc' ? '最新加入优先' : '最早加入优先';
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function message(text: string) {
  notice.value = text;
  window.setTimeout(() => { if (notice.value === text) notice.value = ''; }, 2600);
}

function fail(err: any, fallback = '操作失败') {
  error.value = err?.response?.data?.message || fallback;
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    publicLists.value = (await api.get('/api/problem-lists/public')).data;
    if (auth.token && !auth.user) await auth.fetchProfile();
    if (!auth.isLoggedIn()) return;
    const results = await Promise.all([
      api.get('/api/problem-lists'),
      api.get('/api/learning/dashboard'),
      api.get('/api/learning/daily'),
      api.get('/api/learning/favorites'),
      api.get('/api/learning/wrong-book'),
    ]);
    lists.value = results[0].data;
    dashboard.value = results[1].data;
    daily.value = results[2].data;
    favorites.value = results[3].data;
    wrongBook.value = results[4].data;
    plans.value = dashboard.value?.plans || [];
    if (!selectedListId.value && lists.value.length) await selectList(lists.value[0].id);
  } catch (err: any) {
    fail(err, '学习数据加载失败');
  } finally {
    loading.value = false;
  }
}

async function selectList(id: string) {
  selectedListId.value = id;
  try {
    selectedList.value = (await api.get(`/api/problem-lists/${id}`)).data;
    listForm.value = {
      name: selectedList.value.name,
      description: selectedList.value.description || '',
      isPublic: selectedList.value.isPublic,
    };
    if (selectedListOwned.value) await loadListProblemOptions();
    else {
      listProblems.value = [];
      listProblemsLoaded.value = false;
    }
  } catch (err: any) { fail(err, '题单加载失败'); }
}

function openNewList() {
  listForm.value = { name: '', description: '', isPublic: false };
  listModalOpen.value = true;
}

async function saveList() {
  if (!listForm.value.name.trim()) return;
  saving.value = true;
  try {
    const { data } = await api.post('/api/problem-lists', listForm.value);
    lists.value.unshift(data);
    listModalOpen.value = false;
    await selectList(data.id);
    activeTab.value = 'lists';
    message('题单已创建');
  } catch (err: any) { fail(err, '题单创建失败'); }
  finally { saving.value = false; }
}

async function updateList() {
  if (!selectedList.value || !listForm.value.name.trim()) return;
  try {
    const { data } = await api.patch(`/api/problem-lists/${selectedList.value.id}`, listForm.value);
    selectedList.value = { ...selectedList.value, ...data };
    const index = lists.value.findIndex((item) => item.id === data.id);
    if (index >= 0) lists.value[index] = { ...lists.value[index], ...data };
    message(data.isPublic ? '题单已公开' : '题单设置已保存');
  } catch (err: any) { fail(err, '题单保存失败'); }
}

async function deleteList() {
  if (!selectedList.value || !window.confirm('确定删除这个题单吗？题目不会被删除。')) return;
  try {
    await api.delete(`/api/problem-lists/${selectedList.value.id}`);
    lists.value = lists.value.filter((item) => item.id !== selectedList.value.id);
    selectedList.value = null;
    selectedListId.value = '';
    if (lists.value.length) await selectList(lists.value[0].id);
    message('题单已删除');
  } catch (err: any) { fail(err, '题单删除失败'); }
}

async function loadListProblemOptions(keyword = '') {
  if (!selectedListOwned.value) return;
  const normalizedKeyword = keyword.trim();
  listProblemsLoading.value = true;
  listProblemsLoaded.value = false;
  listProblems.value = [];
  listProblemKeyword.value = normalizedKeyword;
  try {
    const { data } = await api.get('/api/problems', {
      params: { keyword: normalizedKeyword || undefined, pageSize: 30, status: 'PUBLISHED' },
    });
    const selectedIds = new Set(selectedListItems.value.map((item: any) => item.problemId));
    listProblems.value = (data.items || []).filter((problem: any) => !selectedIds.has(problem.id));
    listProblemsLoaded.value = true;
  } catch (err: any) { fail(err, '题目加载失败'); }
  finally { listProblemsLoading.value = false; }
}

async function searchListProblems() {
  await loadListProblemOptions(listSearch.value);
}

async function addToList(problemId: string) {
  if (!selectedList.value) return;
  try {
    await api.post(`/api/problem-lists/${selectedList.value.id}/items`, { problemId });
    listSearch.value = '';
    await selectList(selectedList.value.id);
    message('题目已加入题单');
  } catch (err: any) { fail(err, '题目加入失败'); }
}

async function removeFromList(itemId: string) {
  if (!selectedList.value) return;
  try {
    await api.delete(`/api/problem-lists/${selectedList.value.id}/items/${itemId}`);
    await selectList(selectedList.value.id);
  } catch (err: any) { fail(err, '题目移除失败'); }
}

function selectListSort(mode: ListSort) {
  listSort.value = mode;
  listSortDirection.value = mode === 'joined' ? 'desc' : 'asc';
}

function reverseListSort() {
  listSortDirection.value = listSortDirection.value === 'asc' ? 'desc' : 'asc';
}

function openProblem(problemId: string) { router.push(`/problems/${problemId}`); }

async function openPublicList(id: string) {
  activeTab.value = 'lists';
  selectedListId.value = id;
  try {
    selectedList.value = (await api.get(`/api/problem-lists/public/${id}`)).data;
    listForm.value = { name: selectedList.value.name, description: selectedList.value.description || '', isPublic: true };
  } catch (err: any) { fail(err, '公开题单加载失败'); }
}

function openNewPlan() {
  planForm.value = { name: '', description: '', startDate: today(), endDate: addDays(7), dailyTarget: 3 };
  planModalOpen.value = true;
}

async function savePlan() {
  if (!planForm.value.name.trim()) return;
  if (plans.value.length && !window.confirm('当前已有学习计划。创建新计划会自动删除旧计划及其题目、进度和打卡记录，确定继续创建吗？')) return;
  try {
    const { data } = await api.post('/api/learning/plans', planForm.value);
    plans.value = [data];
    planModalOpen.value = false;
    message('学习计划已创建');
    await loadAll();
  } catch (err: any) { fail(err, '学习计划创建失败'); }
}

async function deletePlan(id: string) {
  if (!window.confirm('确定删除这个学习计划吗？')) return;
  try {
    await api.delete(`/api/learning/plans/${id}`);
    plans.value = plans.value.filter((item) => item.id !== id);
    message('计划已删除');
  } catch (err: any) { fail(err, '计划删除失败'); }
}

async function generateDaily() {
  try {
    daily.value = (await api.post('/api/learning/daily/generate')).data;
    dashboard.value = { ...(dashboard.value || {}), daily: daily.value };
    message('今日练习已生成');
  } catch (err: any) { fail(err, '每日练习生成失败'); }
}

async function toggleDaily(item: any) {
  const wasEligible = Boolean(daily.value?.progress?.canCheckIn);
  try {
    await api.patch(`/api/learning/plans/${item.planId}/items/${item.id}`, { completed: !item.completed });
    daily.value = (await api.get('/api/learning/daily')).data;
    dashboard.value = (await api.get('/api/learning/dashboard')).data;
    plans.value = dashboard.value?.plans || [];
    if (!wasEligible && daily.value.progress?.canCheckIn && !daily.value.progress?.checkedIn) {
      checkInOpen.value = true;
    }
  } catch (err: any) { fail(err, '进度更新失败'); }
}

async function confirmCheckIn() {
  if (!daily.value?.plan?.id) return;
  checkInSaving.value = true;
  try {
    await api.post(`/api/learning/plans/${daily.value.plan.id}/check-in`, { date: daily.value.date });
    checkInOpen.value = false;
    const [dailyResult, dashboardResult] = await Promise.all([
      api.get('/api/learning/daily'),
      api.get('/api/learning/dashboard'),
    ]);
    daily.value = dailyResult.data;
    dashboard.value = dashboardResult.data;
    plans.value = dashboard.value?.plans || [];
    message('今日打卡已完成');
  } catch (err: any) {
    fail(err, '今日打卡失败');
  } finally {
    checkInSaving.value = false;
  }
}

function openPlanDetails(id: string) {
  router.push(`/learning-plans/${id}`);
}

async function searchPlanProblems() {
  if (!planSearch.value.trim()) { planProblems.value = []; return; }
  try { planProblems.value = (await api.get('/api/problems', { params: { keyword: planSearch.value, pageSize: 12 } })).data.items; }
  catch (err: any) { fail(err, '题目搜索失败'); }
}

async function addToDaily(problemId: string) {
  if (!daily.value?.plan?.id) await generateDaily();
  if (!daily.value?.plan?.id) return;
  try {
    await api.post(`/api/learning/plans/${daily.value.plan.id}/items`, { problemId, dayIndex: daily.value.dayIndex || 0, type: 'PRACTICE' });
    daily.value = (await api.get('/api/learning/daily')).data;
    message('题目已加入今日练习');
  } catch (err: any) { fail(err, '题目加入失败'); }
}

async function removeFavorite(problemId: string) {
  try { await api.delete(`/api/learning/favorites/${problemId}`); favorites.value = favorites.value.filter((item) => item.problemId !== problemId); message('已取消收藏'); }
  catch (err: any) { fail(err, '取消收藏失败'); }
}

async function removeWrong(problemId: string) {
  try { await api.delete(`/api/learning/wrong-book/${problemId}`); wrongBook.value = wrongBook.value.filter((item) => item.problemId !== problemId); message('已移出错题本'); }
  catch (err: any) { fail(err, '错题移除失败'); }
}

onMounted(loadAll);
</script>

<template>
  <div class="learning-page" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="learning-sidebar">
      <div class="learning-sidebar-title">
        <span class="learning-sidebar-icon"><BookOpenCheck :size="19" /></span>
        <span class="learning-sidebar-copy"><strong>学习导航</strong><small>题单与计划</small></span>
        <button class="learning-sidebar-collapse" type="button" :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-label="sidebarCollapsed ? '展开学习侧栏' : '收起学习侧栏'" @click="sidebarCollapsed = !sidebarCollapsed"><PanelLeftOpen v-if="sidebarCollapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button>
      </div>
      <p class="learning-sidebar-label">学习模块</p>
      <nav class="workspace-nav" aria-label="学习工作台">
        <button v-for="item in workspaceTabs" :key="item.id" :title="sidebarCollapsed ? item.label : undefined" :class="{ active: activeTab === item.id }" @click="activeTab = item.id">
          <component :is="item.icon" :size="18" />
          <span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span>
          <b v-if="item.count !== undefined">{{ item.count }}</b>
        </button>
      </nav>
    </aside>

    <main class="learning-main">
      <header class="learning-header">
      <div>
        <span class="eyebrow">STUDY WORKSPACE</span>
        <h1>题单与学习计划</h1>
        <p>把要练的题、正在复习的错题和每天的目标放在一处。</p>
      </div>
      <div class="header-actions">
        <button class="secondary-btn" @click="router.push('/problems')"><BookOpenCheck :size="17" />进入题库</button>
      </div>
    </header>

    <div v-if="notice" class="notice success">{{ notice }}</div>
    <div v-if="error" class="notice error">{{ error }}<button @click="error = ''" aria-label="关闭提示">×</button></div>

    <div v-if="!auth.isLoggedIn() && !auth.loading" class="login-banner">
      <div><strong>登录后管理自己的题单和计划</strong><span>公开题单仍可浏览，收藏和错题需要账号。</span></div>
      <button class="primary-btn" @click="router.push('/login')">登录 / 注册</button>
    </div>

      <div class="learning-content">
        <div v-if="loading" class="loading-state">正在整理你的学习数据…</div>

        <template v-else>
      <section v-if="activeTab === 'overview'" class="overview-section">
        <LearningProgress v-if="auth.isLoggedIn()" :daily="daily" :plan-progress="activePlan?.progress" />
        <div v-if="auth.isLoggedIn()" class="metric-grid">
          <div class="metric"><span>已解决题目</span><strong>{{ dashboard?.counts?.solved || 0 }}</strong><small>以通过提交计算</small></div>
          <div class="metric"><span>收藏题目</span><strong>{{ dashboard?.counts?.favorites || 0 }}</strong><small>可加入每日练习</small></div>
          <div class="metric"><span>错题本</span><strong>{{ dashboard?.counts?.wrongBook || 0 }}</strong><small>优先安排复习</small></div>
        </div>
        <div class="overview-grid">
          <section class="panel daily-panel">
            <div class="panel-heading"><div><span class="section-kicker">TODAY</span><h2>今日练习</h2></div><button v-if="auth.isLoggedIn()" class="text-btn" @click="generateDaily">生成 / 补充</button></div>
            <div v-if="!auth.isLoggedIn()" class="empty-state">登录后生成每日练习。</div>
            <div v-else-if="!daily.items?.length" class="empty-state"><strong>今天还没有安排题目</strong><p>优先生成未做过的新题，不足时自动补充复习题。</p><button class="primary-btn" @click="generateDaily">生成今日练习</button></div>
            <div v-else class="daily-list">
              <label v-for="item in daily.items" :key="item.id" class="daily-row" :class="{ done: item.completed }">
                <input type="checkbox" :checked="item.completed" @change="toggleDaily(item)">
                <span class="history-check" :class="{ visible: item.previouslyDone || item.completed }">✓</span>
                <span class="daily-type">{{ item.type === 'REVIEW' ? '复习题' : '新题' }}</span>
                <button class="problem-link" @click.prevent="openProblem(item.problemId)">{{ item.problem?.title || '题目已移除' }}</button>
                <span class="row-arrow">›</span>
              </label>
            </div>
          </section>
          <section class="panel quick-panel">
            <div class="panel-heading"><div><span class="section-kicker">YOUR LIBRARY</span><h2>继续学习</h2></div><button class="text-btn" @click="activeTab = 'library'">查看全部</button></div>
            <div class="quick-list">
              <button v-for="item in continueItems" :key="item.problemId" class="quick-row" @click="openProblem(item.problemId)"><span class="quick-icon">{{ item.types.includes('错题') ? '✓' : '☆' }}</span><span><strong>{{ item.problem?.title }}</strong><small><b>{{ item.types.join(' / ') }}</b> · {{ pointDifficultyShortLabel(item.problem?.difficulty) }}</small></span><span>›</span></button>
              <div v-if="!continueItems.length" class="empty-state">收藏和错题会集中出现在这里。</div>
            </div>
          </section>
        </div>
        <section class="public-section">
          <div class="panel-heading"><div><span class="section-kicker">COMMUNITY LISTS</span><h2>公开题单</h2></div><button class="text-btn" @click="activeTab = 'lists'">管理题单</button></div>
          <div class="public-grid"><button v-for="list in publicLists.slice(0, 6)" :key="list.id" class="public-list" @click="openPublicList(list.id)"><strong>{{ list.name }}</strong><span>{{ list._count?.items || 0 }} 道题</span><small>{{ list.description || '暂无说明' }}</small></button><div v-if="!publicLists.length" class="empty-state">还没有公开题单。</div></div>
        </section>
      </section>

      <section v-else-if="activeTab === 'lists'" class="lists-section">
        <div class="section-toolbar"><div><span class="section-kicker">CURATED PRACTICE</span><h2>我的题单</h2></div><button v-if="auth.isLoggedIn()" class="primary-btn" @click="openNewList">新建题单</button></div>
        <div v-if="!auth.isLoggedIn()" class="empty-state">登录后创建和编辑题单。</div>
        <div v-else class="lists-workspace">
          <aside class="list-sidebar"><button v-for="list in lists" :key="list.id" :class="['list-nav-item', { active: selectedListId === list.id }]" @click="selectList(list.id)"><span>{{ list.isPublic ? '公开' : '私有' }}</span><strong>{{ list.name }}</strong><small>{{ list._count?.items || 0 }} 题</small></button><div v-if="!lists.length" class="empty-state compact">还没有题单。</div></aside>
          <main v-if="selectedList" class="list-editor panel">
            <div class="editor-heading"><div><span class="section-kicker">{{ selectedListOwned ? 'LIST EDITOR' : 'PUBLIC LIST' }}</span><h2>{{ selectedList.name }}</h2><p>{{ selectedList.isPublic ? '公开题单' : '仅自己可见' }} · {{ selectedListItems.length }} 道题</p></div><div v-if="selectedListOwned" class="inline-actions"><button class="secondary-btn" @click="deleteList">删除</button><button class="primary-btn" @click="updateList">保存设置</button></div></div>
            <div v-if="selectedListOwned" class="list-settings"><label>名称<input v-model="listForm.name" maxlength="80"></label><label>说明<textarea v-model="listForm.description" rows="2" maxlength="500"></textarea></label><label class="switch-label"><input v-model="listForm.isPublic" type="checkbox"><span>公开题单</span></label></div>
            <p v-else class="public-description">{{ selectedList.description || '这个公开题单没有说明。' }}</p>
            <div class="subheading"><div><h3>题目排序</h3><small>{{ sortDirectionLabel }}</small></div><div v-if="selectedListOwned" class="search-inline"><input v-model="listSearch" placeholder="按标题、站内 ID 或平台题号搜索" @keyup.enter="searchListProblems"><button class="secondary-btn" :disabled="listProblemsLoading" @click="searchListProblems">{{ listProblemsLoading ? '加载中' : '搜索' }}</button></div></div>
            <div class="sort-toolbar" aria-label="题单排序方式">
              <div class="sort-modes">
                <button :class="{ active: listSort === 'difficulty' }" @click="selectListSort('difficulty')">按难度</button>
                <button :class="{ active: listSort === 'number' }" @click="selectListSort('number')">按编号</button>
                <button :class="{ active: listSort === 'joined' }" @click="selectListSort('joined')">按加入时间</button>
              </div>
              <button class="sort-direction" :title="`倒转排序，当前为${sortDirectionLabel}`" aria-label="倒转排序" @click="reverseListSort">{{ listSortDirection === 'asc' ? '↑' : '↓' }}</button>
            </div>
            <div v-if="selectedListOwned" class="problem-catalog"><div class="catalog-heading"><span>站内题目</span><small>{{ listProblemKeyword ? `“${listProblemKeyword}”的搜索结果` : '最近发布' }}</small></div><div v-if="listProblems.length" class="search-results"><button v-for="problem in listProblems" :key="problem.id" @click="addToList(problem.id)"><span><strong>{{ problem.title }}</strong><small>{{ problem.sourceInfo?.platform || problem.source || 'LOCAL' }}{{ problem.sourceInfo?.remoteProblemId ? ` · ${problem.sourceInfo.remoteProblemId}` : '' }}</small></span><b>＋加入</b></button></div><div v-else-if="listProblemsLoading" class="problem-search-empty">正在获取站内题目...</div><div v-else-if="listProblemsLoaded" class="problem-search-empty">{{ listProblemKeyword ? '没有找到匹配题目，请尝试标题或平台题号。' : '暂无其他可加入的已发布题目。' }}</div></div>
            <div v-if="selectedListItems.length" class="ordered-list"><div v-for="(item, index) in sortedListItems" :key="item.id" class="ordered-row"><span class="order-number">{{ index + 1 }}</span><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title }}</button><span v-if="listSort === 'joined'" class="joined-at">{{ new Date(item.createdAt).toLocaleDateString() }}</span><span class="difficulty">{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span><button v-if="selectedListOwned" class="icon-btn danger" title="移出题单" @click="removeFromList(item.id)">×</button><button v-else class="icon-btn" title="打开题目" @click="openProblem(item.problemId)">›</button></div></div>
            <div v-else class="empty-state">从上方站内题目中选择并加入这个题单。</div>
          </main>
          <div v-else class="empty-state panel">选择一个题单开始编辑。</div>
        </div>
      </section>

      <section v-else-if="activeTab === 'plans'" class="plans-section">
        <div class="section-toolbar"><div><span class="section-kicker">GOALS & PROGRESS</span><h2>学习计划</h2></div><button class="primary-btn" @click="openNewPlan">{{ plans.length ? '更换计划' : '新建计划' }}</button></div>
        <LearningProgress v-if="activePlan" :daily="daily" :plan-progress="activePlan.progress" />
        <div class="plans-grid"><article v-for="plan in plans" :key="plan.id" class="plan-row panel"><button class="plan-main" @click="openPlanDetails(plan.id)"><span class="plan-type">{{ plan.type }}</span><h3>{{ plan.name }}</h3><p>{{ plan.description || '没有设置计划说明' }}</p></button><div class="plan-meta"><strong>{{ plan.progress?.checkedInDays || 0 }} / {{ plan.progress?.totalDays || 0 }}</strong><small>打卡天数</small></div><button class="icon-btn danger" title="删除计划" @click="deletePlan(plan.id)">×</button></article><div v-if="!plans.length" class="empty-state panel">创建一个计划，安排每日目标和复习节奏。</div></div>
        <div class="panel plan-builder"><div class="panel-heading"><div><span class="section-kicker">TODAY</span><h2>每日练习编排</h2></div><button class="text-btn" @click="generateDaily">按计划补充</button></div><div class="daily-progress"><div><strong>{{ daily.progress?.completed || 0 }} / {{ daily.progress?.total || 0 }}</strong><span>今日完成</span></div><div class="progress-track"><i :style="{ width: `${completionPercent}%` }"></i></div><span>{{ completionPercent }}%</span></div><div class="search-inline wide"><input v-model="planSearch" placeholder="搜索题目加入今日练习" @keyup.enter="searchPlanProblems"><button class="secondary-btn" @click="searchPlanProblems">搜索</button></div><div v-if="planProblems.length" class="search-results"><button v-for="problem in planProblems" :key="problem.id" @click="addToDaily(problem.id)"><span>{{ problem.title }}</span><small>＋加入今日</small></button></div><div class="daily-list schedule-list"><label v-for="item in daily.items" :key="item.id" class="daily-row" :class="{ done: item.completed }"><input type="checkbox" :checked="item.completed" @change="toggleDaily(item)"><span class="history-check" :class="{ visible: item.previouslyDone || item.completed }">✓</span><span class="daily-type">{{ item.type === 'REVIEW' ? '复习题' : '新题' }}</span><button class="problem-link" @click.prevent="openProblem(item.problemId)">{{ item.problem?.title }}</button></label></div></div>
      </section>

      <section v-else class="library-section"><div class="section-toolbar"><div><span class="section-kicker">RETAIN & REVIEW</span><h2>收藏与错题</h2></div><button class="secondary-btn" @click="generateDaily">把重点加入今日练习</button></div><div class="library-grid"><section class="panel library-column"><div class="panel-heading"><div><h2>收藏题目</h2><small>{{ favorites.length }} 道题</small></div></div><div class="library-list"><div v-for="item in favorites" :key="item.id" class="library-row"><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title }}</button><span>{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span><button class="icon-btn" title="取消收藏" @click="removeFavorite(item.problemId)">☆</button></div><div v-if="!favorites.length" class="empty-state">在题目页点击收藏，建立自己的练习清单。</div></div></section><section class="panel library-column"><div class="panel-heading"><div><h2>错题本</h2><small>{{ wrongBook.length }} 道题</small></div></div><div class="library-list"><div v-for="item in wrongBook" :key="item.id" class="library-row"><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title }}</button><span class="wrong-tag">{{ item.errorType }}</span><button class="icon-btn" title="移出错题本" @click="removeWrong(item.problemId)">✓</button></div><div v-if="!wrongBook.length" class="empty-state">提交出现错误的题目会自动进入这里。</div></div></section></div></section>
        </template>
      </div>
    </main>

    <div v-if="listModalOpen || planModalOpen" class="modal-backdrop" @click.self="listModalOpen = false; planModalOpen = false"><section class="modal panel"><button class="modal-close" aria-label="关闭" @click="listModalOpen = false; planModalOpen = false">×</button><template v-if="listModalOpen"><span class="section-kicker">NEW LIST</span><h2>创建题单</h2><label>名称<input v-model="listForm.name" maxlength="80" autofocus></label><label>说明<textarea v-model="listForm.description" rows="3" maxlength="500"></textarea></label><label class="switch-label"><input v-model="listForm.isPublic" type="checkbox"><span>创建后公开</span></label><button class="primary-btn full-btn" :disabled="saving" @click="saveList">{{ saving ? '保存中…' : '创建题单' }}</button></template><template v-else><span class="section-kicker">NEW PLAN</span><h2>{{ plans.length ? '更换学习计划' : '创建学习计划' }}</h2><div v-if="plans.length" class="replace-warning">当前计划及其题目、进度、打卡记录会在新计划创建后删除。</div><label>名称<input v-model="planForm.name" maxlength="80" autofocus></label><label>说明<textarea v-model="planForm.description" rows="2" maxlength="500"></textarea></label><div class="date-fields"><label>开始<input v-model="planForm.startDate" type="date"></label><label>结束<input v-model="planForm.endDate" type="date"></label></div><label>每日目标<input v-model.number="planForm.dailyTarget" type="number" min="1" max="50"></label><button class="primary-btn full-btn" @click="savePlan">{{ plans.length ? '确认更换计划' : '创建计划' }}</button></template></section></div>
    <CheckInModal v-if="checkInOpen" :date="daily.date" :plan-name="daily.plan?.name" :saving="checkInSaving" @confirm="confirmCheckIn" @close="checkInOpen = false" />
  </div>
</template>

<style scoped>
.learning-page { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 42px 0 72px; color: #1f2937; }
.learning-header, .section-toolbar, .panel-heading, .editor-heading, .subheading, .header-actions, .inline-actions, .daily-progress { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.learning-header { margin-bottom: 30px; align-items: flex-end; }
.eyebrow, .section-kicker { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
h1 { margin: 6px 0 8px; color: #0f172a; font-size: clamp(30px, 4vw, 46px); line-height: 1.08; letter-spacing: 0; }
h2 { color: #0f172a; font-size: 20px; line-height: 1.25; letter-spacing: 0; }
h3 { color: #0f172a; font-size: 16px; letter-spacing: 0; }
.learning-header p, .editor-heading p, .panel-heading small, .subheading small { color: #64748b; font-size: 13px; }
.primary-btn, .secondary-btn, .text-btn, .icon-btn { border: 0; font: inherit; cursor: pointer; }
.primary-btn, .secondary-btn { border-radius: 6px; padding: 10px 16px; font-weight: 700; white-space: nowrap; }
.primary-btn { background: #0f766e; color: white; }
.primary-btn:hover { background: #115e59; }
.primary-btn:disabled { opacity: .6; cursor: wait; }
.secondary-btn { background: #e2e8f0; color: #334155; }
.secondary-btn:hover { background: #cbd5e1; }
.text-btn { padding: 3px 0; background: transparent; color: #0f766e; font-size: 13px; font-weight: 700; }
.text-btn:hover { color: #115e59; text-decoration: underline; }
.icon-btn { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 5px; background: transparent; color: #64748b; font-size: 18px; line-height: 1; }
.icon-btn:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }
.icon-btn:disabled { color: #cbd5e1; cursor: not-allowed; }
.icon-btn.danger:hover { color: #b91c1c; background: #fee2e2; }
.notice { position: fixed; left: 14px; right: 14px; top: 74px; z-index: 120; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, .14); font-size: 14px; }
.notice.success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
.notice.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.notice button { border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }
.login-banner { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; padding: 14px 18px; border-left: 3px solid #0f766e; background: #f0fdfa; }
.login-banner strong, .login-banner span { display: block; }
.login-banner strong { color: #134e4a; font-size: 14px; }
.login-banner span { margin-top: 3px; color: #64748b; font-size: 13px; }
.workspace-tabs { display: flex; gap: 4px; margin-bottom: 28px; border-bottom: 1px solid #cbd5e1; overflow-x: auto; }
.workspace-tabs button { border: 0; border-bottom: 2px solid transparent; padding: 12px 16px; background: transparent; color: #64748b; cursor: pointer; white-space: nowrap; font: inherit; font-size: 14px; font-weight: 700; }
.workspace-tabs button:hover { color: #0f766e; }
.workspace-tabs button.active { border-color: #0f766e; color: #0f766e; }
.workspace-tabs span { display: inline-flex; min-width: 20px; justify-content: center; margin-left: 4px; padding: 1px 5px; border-radius: 10px; background: #e2e8f0; color: #64748b; font-size: 11px; }
.workspace-tabs button.active span { background: #ccfbf1; color: #0f766e; }
.loading-state, .empty-state { padding: 42px 20px; color: #64748b; text-align: center; }
.empty-state strong { display: block; color: #334155; margin-bottom: 5px; }
.empty-state p { margin: 0 0 16px; font-size: 13px; }
.empty-state.compact { padding: 22px 10px; font-size: 13px; }
.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
.metric { padding: 18px 20px; border-top: 3px solid #cbd5e1; background: white; box-shadow: 0 2px 10px rgba(15, 23, 42, .04); }
.metric span, .metric small { display: block; color: #64748b; font-size: 12px; }
.metric strong { display: block; margin: 8px 0 2px; color: #0f172a; font-size: 27px; line-height: 1; }
.overview-grid, .library-grid { display: grid; grid-template-columns: 1.25fr .75fr; gap: 16px; }
.panel { border: 1px solid #e2e8f0; background: white; box-shadow: 0 2px 10px rgba(15, 23, 42, .035); }
.daily-panel, .quick-panel, .plan-builder, .library-column, .list-editor { padding: 22px; }
.daily-panel .panel-heading, .quick-panel .panel-heading, .plan-builder .panel-heading, .library-column .panel-heading { margin-bottom: 18px; }
.daily-list { border-top: 1px solid #e2e8f0; }
.daily-row, .quick-row, .ordered-row, .library-row { display: flex; align-items: center; gap: 10px; min-height: 48px; border-bottom: 1px solid #f1f5f9; }
.daily-row:last-child, .quick-row:last-child, .ordered-row:last-child, .library-row:last-child { border-bottom: 0; }
.daily-row input { width: 16px; height: 16px; accent-color: #0f766e; }
.daily-row.done .problem-link { color: #94a3b8; text-decoration: line-through; }
.history-check { width: 16px; color: transparent; font-weight: 800; }
.history-check.visible { color: #0f766e; }
.daily-type, .plan-type { min-width: 36px; color: #64748b; font-size: 11px; font-weight: 700; }
.problem-link { flex: 1; min-width: 0; border: 0; padding: 0; background: transparent; color: #0f766e; text-align: left; cursor: pointer; font: inherit; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.problem-link:hover { color: #115e59; text-decoration: underline; }
.row-arrow { color: #94a3b8; font-size: 24px; line-height: 1; }
.quick-list { border-top: 1px solid #e2e8f0; }
.quick-row { width: 100%; border: 0; border-bottom: 1px solid #f1f5f9; background: transparent; text-align: left; cursor: pointer; }
.quick-row > span:last-child { color: #94a3b8; font-size: 22px; }
.quick-icon { width: 28px; color: #f59e0b; font-size: 21px; }
.quick-row strong, .quick-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-row strong { color: #334155; font-size: 14px; }
.quick-row small { margin-top: 2px; color: #94a3b8; font-size: 12px; }
.public-section { margin-top: 22px; padding-top: 4px; }
.public-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
.public-list { min-height: 120px; padding: 17px; border: 1px solid #e2e8f0; border-top: 3px solid #0f766e; background: white; text-align: left; cursor: pointer; }
.public-list:hover { border-color: #99f6e4; box-shadow: 0 4px 14px rgba(15, 118, 110, .1); }
.public-list strong, .public-list span, .public-list small { display: block; }
.public-list strong { color: #0f172a; font-size: 15px; }
.public-list span { margin-top: 6px; color: #0f766e; font-size: 12px; }
.public-list small { margin-top: 10px; color: #64748b; font-size: 12px; line-height: 1.4; }
.lists-workspace { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }
.list-sidebar { border-right: 1px solid #e2e8f0; padding-right: 12px; }
.list-nav-item { display: block; width: 100%; margin-bottom: 4px; padding: 13px 14px; border: 1px solid transparent; background: transparent; text-align: left; cursor: pointer; }
.list-nav-item:hover { background: #f8fafc; }
.list-nav-item.active { border-color: #99f6e4; background: #f0fdfa; }
.list-nav-item span, .list-nav-item strong, .list-nav-item small { display: block; }
.list-nav-item span { color: #0f766e; font-size: 10px; font-weight: 800; letter-spacing: .08em; }
.list-nav-item strong { margin: 4px 0; color: #334155; font-size: 14px; }
.list-nav-item small { color: #94a3b8; font-size: 12px; }
.editor-heading { align-items: flex-start; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; }
.inline-actions { align-items: flex-start; }
.list-settings { display: grid; grid-template-columns: 1fr 2fr auto; align-items: end; gap: 14px; padding: 18px 0; border-bottom: 1px solid #e2e8f0; }
.public-description { padding: 18px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; }
label { display: block; color: #475569; font-size: 12px; font-weight: 700; }
input, textarea { width: 100%; margin-top: 7px; border: 1px solid #cbd5e1; border-radius: 5px; padding: 9px 10px; background: #fff; color: #1e293b; font: inherit; font-size: 14px; outline: none; }
input:focus, textarea:focus { border-color: #0f766e; box-shadow: 0 0 0 2px #ccfbf1; }
textarea { resize: vertical; }
.switch-label { display: flex; align-items: center; gap: 8px; min-height: 40px; white-space: nowrap; }
.switch-label input { width: 16px; margin: 0; accent-color: #0f766e; }
.subheading { margin: 20px 0 10px; align-items: flex-end; }
.subheading h3 { margin-bottom: 3px; }
.search-inline { display: flex; gap: 8px; align-items: flex-end; }
.search-inline input { min-width: 230px; margin: 0; }
.search-inline.wide { margin: 18px 0; }
.search-inline.wide input { flex: 1; }
.search-results { margin-bottom: 10px; border: 1px solid #bae6fd; background: #f0f9ff; }
.search-results button { display: flex; justify-content: space-between; width: 100%; padding: 9px 12px; border: 0; border-bottom: 1px solid #e0f2fe; background: transparent; color: #334155; text-align: left; cursor: pointer; font: inherit; }
.search-results button:last-child { border-bottom: 0; }
.search-results button:hover { background: #e0f2fe; }
.search-results small { color: #0369a1; font-weight: 700; }
.problem-catalog { margin:12px 0 16px; overflow:hidden; border:1px solid #dbe5ee; border-radius:7px; background:#f8fbfe; }.catalog-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; color:#34536f; font-size:12px; font-weight:850; }.catalog-heading small { color:#8492a2; font-size:10px; font-weight:650; }.problem-catalog .search-results { max-height:260px; margin:0; overflow-y:auto; border:0; border-top:1px solid #dbe5ee; background:#fff; }.problem-catalog .search-results button>span { display:grid; gap:3px; min-width:0; }.problem-catalog .search-results strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }.problem-catalog .search-results small { color:#7d8b9b; font-size:9px; }.problem-catalog .search-results b { flex:0 0 auto; color:#2469ad; font-size:11px; }.problem-search-empty { padding:24px 14px; border-top:1px solid #dbe5ee; color:#7d8b9b; text-align:center; font-size:11px; }
.ordered-list { border-top: 1px solid #e2e8f0; }
.sort-toolbar { display: flex; align-items: center; justify-content: flex-start; gap: 12px; margin-bottom: 12px; }
.sort-modes { display: flex; gap: 4px; overflow-x: auto; }
.sort-modes button, .sort-direction { border: 1px solid #cbd5e1; background: #fff; color: #64748b; cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; }
.sort-modes button { padding: 7px 10px; }
.sort-modes button:first-child { border-radius: 5px 0 0 5px; }
.sort-modes button:last-child { border-radius: 0 5px 5px 0; }
.sort-modes button + button { margin-left: -5px; border-left-color: transparent; }
.sort-modes button.active { position: relative; z-index: 1; border-color: #0f766e; background: #f0fdfa; color: #0f766e; }
.sort-direction { width: 34px; height: 32px; border-radius: 5px; color: #0f766e; font-size: 18px; }
.sort-direction:hover { border-color: #0f766e; background: #f0fdfa; }
.order-number { width: 28px; color: #94a3b8; font-size: 12px; text-align: center; }
.difficulty, .library-row > span { color: #64748b; font-size: 12px; }
.joined-at { color: #94a3b8; font-size: 11px; white-space: nowrap; }
.plans-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0 22px; }
.plan-row { display: flex; align-items: center; gap: 14px; padding: 17px; }
.plan-main { flex: 1; min-width: 0; border: 0; padding: 0; background: transparent; cursor: pointer; text-align: left; }
.plan-main > * { pointer-events: none; }
.plan-type { color: #0f766e; font-size: 10px; letter-spacing: .08em; }
.plan-row h3 { margin: 4px 0; }
.plan-row p { color: #64748b; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-meta { display: flex; flex-direction: column; align-items: center; color: #64748b; }
.plan-meta strong { color: #0f766e; font-size: 23px; line-height: 1; }
.plan-meta small { margin-top: 3px; font-size: 11px; }
.daily-progress { margin-bottom: 16px; }
.daily-progress strong, .daily-progress span { display: block; }
.daily-progress strong { color: #0f766e; font-size: 18px; }
.daily-progress span { color: #64748b; font-size: 11px; }
.progress-track { flex: 1; height: 7px; overflow: hidden; border-radius: 4px; background: #e2e8f0; }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: #0f766e; transition: width .25s ease; }
.schedule-list { margin-top: 12px; }
.library-grid { grid-template-columns: 1fr 1fr; margin-top: 16px; }
.library-list { border-top: 1px solid #e2e8f0; }
.library-row { padding: 2px 0; }
.wrong-tag { color: #b91c1c !important; font-size: 11px !important; font-weight: 700; }
.full-btn { width: 100%; }
.modal-backdrop { position: fixed; inset: 0; z-index: 150; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .45); }
.modal { position: relative; width: min(480px, 100%); padding: 26px; }
.modal h2 { margin: 6px 0 20px; }
.modal label + label { margin-top: 14px; }
.modal-close { position: absolute; top: 13px; right: 15px; border: 0; background: transparent; color: #64748b; font-size: 24px; cursor: pointer; }
.date-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.modal .full-btn { margin-top: 20px; }
.replace-warning { margin: -8px 0 16px; padding: 10px 12px; border-left: 3px solid #f59e0b; background: #fffbeb; color: #92400e; font-size: 12px; line-height: 1.5; }
@media (max-width: 900px) {
  .overview-grid, .library-grid { grid-template-columns: 1fr; }
  .lists-workspace { grid-template-columns: 210px 1fr; }
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
  .public-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .learning-page { width: min(100% - 28px, 1180px); padding-top: 26px; }
  .learning-header { display: block; }
  .header-actions { margin-top: 18px; }
  .metric-grid, .public-grid, .plans-grid { grid-template-columns: 1fr; }
  .lists-workspace { grid-template-columns: 1fr; }
  .list-sidebar { display: flex; gap: 6px; overflow-x: auto; border-right: 0; border-bottom: 1px solid #e2e8f0; padding: 0 0 10px; }
  .list-nav-item { min-width: 180px; margin: 0; }
  .list-settings { grid-template-columns: 1fr; }
  .editor-heading, .subheading, .section-toolbar { align-items: flex-start; flex-direction: column; }
  .inline-actions, .search-inline, .sort-toolbar { width: 100%; }
  .sort-toolbar { align-items: stretch; }
  .search-inline input { min-width: 0; flex: 1; }
  .library-row .problem-link { white-space: normal; }
  .login-banner { display: block; }
  .login-banner .primary-btn { margin-top: 12px; }
}
@media (min-width: 641px) { .notice { left: auto; right: 24px; max-width: 420px; } }

/* Product-wide learning workspace skin: aligned with Home and Contests. */
.learning-page { --workspace-navy:#173b66; --workspace-blue:#2469ad; --workspace-pale:#eaf3fc; --workspace-line:#dfe7ef; display:flex; width:100%; max-width:none; min-height:calc(100vh - 56px); margin:0; padding:0; background:#f3f5f7; font-family:'Manrope Variable','Noto Sans SC Variable',sans-serif; }
.learning-main { min-width:0; flex:1; padding:26px 28px 72px; }.learning-main>.learning-header,.learning-main>.login-banner,.learning-main>.learning-content { width:min(1180px,100%); margin-right:auto; margin-left:auto; }
.learning-header { min-height:166px; padding:28px 32px; border-radius:8px; color:#fff; background:var(--workspace-navy); box-shadow:0 14px 32px rgba(23,59,102,.16); }
.learning-header .eyebrow { color:#8fc2ec; letter-spacing:0; }
.learning-header h1 { color:#fff; font-size:34px; letter-spacing:0; }
.learning-header p { color:#d7e6f4; }
.header-actions { flex-wrap:wrap; }
.header-actions .secondary-btn { color:#eaf4fd; border:1px solid rgba(255,255,255,.24); background:rgba(255,255,255,.1); }
.header-actions .primary-btn { color:#173b66; background:#f2c66d; }
.primary-btn,.secondary-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:6px; }
.primary-btn { background:var(--workspace-blue); }
.primary-btn:hover { background:#1b568d; }
.learning-sidebar { position:sticky; top:56px; display:flex; width:264px; height:calc(100vh - 56px); flex:0 0 264px; align-self:flex-start; padding:22px 14px; overflow:hidden; flex-direction:column; border-right:1px solid var(--workspace-line); background:#f8fbfe; transition:width .18s,flex-basis .18s; }
.learning-sidebar-title { display:flex; align-items:center; gap:10px; padding:0 7px 18px; }.learning-sidebar-icon { display:grid; width:38px; height:38px; flex:0 0 38px; place-items:center; border-radius:8px; color:#1c5688; background:#dcecf9; }.learning-sidebar-copy { display:grid; min-width:0; gap:2px; }.learning-sidebar-copy strong { color:#29435d; font-size:13px; }.learning-sidebar-copy small { color:#8492a2; font-size:10px; }.learning-sidebar-collapse { display:grid; width:34px; height:34px; flex:0 0 34px; margin-left:auto; place-items:center; border:0; border-radius:7px; color:#6e7f91; background:transparent; cursor:pointer; }.learning-sidebar-collapse:hover { color:#245f94; background:#e7f0f8; }.learning-sidebar-label { margin:4px 9px 9px; color:#8493a5; font-size:10px; font-weight:900; }
.workspace-nav { display:grid; gap:5px; }
.workspace-nav button { display:grid; grid-template-columns:22px minmax(0,1fr) auto; min-height:52px; align-items:center; gap:9px; width:100%; padding:7px 10px; border:0; border-radius:7px; color:#65768a; text-align:left; background:transparent; font:inherit; cursor:pointer; }
.workspace-nav button:hover { color:#1f5e96; background:#eef6fd; }
.workspace-nav button.active { color:#fff; background:var(--workspace-navy); box-shadow:0 6px 14px rgba(23,59,102,.18); }
.workspace-nav button>span { display:grid; gap:2px; min-width:0; }.workspace-nav button strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }.workspace-nav button small { color:#8a98a8; font-size:9px; }.workspace-nav button.active small { color:#cbddee; }
.workspace-nav button b { display:grid; min-width:21px; height:20px; place-items:center; padding:0 4px; border-radius:5px; color:#356b99; background:#e1edf8; font-size:10px; }.workspace-nav button.active b { color:#fff; background:rgba(255,255,255,.15); }
.learning-content { min-width:0; margin-top:22px!important; }
.learning-page.sidebar-collapsed .learning-sidebar { width:72px; flex-basis:72px; padding-right:10px; padding-left:10px; }.sidebar-collapsed .learning-sidebar-icon,.sidebar-collapsed .learning-sidebar-copy,.sidebar-collapsed .learning-sidebar-label { display:none; }.sidebar-collapsed .learning-sidebar-title { justify-content:center; padding-right:0; padding-left:0; }.sidebar-collapsed .learning-sidebar-collapse { margin-left:0; }.sidebar-collapsed .workspace-nav button { grid-template-columns:1fr; justify-items:center; padding-right:0; padding-left:0; }.sidebar-collapsed .workspace-nav button>span,.sidebar-collapsed .workspace-nav button>b { display:none; }
.panel,.public-section,.metric,.login-banner { border-color:var(--workspace-line); border-radius:8px; box-shadow:0 7px 20px rgba(23,59,102,.04); }
.metric { border-top:3px solid #8fb9dc; }
.metric strong,.plan-meta strong,.daily-progress strong { color:#1f6099; }
.section-kicker,.text-btn,.plan-type,.list-nav-item span { color:#3977aa; letter-spacing:0; }
.text-btn:hover { color:#174f81; }
.list-sidebar { border-right-color:var(--workspace-line); background:#f8fbfe; }
.list-nav-item { border-radius:7px; }
.list-nav-item:hover { background:#edf5fc; }
.list-nav-item.active { border-color:#91b9da; background:#edf6fd; }
input:focus,textarea:focus { border-color:#3979ad; box-shadow:0 0 0 2px #deedf9; }
.switch-label input { accent-color:var(--workspace-blue); }
.sort-modes button.active,.sort-direction:hover { border-color:var(--workspace-blue); color:#1f6098; background:#edf6fd; }
.sort-direction { color:#1f6098; }
.progress-track i { background:var(--workspace-blue); }
.daily-type { color:#28679d; background:#e6f1fb; }
.public-list:hover { border-color:#8fb7d8; box-shadow:0 10px 22px rgba(23,59,102,.09); }
.modal { border-radius:8px; }
@media(max-width:860px){.learning-page{display:block}.learning-main{padding:18px 16px 52px}.learning-sidebar,.learning-page.sidebar-collapsed .learning-sidebar{position:static;width:auto;height:auto;padding:12px;border-right:0}.learning-sidebar-title{display:none}.workspace-nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:5px;border:1px solid var(--workspace-line);border-radius:8px;background:#fff}.workspace-nav button,.sidebar-collapsed .workspace-nav button{grid-template-columns:22px minmax(0,1fr) auto;justify-items:initial;min-height:46px;padding:7px 10px}.workspace-nav button:last-child{grid-column:1/-1}.workspace-nav button small,.sidebar-collapsed .workspace-nav button small,.sidebar-collapsed .workspace-nav button>span,.sidebar-collapsed .workspace-nav button>b{display:initial}.workspace-nav button>span,.sidebar-collapsed .workspace-nav button>span{display:grid}.workspace-nav button>b,.sidebar-collapsed .workspace-nav button>b{display:grid}.learning-content{margin-top:20px!important}.learning-header{align-items:flex-start;flex-direction:column}.learning-header h1{font-size:29px}}
</style>
