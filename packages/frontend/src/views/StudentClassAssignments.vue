<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowLeft, CalendarClock, CheckCircle2, Circle, FileText, RefreshCw } from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRoute } from 'vue-router';
import api from '../api/client';
import { isLatestAssignmentRequest, selectInitialAssignment } from './student-class-assignment';

interface AssignmentProblem {
  id: string;
  title: string;
  source: string;
  difficulty?: string | null;
  order: number;
  score: number;
}

interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  problems: AssignmentProblem[];
  progress: { solvedCount: number; totalProblems: number; completed: boolean };
}

const route = useRoute();
const classInfo = ref<{ id: string; name: string } | null>(null);
const assignments = ref<Assignment[]>([]);
const selectedAssignmentId = ref('');
const loading = ref(true);
const error = ref('');
let latestAssignmentRequestId = 0;

const selectedAssignment = computed(() => assignments.value.find((assignment) => assignment.id === selectedAssignmentId.value) || null);
const requestedAssignmentId = computed(() => {
  const value = route.query.assignment;
  return typeof value === 'string' ? value : '';
});
const assignmentStatus = computed(() => {
  const assignment = selectedAssignment.value;
  if (!assignment) return '';
  const now = Date.now();
  if (new Date(assignment.startTime).getTime() > now) return '尚未开始';
  if (new Date(assignment.endTime).getTime() < now) return '已截止';
  return '进行中';
});

onMounted(loadAssignments);
watch(() => route.params.classId, () => void loadAssignments());
watch(requestedAssignmentId, (assignmentId) => {
  selectedAssignmentId.value = selectInitialAssignment(assignments.value, assignmentId);
});

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat('zh-CN', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)) : '-';
}

async function loadAssignments() {
  const classId = String(route.params.classId || '');
  if (!classId) return;
  const requestId = ++latestAssignmentRequestId;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<{ class: { id: string; name: string }; assignments: Assignment[] }>(
      `/api/user/classes/${classId}/assignments`,
    );
    if (!isLatestAssignmentRequest(requestId, latestAssignmentRequestId)) return;
    classInfo.value = data.class;
    assignments.value = data.assignments || [];
    selectedAssignmentId.value = selectInitialAssignment(assignments.value, requestedAssignmentId.value);
  } catch (requestError: any) {
    if (!isLatestAssignmentRequest(requestId, latestAssignmentRequestId)) return;
    classInfo.value = null;
    assignments.value = [];
    selectedAssignmentId.value = '';
    error.value = requestError.response?.data?.message || '班级作业加载失败';
  } finally {
    if (isLatestAssignmentRequest(requestId, latestAssignmentRequestId)) loading.value = false;
  }
}
</script>

