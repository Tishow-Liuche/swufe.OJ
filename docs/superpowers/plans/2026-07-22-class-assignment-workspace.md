# Class Assignment Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let teachers switch directly between their classes and build an assignment from a filterable, paginated problem bank with an explicit cross-page problem set.

**Architecture:** Keep the existing ClassManage.vue route and teacher assignment API. Add a small, independently tested selection helper for cross-page selection, then make ClassManage.vue fetch metadata and filtered published problems from existing problem-bank APIs. Replace the nested class menu with a persistent class list and render the assignment builder as a responsive table-plus-problem-set layout.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vite, Vitest, Axios, Lucide Vue, existing NestJS APIs.

---

## File Structure

- Create: packages/frontend/src/views/teacher/assignment-selection.ts - immutable operations for one problem, a current result page, and selected problem IDs.
- Create: packages/frontend/src/views/teacher/assignment-selection.spec.ts - Vitest coverage for additions, removals, current-page selection, and cross-page retention.
- Modify: packages/frontend/src/views/teacher/ClassManage.vue - direct class list, filter/query state, problem-bank table, problem set, and responsive styles.
- Modify: packages/backend/src/problem/problem.service.ts and problem.service.spec.ts - map source metadata platform values such as ATCODER to sourceInfo.platform while retaining legacy source filters.

### Task 1: Cross-page Assignment Selection Helper

**Files:**
- Create: packages/frontend/src/views/teacher/assignment-selection.ts
- Test: packages/frontend/src/views/teacher/assignment-selection.spec.ts

- [ ] **Step 1: Write the failing selection tests**

~~~ts
import { describe, expect, it } from 'vitest';
import { isCurrentPageSelected, setCurrentPageSelected, toggleProblem } from './assignment-selection';

type Problem = { id: string; title: string };
const a = { id: 'a', title: 'A' };
const b = { id: 'b', title: 'B' };
const c = { id: 'c', title: 'C' };

