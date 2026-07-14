<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useDebounceFn, useStorage } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers3,
  ListFilter,
  ListTodo,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  SearchX,
  SlidersHorizontal,
  Star,
  Tag,
  X,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../api/client';
import FilterSelect from '../components/FilterSelect.vue';
import { useAuthStore } from '../stores/auth';

interface ProblemTag {
  name: string;
}

interface ProblemItem {
  id: string;
  title: string;
  source: string;
  difficulty: string | null;
  timeLimit: number;
  memoryLimit: number;
  createdAt: string;
  tags: ProblemTag[];
  _count?: { submissions: number };
}

interface ProblemResponse {
  items: ProblemItem[];
  total: number;
  page: number;
  pageSize: number;
}

type PageToken = number | 'start-ellipsis' | 'end-ellipsis';

const difficultyOptions = [
  { value: '', label: '全部' },
  { value: 'BEGINNER', label: '入门' },
  { value: 'POPULAR', label: '普及' },
  { value: 'IMPROVE', label: '提高' },
  { value: 'PROVINCIAL', label: '省选' },
  { value: 'NOI', label: 'NOI' },
];

const sourceOptions = [
  { value: '', label: '全部来源' },
  { value: 'LOCAL', label: '原创' },
  { value: 'EXTERNAL', label: '洛谷' },
  { value: 'REMOTE', label: '远程' },
];

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const sidebarCollapsed = useStorage('swufe-oj:problem-sidebar-collapsed', false);