<template>
  <div class="assignment-page">
    <header class="assignment-header">
      <div>
        <router-link to="/classes" class="back-link"><ArrowLeft :size="16" />我的班级</router-link>
        <p>CLASS ASSIGNMENTS</p>
        <h1>{{ classInfo?.name || '班级作业' }}</h1>
        <span>查看作业要求、完成进度和待练题目。</span>
      </div>
      <button type="button" class="refresh-button" :disabled="loading" title="刷新班级作业" aria-label="刷新班级作业" @click="loadAssignments"><RefreshCw :size="17" /></button>
    </header>

    <div v-if="loading" class="page-state">正在加载班级作业...</div>
    <div v-else-if="error" class="page-state error-state">{{ error }}</div>
    <div v-else-if="!assignments.length" class="page-state empty-state"><FileText :size="28" /><b>暂时没有班级作业</b><span>老师发布作业后会在这里显示。</span></div>

    <section v-else class="assignment-workspace">
      <aside class="assignment-list" aria-label="班级作业列表">
        <header><FileText :size="17" /><strong>班级作业</strong><span>{{ assignments.length }}</span></header>
        <button
          v-for="assignment in assignments"
          :key="assignment.id"
          type="button"
          :class="{ selected: selectedAssignmentId === assignment.id }"
          @click="selectedAssignmentId = assignment.id"
        >
          <span><b>{{ assignment.title }}</b><small>{{ formatDate(assignment.endTime) }} 截止</small></span>
          <i :class="{ done: assignment.progress.completed }">{{ assignment.progress.solvedCount }}/{{ assignment.progress.totalProblems }}</i>
        </button>
      </aside>

      <main v-if="selectedAssignment" class="assignment-detail">
        <header class="detail-heading">
          <div>
            <span class="detail-kicker">{{ assignmentStatus }}</span>
            <h2>{{ selectedAssignment.title }}</h2>
            <p v-if="selectedAssignment.description">{{ selectedAssignment.description }}</p>
            <p v-else>按题目列表进入练习，提交通过后会自动更新完成进度。</p>
          </div>
          <div class="completion-badge" :class="{ complete: selectedAssignment.progress.completed }">
            <CheckCircle2 v-if="selectedAssignment.progress.completed" :size="17" /><Circle v-else :size="17" />
            {{ selectedAssignment.progress.solvedCount }}/{{ selectedAssignment.progress.totalProblems }} 已完成
          </div>
        </header>

        <div class="assignment-timing">
          <CalendarClock :size="19" />
          <div><span>开始时间</span><b>{{ formatDate(selectedAssignment.startTime) }}</b></div>
          <div><span>截止时间</span><b>{{ formatDate(selectedAssignment.endTime) }}</b></div>
        </div>

        <section class="problem-section">
          <header><h3>作业题目</h3><span>{{ selectedAssignment.problems.length }} 题</span></header>
          <ol class="problem-list">
            <li v-for="problem in selectedAssignment.problems" :key="problem.id">
              <span class="problem-order">{{ problem.order }}</span>
              <router-link :to="`/problems/${problem.id}`">
                <b>{{ problem.title }}</b>
                <small>{{ problem.source || 'LOCAL' }}<template v-if="problem.difficulty"> · {{ problem.difficulty }}</template></small>
              </router-link>
              <span class="problem-score">{{ problem.score }} 分</span>
            </li>
          </ol>
        </section>
      </main>
    </section>
  </div>
</template>

