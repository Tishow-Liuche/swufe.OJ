<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  DoorOpen,
  ExternalLink,
  FileText,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  XCircle,
} from '@lucide/vue';
import { useStorage } from '@vueuse/core';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../api/client';
import { canViewClassAssignments, selectCurrentClass } from './student-class-workspace';

interface Membership {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  appliedAt: string;
  reviewedAt?: string | null;
  class: { id: string; name: string; status: string; course?: { name: string } | null; _count?: { members: number } };
  teacher?: { username: string; nickname?: string | null } | null;
}

interface AssignmentProblem {
  id: string;
  title: string;
  source?: string;
  difficulty?: string;
  order: number;
  score: number;
  status: string;
  attempts: number;
  bestSubmissionId?: string | null;
}

interface Assignment {
  id: string;
  classId: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  lifecycle: 'NOT_STARTED' | 'ACTIVE' | 'ENDED';
  enrollmentStatus: string;
  class: { id: string; name: string; course?: { name: string } | null };
  teacher?: { username: string; nickname?: string | null } | null;
  progress: { total: number; solved: number; completed: boolean };
  problems: AssignmentProblem[];
}

const memberships = ref<Membership[]>([]);
const assignments = ref<Assignment[]>([]);
const loading = ref(true);
const assignmentLoading = ref(true);
const error = ref('');
const sidebarCollapsed = useStorage('swufe-oj:student-class-sidebar-collapsed-v1', true);
const selectedClassId = ref('');
const activeView = ref<'assignments' | 'info'>('assignments');

const approvedCount = computed(() => memberships.value.filter((item) => item.status === 'APPROVED').length);
const pendingCount = computed(() => memberships.value.filter((item) => item.status === 'PENDING').length);
const activeAssignments = computed(() => assignments.value.filter((item) => item.lifecycle === 'ACTIVE').length);
const unfinishedAssignments = computed(() => assignments.value.filter((item) => !item.progress.completed).length);
const selectedMembership = computed(() => memberships.value.find((item) => item.class.id === selectedClassId.value) || null);
const selectedAssignments = computed(() => assignments.value.filter((item) => item.classId === selectedClassId.value));
const canViewSelectedAssignments = computed(() => canViewClassAssignments(selectedMembership.value?.status));

onMounted(loadAll);

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function statusMeta(status: Membership['status']) {
  if (status === 'APPROVED') return { label: '已加入', icon: CheckCircle2 };
  if (status === 'REJECTED') return { label: '未通过', icon: XCircle };
  return { label: '等待审核', icon: Clock3 };
}

function assignmentStateText(item: Assignment) {
  if (item.progress.completed) return '已完成';
  if (item.lifecycle === 'NOT_STARTED') return '未开始';
  if (item.lifecycle === 'ENDED') return '已截止';
  return '进行中';
}

function assignmentStateClass(item: Assignment) {
  if (item.progress.completed) return 'done';
  return item.lifecycle.toLowerCase().replace('_', '-');
}

function problemStatusText(status: string) {
  if (status === 'ACCEPTED') return 'AC';
  if (status === 'NOT_SUBMITTED') return '未提交';
  if (status === 'WRONG_ANSWER') return 'WA';
  if (status === 'TIME_LIMIT_EXCEEDED') return 'TLE';
  if (status === 'MEMORY_LIMIT_EXCEEDED') return 'MLE';
  if (status === 'RUNTIME_ERROR') return 'RE';
  if (status === 'COMPILATION_ERROR') return 'CE';
  return status.replace(/_/g, ' ');
}

function problemStatusClass(status: string) {
  if (status === 'ACCEPTED') return 'accepted';
  if (status === 'NOT_SUBMITTED') return 'empty';
  return 'wrong';
}

async function loadAll() {
  await Promise.all([loadClasses(), loadAssignments()]);
}

async function loadClasses() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/api/user/classes');
    memberships.value = data;
    selectedClassId.value = selectCurrentClass(memberships.value, selectedClassId.value);
    if (activeView.value === 'assignments' && !canViewSelectedAssignments.value) activeView.value = 'info';
  } catch (e: any) {
    error.value = e.response?.data?.message || '班级信息加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadAssignments() {
  assignmentLoading.value = true;
  try {
    const { data } = await api.get('/api/user/assignments');
    assignments.value = data.items || [];
  } catch (e: any) {
    error.value = e.response?.data?.message || '作业加载失败';
  } finally {
    assignmentLoading.value = false;
  }
}

