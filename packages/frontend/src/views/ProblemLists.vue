<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  CircleStop,
  LayoutDashboard,
  Library,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import FilterSelect from '../components/FilterSelect.vue';
import ProblemStateBadges from '../components/ProblemStateBadges.vue';
import { useAuthStore } from '../stores/auth';
import {
  pointDifficultyOptions,
  pointDifficultyOrder,
  pointDifficultyShortLabel,
} from '../utils/pointDifficulty';

type Tab = 'practice' | 'plans' | 'lists' | 'library';
type LibraryView = 'summary' | 'favorites' | 'wrong';
type ListSort = 'difficulty' | 'number' | 'joined';
type CatalogProblem = {
  id: string;
  title: string;
  source?: string;
  difficulty?: string | null;
  tags?: Array<{ name: string }>;
  sourceInfo?: { remoteProblemId?: string; platform?: string } | null;
  state?: any;
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const activeTab = ref<Tab>('practice');
const sidebarCollapsed = useStorage('swufe-oj:learning-sidebar-collapsed-v2', true);
const loading = ref(true);
const saving = ref(false);
const savingPlanId = ref('');
const error = ref('');
const notice = ref('');

const lists = ref<any[]>([]);
const publicLists = ref<any[]>([]);
const selectedListId = ref('');
const selectedList = ref<any>(null);
const listForm = ref({ name: '', description: '', isPublic: true });
const listModalOpen = ref(false);
const listSearch = ref('');
const listProblems = ref<CatalogProblem[]>([]);
const listProblemsLoading = ref(false);
const listProblemsLoaded = ref(false);
const listSort = ref<ListSort>('difficulty');
const listSortDirection = ref<'asc' | 'desc'>('asc');
const catalogPage = ref(1);
const catalogPageSize = 10;
const catalogTotal = ref(0);
const catalogSource = ref('');
const catalogDifficulty = ref('');
const catalogTag = ref('');
const catalogMetadata = ref<{
  tags: Array<{ name: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
} | null>(null);
const catalogSelected = ref<CatalogProblem[]>([]);
const catalogAdding = ref(false);
let catalogSearchSerial = 0;

const plans = ref<any[]>([]);
const dashboard = ref<any>(null);
const daily = ref<any>({ items: [], progress: { total: 0 } });
const continueLearning = ref<any>({ items: [], counts: { wrong: 0, attempted: 0 } });
const continueExpanded = ref(false);
const myPlansOpen = ref(false);

const favorites = ref<any[]>([]);
const wrongBook = ref<any[]>([]);
const libraryView = ref<LibraryView>('summary');

const selectedListItems = computed(() => selectedList.value?.items || []);
const selectedListOwned = computed(() => lists.value.some((item) => item.id === selectedList.value?.id));
const activePlans = computed(() => plans.value.filter((plan) => plan.status === 'ACTIVE'));
const completedPlans = computed(() => plans.value.filter((plan) => plan.status === 'COMPLETED'));
const activePlanListIds = computed(() => new Set(activePlans.value.map((plan) => plan.problemListId)));
const featuredLists = computed(() =>
  publicLists.value.filter((list) => !activePlanListIds.value.has(list.id)).slice(0, 8),
);
const workspaceTabs = computed(() => [
  { id: 'practice' as const, label: '刷题', detail: '今日练习', icon: LayoutDashboard },
  { id: 'plans' as const, label: '学习计划', detail: '题单进度', icon: CalendarCheck, count: activePlans.value.length },
  { id: 'lists' as const, label: '题单', detail: '公开题单', icon: ListChecks, count: publicLists.value.length },
  { id: 'library' as const, label: '收藏与错题', detail: '重点回顾', icon: Library },
]);
const sortedListItems = computed(() => {
  const direction = listSortDirection.value === 'asc' ? 1 : -1;
  return [...selectedListItems.value].sort((left, right) => {
    if (listSort.value === 'difficulty') {
      const difference = pointDifficultyOrder(left.problem?.difficulty) - pointDifficultyOrder(right.problem?.difficulty);
      if (difference) return difference * direction;
    } else if (listSort.value === 'number') {
      const numberOf = (title = '') => Number(title.match(/P\s*(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
      const difference = numberOf(left.problem?.title) - numberOf(right.problem?.title);
      if (difference) return difference * direction;
    } else {
      const difference = new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
      if (difference) return difference * direction;
    }
    return String(left.problem?.title || '').localeCompare(String(right.problem?.title || ''), 'zh-CN') * direction;
  });
});
const sortDirectionLabel = computed(() => {
  if (listSort.value === 'difficulty') return listSortDirection.value === 'asc' ? '简单到困难' : '困难到简单';
  if (listSort.value === 'number') return listSortDirection.value === 'asc' ? '编号从小到大' : '编号从大到小';
  return listSortDirection.value === 'desc' ? '最新加入优先' : '最早加入优先';
});
const fullLibraryItems = computed(() => (libraryView.value === 'favorites' ? favorites.value : wrongBook.value));
const catalogTotalPages = computed(() => Math.max(1, Math.ceil(catalogTotal.value / catalogPageSize)));
const catalogSelectedIds = computed(() => new Set(catalogSelected.value.map((item) => item.id)));
const catalogPageFullySelected = computed(() => {
  if (!listProblems.value.length) return false;
  return listProblems.value.every((item) => catalogSelectedIds.value.has(item.id));
});
const catalogSourceOptions = computed(() => [
  { value: '', label: '全部来源' },
  ...(catalogMetadata.value?.sources || []).map((item) => ({
    value: item.source,
    label: item.source === 'LOCAL' ? `原创 (${item.count})` : `${item.source} (${item.count})`,
  })),
]);
const catalogTagOptions = computed(() => [
  { value: '', label: '全部标签' },
  ...(catalogMetadata.value?.tags || []).slice(0, 80).map((item) => ({
    value: item.name,
    label: `${item.name} (${item.count})`,
  })),
]);

function message(text: string) {
  notice.value = text;
  window.setTimeout(() => {
    if (notice.value === text) notice.value = '';
  }, 2600);
}

function fail(err: any, fallback = '操作失败') {
  error.value = err?.response?.data?.message || fallback;
}

function problemCount(list: any) {
  return list?._count?.items ?? list?.items?.length ?? 0;
}

function changeTab(tab: Tab) {
  activeTab.value = tab;
  if (tab !== 'library') libraryView.value = 'summary';
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    if (auth.token && !auth.user) await auth.fetchProfile();
    const results = await Promise.all([
      api.get('/api/problem-lists/public'),
      api.get('/api/problem-lists'),
      api.get('/api/learning/dashboard'),
      api.get('/api/learning/favorites'),
      api.get('/api/learning/wrong-book'),
    ]);
    publicLists.value = results[0].data;
    lists.value = results[1].data;
    dashboard.value = results[2].data;
    daily.value = dashboard.value?.daily || { items: [], progress: { total: 0 } };
    continueLearning.value = dashboard.value?.continueLearning || { items: [], counts: { wrong: 0, attempted: 0 } };
    favorites.value = results[3].data;
    wrongBook.value = results[4].data;
    plans.value = dashboard.value?.plans || [];
  } catch (err: any) {
    fail(err, '学习数据加载失败');
  } finally {
    loading.value = false;
  }
}

async function reloadLearning() {
  const dashboardResult = await api.get('/api/learning/dashboard');
  dashboard.value = dashboardResult.data;
  daily.value = dashboard.value?.daily || { items: [], progress: { total: 0 } };
  continueLearning.value = dashboard.value?.continueLearning || { items: [], counts: { wrong: 0, attempted: 0 } };
  plans.value = dashboard.value?.plans || [];
}

async function selectList(id: string) {
  selectedListId.value = id;
  catalogSelected.value = [];
  try {
    selectedList.value = (await api.get(`/api/problem-lists/${id}`)).data;
    listForm.value = {
      name: selectedList.value.name,
      description: selectedList.value.description || '',
      isPublic: selectedList.value.isPublic,
    };
    if (selectedListOwned.value) {
      if (!catalogMetadata.value) await loadCatalogMetadata();
      await loadListProblemOptions(catalogPage.value || 1);
    } else {
      listProblems.value = [];
      listProblemsLoaded.value = false;
      catalogTotal.value = 0;
    }
  } catch (err: any) {
    fail(err, '题单加载失败');
  }
}

function openNewList() {
  listForm.value = { name: '', description: '', isPublic: true };
  listModalOpen.value = true;
}

async function saveList() {
  if (!listForm.value.name.trim()) return;
  saving.value = true;
  try {
    const { data } = await api.post('/api/problem-lists', listForm.value);
    listModalOpen.value = false;
    await loadAll();
    await selectList(data.id);
    activeTab.value = 'lists';
    message('题单已创建');
  } catch (err: any) {
    fail(err, '题单创建失败');
  } finally {
    saving.value = false;
  }
}

async function updateList() {
  if (!selectedList.value || !listForm.value.name.trim()) return;
  saving.value = true;
  try {
    await api.patch(`/api/problem-lists/${selectedList.value.id}`, listForm.value);
    await loadAll();
    await selectList(selectedList.value.id);
    message('题单设置已保存');
  } catch (err: any) {
    fail(err, '题单保存失败');
  } finally {
    saving.value = false;
  }
}

async function deleteList() {
  if (!selectedList.value || !window.confirm('确定删除这个题单吗？相关学习计划也会结束。')) return;
  try {
    await api.delete(`/api/problem-lists/${selectedList.value.id}`);
    selectedList.value = null;
    selectedListId.value = '';
    await loadAll();
    message('题单已删除');
  } catch (err: any) {
    fail(err, '题单删除失败');
  }
}

async function loadCatalogMetadata() {
  try {
    const { data } = await api.get('/api/problems/metadata');
    catalogMetadata.value = {
      tags: data?.tags || [],
      sources: data?.sources || [],
    };
  } catch {
    catalogMetadata.value = { tags: [], sources: [] };
  }
}

async function loadListProblemOptions(page = catalogPage.value) {
  if (!selectedListOwned.value) return;
  const requestId = ++catalogSearchSerial;
  listProblemsLoading.value = true;
  listProblemsLoaded.value = false;
  try {
    const params: Record<string, string | number> = {
      page,
      pageSize: catalogPageSize,
      status: 'PUBLISHED',
    };
    if (listSearch.value.trim()) params.keyword = listSearch.value.trim();
    if (catalogSource.value) params.source = catalogSource.value;
    if (catalogDifficulty.value) params.difficulty = catalogDifficulty.value;
    if (catalogTag.value) params.tag = catalogTag.value;

    const { data } = await api.get('/api/problems', { params });
    if (requestId !== catalogSearchSerial) return;

    const alreadyInList = new Set(selectedListItems.value.map((item: any) => item.problemId));
    const items = (data.items || []).filter((problem: any) => !alreadyInList.has(problem.id));
    listProblems.value = await attachProblemStates(items);
    catalogTotal.value = data.total || 0;
    catalogPage.value = Math.min(
      data.page || page,
      Math.max(1, Math.ceil((data.total || 0) / catalogPageSize) || 1),
    );
    listProblemsLoaded.value = true;
  } catch (err: any) {
    if (requestId === catalogSearchSerial) fail(err, '题目加载失败');
  } finally {
    if (requestId === catalogSearchSerial) listProblemsLoading.value = false;
  }
}

function resetCatalogPage() {
  catalogPage.value = 1;
  void loadListProblemOptions(1);
}

function selectCatalogDifficulty(value: string) {
  catalogDifficulty.value = value;
  resetCatalogPage();
}

function problemSourceLabel(problem: CatalogProblem) {
  if (problem.sourceInfo?.platform) return problem.sourceInfo.platform;
  if (problem.source === 'LOCAL') return '原创';
  return problem.source || '未知来源';
}

function toggleCatalogProblem(problem: CatalogProblem) {
  if (catalogSelectedIds.value.has(problem.id)) {
    catalogSelected.value = catalogSelected.value.filter((item) => item.id !== problem.id);
    return;
  }
  catalogSelected.value = [...catalogSelected.value, problem];
}

function toggleCatalogCurrentPage() {
  if (catalogPageFullySelected.value) {
    const pageIds = new Set(listProblems.value.map((item) => item.id));
    catalogSelected.value = catalogSelected.value.filter((item) => !pageIds.has(item.id));
    return;
  }
  const merged = new Map(catalogSelected.value.map((item) => [item.id, item]));
  for (const problem of listProblems.value) merged.set(problem.id, problem);
  catalogSelected.value = Array.from(merged.values());
}

function removeCatalogSelection(problemId: string) {
  catalogSelected.value = catalogSelected.value.filter((item) => item.id !== problemId);
}

function clearCatalogSelection() {
  catalogSelected.value = [];
}

async function attachProblemStates(problems: any[]) {
  if (!problems.length) return problems;
  try {
    const { data } = await api.post('/api/learning/problem-states', {
      problemIds: problems.map((problem) => problem.id),
    });
    return problems.map((problem) => ({ ...problem, state: data[problem.id] }));
  } catch {
    return problems;
  }
}

async function addToList(problemId: string) {
  if (!selectedList.value) return;
  try {
    await api.post(`/api/problem-lists/${selectedList.value.id}/items`, { problemId });
    catalogSelected.value = catalogSelected.value.filter((item) => item.id !== problemId);
    await selectList(selectedList.value.id);
    message('题目已加入题单');
  } catch (err: any) {
    fail(err, '题目加入失败');
  }
}

async function addSelectedToList() {
  if (!selectedList.value || !catalogSelected.value.length) return;
  catalogAdding.value = true;
  let added = 0;
  let failed = 0;
  try {
    for (const problem of catalogSelected.value) {
      try {
        await api.post(`/api/problem-lists/${selectedList.value.id}/items`, { problemId: problem.id });
        added += 1;
      } catch {
        failed += 1;
      }
    }
    catalogSelected.value = [];
    await selectList(selectedList.value.id);
    if (failed && added) message(`已加入 ${added} 题，${failed} 题失败`);
    else if (failed) fail(null, `${failed} 题加入失败`);
    else message(`已加入 ${added} 题到题单`);
  } finally {
    catalogAdding.value = false;
  }
}

async function removeFromList(itemId: string) {
  if (!selectedList.value) return;
  try {
    await api.delete(`/api/problem-lists/${selectedList.value.id}/items/${itemId}`);
    await selectList(selectedList.value.id);
  } catch (err: any) {
    fail(err, '题目移除失败');
  }
}

function selectListSort(mode: ListSort) {
  listSort.value = mode;
  listSortDirection.value = mode === 'joined' ? 'desc' : 'asc';
}

function reverseListSort() {
  listSortDirection.value = listSortDirection.value === 'asc' ? 'desc' : 'asc';
}

function openProblem(problemId: string) {
  void router.push(`/problems/${problemId}`);
}

function openPlanDetails(id: string) {
  void router.push(`/learning-plans/${id}`);
}

async function joinPlan(problemListId: string) {
  savingPlanId.value = problemListId;
  try {
    await api.post('/api/learning/plans', { problemListId });
    await reloadLearning();
    message('已加入学习计划');
  } catch (err: any) {
    fail(err, '加入学习计划失败');
  } finally {
    savingPlanId.value = '';
  }
}

async function setPlanStatus(plan: any, status: 'ACTIVE' | 'COMPLETED') {
  if (status === 'COMPLETED' && !window.confirm('确定结束这个学习计划吗？之后仍可重新开始。')) return;
  savingPlanId.value = plan.problemListId;
  try {
    await api.patch(`/api/learning/plans/${plan.id}`, { status });
    await reloadLearning();
    message(status === 'ACTIVE' ? '学习计划已重新开始' : '学习计划已结束');
  } catch (err: any) {
    fail(err, '学习计划更新失败');
  } finally {
    savingPlanId.value = '';
  }
}

async function removeFavorite(problemId: string) {
  try {
    await api.delete(`/api/learning/favorites/${problemId}`);
    favorites.value = favorites.value.filter((item) => item.problemId !== problemId);
    await reloadLearning();
    message('已取消收藏');
  } catch (err: any) {
    fail(err, '取消收藏失败');
  }
}

async function removeWrong(problemId: string) {
  try {
    await api.delete(`/api/learning/wrong-book/${problemId}`);
    wrongBook.value = wrongBook.value.filter((item) => item.problemId !== problemId);
    await reloadLearning();
    message('已移出错题本');
  } catch (err: any) {
    fail(err, '错题移除失败');
  }
}

onMounted(async () => {
  const requestedTab = String(route.query.tab || '');
  const requestedView = String(route.query.view || '');
  if (['practice', 'plans', 'lists', 'library'].includes(requestedTab)) {
    activeTab.value = requestedTab as Tab;
  }
  if (requestedTab === 'library' && ['summary', 'favorites', 'wrong'].includes(requestedView)) {
    libraryView.value = requestedView as LibraryView;
  } else if (requestedView === 'favorites' || requestedView === 'wrong') {
    // Allow deep-links that only set view=favorites|wrong
    activeTab.value = 'library';
    libraryView.value = requestedView as LibraryView;
  }
  await Promise.all([loadAll(), loadCatalogMetadata()]);
});
</script>

<template>
  <div class="learning-page" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="learning-sidebar">
      <div class="learning-sidebar-title">
        <span class="learning-sidebar-icon"><BookOpenCheck :size="19" /></span>
        <span class="learning-sidebar-copy"><strong>学习</strong><small>刷题与题单计划</small></span>
        <button
          class="learning-sidebar-collapse"
          type="button"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="sidebarCollapsed ? '展开学习侧栏' : '收起学习侧栏'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <PanelLeftOpen v-if="sidebarCollapsed" :size="18" />
          <PanelLeftClose v-else :size="18" />
        </button>
      </div>
      <p class="learning-sidebar-label">学习模块</p>
      <nav class="workspace-nav" aria-label="学习工作台">
        <button
          v-for="item in workspaceTabs"
          :key="item.id"
          :title="sidebarCollapsed ? item.label : undefined"
          :class="{ active: activeTab === item.id }"
          @click="changeTab(item.id)"
        >
          <component :is="item.icon" :size="18" />
          <span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span>
          <b v-if="item.count !== undefined">{{ item.count }}</b>
        </button>
      </nav>
    </aside>

    <main class="learning-main">
      <header class="learning-header">
        <span class="eyebrow">STUDY WORKSPACE</span>
        <h1>学习</h1>
        <p>从公开题单开始计划，按自己的节奏持续完成。</p>
      </header>

      <div v-if="notice" class="notice success">{{ notice }}</div>
      <div v-if="error" class="notice error">{{ error }}<button aria-label="关闭提示" @click="error = ''"><X :size="16" /></button></div>

      <div class="learning-content">
        <div v-if="loading" class="loading-state">正在整理你的学习数据...</div>

        <template v-else-if="activeTab === 'practice'">
          <section class="metric-strip" aria-label="刷题数据">
            <div><span>今日已解决题目</span><strong>{{ dashboard?.counts?.todaySolved || 0 }}</strong><small>道</small></div>
            <div><span>累计解决题目</span><strong>{{ dashboard?.counts?.totalSolved || 0 }}</strong><small>道</small></div>
            <div><span>累计签到</span><strong>{{ dashboard?.counts?.checkInDays || 0 }}</strong><small>天</small></div>
          </section>

          <div class="practice-grid">
            <section class="workspace-panel today-practice">
              <div class="section-heading">
                <div><span class="section-kicker">TODAY</span><h2>今日练习</h2></div>
                <span class="section-count">{{ daily.items?.length || 0 }} 题</span>
              </div>
              <div v-if="daily.items?.length" class="problem-rows">
                <button v-for="item in daily.items" :key="item.id" class="problem-row" @click="openProblem(item.problemId)">
                  <span class="problem-index">{{ String(daily.items.indexOf(item) + 1).padStart(2, '0') }}</span>
                  <span class="problem-copy">
                    <strong>{{ item.problem?.title }}</strong>
                    <small>{{ item.source === 'REVIEW' ? '随机复习题' : '未通过题目' }}</small>
                    <ProblemStateBadges :state="item.state" compact />
                  </span>
                  <span class="difficulty">{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span>
                </button>
              </div>
              <div v-else class="empty-state">
                <CheckCircle2 :size="28" />
                <strong>题库还没有可练习的题目</strong>
                <p>发布题目后，系统会在每天自动生成练习。</p>
              </div>
            </section>

            <section class="workspace-panel continue-panel">
              <div class="section-heading">
                <div><span class="section-kicker">CONTINUE</span><h2>继续学习</h2></div>
                <span class="section-count">{{ continueLearning.items?.length || 0 }} 题</span>
              </div>
              <div v-if="continueLearning.items?.length" class="continue-list">
                <button
                  v-for="item in continueLearning.items.slice(0, continueExpanded ? continueLearning.items.length : 4)"
                  :key="`${item.reason}-${item.problemId}`"
                  @click="openProblem(item.problemId)"
                >
                  <span>
                    <strong>{{ item.problem?.title }}</strong>
                    <small>{{ item.reason === 'WRONG' ? '错题优先' : '写过但未通过' }}</small>
                    <ProblemStateBadges :state="item.state" compact />
                  </span>
                  <b>{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</b>
                </button>
                <button v-if="continueLearning.items.length > 4" class="continue-expand" @click.stop="continueExpanded = !continueExpanded">
                  {{ continueExpanded ? '收起列表' : `查看全部 ${continueLearning.items.length} 题` }}
                </button>
              </div>
              <div v-else class="empty-state compact"><BookOpen :size="25" /><strong>没有待继续的题目</strong><p>错题和写过但未通过的题目会显示在这里。</p></div>
              <button class="library-entry" @click="router.push('/problems')"><BookOpenCheck :size="18" /><span><strong>进入题库</strong><small>浏览全部题目</small></span></button>
            </section>
          </div>

          <section class="active-section">
            <div class="section-heading">
              <div><span class="section-kicker">IN PROGRESS</span><h2>正在进行中的学习计划</h2></div>
              <button class="text-btn" @click="changeTab('plans')">管理计划</button>
            </div>
            <div v-if="activePlans.length" class="plan-grid">
              <article v-for="plan in activePlans" :key="plan.id" class="plan-card">
                <button class="card-main" @click="openPlanDetails(plan.id)">
                  <span class="card-label">公开题单计划</span>
                  <h3>{{ plan.problemList?.name }}</h3>
                  <p>{{ plan.problemList?.description || '按题单顺序完成每一道题。' }}</p>
                  <div class="progress-line"><i :style="{ width: `${plan.progress?.percent || 0}%` }"></i></div>
                  <span class="progress-copy">已完成 {{ plan.progress?.solved || 0 }} / {{ plan.progress?.total || 0 }} 题</span>
                </button>
              </article>
            </div>
            <div v-else class="section-empty">暂无进行中的学习计划。</div>
          </section>
        </template>

        <template v-else-if="activeTab === 'plans'">
          <section class="page-section">
            <div class="page-toolbar">
              <div><span class="section-kicker">LEARNING PLANS</span><h2>学习计划</h2><p>收藏一份题单作为计划，完成度会根据通过记录自动更新。</p></div>
              <button class="secondary-btn" @click="myPlansOpen = true"><ListChecks :size="17" />我的学习计划</button>
            </div>

            <div class="subsection-heading"><div><h3>正在进行中</h3><span>{{ activePlans.length }} 个计划</span></div></div>
            <div v-if="activePlans.length" class="plan-grid">
              <article v-for="plan in activePlans" :key="plan.id" class="plan-card active-plan-card">
                <button class="card-main" @click="openPlanDetails(plan.id)">
                  <span class="card-label">LEARNING NOW</span>
                  <h3>{{ plan.problemList?.name }}</h3>
                  <p>{{ plan.problemList?.description || '按题单顺序完成每一道题。' }}</p>
                  <div class="progress-line"><i :style="{ width: `${plan.progress?.percent || 0}%` }"></i></div>
                  <span class="progress-copy">{{ plan.progress?.solved || 0 }} / {{ plan.progress?.total || 0 }} 题 · {{ plan.progress?.percent || 0 }}%</span>
                </button>
                <button class="icon-command danger" title="结束计划" aria-label="结束计划" @click="setPlanStatus(plan, 'COMPLETED')"><CircleStop :size="17" /></button>
              </article>
            </div>
            <div v-else class="section-empty">还没有进行中的计划，从下方公开题单开始。</div>

            <div class="subsection-heading featured-heading"><div><h3>精选的其他公开题单</h3><span>选择题单加入学习计划</span></div></div>
            <div v-if="featuredLists.length" class="public-grid">
              <article v-for="list in featuredLists" :key="list.id" class="list-card">
                <span class="list-badge">公开题单</span>
                <h3>{{ list.name }}</h3>
                <p>{{ list.description || '一份等待探索的练习题单。' }}</p>
                <div class="card-footer"><span>{{ problemCount(list) }} 道题</span><button class="primary-btn small" :disabled="savingPlanId === list.id" @click="joinPlan(list.id)">{{ savingPlanId === list.id ? '加入中...' : '加入学习计划' }}</button></div>
              </article>
            </div>
            <div v-else class="section-empty">所有公开题单都已加入当前计划。</div>
          </section>
        </template>

        <template v-else-if="activeTab === 'lists'">
          <section class="page-section">
            <div class="page-toolbar">
              <div><span class="section-kicker">PUBLIC LISTS</span><h2>题单</h2><p>浏览网站全部公开题单，也可以创建并维护自己的题单。</p></div>
              <button class="primary-btn" @click="openNewList"><Plus :size="17" />创建题单</button>
            </div>

            <div v-if="publicLists.length" class="public-grid list-catalog">
              <article v-for="list in publicLists" :key="list.id" class="list-card" :class="{ selected: selectedListId === list.id }">
                <span class="list-badge">{{ lists.some((mine) => mine.id === list.id) ? '我创建的' : '公开题单' }}</span>
                <h3>{{ list.name }}</h3>
                <p>{{ list.description || '暂无题单说明。' }}</p>
                <div class="card-footer"><span>{{ problemCount(list) }} 道题</span><button class="text-btn" @click="selectList(list.id)">查看题单</button></div>
              </article>
            </div>
            <div v-else class="section-empty">暂无公开题单，创建第一份题单吧。</div>

            <section v-if="selectedList" class="list-detail">
              <div class="detail-heading">
                <div><span class="section-kicker">{{ selectedListOwned ? 'MY LIST' : 'PUBLIC LIST' }}</span><h2>{{ selectedList.name }}</h2></div>
                <div v-if="selectedListOwned" class="inline-actions">
                  <button class="secondary-btn danger-command" title="删除题单" @click="deleteList"><Trash2 :size="16" />删除</button>
                  <button class="primary-btn" :disabled="saving" @click="updateList"><Save :size="16" />保存设置</button>
                </div>
                <button v-else-if="!activePlanListIds.has(selectedList.id)" class="primary-btn" @click="joinPlan(selectedList.id)">加入学习计划</button>
              </div>

              <div v-if="selectedListOwned" class="list-settings">
                <label>题单名称<input v-model="listForm.name" maxlength="80"></label>
                <label>题单说明<textarea v-model="listForm.description" rows="2" maxlength="500"></textarea></label>
                <label class="switch-label"><input v-model="listForm.isPublic" type="checkbox"><span>公开题单</span></label>
              </div>
              <p v-else class="public-description">{{ selectedList.description || '暂无题单说明。' }}</p>

              <template v-if="selectedListOwned">
                <div class="subheading">
                  <div>
                    <h3>添加题目</h3>
                    <span>仿照老师布置作业：筛选题库后勾选加入</span>
                  </div>
                  <span class="catalog-selected-count">已选 {{ catalogSelected.length }} 题</span>
                </div>

                <div class="list-assignment-workspace" aria-label="题单选题">
                  <section class="list-problem-bank">
                    <header class="list-bank-heading">
                      <div>
                        <strong>题库</strong>
                        <span>支持关键词、来源、标签、难度筛选</span>
                      </div>
                      <span>{{ listProblemsLoading ? '加载中' : `共 ${catalogTotal} 题` }}</span>
                    </header>

                    <div class="list-filter-row">
                      <label class="list-keyword">
                        <Search :size="16" />
                        <input
                          v-model="listSearch"
                          placeholder="搜索题目标题、编号"
                          @keyup.enter="resetCatalogPage"
                        >
                      </label>
                      <FilterSelect
                        v-model="catalogSource"
                        :options="catalogSourceOptions"
                        label="按来源筛选"
                        @update:model-value="resetCatalogPage"
                      />
                      <FilterSelect
                        v-model="catalogTag"
                        :options="catalogTagOptions"
                        label="按标签筛选"
                        @update:model-value="resetCatalogPage"
                      />
                      <button class="secondary-btn" type="button" @click="resetCatalogPage">
                        <Search :size="16" />搜索
                      </button>
                    </div>

                    <div class="list-difficulty-filter" role="group" aria-label="按难度筛选">
                      <button
                        type="button"
                        :class="{ active: !catalogDifficulty }"
                        :aria-pressed="!catalogDifficulty"
                        @click="selectCatalogDifficulty('')"
                      >
                        全部难度
                      </button>
                      <button
                        v-for="item in pointDifficultyOptions"
                        :key="item.value"
                        type="button"
                        :class="{ active: catalogDifficulty === item.value }"
                        :aria-pressed="catalogDifficulty === item.value"
                        @click="selectCatalogDifficulty(item.value)"
                      >
                        {{ item.level }}
                      </button>
                    </div>

                    <div v-if="listProblemsLoading" class="problem-search-empty">正在加载题库...</div>
                    <template v-else>
                      <div v-if="listProblems.length" class="list-catalog-table-wrap">
                        <table class="list-catalog-table">
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  :checked="catalogPageFullySelected"
                                  :aria-label="catalogPageFullySelected ? '取消选择当前页' : '选择当前页'"
                                  @change="toggleCatalogCurrentPage"
                                >
                              </th>
                              <th>题目</th>
                              <th>来源</th>
                              <th>难度</th>
                              <th>状态</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr
                              v-for="problem in listProblems"
                              :key="problem.id"
                              class="list-catalog-row"
                              :class="{ selected: catalogSelectedIds.has(problem.id) }"
                              @click="toggleCatalogProblem(problem)"
                            >
                              <td @click.stop>
                                <input
                                  type="checkbox"
                                  :checked="catalogSelectedIds.has(problem.id)"
                                  :aria-label="`选择 ${problem.title}`"
                                  @change="toggleCatalogProblem(problem)"
                                >
                              </td>
                              <td>
                                <strong>{{ problem.title }}</strong>
                                <small v-if="problem.sourceInfo?.remoteProblemId">{{ problem.sourceInfo.remoteProblemId }}</small>
                              </td>
                              <td>{{ problemSourceLabel(problem) }}</td>
                              <td>{{ pointDifficultyShortLabel(problem.difficulty) }}</td>
                              <td><ProblemStateBadges :state="problem.state" compact /></td>
                              <td>
                                <button class="text-btn" type="button" @click.stop="addToList(problem.id)">快速加入</button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div v-else-if="listProblemsLoaded" class="problem-search-empty">
                        没有符合筛选条件的可加入题目。
                      </div>
                    </template>

                    <footer class="list-catalog-pagination">
                      <button
                        type="button"
                        :disabled="catalogPage <= 1 || listProblemsLoading"
                        @click="loadListProblemOptions(catalogPage - 1)"
                      >
                        上一页
                      </button>
                      <span>第 {{ catalogPage }} / {{ catalogTotalPages }} 页</span>
                      <button
                        type="button"
                        :disabled="catalogPage >= catalogTotalPages || listProblemsLoading"
                        @click="loadListProblemOptions(catalogPage + 1)"
                      >
                        下一页
                      </button>
                    </footer>
                  </section>

                  <aside class="list-problem-set" aria-label="待加入题单">
                    <header>
                      <div>
                        <strong>待加入题单</strong>
                        <span>已选 {{ catalogSelected.length }} 题</span>
                      </div>
                      <button
                        v-if="catalogSelected.length"
                        type="button"
                        class="clear-problem-set"
                        @click="clearCatalogSelection"
                      >
                        清空
                      </button>
                    </header>
                    <div v-if="catalogSelected.length" class="problem-set-list">
                      <article v-for="problem in catalogSelected" :key="problem.id">
                        <div>
                          <strong>{{ problem.title }}</strong>
                          <span>{{ problemSourceLabel(problem) }} · {{ pointDifficultyShortLabel(problem.difficulty) }}</span>
                        </div>
                        <button
                          type="button"
                          title="移除"
                          :aria-label="`移除 ${problem.title}`"
                          @click="removeCatalogSelection(problem.id)"
                        >
                          <X :size="15" />
                        </button>
                      </article>
                    </div>
                    <div v-else class="problem-set-empty">从左侧题库勾选题目</div>
                    <footer class="builder-footer">
                      <span>可批量加入当前题单</span>
                      <button
                        class="primary-btn"
                        type="button"
                        :disabled="!catalogSelected.length || catalogAdding"
                        @click="addSelectedToList"
                      >
                        <Plus :size="16" />
                        {{ catalogAdding ? '加入中…' : `加入 ${catalogSelected.length || ''} 题` }}
                      </button>
                    </footer>
                  </aside>
                </div>
              </template>

              <div class="subheading problem-heading">
                <div><h3>题目列表</h3><span>{{ selectedListItems.length }} 道题</span></div>
                <div class="sort-toolbar">
                  <div class="sort-modes" aria-label="题单排序">
                    <button :class="{ active: listSort === 'difficulty' }" @click="selectListSort('difficulty')">难度</button>
                    <button :class="{ active: listSort === 'number' }" @click="selectListSort('number')">题号</button>
                    <button :class="{ active: listSort === 'joined' }" @click="selectListSort('joined')">加入时间</button>
                  </div>
                  <button class="sort-direction" :title="sortDirectionLabel" :aria-label="sortDirectionLabel" @click="reverseListSort"><ArrowUpDown :size="16" /></button>
                </div>
              </div>
              <div v-if="sortedListItems.length" class="ordered-list">
                <div v-for="(item, index) in sortedListItems" :key="item.id" class="ordered-row">
                  <span class="order-number">{{ index + 1 }}</span>
                  <span class="listed-problem"><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title || '题目已移除' }}</button><ProblemStateBadges :state="item.state" compact /></span>
                  <span class="difficulty">{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span>
                  <button v-if="selectedListOwned" class="icon-command danger" title="移出题单" aria-label="移出题单" @click="removeFromList(item.id)"><Trash2 :size="15" /></button>
                </div>
              </div>
              <div v-else class="section-empty">这个题单还没有题目。</div>
            </section>
          </section>
        </template>

        <template v-else>
          <section class="page-section">
            <div v-if="libraryView === 'summary'" class="page-toolbar"><div><span class="section-kicker">PERSONAL LIBRARY</span><h2>收藏与错题</h2><p>查看最近收藏和需要重做的题目。</p></div></div>
            <div v-else class="page-toolbar compact-toolbar">
              <button class="back-btn" @click="libraryView = 'summary'"><ArrowLeft :size="17" />返回</button>
              <div><span class="section-kicker">ALL PROBLEMS</span><h2>{{ libraryView === 'favorites' ? '全部收藏' : '全部错题' }}</h2></div>
            </div>

            <div v-if="libraryView === 'summary'" class="library-grid">
              <section class="library-column">
                <div class="library-title"><span class="library-icon favorite"><Star :size="17" /></span><div><h3>收藏</h3><small>{{ favorites.length }} 道题</small></div></div>
                <div v-if="favorites.length" class="library-list">
                  <div v-for="item in favorites.slice(0, 5)" :key="item.id" class="library-row">
                    <span class="listed-problem"><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title }}</button><ProblemStateBadges :state="item.state" compact /></span>
                    <span>{{ pointDifficultyShortLabel(item.problem?.difficulty) }}</span>
                    <button class="icon-command" title="取消收藏" aria-label="取消收藏" @click="removeFavorite(item.problemId)"><X :size="15" /></button>
                  </div>
                </div>
                <div v-else class="section-empty compact">暂无收藏题目。</div>
                <button class="view-all" @click="libraryView = 'favorites'">查看全部收藏 <span>{{ favorites.length }}</span></button>
              </section>

              <section class="library-column">
                <div class="library-title"><span class="library-icon wrong"><AlertTriangle :size="17" /></span><div><h3>错题</h3><small>{{ wrongBook.length }} 道题</small></div></div>
                <div v-if="wrongBook.length" class="library-list">
                  <div v-for="item in wrongBook.slice(0, 5)" :key="item.id" class="library-row">
                    <span class="listed-problem"><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title }}</button><ProblemStateBadges :state="item.state" compact /></span>
                    <span class="wrong-tag">{{ item.errorType || '需要重做' }}</span>
                    <button class="icon-command" title="移出错题本" aria-label="移出错题本" @click="removeWrong(item.problemId)"><X :size="15" /></button>
                  </div>
                </div>
                <div v-else class="section-empty compact">暂无错题记录。</div>
                <button class="view-all wrong-view" @click="libraryView = 'wrong'">查看全部错题 <span>{{ wrongBook.length }}</span></button>
              </section>
            </div>

            <div v-else-if="fullLibraryItems.length" class="full-library-list">
              <div v-for="item in fullLibraryItems" :key="item.id" class="library-row full-row">
                <span class="listed-problem"><button class="problem-link" @click="openProblem(item.problemId)">{{ item.problem?.title }}</button><ProblemStateBadges :state="item.state" compact /></span>
                <span>{{ libraryView === 'favorites' ? pointDifficultyShortLabel(item.problem?.difficulty) : (item.errorType || '需要重做') }}</span>
                <button class="secondary-btn danger-command" @click="libraryView === 'favorites' ? removeFavorite(item.problemId) : removeWrong(item.problemId)"><Trash2 :size="15" />移除</button>
              </div>
            </div>
            <div v-else class="section-empty">这里还没有题目。</div>
          </section>
        </template>
      </div>
    </main>

    <div v-if="listModalOpen" class="modal-backdrop" @click.self="listModalOpen = false">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="new-list-title">
        <button class="modal-close" aria-label="关闭" @click="listModalOpen = false"><X :size="19" /></button>
        <span class="section-kicker">NEW LIST</span>
        <h2 id="new-list-title">创建题单</h2>
        <label>名称<input v-model="listForm.name" maxlength="80" autofocus></label>
        <label>说明<textarea v-model="listForm.description" rows="3" maxlength="500"></textarea></label>
        <label class="switch-label"><input v-model="listForm.isPublic" type="checkbox"><span>创建后公开</span></label>
        <button class="primary-btn full-btn" :disabled="saving || !listForm.name.trim()" @click="saveList">{{ saving ? '保存中...' : '创建题单' }}</button>
      </section>
    </div>

    <div v-if="myPlansOpen" class="modal-backdrop" @click.self="myPlansOpen = false">
      <section class="modal plan-modal" role="dialog" aria-modal="true" aria-labelledby="my-plan-title">
        <button class="modal-close" aria-label="关闭" @click="myPlansOpen = false"><X :size="19" /></button>
        <span class="section-kicker">MY PLANS</span>
        <h2 id="my-plan-title">我的学习计划</h2>
        <div class="modal-plan-section">
          <h3>正在进行中 <span>{{ activePlans.length }}</span></h3>
          <div v-if="activePlans.length" class="modal-plan-list">
            <div v-for="plan in activePlans" :key="plan.id">
              <button @click="myPlansOpen = false; openPlanDetails(plan.id)"><strong>{{ plan.problemList?.name }}</strong><small>{{ plan.progress?.solved || 0 }} / {{ plan.progress?.total || 0 }} 题</small></button>
              <button class="icon-command danger" title="结束计划" aria-label="结束计划" @click="setPlanStatus(plan, 'COMPLETED')"><CircleStop :size="16" /></button>
            </div>
          </div>
          <p v-else>暂无进行中的计划。</p>
        </div>
        <div class="modal-plan-section completed">
          <h3>已经结束 <span>{{ completedPlans.length }}</span></h3>
          <div v-if="completedPlans.length" class="modal-plan-list">
            <div v-for="plan in completedPlans" :key="plan.id">
              <button @click="myPlansOpen = false; openPlanDetails(plan.id)"><strong>{{ plan.problemList?.name }}</strong><small>完成 {{ plan.progress?.percent || 0 }}%</small></button>
              <button class="icon-command" title="重新开始" aria-label="重新开始" @click="setPlanStatus(plan, 'ACTIVE')"><RotateCcw :size="16" /></button>
            </div>
          </div>
          <p v-else>暂无已结束的计划。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.learning-page {
  --blue: #1f5eff;
  --blue-soft: #e8efff;
  --ink: #24364a;
  --muted: #718094;
  --line: #dbe4ed;
  display: flex;
  min-height: calc(100vh - 56px);
  color: var(--ink);
  background: #f3f6f9;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}
.learning-sidebar {
  position: sticky;
  top: 56px;
  display: flex;
  width: 264px;
  height: calc(100vh - 56px);
  flex: 0 0 264px;
  align-self: flex-start;
  flex-direction: column;
  padding: 22px 14px;
  overflow: hidden;
  border-right: 1px solid var(--line);
  background: #f8fafc;
  transition: width .18s, flex-basis .18s;
}
.learning-sidebar-title { display: flex; align-items: center; gap: 10px; padding: 0 7px 18px; }
.learning-sidebar-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 8px; color: var(--blue); background: var(--blue-soft); }
.learning-sidebar-copy { display: grid; min-width: 0; gap: 2px; }
.learning-sidebar-copy strong { font-size: 13px; }
.learning-sidebar-copy small { color: #8794a4; font-size: 10px; }
.learning-sidebar-collapse { display: grid; width: 34px; height: 34px; flex: 0 0 34px; margin-left: auto; place-items: center; border: 0; border-radius: 7px; color: #6e7f91; background: transparent; cursor: pointer; }
.learning-sidebar-collapse:hover { color: #225d91; background: #eaf1f7; }
.learning-sidebar-label { margin: 4px 9px 9px; color: #8493a5; font-size: 10px; font-weight: 900; }
.workspace-nav { display: grid; gap: 5px; }
.workspace-nav button { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; min-height: 52px; align-items: center; gap: 9px; width: 100%; padding: 7px 10px; border: 0; border-radius: 7px; color: #65768a; text-align: left; background: transparent; font: inherit; cursor: pointer; }
.workspace-nav button:hover { color: #245f94; background: #eef4f9; }
.workspace-nav button.active { color: var(--blue); background: var(--blue-soft); }
.workspace-nav button > span { display: grid; gap: 2px; min-width: 0; }
.workspace-nav button strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.workspace-nav button small { color: #8a98a8; font-size: 9px; }
.workspace-nav button b { display: grid; min-width: 21px; height: 20px; place-items: center; padding: 0 4px; border-radius: 5px; color: #65768a; background: #edf1f5; font-size: 10px; }
.workspace-nav button.active b { color: var(--blue); background: #d7e4ff; }
.learning-page.sidebar-collapsed .learning-sidebar { width: 72px; flex-basis: 72px; padding-right: 10px; padding-left: 10px; }
.sidebar-collapsed .learning-sidebar-icon, .sidebar-collapsed .learning-sidebar-copy, .sidebar-collapsed .learning-sidebar-label { display: none; }
.sidebar-collapsed .learning-sidebar-title { justify-content: center; padding-right: 0; padding-left: 0; }
.sidebar-collapsed .learning-sidebar-collapse { margin-left: 0; }
.sidebar-collapsed .workspace-nav button { grid-template-columns: 1fr; justify-items: center; padding-right: 0; padding-left: 0; }
.sidebar-collapsed .workspace-nav button > span, .sidebar-collapsed .workspace-nav button > b { display: none; }

.learning-main { min-width: 0; flex: 1; padding: 26px 28px 72px; }
.learning-header, .learning-content { width: min(1440px, 100%); margin-right: auto; margin-left: auto; }
.learning-header {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-height: 178px;
  padding: 32px 40px;
  border: 1px solid #dce5ef;
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 66, 104, .08);
  color: #1f2a37;
}
.eyebrow, .section-kicker { color: #3977aa; font-size: 11px; font-weight: 900; letter-spacing: .15em; }
.learning-header h1 { margin: 0; color: #1f2a37; font-size: 42px; line-height: 1.1; letter-spacing: -.05em; }
.learning-header p, .page-toolbar p { max-width: 610px; margin: 11px 0 0; color: #66778a; font-size: 14px; line-height: 1.7; }
.learning-header .eyebrow { margin: 0 0 7px; }
.learning-content { margin-top: 22px; }
.loading-state, .section-empty, .empty-state { padding: 42px 18px; color: var(--muted); text-align: center; }
.section-empty { border: 1px dashed #cbd7e2; border-radius: 18px; background: #f9fbfc; font-size: 13px; }
.section-empty.compact { padding: 26px 12px; border: 0; border-radius: 0; background: transparent; }
.notice { position: fixed; z-index: 180; top: 72px; right: 24px; display: flex; align-items: center; gap: 12px; max-width: 420px; padding: 12px 16px; border: 1px solid; border-radius: 7px; box-shadow: 0 10px 28px rgba(31, 48, 67, .14); font-size: 13px; }
.notice.success { border-color: #a7dbc6; color: #166044; background: #f0fbf6; }
.notice.error { border-color: #efc0bd; color: #9d342e; background: #fff5f4; }
.notice button { display: grid; place-items: center; border: 0; color: inherit; background: transparent; cursor: pointer; }

.metric-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 18px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 7px 20px rgba(31, 66, 104, .04);
}
.metric-strip > div { display: flex; min-width: 0; min-height: 96px; align-items: center; gap: 10px; padding: 24px 28px; }
.metric-strip > div + div { box-shadow: inset 1px 0 var(--line); }
.metric-strip span { margin-right: auto; color: #617287; font-size: 14px; font-weight: 700; }
.metric-strip strong { color: #1f4f82; font-size: 34px; line-height: 1; }
.metric-strip > div:nth-child(2) strong { color: #23785b; }
.metric-strip > div:nth-child(3) strong { color: #95651e; }
.metric-strip small { color: #8996a5; font-size: 13px; }
.practice-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 16px; }
.workspace-panel, .page-section, .active-section, .list-detail {
  border: 1px solid var(--line);
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 7px 20px rgba(31, 66, 104, .04);
}
.workspace-panel { min-width: 0; padding: 24px 24px 18px; }
.section-heading, .page-toolbar, .detail-heading, .subheading, .subsection-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.section-heading { margin-bottom: 14px; }
.section-heading h2, .page-toolbar h2, .detail-heading h2 { margin-top: 6px; color: #26384d; font-size: 20px; letter-spacing: 0; line-height: 1.25; }
.section-count { color: #718094; font-size: 12px; font-weight: 750; }
.problem-rows { border-top: 1px solid var(--line); }
.problem-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  min-height: 76px;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid #e9eef3;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}
.problem-row:hover { background: #f8fafc; }
.problem-index, .order-number { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 8px; color: #68798c; background: #edf2f6; font-size: 12px; font-weight: 750; }
.problem-copy { display: grid; min-width: 0; gap: 6px; }
.problem-copy strong { overflow: hidden; color: #295b8d; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.35; }
.problem-copy small { color: #8a97a6; font-size: 12px; line-height: 1.4; }
.problem-copy :deep(.state-badges),
.problem-copy :deep(.problem-state-badges) { margin-top: 1px; }
.difficulty { padding: 5px 9px; border-radius: 7px; color: #557086; background: #eef3f7; font-size: 11px; white-space: nowrap; }
.empty-state { display: grid; justify-items: center; gap: 8px; padding: 18px 8px; }
.empty-state svg { color: #5d8f78; }
.empty-state strong { color: #44586c; font-size: 13px; }
.empty-state p { font-size: 12px; line-height: 1.5; }
.empty-state.compact { padding: 28px 10px; }
.continue-list { border-top: 1px solid var(--line); }
.continue-list button {
  display: flex;
  min-height: 78px;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid #e9eef3;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}
.continue-list button:hover { background: #f8fafc; }
.continue-list button > span { display: grid; min-width: 0; flex: 1; gap: 6px; }
.continue-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.35; }
.continue-list small { color: #8794a3; font-size: 12px; line-height: 1.4; }
.continue-list b { flex: 0 0 auto; color: #2c70b1; font-size: 13px; font-weight: 800; white-space: nowrap; }
.continue-list .continue-expand { min-height: 44px; justify-content: center; color: #316d9f; font-size: 12px; font-weight: 800; }
.library-entry { display: flex; min-height: 64px; align-items: center; gap: 12px; width: 100%; margin-top: 16px; padding: 12px 14px; border: 1px solid #bfd1e2; border-radius: 14px; color: #225d91; text-align: left; background: #f4f8fc; cursor: pointer; }
.library-entry:hover { border-color: #8fb3d2; background: #eaf2f9; }
.library-entry span { display: grid; gap: 4px; }
.library-entry strong { font-size: 13px; line-height: 1.35; }
.library-entry small { color: #7a8999; font-size: 11px; line-height: 1.4; }
.active-section { margin-top: 18px; padding: 22px; }
.plan-grid, .public-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.plan-card, .list-card { position: relative; min-width: 0; border: 1px solid var(--line); border-radius: 18px; background: #fff; }
.plan-card { display: flex; }
.plan-card:hover, .list-card:hover, .list-card.selected { border-color: #91b4d3; box-shadow: 0 9px 22px rgba(35, 77, 113, .08); }
.card-main { min-width: 0; flex: 1; padding: 17px; border: 0; color: inherit; text-align: left; background: transparent; cursor: pointer; }
.card-label, .list-badge { color: #3977aa; font-size: 9px; font-weight: 850; }
.card-main h3, .list-card h3 { margin: 7px 0 6px; overflow: hidden; color: #2a3e52; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; letter-spacing: 0; }
.card-main p, .list-card p { height: 35px; overflow: hidden; color: #7c8998; font-size: 11px; line-height: 1.55; }
.progress-line { height: 6px; margin: 16px 0 7px; overflow: hidden; border-radius: 3px; background: #e6ebf0; }
.progress-line i { display: block; height: 100%; border-radius: inherit; background: var(--blue); }
.progress-copy { color: #66778a; font-size: 10px; }
.active-plan-card { border-top: 3px solid #4e84db; }
.icon-command { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 0; border-radius: 6px; color: #65778a; background: transparent; cursor: pointer; }
.icon-command:hover { color: #245f94; background: #edf3f8; }
.plan-card > .icon-command { margin: 11px 11px 0 0; }
.icon-command.danger:hover { color: #a9443d; background: #fff0ef; }

.page-section { padding: 24px; }
.page-toolbar { min-height: 70px; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
.page-toolbar > div { min-width: 0; }
.page-toolbar p { margin-top: 7px; }
.subsection-heading { margin: 23px 0 13px; }
.subsection-heading h3, .subheading h3 { font-size: 15px; letter-spacing: 0; }
.subsection-heading span, .subheading span { color: #8492a2; font-size: 10px; }
.featured-heading { margin-top: 30px; padding-top: 23px; border-top: 1px solid var(--line); }
.list-card { padding: 17px; }
.list-card p { margin-bottom: 16px; }
.card-footer { display: flex; min-height: 34px; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid #e9eef3; }
.card-footer > span { color: #7e8d9d; font-size: 10px; }
.list-catalog { margin-top: 20px; }
.list-detail { margin-top: 24px; padding: 24px; box-shadow: none; }
.detail-heading { min-height: 62px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.inline-actions { display: flex; gap: 8px; }
.list-settings { display: grid; grid-template-columns: 1fr 2fr auto; align-items: end; gap: 14px; margin: 0 -24px; padding: 18px 24px; border-bottom: 1px solid var(--line); background: #f8fafc; }
label { display: block; color: #4d6074; font-size: 11px; font-weight: 750; }
input, textarea { width: 100%; margin-top: 7px; padding: 9px 10px; border: 1px solid #cbd8e4; border-radius: 5px; color: #26384d; background: #fff; font: inherit; font-size: 13px; outline: none; }
input:focus, textarea:focus { border-color: #7fa9e8; box-shadow: 0 0 0 3px rgba(31, 94, 255, .09); }
textarea { resize: vertical; }
.switch-label { display: flex; min-height: 40px; align-items: center; gap: 8px; white-space: nowrap; }
.switch-label input { width: 16px; margin: 0; accent-color: var(--blue); }
.public-description { padding: 18px 0; border-bottom: 1px solid var(--line); color: #6f7f90; font-size: 12px; }
.subheading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 21px 0 11px; }
.catalog-selected-count {
  padding: 4px 8px;
  border-radius: 999px;
  color: #245f94;
  background: #edf5fc;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}
.list-assignment-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 14px;
  margin-top: 10px;
  align-items: start;
}
.list-problem-bank,
.list-problem-set {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}
.list-problem-bank { padding: 12px; }
.list-bank-heading,
.list-problem-set > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.list-bank-heading > div,
.list-problem-set > header > div { display: grid; gap: 2px; }
.list-bank-heading strong,
.list-problem-set strong { color: #29475f; font-size: 13px; }
.list-bank-heading span,
.list-problem-set header span { color: #7c8998; font-size: 10px; }
.list-bank-heading > span {
  flex: 0 0 auto;
  padding: 4px 7px;
  border-radius: 999px;
  color: #245f94;
  background: #edf5fc;
  font-size: 10px;
  font-weight: 800;
}
.list-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(120px, .9fr) minmax(120px, .9fr) auto;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}
.list-keyword {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid #d5dee8;
  border-radius: 8px;
  background: #f8fafc;
  color: #718094;
}
.list-keyword input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}
.list-difficulty-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.list-difficulty-filter button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #d5dee8;
  border-radius: 999px;
  background: #fff;
  color: #526579;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.list-difficulty-filter button.active,
.list-difficulty-filter button:hover {
  border-color: #9fc0de;
  color: #1f5eff;
  background: #eef5ff;
}
.list-catalog-table-wrap {
  margin-top: 12px;
  overflow: auto;
  border: 1px solid #dce5ed;
  border-radius: 10px;
}
.list-catalog-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
}
.list-catalog-table th,
.list-catalog-table td {
  padding: 10px 11px;
  border-bottom: 1px solid #eaf0f5;
  color: #53677b;
  text-align: left;
  font-size: 11px;
}
.list-catalog-table th {
  color: #718094;
  background: #f8fafc;
  font-size: 10px;
}
.list-catalog-table th:first-child,
.list-catalog-table td:first-child {
  width: 34px;
  text-align: center;
}
.list-catalog-row {
  cursor: pointer;
  transition: background .14s;
}
.list-catalog-row:hover { background: #f7fbff; }
.list-catalog-row.selected { background: #eef5ff; }
.list-catalog-table td strong {
  display: block;
  color: #304a64;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.list-catalog-table td small {
  display: block;
  margin-top: 3px;
  color: #8794a2;
  font-size: 9px;
}
.list-catalog-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}
.list-catalog-pagination button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #d5dee8;
  border-radius: 8px;
  background: #fff;
  color: #3f5870;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.list-catalog-pagination button:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.list-problem-set {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 320px;
  padding: 12px;
  background: #f8fafc;
}
.list-problem-set .clear-problem-set {
  border: 0;
  background: transparent;
  color: #b45309;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.problem-set-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  max-height: 360px;
  overflow: auto;
}
.problem-set-list article {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e1e9f1;
  border-radius: 9px;
  background: #fff;
}
.problem-set-list article strong {
  display: block;
  color: #2d4660;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.problem-set-list article span {
  display: block;
  margin-top: 3px;
  color: #8291a1;
  font-size: 10px;
}
.problem-set-list button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fff;
  color: #7b8794;
  cursor: pointer;
}
.problem-set-empty {
  display: grid;
  place-items: center;
  min-height: 160px;
  margin-top: 12px;
  color: #8b98a7;
  font-size: 12px;
  text-align: center;
}
.builder-footer {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.builder-footer > span {
  color: #7d8b9b;
  font-size: 10px;
}
.builder-footer .primary-btn {
  width: 100%;
  justify-content: center;
}
.problem-search-empty {
  margin-top: 12px;
  padding: 18px 12px;
  color: #8090a0;
  text-align: center;
  font-size: 12px;
  border: 1px dashed #d5dee8;
  border-radius: 10px;
  background: #fbfdff;
}
@media (max-width: 980px) {
  .list-assignment-workspace { grid-template-columns: 1fr; }
  .list-filter-row { grid-template-columns: 1fr; }
}
.problem-heading { align-items: flex-end; }
.sort-toolbar { display: flex; gap: 5px; padding: 4px; border: 1px solid #dce4ec; border-radius: 7px; background: #f0f3f6; }
.sort-modes { display: flex; gap: 3px; }
.sort-modes button, .sort-direction { height: 31px; padding: 0 9px; border: 0; border-radius: 5px; color: #65778a; background: transparent; cursor: pointer; font: inherit; font-size: 10px; font-weight: 750; }
.sort-modes button.active { color: var(--blue); background: #fff; box-shadow: 0 2px 6px rgba(31, 66, 104, .08); }
.sort-direction { display: grid; width: 32px; padding: 0; place-items: center; background: #fff; }
.ordered-list { overflow: hidden; border: 1px solid var(--line); border-radius: 7px; }
.ordered-row { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto auto; min-height: 54px; align-items: center; gap: 9px; padding: 0 11px; border-bottom: 1px solid #e9eef3; }
.ordered-row:last-child { border-bottom: 0; }
.problem-link { min-width: 0; overflow: hidden; border: 0; padding: 0; color: #225f96; text-align: left; text-overflow: ellipsis; white-space: nowrap; background: transparent; cursor: pointer; font: inherit; font-size: 12px; font-weight: 750; }
.problem-link:hover { color: var(--blue); }
.listed-problem { display: grid; min-width: 0; gap: 5px; }

.library-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
.library-column { overflow: hidden; border: 1px solid var(--line); border-radius: 8px; }
.library-title { display: flex; min-height: 70px; align-items: center; gap: 11px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: #f8fafc; }
.library-title > div { display: grid; gap: 2px; }
.library-title h3 { font-size: 14px; }
.library-title small { color: #8492a2; font-size: 9px; }
.library-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 7px; }
.library-icon.favorite { color: #8a6700; background: #fff6cf; }
.library-icon.wrong { color: #a7443f; background: #fff0ef; }
.library-list { padding: 0 14px; }
.library-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 34px; min-height: 51px; align-items: center; gap: 9px; border-bottom: 1px solid #e9eef3; }
.library-row > span:not(.listed-problem) { color: #718094; font-size: 9px; white-space: nowrap; }
.wrong-tag { color: #a7443f !important; }
.view-all { display: flex; min-height: 48px; align-items: center; justify-content: space-between; width: 100%; padding: 0 16px; border: 0; color: #2d6396; background: #f6f9fc; cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; }
.view-all:hover { background: #edf4fa; }
.view-all span { display: grid; min-width: 24px; height: 22px; place-items: center; border-radius: 5px; color: #53718d; background: #e5edf4; }
.wrong-view { color: #93413b; }
.compact-toolbar { justify-content: flex-start; }
.back-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; color: #356f9f; background: transparent; cursor: pointer; font: inherit; font-size: 11px; font-weight: 750; }
.full-library-list { margin-top: 18px; border: 1px solid var(--line); border-radius: 7px; }
.full-row { grid-template-columns: minmax(0, 1fr) auto 90px; padding: 0 13px; }

.primary-btn, .secondary-btn { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; }
.primary-btn { border: 1px solid var(--blue); color: #fff; background: var(--blue); }
.primary-btn:hover { border-color: #174bd1; background: #174bd1; }
.primary-btn.small { min-height: 32px; padding: 0 10px; font-size: 10px; }
.primary-btn:disabled { opacity: .58; cursor: wait; }
.secondary-btn { border: 1px solid #bfd1e2; color: #225d91; background: #f8fbfe; }
.secondary-btn:hover { border-color: #8fb3d2; background: #edf5fc; }
.secondary-btn.danger-command { color: #a8463f; border-color: #e8c5c2; background: #fff8f7; }
.text-btn { border: 0; padding: 0; color: #2e6ba0; background: transparent; cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; }
.text-btn:hover { color: #174f81; }

.modal-backdrop { position: fixed; inset: 0; z-index: 220; display: grid; place-items: center; padding: 20px; background: rgba(29, 42, 56, .5); }
.modal { position: relative; width: min(480px, 100%); max-height: calc(100vh - 40px); padding: 26px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 0 24px 70px rgba(23, 40, 57, .22); }
.modal h2 { margin: 6px 0 20px; font-size: 21px; letter-spacing: 0; }
.modal label + label { margin-top: 14px; }
.modal-close { position: absolute; top: 14px; right: 14px; display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 6px; color: #65778a; background: transparent; cursor: pointer; }
.modal-close:hover { background: #edf3f8; }
.full-btn { width: 100%; margin-top: 20px; }
.plan-modal { width: min(620px, 100%); }
.modal-plan-section { padding: 16px 0; border-top: 1px solid var(--line); }
.modal-plan-section h3 { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; font-size: 13px; }
.modal-plan-section h3 span { display: grid; min-width: 22px; height: 20px; place-items: center; border-radius: 5px; color: #47647f; background: #e9eff4; font-size: 9px; }
.modal-plan-section > p { padding: 16px 0; color: #8492a2; font-size: 11px; }
.modal-plan-list { border: 1px solid var(--line); border-radius: 7px; }
.modal-plan-list > div { display: flex; min-height: 54px; align-items: center; gap: 8px; padding: 5px 8px 5px 12px; border-bottom: 1px solid #e9eef3; }
.modal-plan-list > div:last-child { border-bottom: 0; }
.modal-plan-list > div > button:first-child { display: grid; min-width: 0; flex: 1; gap: 3px; border: 0; color: inherit; text-align: left; background: transparent; cursor: pointer; }
.modal-plan-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.modal-plan-list small { color: #8492a2; font-size: 9px; }
.modal-plan-section.completed { padding-bottom: 0; }

@media (max-width: 1040px) {
  .plan-grid, .public-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .list-settings { grid-template-columns: 1fr 1.5fr; }
  .switch-label { grid-column: 1 / -1; }
}
@media (max-width: 860px) {
  .learning-page { display: block; }
  .learning-main { padding: 18px 16px 52px; }
  .learning-sidebar, .learning-page.sidebar-collapsed .learning-sidebar { position: static; width: auto; height: auto; padding: 12px; border-right: 0; }
  .learning-sidebar-title { display: none; }
  .workspace-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; padding: 5px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
  .workspace-nav button, .sidebar-collapsed .workspace-nav button { grid-template-columns: 22px minmax(0, 1fr) auto; justify-items: initial; min-height: 46px; padding: 7px 10px; }
  .workspace-nav button small, .sidebar-collapsed .workspace-nav button small, .sidebar-collapsed .workspace-nav button > span, .sidebar-collapsed .workspace-nav button > b { display: initial; }
  .workspace-nav button > span, .sidebar-collapsed .workspace-nav button > span { display: grid; }
  .workspace-nav button > b, .sidebar-collapsed .workspace-nav button > b { display: grid; }
  .learning-header { min-height: 0; }
  .practice-grid { grid-template-columns: 1fr; }
}
@media (max-width: 680px) {
  .learning-header { padding: 22px 20px; }
  .learning-header h1 { font-size: 29px; }
  .metric-strip { grid-template-columns: 1fr; }
  .metric-strip > div { min-height: 76px; padding: 17px 20px; }
  .metric-strip > div + div { box-shadow: inset 0 1px var(--line); }
  .metric-strip strong { font-size: 28px; }
  .workspace-panel, .page-section, .active-section, .list-detail { padding: 18px 15px; }
  .plan-grid, .public-grid, .library-grid { grid-template-columns: 1fr; }
  .page-toolbar, .detail-heading, .problem-heading { align-items: flex-start; flex-direction: column; }
  .list-settings { grid-template-columns: 1fr; margin: 0 -15px; padding: 16px 15px; }
  .switch-label { grid-column: auto; }
  .inline-actions, .search-inline { width: 100%; }
  .inline-actions > button { min-width: 0; flex: 1; padding-right: 8px; padding-left: 8px; }
  .sort-toolbar { width: 100%; overflow-x: auto; }
  .ordered-row { grid-template-columns: 34px minmax(0, 1fr) auto; }
  .ordered-row .difficulty { display: none; }
  .full-row { grid-template-columns: minmax(0, 1fr) auto; padding: 8px 11px; }
  .full-row > span { display: none; }
  .notice { right: 14px; left: 14px; max-width: none; }
}
@media (max-width: 430px) {
  .workspace-nav button { grid-template-columns: 20px minmax(0, 1fr); }
  .workspace-nav button > b { display: none !important; }
  .problem-row { grid-template-columns: 30px minmax(0, 1fr); }
  .problem-row > .difficulty { display: none; }
}
</style>