function queryValue(key: string) {
  const value = route.query[key];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

const initialKeyword = queryValue('keyword').trim();
const requestedDifficulty = queryValue('difficulty');
const initialDifficulty = difficultyOptions.some((option) => option.value === requestedDifficulty)
  ? requestedDifficulty
  : '';
const requestedSource = queryValue('source');
const initialSource = sourceOptions.some((option) => option.value === requestedSource)
  ? requestedSource
  : '';
const requestedPage = Number.parseInt(queryValue('page'), 10);

const searchInput = ref(initialKeyword);
const keyword = ref(initialKeyword);
const difficulty = ref(initialDifficulty);
const source = ref(initialSource);
const selectedTag = ref(queryValue('tag'));
const page = ref(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1);
const pageSize = 10;

const problems = ref<ProblemItem[]>([]);
const metadataProblems = ref<ProblemItem[]>([]);
const total = ref(0);
const publishedTotal = ref<number | null>(null);
const loading = ref(true);
const error = ref('');
const metadataLoading = ref(true);
const metadataError = ref(false);
let requestSerial = 0;
let focusResultsAfterLoad = false;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const hasFilters = computed(() => Boolean(
  keyword.value || difficulty.value || source.value || selectedTag.value,
));
const resultLabel = computed(() => hasFilters.value ? `筛选到 ${total.value} 道题` : `全部 ${total.value} 道题`);
const publicProblemCount = computed(() => {
  if (publishedTotal.value !== null) return publishedTotal.value;
  if (!loading.value && !error.value && !hasFilters.value) return total.value;
  return null;
});

const tagCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const problem of metadataProblems.value) {
    for (const item of problem.tags || []) {
      counts.set(item.name, (counts.get(item.name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([name, count]) => ({ name, count }));
});

const popularTagCounts = computed(() => tagCounts.value.slice(0, 9));
const metadataIsSample = computed(() => (
  publishedTotal.value !== null && publishedTotal.value > metadataProblems.value.length
));
const tagOptions = computed(() => [
  { value: '', label: metadataIsSample.value ? '样本内标签' : '全部标签' },
  ...tagCounts.value.map((item) => ({
    value: item.name,
    label: `${item.name} (${item.count})`,
  })),
]);
const metadataScopeLabel = computed(() => {
  if (metadataLoading.value) return '统计加载中';
  if (metadataIsSample.value) {
    return `前 ${metadataProblems.value.length} 道样本`;
  }
  return `${metadataProblems.value.length} 道已载入`;
});

const difficultyDistribution = computed(() => difficultyOptions.slice(1)
  .map((option) => ({
    ...option,
    count: metadataProblems.value.filter((problem) => problem.difficulty === option.value).length,
  }))
  .filter((option) => option.count > 0));

const maxDifficultyCount = computed(() => Math.max(
  1,
  ...difficultyDistribution.value.map((item) => item.count),
));

const sourceCount = computed(() => new Set(metadataProblems.value.map((problem) => problem.source)).size);

const paginationTokens = computed<PageToken[]>(() => {
  const count = totalPages.value;
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);

  const tokens: PageToken[] = [1];
  const start = Math.max(2, page.value - 1);
  const end = Math.min(count - 1, page.value + 1);
  if (start > 2) tokens.push('start-ellipsis');
  for (let value = start; value <= end; value += 1) tokens.push(value);
  if (end < count - 1) tokens.push('end-ellipsis');
  tokens.push(count);
  return tokens;
});

const commitSearch = useDebounceFn(() => {
  keyword.value = searchInput.value.trim();
}, 280);

watch(searchInput, () => commitSearch());

watch([keyword, difficulty, source, selectedTag], () => {
  if (page.value !== 1) page.value = 1;
  else void loadProblems();
});

watch(page, () => void loadProblems());

watch([keyword, difficulty, source, selectedTag, page], syncRouteQuery, { flush: 'post' });

onMounted(() => {
  syncRouteQuery();
  void loadMetadata();
  void loadProblems();
});

async function loadMetadata() {
  metadataLoading.value = true;
  metadataError.value = false;
  try {
    const { data } = await api.get<ProblemResponse>('/api/problems', {
      params: { page: 1, pageSize: 100 },
    });
    metadataProblems.value = data.items || [];
    publishedTotal.value = data.total || 0;
  } catch {
    metadataProblems.value = [];
    publishedTotal.value = null;
    metadataError.value = true;
  } finally {
    metadataLoading.value = false;
  }
}

async function loadProblems() {
  const requestId = ++requestSerial;
  loading.value = true;
  error.value = '';

  try {
    const params: Record<string, string | number> = {
      page: page.value,
      pageSize,
    };
    if (keyword.value) params.keyword = keyword.value;
    if (difficulty.value) params.difficulty = difficulty.value;
    if (source.value) params.source = source.value;
    if (selectedTag.value) params.tag = selectedTag.value;

    const { data } = await api.get<ProblemResponse>('/api/problems', { params });
    if (requestId !== requestSerial) return;

    problems.value = data.items || [];
    total.value = data.total || 0;

    const lastPage = Math.max(1, Math.ceil(total.value / pageSize));
    if (page.value > lastPage) page.value = lastPage;
  } catch (requestError: any) {
    if (requestId !== requestSerial) return;
    problems.value = [];
    total.value = 0;
    error.value = requestError.response?.data?.message || '题库暂时无法加载';
  } finally {
    if (requestId === requestSerial) {
      loading.value = false;
      if (focusResultsAfterLoad) {
        focusResultsAfterLoad = false;
        void nextTick(() => {
          const currentPageButton = document.querySelector<HTMLButtonElement>('.page-button.current');
          if (currentPageButton && getComputedStyle(currentPageButton).display !== 'none') {
            currentPageButton.focus();
          } else {
            document.querySelector<HTMLElement>('#result-heading')?.focus();
          }
        });
      }
    }
  }
}

function applySearchNow() {
  const nextKeyword = searchInput.value.trim();
  if (keyword.value === nextKeyword) {
    if (page.value !== 1) page.value = 1;
    else void loadProblems();
    return;
  }
  keyword.value = nextKeyword;
}

function clearSearch() {
  searchInput.value = '';
  keyword.value = '';
}

function resetFilters() {
  const wasClear = !hasFilters.value && !searchInput.value;
  searchInput.value = '';
  keyword.value = '';
  difficulty.value = '';
  source.value = '';
  selectedTag.value = '';
  if (wasClear) void loadProblems();
}

function reloadAll() {
  void loadMetadata();
  void loadProblems();
}

function goToPage(target: number) {
  if (target < 1 || target > totalPages.value || target === page.value) return;
  focusResultsAfterLoad = true;
  page.value = target;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('.problem-results')?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

function syncRouteQuery() {
  const nextQuery: Record<string, string> = {};
  if (keyword.value) nextQuery.keyword = keyword.value;
  if (difficulty.value) nextQuery.difficulty = difficulty.value;
  if (source.value) nextQuery.source = source.value;
  if (selectedTag.value) nextQuery.tag = selectedTag.value;
  if (page.value > 1) nextQuery.page = String(page.value);

  const unchanged = queryValue('keyword') === (nextQuery.keyword || '')
    && queryValue('difficulty') === (nextQuery.difficulty || '')
    && queryValue('source') === (nextQuery.source || '')
    && queryValue('tag') === (nextQuery.tag || '')
    && queryValue('page') === (nextQuery.page || '');
  if (!unchanged) void router.replace({ query: nextQuery });
}

function openProblem(problemId: string) {
  void router.push(`/problems/${problemId}`);
}

function handleProblemRowClick(event: MouseEvent, problemId: string) {
  const target = event.target as Element;
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (target.closest('a, button')) return;
  openProblem(problemId);
}

function difficultyLabel(value: string | null) {
  return difficultyOptions.find((option) => option.value === value)?.label || '未分级';
}

function difficultyClass(value: string | null) {
  return value?.toLowerCase() || 'unrated';
}

function sourceLabel(value: string) {
  return sourceOptions.find((option) => option.value === value)?.label || value || '原创';
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function requireLogin(redirect: string) {
  void router.push({ path: '/login', query: { redirect } });
}
</script>

<template>
  <div class="library-page">
    <div class="library-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <aside class="library-sidebar" aria-label="题库个人导航">
        <div class="sidebar-title">
          <span class="sidebar-title-icon">
            <BookOpenCheck :size="19" aria-hidden="true" />
          </span>
          <span class="sidebar-title-copy">
            <strong>练习空间</strong>
            <small>学生题库</small>
          </span>
          <button
            type="button"
            class="sidebar-collapse-button"
            :aria-label="sidebarCollapsed ? '展开题库侧栏' : '收起题库侧栏'"
            :aria-expanded="!sidebarCollapsed"
            aria-controls="library-sidebar-navigation"
            :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <PanelLeftOpen v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
            <PanelLeftClose v-else :size="18" aria-hidden="true" />
          </button>
        </div>

        <nav id="library-sidebar-navigation" class="sidebar-navigation" aria-label="题库功能">
          <router-link
            to="/problems"
            class="sidebar-link"
            aria-label="全部题目"
            :title="sidebarCollapsed ? '全部题目' : undefined"
          >
            <ListTodo :size="18" aria-hidden="true" />
            <span class="sidebar-link-label">全部题目</span>
          </router-link>

          <div class="sidebar-divider" aria-hidden="true"></div>
          <span class="sidebar-section-label">个人题库</span>

          <router-link
            v-if="auth.isLoggedIn()"
            to="/problem-lists"
            class="sidebar-link"
            aria-label="我的题单"
            :title="sidebarCollapsed ? '我的题单' : undefined"
          >
            <BookOpen :size="18" aria-hidden="true" />
            <span class="sidebar-link-label">我的题单</span>
            <ChevronRight class="sidebar-link-trailing" :size="16" aria-hidden="true" />
          </router-link>

          <button
            v-else
            type="button"
            class="sidebar-link"
            aria-label="登录后查看我的题单"
            :title="sidebarCollapsed ? '登录后查看我的题单' : undefined"
            @click="requireLogin('/problem-lists')"
          >
            <BookOpen :size="18" aria-hidden="true" />
            <span class="sidebar-link-label">我的题单</span>
            <ChevronRight class="sidebar-link-trailing" :size="16" aria-hidden="true" />
          </button>

          <button
            v-if="!auth.isLoggedIn()"
            type="button"
            class="sidebar-link"
            aria-label="登录后查看我的收藏"
            :title="sidebarCollapsed ? '登录后查看我的收藏' : undefined"
            @click="requireLogin('/profile')"
          >
            <Star :size="18" aria-hidden="true" />
            <span class="sidebar-link-label">我的收藏</span>
            <ChevronRight class="sidebar-link-trailing" :size="16" aria-hidden="true" />
          </button>

          <button
            v-else
            type="button"
            class="sidebar-link sidebar-link-disabled"
            disabled
            aria-label="我的收藏，数据接口尚未接入"
            :title="sidebarCollapsed ? '我的收藏（尚未接入）' : '收藏数据接口尚未接入'"
          >
            <Star :size="18" aria-hidden="true" />
            <span class="sidebar-link-label">我的收藏</span>
            <LockKeyhole class="sidebar-link-trailing" :size="15" aria-hidden="true" />
          </button>
        </nav>
      </aside>

      <div class="library-main">
        <div class="library-frame">
      <header class="library-heading">
        <div class="heading-copy">
          <div class="context-label">
            <BookOpen :size="16" aria-hidden="true" />
            <span>学生训练</span>
          </div>
          <h1>题库</h1>
          <p aria-live="polite">
            共 {{ publicProblemCount === null ? '—' : formatNumber(publicProblemCount) }} 道公开题目
          </p>
        </div>

        <div class="summary-ribbon" role="list" aria-label="题库概览">
          <div class="summary-item" role="listitem">
            <Database :size="19" aria-hidden="true" />
            <span>
              <strong>{{ publicProblemCount === null ? '—' : formatNumber(publicProblemCount) }}</strong>
              <small>公开题目</small>
            </span>
          </div>
          <div class="summary-item" role="listitem">
            <ListFilter :size="19" aria-hidden="true" />
            <span><strong>{{ formatNumber(total) }}</strong><small>当前结果</small></span>
          </div>
          <div class="summary-item" role="listitem">
            <Layers3 :size="19" aria-hidden="true" />
            <span><strong>{{ sourceCount }}</strong><small>{{ metadataIsSample ? '样本来源' : '题库来源' }}</small></span>
          </div>
        </div>
      </header>

      <section class="filter-panel" aria-label="题库筛选">
        <div class="search-field">
          <Search :size="20" aria-hidden="true" />
          <label class="sr-only" for="problem-search">搜索题目名称</label>
          <input
            id="problem-search"
            v-model="searchInput"
            type="search"
            placeholder="搜索题目名称"
            autocomplete="off"
            @keydown.enter.prevent="applySearchNow"
          />
          <button
            v-if="searchInput"
            type="button"
            class="icon-button clear-search"
            aria-label="清除搜索"
            title="清除搜索"
            @click="clearSearch"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <div class="filter-row">
          <div class="filter-label">
            <SlidersHorizontal :size="17" aria-hidden="true" />
            <span>难度</span>
          </div>
          <div class="difficulty-control" role="group" aria-label="按难度筛选">
            <button
              v-for="option in difficultyOptions"
              :key="option.value"
              type="button"
              class="difficulty-button"
              :class="{ active: difficulty === option.value }"
              :aria-pressed="difficulty === option.value"
              @click="difficulty = option.value"
            >
              {{ option.label }}
            </button>
          </div>

          <FilterSelect
            v-model="source"
            class="tag-select source-select"
            :options="sourceOptions"
            label="按题目来源筛选"
          >
            <template #icon><Database :size="17" aria-hidden="true" /></template>
          </FilterSelect>

          <FilterSelect
            v-model="selectedTag"
            class="tag-select"
            :options="tagOptions"
            label="按标签筛选"
          >
            <template #icon><Tag :size="17" aria-hidden="true" /></template>
          </FilterSelect>

          <button v-if="hasFilters" type="button" class="reset-button" @click="resetFilters">
            <RefreshCw :size="16" aria-hidden="true" />
            重置
          </button>
        </div>
      </section>

      <div class="content-grid">
        <section class="problem-results list-surface" aria-labelledby="result-heading">
          <div class="list-header">
            <div>
              <span class="list-kicker">练习列表</span>
              <h2 id="result-heading" tabindex="-1">{{ resultLabel }}</h2>
            </div>
            <div class="active-filters" aria-live="polite">
              <span v-if="keyword" class="filter-chip">“{{ keyword }}”</span>
              <span v-if="difficulty" class="filter-chip">{{ difficultyLabel(difficulty) }}</span>
              <span v-if="source" class="filter-chip">{{ sourceLabel(source) }}</span>
              <span v-if="selectedTag" class="filter-chip">{{ selectedTag }}</span>
            </div>
          </div>

          <div v-if="loading" class="skeleton-list" aria-label="正在加载题目" aria-busy="true">
            <div v-for="index in 8" :key="index" class="skeleton-row">
              <span class="skeleton-block skeleton-title"></span>
              <span class="skeleton-block skeleton-pill"></span>
              <span class="skeleton-block skeleton-meta"></span>
            </div>
          </div>

          <div v-else-if="error" class="state-panel" role="alert">
            <AlertCircle :size="32" aria-hidden="true" />
            <h2>加载失败</h2>
            <p>{{ error }}</p>
            <button type="button" class="primary-button" @click="reloadAll">
              <RefreshCw :size="17" aria-hidden="true" />
              重新加载
            </button>
          </div>

          <div v-else-if="problems.length === 0" class="state-panel">
            <SearchX :size="34" aria-hidden="true" />
            <h2>{{ hasFilters ? '没有匹配的题目' : '题库暂无题目' }}</h2>
            <button v-if="hasFilters" type="button" class="primary-button" @click="resetFilters">
              清除筛选
            </button>
          </div>

          <template v-else>
            <div class="desktop-table-wrap">
              <table class="problem-table">
                <caption class="sr-only">学生题库，共 {{ total }} 道题</caption>
                <thead>
                  <tr>
                    <th scope="col">题目</th>
                    <th scope="col">难度</th>
                    <th scope="col" class="tags-column">标签</th>
                    <th scope="col">运行约束</th>
                    <th scope="col" class="submission-column">提交</th>
                    <th scope="col" class="action-column"><span class="sr-only">打开</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(problem, index) in problems"
                    :key="problem.id"
                    class="problem-row"
                    :style="{ animationDelay: `${index * 24}ms` }"
                    @click="handleProblemRowClick($event, problem.id)"
                  >
                    <td class="problem-title-cell">
                      <router-link :to="`/problems/${problem.id}`" class="problem-title-link">
                        {{ problem.title }}
                      </router-link>
                      <span class="problem-source">{{ sourceLabel(problem.source) }}</span>
                    </td>
                    <td>
                      <span class="difficulty-badge" :class="difficultyClass(problem.difficulty)">
                        {{ difficultyLabel(problem.difficulty) }}
                      </span>
                    </td>
                    <td class="tags-column">
                      <div class="tag-list">
                        <span v-for="item in problem.tags.slice(0, 3)" :key="item.name" class="tag-chip">
                          {{ item.name }}
                        </span>
                        <span v-if="problem.tags.length > 3" class="tag-chip tag-more">+{{ problem.tags.length - 3 }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="constraint-list">
                        <span><span class="constraint-dot time-dot"></span>{{ problem.timeLimit }} ms</span>
                        <span><span class="constraint-dot memory-dot"></span>{{ problem.memoryLimit }} MB</span>
                      </div>
                    </td>
                    <td class="submission-column submission-count">
                      {{ formatNumber(problem._count?.submissions) }}
                    </td>
                    <td class="action-column">
                      <ArrowUpRight :size="18" aria-hidden="true" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mobile-problem-list">
              <router-link
                v-for="(problem, index) in problems"
                :key="problem.id"
                :to="`/problems/${problem.id}`"
                class="mobile-problem-item"
                :style="{ animationDelay: `${index * 24}ms` }"
              >
                <div class="mobile-problem-heading">
                  <span class="mobile-problem-title">{{ problem.title }}</span>
                  <span class="difficulty-badge" :class="difficultyClass(problem.difficulty)">
                    {{ difficultyLabel(problem.difficulty) }}
                  </span>
                </div>
                <div class="mobile-tag-list">
                  <span v-for="item in problem.tags.slice(0, 2)" :key="item.name" class="tag-chip">{{ item.name }}</span>
                  <span v-if="problem.tags.length > 2" class="tag-chip tag-more">+{{ problem.tags.length - 2 }}</span>
                </div>
                <div class="mobile-problem-meta">
                  <span>{{ sourceLabel(problem.source) }}</span>
                  <span>{{ problem.timeLimit }} ms</span>
                  <span>{{ problem.memoryLimit }} MB</span>
                  <span>{{ formatNumber(problem._count?.submissions) }} 次提交</span>
                </div>
              </router-link>
            </div>

            <footer v-if="totalPages > 1" class="pagination" aria-label="题库分页">
              <button
                type="button"
                class="page-button icon-page-button"
                :disabled="page === 1"
                aria-label="上一页"
                title="上一页"
                @click="goToPage(page - 1)"
              >
                <ChevronLeft :size="19" aria-hidden="true" />
              </button>

              <span class="mobile-page-status">{{ page }} / {{ totalPages }}</span>

              <template v-for="token in paginationTokens" :key="token">
                <button
                  v-if="typeof token === 'number'"
                  type="button"
                  class="page-button"
                  :class="{ current: token === page }"
                  :aria-current="token === page ? 'page' : undefined"
                  @click="goToPage(token)"
                >
                  {{ token }}
                </button>
                <span v-else class="page-ellipsis" aria-hidden="true">…</span>
              </template>

              <button
                type="button"
                class="page-button icon-page-button"
                :disabled="page === totalPages"
                aria-label="下一页"
                title="下一页"
                @click="goToPage(page + 1)"
              >
                <ChevronRight :size="19" aria-hidden="true" />
              </button>
            </footer>
          </template>
        </section>

        <aside class="insights-column" aria-label="题库数据概览">
          <section v-if="metadataError" class="insight-panel metadata-state" role="status">
            <AlertCircle :size="22" aria-hidden="true" />
            <span>统计暂不可用</span>
            <button type="button" class="icon-button" aria-label="重新加载题库统计" title="重新加载" @click="loadMetadata">
              <RefreshCw :size="17" aria-hidden="true" />
            </button>
          </section>

          <template v-else>
            <section class="insight-panel">
              <div class="insight-heading">
                <span class="insight-icon"><SlidersHorizontal :size="18" aria-hidden="true" /></span>
                <div>
                  <span>难度分布</span>
                  <small>{{ metadataScopeLabel }}</small>
                </div>
              </div>
              <div class="difficulty-bars">
                <button
                  v-for="item in difficultyDistribution"
                  :key="item.value"
                  type="button"
                  class="distribution-row"
                  @click="difficulty = item.value"
                >
                  <span class="distribution-label">{{ item.label }}</span>
                  <span class="distribution-track">
                    <span
                      class="distribution-fill"
                      :class="difficultyClass(item.value)"
                      :style="{ width: `${(item.count / maxDifficultyCount) * 100}%` }"
                    ></span>
                  </span>
                  <strong>{{ item.count }}</strong>
                </button>
              </div>
            </section>

            <section class="insight-panel">
              <div class="insight-heading">
                <span class="insight-icon accent"><Tag :size="18" aria-hidden="true" /></span>
                <div>
                  <span>热门标签</span>
                  <small>{{ metadataIsSample ? `${tagCounts.length} 个样本标签` : `${tagCounts.length} 个标签` }}</small>
                </div>
              </div>
              <div class="tag-cloud">
                <button
                  v-for="item in popularTagCounts"
                  :key="item.name"
                  type="button"
                  :class="{ selected: selectedTag === item.name }"
                  @click="selectedTag = selectedTag === item.name ? '' : item.name"
                >
                  <span>{{ item.name }}</span>
                  <strong>{{ item.count }}</strong>
                </button>
              </div>
            </section>
          </template>

        </aside>
      </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-page {
  --primary: #1f5eff;
  --primary-strong: #1748c9;
  --primary-container: #e2eaff;
  --secondary: #087f73;
  --accent: #e88916;
  --success: #18794e;
  --danger: #c83b31;
  --ink: #20252c;
  --muted: #68717e;
  --outline: #d8dde5;
  --surface: #ffffff;
  --surface-low: #f4f6f8;
  --surface-high: #e9edf2;
  min-height: calc(100vh - 56px);
  background: #f3f5f7;
  color: var(--ink);
  font-family: 'Noto Sans SC Variable', sans-serif;
  letter-spacing: 0;
}

.library-shell {
  display: flex;
  min-height: calc(100vh - 56px);
}

.library-sidebar {
  position: sticky;
  z-index: 3;
  top: 56px;
  width: 248px;
  flex: 0 0 248px;
  align-self: start;
  height: calc(100vh - 56px);
  padding: 22px 14px;
  overflow-y: auto;
  border-right: 1px solid var(--outline);
  background: #fafbfc;
  transition:
    width 180ms cubic-bezier(0.2, 0, 0, 1),
    flex-basis 180ms cubic-bezier(0.2, 0, 0, 1),
    padding 180ms cubic-bezier(0.2, 0, 0, 1);
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 18px;
}

.sidebar-title-icon {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 8px;
  background: var(--primary-container);
  color: var(--primary-strong);
}

.sidebar-title-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.sidebar-title strong {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.3;
  font-weight: 750;
}

.sidebar-title small {
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
}

.sidebar-collapse-button {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #707a87;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease;
}

.sidebar-collapse-button:hover {
  background: var(--surface-high);
  color: var(--ink);
}

.sidebar-collapse-button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.sidebar-navigation {
  display: grid;
  gap: 4px;
}

.sidebar-navigation .sidebar-link {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 44px;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #505a67;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease, border-color 140ms ease;
}

.sidebar-navigation a.sidebar-link:hover,
.sidebar-navigation button.sidebar-link:not(:disabled):hover {
  border-color: #e1e5ea;
  background: var(--surface);
  color: var(--ink);
}

.sidebar-navigation .sidebar-link.router-link-exact-active {
  border-color: #cbd8ff;
  background: var(--primary-container);
  color: var(--primary-strong);
}

.sidebar-navigation .sidebar-link.router-link-exact-active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: -1px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--primary);
  content: '';
}

.sidebar-link > svg {
  flex: 0 0 auto;
}

.sidebar-link-trailing {
  margin-left: auto;
  color: #8a929d;
}

.sidebar-navigation .sidebar-link-disabled {
  color: #8a929d;
  cursor: not-allowed;
  opacity: 0.72;
}

.sidebar-divider {
  height: 1px;
  margin: 13px 8px 10px;
  background: var(--outline);
}

.sidebar-section-label {
  padding: 0 10px 6px;
  color: #8a929d;
  font-size: 10px;
  font-weight: 750;
}

.sidebar-collapsed .library-sidebar {
  width: 72px;
  flex-basis: 72px;
  padding-right: 10px;
  padding-left: 10px;
}

.sidebar-collapsed .sidebar-title {
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}

.sidebar-collapsed .sidebar-title-icon,
.sidebar-collapsed .sidebar-title-copy,
.sidebar-collapsed .sidebar-link-label,
.sidebar-collapsed .sidebar-link-trailing,
.sidebar-collapsed .sidebar-section-label {
  display: none;
}

.sidebar-collapsed .sidebar-collapse-button {
  margin-left: 0;
}

.sidebar-collapsed .sidebar-navigation .sidebar-link {
  justify-content: center;
  gap: 0;
  padding-right: 0;
  padding-left: 0;
}

.sidebar-collapsed .sidebar-divider {
  margin-right: 6px;
  margin-left: 6px;
}

.library-main {
  min-width: 0;
  flex: 1 1 auto;
  padding: 30px 24px 56px;
}

.library-frame {
  width: min(1240px, 100%);
  margin: 0 auto;
}

.library-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 22px;
}

.context-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
  color: var(--primary-strong);
  font-size: 13px;
  font-weight: 700;
}