function selectClass(classId: string) {
  selectedClassId.value = classId;
  const membership = memberships.value.find((item) => item.class.id === classId);
  if (!canViewClassAssignments(membership?.status)) activeView.value = 'info';
}

function openAssignments() {
  if (canViewSelectedAssignments.value) activeView.value = 'assignments';
}

</script>

<template>
  <div class="classes-page" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="class-sidebar" aria-label="班级导航">
      <div class="sidebar-title">
        <span class="sidebar-title-icon"><UsersRound :size="19" /></span>
        <span class="sidebar-title-copy"><strong>班级工作台</strong><small>学习与作业</small></span>
        <button class="sidebar-collapse-button" type="button" :title="sidebarCollapsed ? '展开班级侧栏' : '收起班级侧栏'" :aria-label="sidebarCollapsed ? '展开班级侧栏' : '收起班级侧栏'" :aria-expanded="!sidebarCollapsed" @click="sidebarCollapsed = !sidebarCollapsed">
          <PanelLeftOpen v-if="sidebarCollapsed" :size="18" />
          <PanelLeftClose v-else :size="18" />
        </button>
      </div>

      <p class="sidebar-label">选择班级</p>
      <div v-if="loading" class="sidebar-state">正在加载...</div>
      <div v-else-if="memberships.length" class="sidebar-class-list">
        <button
          v-for="membership in memberships"
          :key="membership.id"
          type="button"
          :class="{ selected: selectedClassId === membership.class.id }"
          :aria-pressed="selectedClassId === membership.class.id"
          @click="selectClass(membership.class.id)"
        >
          <span class="class-mark">{{ membership.class.name.slice(0, 1) }}</span>
          <span class="sidebar-class-copy"><strong>{{ membership.class.name }}</strong><small>{{ membership.class.course?.name || '未关联课程' }}</small></span>
          <i class="sidebar-class-status" :class="membership.status.toLowerCase()">{{ statusMeta(membership.status).label }}</i>
        </button>
      </div>
      <p v-else class="sidebar-state">还没有班级</p>

      <div class="sidebar-divider"></div>
      <nav class="sidebar-navigation" aria-label="班级视图">
        <button type="button" :class="{ active: activeView === 'assignments' }" :disabled="!canViewSelectedAssignments" @click="openAssignments">
          <BookOpenCheck :size="18" /><span>班级作业</span><small v-if="canViewSelectedAssignments">{{ selectedAssignments.length }}</small>
        </button>
        <button type="button" :class="{ active: activeView === 'info' }" :disabled="!selectedMembership" @click="activeView = 'info'">
          <Info :size="18" /><span>基本信息</span>
        </button>
        <router-link to="/classes/join"><DoorOpen :size="18" /><span>申请加入班级</span></router-link>
      </nav>
    </aside>

    <main class="class-main">
      <header class="page-heading">
        <div>
          <span class="eyebrow"><ShieldCheck :size="16" />{{ activeView === 'assignments' ? '班级作业' : '班级基本信息' }}</span>
          <h1>{{ selectedMembership?.class.name || '我的班级' }}</h1>
          <p>{{ selectedMembership ? (activeView === 'assignments' ? '查看当前班级老师发布的作业，进入题目后直接提交完成。' : '查看班级课程、任课老师和当前审核状态。') : '输入班级码申请加入班级，审核通过后即可开始完成作业。' }}</p>
        </div>
        <div class="summary-strip">
          <div><strong>{{ approvedCount }}</strong><span>已加入</span></div>
          <div><strong>{{ pendingCount }}</strong><span>待审核</span></div>
          <div><strong>{{ activeAssignments }}</strong><span>进行中</span></div>
          <div><strong>{{ unfinishedAssignments }}</strong><span>待完成作业</span></div>
        </div>
      </header>
      <p v-if="error" class="load-error">{{ error }}</p>

      <section v-if="activeView === 'assignments'" class="assignment-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow small"><BookOpenCheck :size="15" />CLASS ASSIGNMENTS</span>
            <h2>班级作业</h2>
            <p>只展示当前选中班级的作业，完成后进度会自动刷新。</p>
          </div>
          <div class="section-actions">
            <router-link v-if="selectedMembership && canViewSelectedAssignments" class="detail-link" :to="`/classes/${selectedMembership.class.id}/assignments`"><FileText :size="15" />作业详情</router-link>
            <button class="refresh-button" :disabled="assignmentLoading" title="刷新作业" @click="loadAssignments"><RefreshCw :size="17" />刷新</button>
          </div>
        </div>

        <div v-if="assignmentLoading" class="empty-state">正在加载作业...</div>
        <div v-else-if="!selectedMembership" class="empty-state">先选择或申请加入一个班级。</div>
        <div v-else-if="!canViewSelectedAssignments" class="empty-state">该班级仍在审核中，审核通过后即可查看班级作业。</div>
        <div v-else-if="selectedAssignments.length" class="assignment-list">
          <article v-for="assignment in selectedAssignments" :key="assignment.id" class="assignment-card">
            <header>
              <div>
                <p>{{ assignment.class.name }} · {{ assignment.teacher?.nickname || assignment.teacher?.username || '任课老师' }}</p>
                <h3>{{ assignment.title }}</h3>
              </div>
              <span class="assignment-state" :class="assignmentStateClass(assignment)">{{ assignmentStateText(assignment) }}</span>
            </header>
            <p v-if="assignment.description" class="assignment-desc">{{ assignment.description }}</p>
            <div class="assignment-meta">
              <span>开始：{{ formatDate(assignment.startTime) }}</span>
              <span>截止：{{ formatDate(assignment.endTime) }}</span>
              <span>进度：{{ assignment.progress.solved }}/{{ assignment.progress.total }}</span>
            </div>
            <div class="progress-track"><i :style="{ width: `${assignment.progress.total ? Math.round((assignment.progress.solved / assignment.progress.total) * 100) : 0}%` }"></i></div>
            <div class="problem-list">
              <router-link v-for="problem in assignment.problems" :key="problem.id" class="problem-row" :to="`/problems/${problem.id}`">
                <span class="problem-title">{{ problem.order }}. {{ problem.title }}</span>
                <span class="problem-actions"><i class="problem-status" :class="problemStatusClass(problem.status)">{{ problemStatusText(problem.status) }}</i><small v-if="problem.attempts">{{ problem.attempts }} 次</small><strong>{{ problem.status === 'ACCEPTED' ? '查看' : '去完成' }} <ExternalLink :size="13" /></strong></span>
              </router-link>
            </div>
          </article>
        </div>
        <div v-else class="empty-state">当前班级还没有可查看的作业。老师发布后会自动出现在这里。</div>
      </section>

      <section v-else class="class-info-section">
        <div class="section-heading">
          <div><span class="eyebrow small"><Info :size="15" />CLASS PROFILE</span><h2>班级基本信息</h2><p>班级课程和审核状态会随老师更新自动同步。</p></div>
          <button class="refresh-button" :disabled="loading" title="刷新班级信息" @click="loadClasses"><RefreshCw :size="17" />刷新</button>
        </div>
        <div v-if="loading" class="empty-state">正在加载班级信息...</div>
        <article v-else-if="selectedMembership" class="class-info-card">
          <div class="class-info-heading"><span class="class-mark">{{ selectedMembership.class.name.slice(0, 1) }}</span><div><h3>{{ selectedMembership.class.name }}</h3><p>{{ selectedMembership.class.course?.name || '未关联课程' }}</p></div><span class="status" :class="selectedMembership.status.toLowerCase()"><component :is="statusMeta(selectedMembership.status).icon" :size="15" />{{ statusMeta(selectedMembership.status).label }}</span></div>
          <dl class="class-info-grid"><div><dt>任课老师</dt><dd>{{ selectedMembership.teacher?.nickname || selectedMembership.teacher?.username || '未知' }}</dd></div><div><dt>申请时间</dt><dd>{{ formatDate(selectedMembership.appliedAt) }}</dd></div><div><dt>班级人数</dt><dd>{{ selectedMembership.class._count?.members ?? 0 }} 人</dd></div></dl>
          <p v-if="selectedMembership.status === 'PENDING'" class="state-note pending-note">申请已送达，老师审核前不会进入正式名单，也暂时看不到班级作业。</p>
          <p v-if="selectedMembership.status === 'REJECTED'" class="state-note rejected-note">{{ selectedMembership.reviewNote || '老师未通过本次申请，可确认班级码后重新申请。' }}</p>
        </article>
        <div v-else class="empty-state">还没有班级记录，输入班级码发起第一次申请。</div>
      </section>

    </main>
  </div>