<style scoped>
.assignment-page { width: min(1180px, calc(100% - 40px)); min-height: calc(100vh - 56px); margin: 0 auto; padding: 28px 0 52px; color: #24364b; font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif; }
.assignment-header { display: flex; min-height: 150px; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 18px; padding: 24px 30px; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 10px 24px rgba(31, 66, 104, .08); }
.back-link { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 12px; color: #3977aa; font-size: 12px; font-weight: 800; text-decoration: none; }.back-link:hover { color: #1f5eff; }.assignment-header p { margin: 0 0 5px; color: #3977aa; font-size: 11px; font-weight: 850; letter-spacing: 0; }.assignment-header h1 { margin: 0; color: #1f2a37; font-size: 30px; }.assignment-header > div > span { display: block; margin-top: 7px; color: #6d7d90; font-size: 13px; }
.refresh-button { display: inline-grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 1px solid #bfd0e1; border-radius: 6px; background: #f8fbfe; color: #34536f; cursor: pointer; }.refresh-button:hover:not(:disabled) { border-color: #8fb8ef; background: #e7efff; color: #1f5eff; }.refresh-button:disabled { cursor: default; opacity: .55; }
.page-state { display: grid; min-height: 360px; place-items: center; padding: 28px; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; color: #748497; font-size: 14px; text-align: center; }.error-state { border-color: #f1c9ca; background: #fff6f6; color: #b64145; }.empty-state { align-content: center; gap: 8px; }.empty-state svg { color: #6d99c1; }.empty-state b { color: #3a5067; }.empty-state span { color: #7c8c9f; font-size: 13px; }
.assignment-workspace { display: grid; min-height: 550px; grid-template-columns: 276px minmax(0, 1fr); overflow: hidden; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 8px 20px rgba(31, 66, 104, .05); }.assignment-list { display: flex; flex-direction: column; gap: 4px; padding: 10px; border-right: 1px solid #e2e9f1; background: #fbfcfe; }.assignment-list > header { display: flex; height: 42px; align-items: center; gap: 8px; padding: 0 8px 8px; border-bottom: 1px solid #e2e9f1; color: #2b4056; }.assignment-list > header svg { color: #1f5eff; }.assignment-list > header strong { font-size: 14px; }.assignment-list > header span { display: inline-grid; min-width: 19px; height: 19px; place-items: center; margin-left: auto; border-radius: 9px; background: #e7efff; color: #1f5eff; font-size: 10px; font-weight: 850; }
.assignment-list > button { display: grid; min-height: 66px; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #5d7186; font: inherit; text-align: left; cursor: pointer; }.assignment-list > button:hover { background: #f0f6fe; color: #2469ad; }.assignment-list > button.selected { border-color: #c8dbf7; background: #eaf2ff; color: #1f5eff; }.assignment-list > button > span { display: grid; min-width: 0; gap: 3px; }.assignment-list b { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.assignment-list small { color: #8493a4; font-size: 10px; }.assignment-list i { min-width: 30px; color: #63819f; font-size: 10px; font-style: normal; font-weight: 800; }.assignment-list i.done { color: #268359; }
.assignment-detail { min-width: 0; padding: 26px 30px 34px; }.detail-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }.detail-kicker { display: inline-flex; margin-bottom: 8px; color: #3977aa; font-size: 11px; font-weight: 850; }.detail-heading h2 { margin: 0; color: #263b51; font-size: 23px; }.detail-heading p { max-width: 650px; margin: 7px 0 0; color: #6d7d90; font-size: 13px; line-height: 1.65; }.completion-badge { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border: 1px solid #c7d8e8; border-radius: 6px; background: #f7fbff; color: #47708f; font-size: 12px; font-weight: 800; }.completion-badge.complete { border-color: #b7e1ce; background: #edfaf4; color: #197149; }
.assignment-timing { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 12px; margin: 25px 0 22px; padding: 13px 15px; border-top: 1px solid #e3ebf2; border-bottom: 1px solid #e3ebf2; color: #4c7090; }.assignment-timing > div { display: grid; gap: 3px; }.assignment-timing > div + div { padding-left: 18px; border-left: 1px solid #e0e9f2; }.assignment-timing span { color: #8493a3; font-size: 11px; }.assignment-timing b { color: #3a5067; font-size: 12px; }
.problem-section > header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }.problem-section h3 { margin: 0; color: #2b4056; font-size: 16px; }.problem-section > header span { color: #8493a3; font-size: 11px; }.problem-list { margin: 0; padding: 0; list-style: none; border-top: 1px solid #e5ecf3; }.problem-list li { display: grid; min-height: 66px; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px; border-bottom: 1px solid #e5ecf3; }.problem-order { display: inline-grid; width: 24px; height: 24px; place-items: center; border-radius: 6px; background: #edf4fd; color: #3977aa; font-size: 11px; font-weight: 850; }.problem-list a { display: grid; min-width: 0; gap: 3px; color: inherit; text-decoration: none; }.problem-list a:hover b { color: #1f5eff; }.problem-list b { overflow: hidden; color: #344b62; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.problem-list small { color: #8190a1; font-size: 11px; }.problem-score { color: #63809b; font-size: 11px; font-weight: 800; }
@media (max-width: 720px) { .assignment-page { width: min(100% - 28px, 1180px); padding-top: 18px; }.assignment-header { align-items: flex-start; padding: 20px; }.assignment-header h1 { font-size: 26px; }.assignment-workspace { grid-template-columns: 1fr; }.assignment-list { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid #e2e9f1; }.assignment-list > header { display: none; }.assignment-list > button { min-width: 190px; }.assignment-detail { padding: 22px 16px 28px; }.detail-heading { flex-direction: column; gap: 12px; }.completion-badge { align-self: flex-start; }.assignment-timing { grid-template-columns: auto minmax(0, 1fr); }.assignment-timing > div + div { grid-column: 2; padding-left: 0; border-left: 0; }.problem-list li { grid-template-columns: 30px minmax(0, 1fr); }.problem-score { grid-column: 2; padding-bottom: 10px; } }
</style>