.heading-copy h1 {
  margin: 0;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
  font-size: 32px;
  line-height: 1.2;
  font-weight: 760;
  letter-spacing: 0;
}

.heading-copy p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.summary-ribbon {
  display: grid;
  grid-template-columns: repeat(3, minmax(112px, 1fr));
  min-width: 420px;
  overflow: hidden;
  border: 1px solid var(--outline);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 2px 7px rgba(31, 42, 55, 0.07);
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  padding: 12px 16px;
  color: var(--primary-strong);
}

.summary-item + .summary-item {
  border-left: 1px solid var(--outline);
}

.summary-item > span {
  display: flex;
  flex-direction: column;
}

.summary-item strong {
  color: var(--ink);
  font-family: 'Manrope Variable', sans-serif;
  font-size: 18px;
  line-height: 1.15;
}

.summary-item small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
}

.filter-panel {
  position: relative;
  z-index: 2;
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid var(--outline);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 2px 7px rgba(31, 42, 55, 0.06);
}

.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 12px;
  border: 1px solid var(--outline);
  border-radius: 8px;
  background: var(--surface-low);
  color: var(--muted);
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.search-field:focus-within {
  border-color: var(--primary);
  background: var(--surface);
  box-shadow: 0 0 0 3px rgba(31, 94, 255, 0.14);
}