</template>

<style scoped>
.classes-page {
  --class-navy: #173b66;
  --class-blue: #2469ad;
  --class-line: #dfe7ef;
  display: flex;
  width: 100%;
  min-height: calc(100vh - 56px);
  margin: 0;
  background: #f3f5f7;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}
.class-sidebar { position: sticky; top: 56px; display: flex; width: 282px; height: calc(100vh - 56px); flex: 0 0 282px; flex-direction: column; padding: 20px 14px; overflow: hidden; border-right: 1px solid var(--class-line); border-radius: 0 18px 18px 0; background: #f8fbfe; box-shadow: 8px 0 22px rgba(23, 59, 102, .035); transition: width .22s ease, flex-basis .22s ease, padding .22s ease; }
.sidebar-title { display: flex; align-items: center; gap: 9px; padding: 0 5px 16px; }.sidebar-title-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 10px; color: #1f5eff; background: #e7efff; }.sidebar-title-copy { display: grid; min-width: 0; gap: 2px; }.sidebar-title-copy strong { color: #293f56; font-size: 13px; }.sidebar-title-copy small { color: #8190a1; font-size: 10px; }
.sidebar-collapse-button { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; margin-left: auto; border: 0; border-radius: 10px; color: #637488; background: transparent; cursor: pointer; }.sidebar-collapse-button:hover { color: #1f5eff; background: #e7efff; }.sidebar-collapse-button:focus-visible { outline: 2px solid #1f5eff; outline-offset: 2px; }.sidebar-label { margin: 3px 7px 8px; color: #8493a5; font-size: 10px; font-weight: 900; }
.sidebar-class-list { display: grid; min-height: 0; gap: 5px; overflow-y: auto; padding: 0 2px 4px; }.sidebar-class-list > button { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; min-height: 54px; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid transparent; border-radius: 11px; color: #314a63; background: transparent; font: inherit; text-align: left; cursor: pointer; }.sidebar-class-list > button:hover { background: #edf5fc; }.sidebar-class-list > button.selected { border-color: #c9dcf0; color: #1f5eff; background: #e7efff; }.sidebar-class-list .class-mark { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; color: #245f94; background: #dcecf9; font-size: 13px; font-weight: 900; }.sidebar-class-list > button.selected .class-mark { color: #fff; background: #1f5eff; }
.sidebar-class-copy { display: grid; min-width: 0; gap: 3px; }.sidebar-class-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }.sidebar-class-copy small { overflow: hidden; color: #8492a2; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }.sidebar-class-status { max-width: 46px; overflow: hidden; color: #7c8997; font-size: 9px; font-style: normal; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }.sidebar-class-status.approved { color: #197149; }.sidebar-class-status.pending { color: #a06f08; }.sidebar-class-status.rejected { color: #a13d36; }.sidebar-state { margin: 0; padding: 12px 7px; color: #8493a5; font-size: 11px; text-align: center; }.sidebar-divider { height: 1px; flex: 0 0 1px; margin: 14px 4px; background: #dce5ee; }
.sidebar-navigation { display: grid; gap: 4px; }.sidebar-navigation button,.sidebar-navigation a { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; min-height: 44px; align-items: center; gap: 9px; padding: 7px 10px; border: 0; border-radius: 10px; color: #607187; background: transparent; font: inherit; font-size: 12px; font-weight: 800; text-align: left; text-decoration: none; cursor: pointer; }.sidebar-navigation button:hover:not(:disabled),.sidebar-navigation a:hover { color: #1f5eff; background: #edf5fc; }.sidebar-navigation button.active { color: #1f5eff; background: #e7efff; }.sidebar-navigation button:disabled { color: #a6b1bd; cursor: not-allowed; }.sidebar-navigation button small { display: grid; min-width: 19px; height: 19px; place-items: center; border-radius: 6px; color: #63819f; background: #edf1f5; font-size: 10px; }.sidebar-navigation button.active small { color: #1f5eff; background: #fff; }
.class-main { min-width: 0; flex: 1; padding: 26px 30px 64px; }.class-main > .page-heading,.class-main > section { width: min(1440px, 100%); margin-right: auto; margin-left: auto; }
.classes-page.sidebar-collapsed .class-sidebar { width: 72px; flex-basis: 72px; padding-right: 10px; padding-left: 10px; }.classes-page.sidebar-collapsed .sidebar-title { justify-content: center; padding-right: 0; padding-left: 0; }.classes-page.sidebar-collapsed .sidebar-title-icon,.classes-page.sidebar-collapsed .sidebar-title-copy,.classes-page.sidebar-collapsed .sidebar-label,.classes-page.sidebar-collapsed .sidebar-class-copy,.classes-page.sidebar-collapsed .sidebar-class-status,.classes-page.sidebar-collapsed .sidebar-state,.classes-page.sidebar-collapsed .sidebar-divider { display: none; }.classes-page.sidebar-collapsed .sidebar-collapse-button { margin-left: 0; }.classes-page.sidebar-collapsed .sidebar-class-list { gap: 6px; overflow-y: auto; }.classes-page.sidebar-collapsed .sidebar-class-list > button { grid-template-columns: 1fr; justify-items: center; min-height: 46px; padding: 6px 0; }.classes-page.sidebar-collapsed .sidebar-navigation button,.classes-page.sidebar-collapsed .sidebar-navigation a { grid-template-columns: 1fr; justify-items: center; padding-right: 0; padding-left: 0; }.classes-page.sidebar-collapsed .sidebar-navigation button span,.classes-page.sidebar-collapsed .sidebar-navigation button small,.classes-page.sidebar-collapsed .sidebar-navigation a span { display: none; }
.page-heading {
  display: flex;
  min-height: 158px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 30px;
  border: 1px solid #dce5ef;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 66, 104, 0.08);
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  color: #3977aa;
  font-size: 13px;
  font-weight: 900;
}
.eyebrow.small {
  margin-bottom: 4px;
  font-size: 11px;
  letter-spacing: .05em;
}
h1, h2, h3 { margin: 0; color: #1f2a37; }
h1 { font-size: 34px; }
.page-heading p, .section-heading p {
  margin: 6px 0 0;
  color: #66778a;
  font-size: 14px;
}
.summary-strip {
  display: grid;
  min-width: 330px;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid #dce5ef;
  border-radius: 8px;
  background: #f8faff;
}
.summary-strip div {
  display: grid;
  gap: 2px;
  padding: 12px 16px;
  text-align: center;
}
.summary-strip div + div { border-left: 1px solid #e4ebf3; }
.summary-strip strong { color: #1f5eff; font-size: 22px; }
.summary-strip span { color: #728092; font-size: 12px; }
.assignment-section, .class-info-section {
  margin-top: 18px;
  padding: 22px;
  border: 1px solid var(--class-line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 7px 20px rgba(23, 59, 102, .04);
}
.section-heading h2 { font-size: 17px; }
.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 7px;
  font-weight: 800;
  cursor: pointer;
}
.refresh-button:disabled { opacity: .5; cursor: default; }
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.refresh-button {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid #d3dde9;
  background: #fff;
  color: #285d8a;
}
.assignment-list { display: grid; gap: 14px; }
.assignment-card {
  padding: 18px;
  border: 1px solid #e1e8f0;
  border-radius: 9px;
  background: linear-gradient(180deg, #fbfdff 0%, #fff 100%);
}
.assignment-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.assignment-card header p {
  margin: 0 0 5px;
  color: #6d7d90;
  font-size: 12px;
  font-weight: 800;
}
.assignment-card h3 { font-size: 18px; }
.assignment-state {
  flex-shrink: 0;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}
.assignment-state.active { color: #1d6c45; background: #e8f7ee; }
.assignment-state.ended { color: #8a6200; background: #fff4d7; }
.assignment-state.not-started { color: #2b6595; background: #e7f1fb; }
.assignment-state.done { color: #fff; background: #1d7a4d; }
.assignment-desc {
  margin: 10px 0 0;
  color: #53677d;
  font-size: 13px;
}
.assignment-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 13px;
}
.assignment-meta span {
  padding: 5px 8px;
  border: 1px solid #dde7f1;
  border-radius: 6px;
  color: #53677d;
  background: #f7fbff;
  font-size: 12px;
}
.progress-track {
  height: 8px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf2f7;
}
.progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2b78d0, #1fa36b);
}
.problem-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.problem-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e6edf4;
  border-radius: 7px;
  color: #24374b;
  background: #fff;
  text-decoration: none;
}
.problem-row:hover {
  border-color: #9cc2e2;
  box-shadow: 0 8px 18px rgba(36, 105, 173, .08);
}
.problem-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 850;
}
.problem-actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
.problem-actions small { color: #7f8da0; font-size: 11px; }
.problem-actions strong {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #2469ad;
  font-size: 12px;
}
.problem-status {
  padding: 3px 7px;
  border-radius: 5px;
  font-style: normal;
  font-size: 11px;
  font-weight: 900;
}
.problem-status.accepted { color: #157347; background: #e8f7ee; }
.problem-status.empty { color: #6c7888; background: #eef2f6; }
.problem-status.wrong { color: #a13d36; background: #fff0ef; }
.membership-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.membership-row {
  display: grid;
  min-height: 176px;
  grid-template-columns: 46px minmax(0, 1fr);
  align-content: start;
  gap: 13px;
  padding: 14px;
  border: 1px solid var(--class-line);
  border-radius: 8px;
  background: #fcfdff;
  transition: transform .18s, border-color .18s, box-shadow .18s;
}
.membership-row:hover {
  border-color: #8eb8da;
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(23, 59, 102, .08);
}
.class-mark {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 7px;
  color: #205f96;
  background: #e3effa;
  font-size: 19px;
  font-weight: 900;
}
.class-copy { min-width: 0; }
.class-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.class-title h3 {
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.class-copy > p { margin: 5px 0 3px; color: #647286; font-size: 13px; }
.class-copy > span { color: #8993a1; font-size: 12px; }
.status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 900;
}
.status.approved { background: #e8f7ee; color: #197047; }
.status.pending { background: #fff6dc; color: #8a6200; }
.status.rejected { background: #fff0ef; color: #a13d36; }
.class-info-card { padding: 20px; border: 1px solid #dfe7ef; border-radius: 14px; background: #fbfdff; }.class-info-heading { display: flex; align-items: center; gap: 12px; }.class-info-heading > .class-mark { display: grid; width: 48px; height: 48px; flex: 0 0 48px; place-items: center; border-radius: 12px; color: #205f96; background: #e3effa; font-size: 19px; font-weight: 900; }.class-info-heading > div { min-width: 0; }.class-info-heading h3 { overflow: hidden; color: #263e56; font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }.class-info-heading p { margin: 4px 0 0; color: #718194; font-size: 12px; }.class-info-heading .status { margin-left: auto; }.class-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 18px 0 0; border: 1px solid #e1e8f0; border-radius: 10px; overflow: hidden; background: #e1e8f0; }.class-info-grid > div { min-width: 0; padding: 13px 15px; background: #fff; }.class-info-grid dt { color: #7d8c9d; font-size: 10px; font-weight: 800; }.class-info-grid dd { margin: 5px 0 0; overflow-wrap: anywhere; color: #334e67; font-size: 13px; font-weight: 800; }
.state-note {
  margin-top: 9px !important;
  padding: 8px 10px;
  border-radius: 6px;
}
.load-error { width: min(1440px, 100%); margin: 14px auto 0; padding: 10px 12px; border: 1px solid #f1c9ca; border-radius: 10px; color: #a33c35; background: #fff0ef; font-size: 13px; }
.section-actions { display: inline-flex; align-items: center; gap: 8px; }.detail-link { display: inline-flex; min-height: 38px; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid #d3dde9; border-radius: 8px; color: #285d8a; background: #fff; font-size: 12px; font-weight: 800; text-decoration: none; }.detail-link:hover { border-color: #9cbfe0; color: #1f5eff; background: #f5f9fe; }
.assignment-link { display: inline-flex; align-items: center; gap: 5px; margin-top: 10px; color: #2469ad; font-size: 12px; font-weight: 800; text-decoration: none; }
.assignment-link:hover { color: #1f5eff; text-decoration: underline; }
.pending-note { background: #fff9e9; color: #775b12 !important; }
.rejected-note { background: #fff2f1; color: #8f403b !important; }
.empty-state {
  padding: 42px 16px;
  color: #8a95a3;
  text-align: center;
}
@media (max-width: 760px) {
  .page-heading { align-items: stretch; flex-direction: column; }
  .summary-strip { width: 100%; min-width: 0; }
  .section-heading { align-items: flex-start; flex-direction: column; }
  .section-actions { width: 100%; }.section-actions > * { flex: 1; }
  .assignment-card header, .problem-row, .class-title {
    align-items: flex-start;
    flex-direction: column;
  }
  .class-info-grid { grid-template-columns: 1fr; }
  .problem-actions { width: 100%; justify-content: space-between; }
}
@media (max-width: 860px) {
  .classes-page { display: block; }
  .class-main { padding: 18px 16px 48px; }
  .class-sidebar,.classes-page.sidebar-collapsed .class-sidebar { position: static; display: grid; width: auto; height: auto; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; padding: 12px; border: 0; border-bottom: 1px solid var(--class-line); border-radius: 0; box-shadow: none; }
  .sidebar-title,.classes-page.sidebar-collapsed .sidebar-title { grid-column: 1 / -1; justify-content: flex-start; padding: 0 5px 4px; }
  .sidebar-title-icon,.sidebar-title-copy,.classes-page.sidebar-collapsed .sidebar-title-icon,.classes-page.sidebar-collapsed .sidebar-title-copy { display: grid; }
  .sidebar-collapse-button { display: none; }
  .sidebar-label,.classes-page.sidebar-collapsed .sidebar-label { display: none; }
  .sidebar-class-list,.classes-page.sidebar-collapsed .sidebar-class-list { display: flex; grid-column: 1 / -1; gap: 7px; overflow-x: auto; overflow-y: hidden; padding: 0 2px 2px; }
  .sidebar-class-list > button,.classes-page.sidebar-collapsed .sidebar-class-list > button { grid-template-columns: 34px minmax(110px, 1fr); justify-items: stretch; min-width: 190px; min-height: 52px; padding: 7px 8px; }
  .sidebar-class-copy,.classes-page.sidebar-collapsed .sidebar-class-copy { display: grid; }
  .sidebar-class-status,.classes-page.sidebar-collapsed .sidebar-class-status { display: none; }
  .sidebar-state,.classes-page.sidebar-collapsed .sidebar-state { display: block; grid-column: 1 / -1; }
  .sidebar-divider,.classes-page.sidebar-collapsed .sidebar-divider { display: none; }
  .sidebar-navigation,.classes-page.sidebar-collapsed .sidebar-navigation { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; grid-column: 1 / -1; }
  .sidebar-navigation button,.sidebar-navigation a,.classes-page.sidebar-collapsed .sidebar-navigation button,.classes-page.sidebar-collapsed .sidebar-navigation a { grid-template-columns: 20px minmax(0, 1fr) auto; justify-items: initial; min-height: 42px; padding: 7px 10px; }
  .sidebar-navigation button span,.sidebar-navigation a span,.classes-page.sidebar-collapsed .sidebar-navigation button span,.classes-page.sidebar-collapsed .sidebar-navigation a span { display: inline; }
  .sidebar-navigation button small,.classes-page.sidebar-collapsed .sidebar-navigation button small { display: grid; }
}
</style>