describe('assignment selection', () => {
  it('adds and removes one problem without duplicating it', () => {
    expect(toggleProblem<Problem>([], a)).toEqual([a]);
    expect(toggleProblem([a], a)).toEqual([]);
  });

  it('selects and clears only the current page while retaining other pages', () => {
    expect(setCurrentPageSelected([c], [a, b], true)).toEqual([c, a, b]);
    expect(setCurrentPageSelected([c, a, b], [a, b], false)).toEqual([c]);
  });

  it('recognizes complete current-page selection without counting other pages', () => {
    expect(isCurrentPageSelected([c, a, b], [a, b])).toBe(true);
    expect(isCurrentPageSelected([c, a], [a, b])).toBe(false);
    expect(isCurrentPageSelected([c], [])).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: Set-Location packages/frontend; npm test -- --run src/views/teacher/assignment-selection.spec.ts

Expected: FAIL because assignment-selection does not exist.

- [ ] **Step 3: Implement immutable selection operations**

~~~ts
export interface IdentifiableProblem {
  id: string;
}

export function toggleProblem<T extends IdentifiableProblem>(selected: readonly T[], problem: T): T[] {
  return selected.some((item) => item.id === problem.id)
    ? selected.filter((item) => item.id !== problem.id)
    : [...selected, problem];
}

export function setCurrentPageSelected<T extends IdentifiableProblem>(
  selected: readonly T[],
  currentPage: readonly T[],
  shouldSelect: boolean,
): T[] {
  const pageIds = new Set(currentPage.map((item) => item.id));
  if (!shouldSelect) return selected.filter((item) => !pageIds.has(item.id));
  const selectedIds = new Set(selected.map((item) => item.id));
  return [...selected, ...currentPage.filter((item) => !selectedIds.has(item.id))];
}

export function isCurrentPageSelected<T extends IdentifiableProblem>(
  selected: readonly T[], currentPage: readonly T[],
): boolean {
  const selectedIds = new Set(selected.map((item) => item.id));
  return currentPage.length > 0 && currentPage.every((item) => selectedIds.has(item.id));
}
~~~

- [ ] **Step 4: Run the focused test and frontend build**

Run: Set-Location packages/frontend; npm test -- --run src/views/teacher/assignment-selection.spec.ts; npm run build

Expected: the Vitest file passes and vue-tsc -b && vite build completes successfully.

- [ ] **Step 5: Commit the helper**

~~~bash
git add packages/frontend/src/views/teacher/assignment-selection.ts packages/frontend/src/views/teacher/assignment-selection.spec.ts
git commit -m "test: cover assignment problem selection"
~~~

### Task 2: Query the Existing Problem Bank from Class Management

**Files:**
- Modify: packages/frontend/src/views/teacher/ClassManage.vue:1-330
- Test: packages/frontend/src/views/teacher/assignment-selection.spec.ts

- [ ] **Step 1: Extend the local problem and metadata contracts**

Add the fields returned by GET /api/problems and GET /api/problems/metadata next to the existing ProblemItem interface.

~~~ts
interface ProblemItem {
  id: string;
  title: string;
  source?: string;
  difficulty?: string | null;
  sourceInfo?: { platform?: string; remoteProblemId?: string } | null;
  tags: Array<{ name: string }>;
}

interface ProblemResponse {
  items: ProblemItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface ProblemMetadata {
  tags: Array<{ name: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}
~~~

- [ ] **Step 2: Confirm the old keyword-only request before replacing it**

Run: Set-Location packages/frontend; npm test -- --run src/views/teacher/assignment-selection.spec.ts

Expected: the selection test passes before the API query is extended.

- [ ] **Step 3: Add filter, paging, and metadata state plus request functions**

Import FilterSelect from ../../components/FilterSelect.vue, pointDifficultyOptions and pointDifficultyShortLabel from ../../utils/pointDifficulty, and the three helpers from ./assignment-selection. Replace searchProblems with this state-driven request flow.

~~~ts
const problemPage = ref(1);
const problemPageSize = 10;
const problemTotal = ref(0);
const problemSource = ref('');
const problemDifficulty = ref('');
const problemTag = ref('');
const problemMetadata = ref<ProblemMetadata | null>(null);
const problemMetadataLoading = ref(false);

const problemTotalPages = computed(() => Math.max(1, Math.ceil(problemTotal.value / problemPageSize)));
const problemTagOptions = computed(() => [
  { value: '', label: '全部标签' },
  ...(problemMetadata.value?.tags || []).map((item) => ({ value: item.name, label: item.name + ' (' + item.count + ')' })),
]);
const problemSourceOptions = computed(() => [
  { value: '', label: '全部来源' },
  ...(problemMetadata.value?.sources || []).map((item) => ({ value: item.source, label: item.source === 'LOCAL' ? '原创' : item.source })),
]);

async function loadProblemMetadata() {
  problemMetadataLoading.value = true;
  try {
    const { data } = await api.get<ProblemMetadata>('/api/problems/metadata');
    problemMetadata.value = data;
  } catch (e: any) {
    showMessage('加载题库筛选项失败：' + (e.response?.data?.message || e.message));
  } finally {
    problemMetadataLoading.value = false;
  }
}

async function searchProblems(page = problemPage.value) {
  problemSearching.value = true;
  try {
    const params: Record<string, string | number> = { page, pageSize: problemPageSize, status: 'PUBLISHED' };
    if (problemKeyword.value.trim()) params.keyword = problemKeyword.value.trim();
    if (problemSource.value) params.source = problemSource.value;
    if (problemDifficulty.value) params.difficulty = problemDifficulty.value;
    if (problemTag.value) params.tag = problemTag.value;
    const { data } = await api.get<ProblemResponse>('/api/problems', { params });
    problemResults.value = data.items || [];
    problemTotal.value = data.total || 0;
    problemPage.value = Math.min(data.page || page, Math.max(1, Math.ceil(problemTotal.value / problemPageSize)));
  } catch (e: any) {
    showMessage('加载题目失败：' + (e.response?.data?.message || e.message));
  } finally {
    problemSearching.value = false;
  }
}

function resetProblemPage() {
  problemPage.value = 1;
  void searchProblems(1);
}
~~~

- [ ] **Step 4: Wire the filters to one deterministic page reset**

Use @keyup.enter="resetProblemPage" on the keyword input. Use @update:model-value="resetProblemPage" on source and tag FilterSelect instances. Use buttons for difficulty values, set problemDifficulty, then call resetProblemPage. Use previous/next page buttons that call searchProblems(nextPage) only when nextPage is within 1 and problemTotalPages.

- [ ] **Step 5: Verify existing API contract compatibility**

Run: Set-Location packages/frontend; npm run build; npm test -- --run src/views/teacher/assignment-selection.spec.ts; Set-Location ../backend; npm test -- --runInBand

Expected: frontend build, focused selection coverage, and the backend regression suite pass with source-platform filtering compatibility.

- [ ] **Step 6: Commit the problem-bank integration**

~~~bash
git add packages/frontend/src/views/teacher/ClassManage.vue
git commit -m "feat: load filterable assignment problem bank"
~~~

### Task 3: Replace the Class Dropdown with a Direct Class List

**Files:**
- Modify: packages/frontend/src/views/teacher/ClassManage.vue:1-130
- Modify: packages/frontend/src/views/teacher/ClassManage.vue:350-377
- Modify: packages/frontend/src/views/teacher/ClassManage.vue stylesheet class-switcher rules and responsive breakpoints

- [ ] **Step 1: Remove obsolete dropdown-only state and handlers**

Delete classMenuOpen, classSwitcher, closeClassMenuOnOutside, selectClassFromMenu, and the document pointer listener. Keep selectedClassId and loadClassData as the only source of class selection.

- [ ] **Step 2: Add the direct class list handler**

~~~ts
async function selectClass(id: string) {
  if (id === selectedClassId.value) return;
  selectedClassId.value = id;
  await loadClassData();
}
~~~

- [ ] **Step 3: Render each available class in the sidebar**

Replace the trigger and popover with this accessible list.

~~~vue
<section class="class-list-section" aria-label="当前班级">
  <span class="class-switcher-label">当前班级</span>
  <div v-if="classes.length" class="class-list" role="list">
    <button
      v-for="item in classes"
      :key="item.id"
      type="button"
      role="listitem"
      class="class-list-item"
      :class="{ selected: selectedClassId === item.id }"
      :title="sidebarCollapsed ? item.name : undefined"
      @click="selectClass(item.id)"
    >
      <i>{{ item.name.slice(0, 1) }}</i>
      <span><strong>{{ item.name }}</strong><small>{{ item.memberCount || 0 }} 名学生</small></span>
      <Check v-if="selectedClassId === item.id" :size="15" aria-label="当前班级" />
    </button>
  </div>
  <p v-else class="class-list-empty">暂无可选班级</p>
</section>
~~~

- [ ] **Step 4: Add responsive sidebar behavior**

Style .class-list as a vertically scrollable region below navigation on desktop. In .sidebar-collapsed, show only the class initial with an accessible title. At the existing mobile sidebar breakpoint, use display: flex, width: max-content, and overflow-x: auto while restoring names so the list scrolls horizontally instead of expanding page width.

- [ ] **Step 5: Build and verify class switching manually**

Run: Set-Location packages/frontend; npm run build

Expected: build succeeds. In a running frontend, click two class list items and confirm member/assignment data refreshes while the active panel remains unchanged.

- [ ] **Step 6: Commit the class switcher**

~~~bash
git add packages/frontend/src/views/teacher/ClassManage.vue
git commit -m "feat: list classes directly in teacher sidebar"
~~~

### Task 4: Render the Assignment Builder as a Problem-bank Table and Problem Set

**Files:**
- Modify: packages/frontend/src/views/teacher/ClassManage.vue:461-464
- Modify: packages/frontend/src/views/teacher/ClassManage.vue assignment-builder styles
- Test: packages/frontend/src/views/teacher/assignment-selection.spec.ts

- [ ] **Step 1: Use selection helpers for persistent problem-set state**

~~~ts
const selectedProblemIds = computed(() => new Set(selectedProblems.value.map((item) => item.id)));
const currentPageFullySelected = computed(() => isCurrentPageSelected(selectedProblems.value, problemResults.value));

function toggleAssignmentProblem(problem: ProblemItem) {
  selectedProblems.value = toggleProblem(selectedProblems.value, problem);
}
function toggleCurrentProblemPage() {
  selectedProblems.value = setCurrentPageSelected(
    selectedProblems.value, problemResults.value, !currentPageFullySelected.value,
  );
}
function removeProblem(problemId: string) {
  selectedProblems.value = selectedProblems.value.filter((item) => item.id !== problemId);
}
function clearSelectedProblems() {
  selectedProblems.value = [];
}
~~~

- [ ] **Step 2: Render filters, selectable rows, and the problem set**

Use a two-column .assignment-workspace containing .problem-bank and .assignment-problem-set. The bank includes the keyword field, FilterSelect source/tag controls, difficulty buttons, a table with a header checkbox bound to currentPageFullySelected, per-row checkboxes bound to selectedProblemIds.has(problem.id), and previous/next page buttons. The set includes count, each selected title with source/difficulty/tags, an icon-only remove button, and a clear command.

~~~vue
<input type="checkbox" :checked="currentPageFullySelected" :aria-label="currentPageFullySelected ? '取消选择当前页' : '选择当前页'" @change="toggleCurrentProblemPage">
<input type="checkbox" :checked="selectedProblemIds.has(problem.id)" :aria-label="'选择题目 ' + problem.title" @change="toggleAssignmentProblem(problem)">
<button type="button" class="table-action" title="移除题目" :aria-label="'移除题目 ' + problem.title" @click="removeProblem(problem.id)"><X :size="15" /></button>
~~~

- [ ] **Step 3: Keep publication semantics unchanged**

Leave createAssignment() posting selectedClassId, title, description, optional ISO deadline, and selectedProblems.value.map((item) => item.id). After publish, clear the problem set and reload assignments; do not clear filters or alter problem data.

- [ ] **Step 4: Add responsive compact layout styles**

At desktop width, use grid-template-columns: minmax(0, 1fr) 272px, make the problem-set column sticky within the builder, and constrain long titles with min-width: 0 plus wrapping. Below 980px, use one column and place the problem set after the table. Below 680px, replace the dense table body with selectable stacked problem rows while retaining the current-page selector and pagination.

- [ ] **Step 5: Run selection tests and production build**

Run: Set-Location packages/frontend; npm test -- --run src/views/teacher/assignment-selection.spec.ts; npm run build

Expected: selection behavior remains covered and the Vue template type-checks.

- [ ] **Step 6: Commit the workspace UI**

~~~bash
git add packages/frontend/src/views/teacher/ClassManage.vue packages/frontend/src/views/teacher/assignment-selection.ts packages/frontend/src/views/teacher/assignment-selection.spec.ts
git commit -m "feat: build assignment problem-set workspace"
~~~

### Task 5: End-to-end Verification and Delivery

**Files:**
- Modify: docs/superpowers/plans/2026-07-22-class-assignment-workspace.md - check completed plan steps during execution.

- [ ] **Step 1: Run all automated checks**

Run: Set-Location packages/frontend; npm run build; Set-Location ../backend; npm test -- --runInBand

Expected: frontend production build succeeds; backend reports all existing test suites passing.

- [ ] **Step 2: Run the teacher UI locally**

Run: Set-Location packages/frontend; npm run dev -- --host 127.0.0.1 --port 5174

Expected: Vite prints http://127.0.0.1:5174/; use an unused port if 5174 is occupied.

- [ ] **Step 3: Perform manual regression checks**

Verify: direct class selection changes the loaded class; all four filters compose; a single row, full current page, and a later page can be selected; page changes retain selections; individual removal and clear work; the standard publish request succeeds; the desktop set is beside the table; narrow layouts show horizontal classes and the set below the bank.

- [ ] **Step 4: Commit tracked plan checkboxes and push only the feature branch**

~~~bash
git add docs/superpowers/plans/2026-07-22-class-assignment-workspace.md
git commit -m "docs: record assignment workspace verification"
git push origin 42411109
~~~

Do not merge or push any commit to main.

## Execution Record

- Completed: direct desktop/mobile class list, filterable paginated assignment problem bank, persistent cross-page problem set, mobile current-page batch selection, and assignment publication through the existing API.
- Completed: source metadata platform filtering now supports ATCODER and future platform values without regressing LOCAL, REMOTE, or EXTERNAL source filters.
- Verified: frontend Vitest 5 suites / 11 tests, frontend production build, backend Jest 31 suites / 201 tests, live API pagination/metadata response shape, and an independent code-review follow-up.