.search-field input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.search-field input::placeholder {
  color: #8a929d;
}

.search-field input::-webkit-search-cancel-button {
  display: none;
}

.icon-button {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
}

.icon-button:hover {
  background: var(--surface-high);
  color: var(--ink);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 13px;
}

.filter-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
}

.difficulty-control {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--surface-high);
  scrollbar-width: none;
}

.difficulty-control::-webkit-scrollbar {
  display: none;
}

.difficulty-button {
  position: relative;
  min-width: 52px;
  height: 36px;
  padding: 0 12px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #56606d;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  transition: color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.difficulty-button::after {
  position: absolute;
  inset: 50%;
  border-radius: 50%;
  background: currentColor;
  opacity: 0;
  content: '';
  transform: scale(0);
  transition: inset 240ms ease, transform 240ms ease, opacity 360ms ease;
}

.difficulty-button:active::after {
  inset: -20%;
  opacity: 0.1;
  transform: scale(1);
  transition: 0s;
}

.difficulty-button:hover {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.62);
}

.difficulty-button.active {
  color: var(--primary-strong);
  background: var(--surface);
  box-shadow: 0 1px 4px rgba(31, 42, 55, 0.12);
}

.tag-select {
  min-width: 154px;
}

.source-select {
  min-width: 132px;
  margin-left: auto;
}

.reset-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.reset-button {
  border: 1px solid var(--outline);
  background: var(--surface);
  color: var(--muted);
}

.reset-button:hover {
  border-color: #bcc4ce;
  background: var(--surface-low);
  color: var(--ink);
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 268px;
  gap: 18px;
  align-items: start;
}

.list-surface,
.insight-panel {
  border: 1px solid var(--outline);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 2px 7px rgba(31, 42, 55, 0.06);
}

.list-surface {
  min-width: 0;
  overflow: hidden;
  scroll-margin-top: 72px;
}

.list-header {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--outline);
}

.list-kicker {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.list-header h2 {
  margin: 2px 0 0;
  font-size: 17px;
  line-height: 1.3;
  font-weight: 750;
}

.active-filters {
  display: flex;
  max-width: 52%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.filter-chip,
.tag-chip {
  display: inline-flex;
  align-items: center;
  max-width: 144px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-chip {
  min-height: 26px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--primary-container);
  color: var(--primary-strong);
  font-size: 11px;
  font-weight: 650;
}

.desktop-table-wrap {
  overflow-x: auto;
}

.problem-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.problem-table th {
  height: 42px;
  padding: 0 14px;
  border-bottom: 1px solid var(--outline);
  background: #f8f9fb;
  color: #6d7682;
  font-size: 11px;
  font-weight: 750;
  text-align: left;
}

.problem-table th:first-child {
  width: 32%;
  padding-left: 18px;
}

.problem-table th:nth-child(2) {
  width: 86px;
}

.problem-table th:nth-child(3) {
  width: 25%;
}

.problem-table th:nth-child(4) {
  width: 142px;
}

.problem-table th:nth-child(5) {
  width: 70px;
  text-align: right;
}

.problem-table td {
  height: 62px;
  padding: 9px 14px;
  border-bottom: 1px solid #e8ebef;
  color: var(--ink);
  font-size: 13px;
  vertical-align: middle;
}

.problem-table td:first-child {
  padding-left: 18px;
}

.problem-row {
  cursor: pointer;
  animation: row-enter 210ms ease both;
  transition: background 140ms ease, box-shadow 140ms ease;
}

.problem-row:nth-child(even) {
  background: #fbfcfd;
}

.problem-row:hover {
  background: #eef3ff;
  box-shadow: inset 3px 0 0 var(--primary);
}

.problem-row:last-child td {
  border-bottom: 0;
}

.problem-title-cell {
  min-width: 0;
}

.problem-title-link {
  display: block;
  overflow: hidden;
  color: var(--ink);
  font-size: 14px;
  font-weight: 690;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.problem-title-link:hover {
  color: var(--primary-strong);
}

.problem-source {
  display: block;
  margin-top: 4px;
  color: #89919c;
  font-size: 10px;
}

.difficulty-badge {
  display: inline-flex;
  min-width: 48px;
  min-height: 25px;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
}

.difficulty-badge.beginner {
  border-color: #b9dec8;
  background: #e8f5ed;
  color: #17613e;
}

.difficulty-badge.popular {
  border-color: #b8cdfd;
  background: #e6edff;
  color: #234fa8;
}

.difficulty-badge.improve {
  border-color: #f1cf9d;
  background: #fff1dc;
  color: #9a570b;
}

.difficulty-badge.provincial {
  border-color: #edb9b4;
  background: #ffebe9;
  color: #a3312a;
}

.difficulty-badge.noi,
.difficulty-badge.unrated {
  border-color: #c9c2dc;
  background: #f0edf7;
  color: #5d526f;
}

.tag-list,
.mobile-tag-list {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.tag-chip {
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid #dfe3e8;
  border-radius: 999px;
  background: #f5f6f8;
  color: #5f6874;
  font-size: 10px;
  font-weight: 600;
}

.tag-more {
  color: var(--primary-strong);
}

.constraint-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #5e6773;
  font-family: 'Manrope Variable', sans-serif;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.constraint-list span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.constraint-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.time-dot {
  background: var(--secondary);
}

.memory-dot {
  background: var(--accent);
}

.submission-count {
  color: #59626f;
  font-family: 'Manrope Variable', sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.action-column {
  width: 42px;
  color: #8a929c;
  text-align: center;
}

.problem-row:hover .action-column {
  color: var(--primary);
}

.mobile-problem-list {
  display: none;
}

.pagination {
  display: flex;
  min-height: 66px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  border-top: 1px solid var(--outline);
}

.page-button {
  display: inline-grid;
  min-width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #56606d;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
}

.page-button:hover:not(:disabled) {
  border-color: var(--outline);
  background: var(--surface-low);
  color: var(--ink);
}

.page-button.current {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
}

.page-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.icon-page-button {
  border-color: var(--outline);
  background: var(--surface);
}

.page-ellipsis {
  min-width: 24px;
  color: var(--muted);
  text-align: center;
}

.mobile-page-status {
  display: none;
  min-width: 62px;
  color: var(--muted);
  font-family: 'Manrope Variable', sans-serif;
  font-size: 12px;
  text-align: center;
}

.insights-column {
  display: grid;
  gap: 14px;
}

.metadata-state {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
}

.metadata-state > svg {
  color: var(--accent);
}

.insight-panel {
  padding: 16px;
}

.insight-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.insight-icon {
  display: inline-grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 8px;
  background: var(--primary-container);
  color: var(--primary-strong);
}

.insight-icon.accent {
  background: #fff0dc;
  color: #a85b08;
}

.insight-heading > div {
  display: flex;
  flex-direction: column;
}

.insight-heading span:not(.insight-icon) {
  font-size: 14px;
  font-weight: 750;
}

.insight-heading small {
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
}

.difficulty-bars {
  display: grid;
  gap: 10px;
}

.distribution-row {
  display: grid;
  grid-template-columns: 44px 1fr 24px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 11px;
  text-align: left;
}

.distribution-row:hover .distribution-label {
  color: var(--primary-strong);
}

.distribution-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-high);
}

.distribution-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
}

.distribution-fill.beginner {
  background: var(--success);
}

.distribution-fill.improve {
  background: var(--accent);
}

.distribution-fill.provincial {
  background: var(--danger);
}

.distribution-fill.noi {
  background: #65558f;
}

.distribution-row strong {
  font-family: 'Manrope Variable', sans-serif;
  text-align: right;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.tag-cloud button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid var(--outline);
  border-radius: 999px;
  background: var(--surface-low);
  color: #59626f;
  font: inherit;
  font-size: 10px;
}

.tag-cloud button:hover,
.tag-cloud button.selected {
  border-color: #a9bfff;
  background: var(--primary-container);
  color: var(--primary-strong);
}

.tag-cloud strong {
  font-family: 'Manrope Variable', sans-serif;
  font-size: 9px;
}

.skeleton-list {
  padding: 4px 18px 12px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 1fr 78px 150px;
  align-items: center;
  gap: 18px;
  height: 60px;
  border-bottom: 1px solid #edf0f3;
}

.skeleton-block {
  display: block;
  height: 13px;
  border-radius: 5px;
  background: #e7eaf0;
  animation: skeleton-pulse 1.1s ease-in-out infinite alternate;
}

.skeleton-title {
  width: min(330px, 82%);
}

.skeleton-pill {
  width: 56px;
}

.skeleton-meta {
  width: 120px;
}

.state-panel {
  display: flex;
  min-height: 370px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 42px 20px;
  color: var(--muted);
  text-align: center;
}

.state-panel h2 {
  margin: 13px 0 5px;
  color: var(--ink);
  font-size: 17px;
}

.state-panel p {
  margin: 0 0 18px;
  font-size: 13px;
}

.primary-button {
  border: 0;
  background: var(--primary);
  color: #fff;
  box-shadow: 0 2px 6px rgba(31, 94, 255, 0.24);
}

.primary-button:hover {
  background: var(--primary-strong);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

button:focus-visible,
select:focus-visible,
a:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

#result-heading:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}

@keyframes row-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes skeleton-pulse {
  from { opacity: 0.48; }
  to { opacity: 1; }
}

@media (max-width: 1080px) {
  .content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .insights-column {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .problem-table th:first-child {
    width: 38%;
  }

  .tags-column {
    display: none;
  }
}

@media (max-width: 900px) {
  .library-shell {
    display: block;
  }

  .library-sidebar {
    position: static;
    width: 100%;
    height: auto;
    flex-basis: auto;
    padding: 10px 16px;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--outline);
    background: var(--surface);
    scrollbar-width: none;
  }

  .library-sidebar::-webkit-scrollbar {
    display: none;
  }

  .sidebar-title,
  .sidebar-section-label {
    display: none;
  }

  .sidebar-navigation {
    display: flex;
    width: max-content;
    align-items: center;
    gap: 6px;
  }

  .sidebar-navigation .sidebar-link {
    width: auto;
    min-width: max-content;
    height: 40px;
    padding: 0 12px;
  }

  .sidebar-collapsed .library-sidebar {
    width: 100%;
    flex-basis: auto;
    padding: 10px 16px;
  }

  .sidebar-collapsed .sidebar-navigation .sidebar-link {
    justify-content: flex-start;
    gap: 10px;
    padding: 0 12px;
  }

  .sidebar-collapsed .sidebar-link-label,
  .sidebar-collapsed .sidebar-link-trailing {
    display: inline-flex;
  }

  .sidebar-navigation .sidebar-link.router-link-exact-active::before {
    top: auto;
    right: 10px;
    bottom: -1px;
    left: 10px;
    width: auto;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }

  .sidebar-divider {
    width: 1px;
    height: 26px;
    margin: 0 2px;
    flex: 0 0 1px;
  }

  .library-main {
    padding: 24px 20px 48px;
  }

  .library-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .summary-ribbon {
    width: 100%;
    min-width: 0;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .insights-column {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

}

@media (max-width: 720px) {
  .library-main {
    padding: 22px 16px 42px;
  }

  .heading-copy h1 {
    font-size: 28px;
  }

  .summary-item {
    min-height: 60px;
    padding: 10px;
  }

  .summary-item svg {
    display: none;
  }

  .filter-row {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .filter-label {
    width: 100%;
  }

  .difficulty-control {
    width: 100%;
  }

  .difficulty-button {
    flex: 1 0 52px;
    height: 44px;
  }

  .tag-select {
    flex: 1;
    margin-left: 0;
  }

  .clear-search {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
  }

  .reset-button,
  .page-button {
    min-height: 44px;
  }

  .page-button {
    min-width: 44px;
    height: 44px;
  }

  .list-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .active-filters {
    max-width: 100%;
    justify-content: flex-start;
  }

  .desktop-table-wrap {
    display: none;
  }

  .list-surface {
    overflow: visible;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .list-header {
    margin-bottom: 10px;
    border: 1px solid var(--outline);
    border-radius: 8px;
    background: var(--surface);
  }

  .mobile-problem-list {
    display: grid;
    gap: 9px;
  }

  .mobile-problem-item {
    display: block;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--outline);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 4px rgba(31, 42, 55, 0.06);
    animation: row-enter 210ms ease both;
  }

  .mobile-problem-item:active {
    background: #eef3ff;
  }

  .mobile-problem-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .mobile-problem-title {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.45;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .mobile-tag-list {
    margin-top: 11px;
  }

  .mobile-problem-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 11px;
    color: var(--muted);
    font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
    font-size: 10px;
  }

  .pagination {
    margin-top: 10px;
    border: 1px solid var(--outline);
    border-radius: 8px;
    background: var(--surface);
  }

  .insights-column {
    grid-template-columns: 1fr;
  }

  .distribution-row,
  .tag-cloud button {
    min-height: 40px;
  }

}

@media (max-width: 430px) {
  .summary-ribbon {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-item {
    justify-content: center;
    padding: 8px 5px;
    text-align: center;
  }

  .summary-item strong {
    font-size: 16px;
  }

  .summary-item small {
    font-size: 9px;
  }

  .reset-button {
    min-width: 76px;
  }

  .difficulty-button {
    flex: 0 0 auto;
  }

  .pagination .page-button:not(.icon-page-button),
  .pagination .page-ellipsis {
    display: none;
  }

  .mobile-page-status {
    display: inline-block;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
