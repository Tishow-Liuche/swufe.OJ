<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  DoorOpen,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../api/client';

interface Membership {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  appliedAt: string;
  reviewedAt?: string | null;
  class: { id: string; name: string; status: string; course?: { name: string } | null };
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
const joinCode = ref('');
const loading = ref(true);
const assignmentLoading = ref(true);
const submitting = ref(false);
const message = ref('');
const error = ref('');

const approvedCount = computed(() => memberships.value.filter((item) => item.status === 'APPROVED').length);
const pendingCount = computed(() => memberships.value.filter((item) => item.status === 'PENDING').length);
const activeAssignments = computed(() => assignments.value.filter((item) => item.lifecycle === 'ACTIVE').length);
const unfinishedAssignments = computed(() => assignments.value.filter((item) => !item.progress.completed).length);

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

async function applyToClass() {
  const code = joinCode.value.trim().toUpperCase();
  message.value = '';
  error.value = '';
  if (!code) {
    error.value = '请输入老师提供的班级码';
    return;
  }
  submitting.value = true;
  try {
    const { data } = await api.post('/api/user/classes/join', { joinCode: code });
    joinCode.value = '';
    message.value = `已向“${data.className}”提交申请，请等待老师审核。`;
    await loadAll();
  } catch (e: any) {
    error.value = e.response?.data?.message || '提交入班申请失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="classes-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow"><ShieldCheck :size="16" />班级身份</span>
        <h1>我的班级</h1>
        <p>加入班级后，可以在这里查看老师发布的作业，并直接进入题目完成提交。</p>
      </div>
      <div class="summary-strip">
        <div><strong>{{ approvedCount }}</strong><span>已加入</span></div>
        <div><strong>{{ pendingCount }}</strong><span>待审核</span></div>
        <div><strong>{{ activeAssignments }}</strong><span>进行中</span></div>
        <div><strong>{{ unfinishedAssignments }}</strong><span>待完成作业</span></div>
      </div>
    </header>

    <section class="join-panel">
      <div class="join-copy">
        <span class="join-icon"><DoorOpen :size="24" /></span>
        <div>
          <h2>申请加入班级</h2>
          <p>班级码为 8 位字母和数字，不区分大小写。审核通过后即可查看班级作业。</p>
        </div>
      </div>
      <form class="join-form" @submit.prevent="applyToClass">
        <input
          v-model="joinCode"
          maxlength="8"
          autocomplete="off"
          aria-label="班级码"
          placeholder="输入 8 位班级码"
          @input="joinCode = joinCode.toUpperCase().replace(/[^A-Z2-9]/g, '')"
        />
        <button type="submit" :disabled="submitting || joinCode.length !== 8">提交申请</button>
      </form>
      <p v-if="message" class="feedback success">{{ message }}</p>
      <p v-if="error" class="feedback error">{{ error }}</p>
    </section>

    <section class="assignment-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow small"><BookOpenCheck :size="15" />CLASS ASSIGNMENTS</span>
          <h2>班级作业</h2>
          <p>老师发布后会自动出现在这里；完成方式就是进入题目正常提交，通过后进度会自动刷新。</p>
        </div>
        <button class="refresh-button" :disabled="assignmentLoading" title="刷新作业" @click="loadAssignments">
          <RefreshCw :size="17" />刷新
        </button>
      </div>

      <div v-if="assignmentLoading" class="empty-state">正在加载作业...</div>
      <div v-else-if="assignments.length" class="assignment-list">
        <article v-for="assignment in assignments" :key="assignment.id" class="assignment-card">
          <header>
            <div>
              <p>{{ assignment.class.name }} · {{ assignment.teacher?.nickname || assignment.teacher?.username || '任课老师' }}</p>
              <h3>{{ assignment.title }}</h3>
            </div>
            <span class="assignment-state" :class="assignmentStateClass(assignment)">
              {{ assignmentStateText(assignment) }}
            </span>
          </header>
          <p v-if="assignment.description" class="assignment-desc">{{ assignment.description }}</p>
          <div class="assignment-meta">
            <span>开始：{{ formatDate(assignment.startTime) }}</span>
            <span>截止：{{ formatDate(assignment.endTime) }}</span>
            <span>进度：{{ assignment.progress.solved }}/{{ assignment.progress.total }}</span>
          </div>
          <div class="progress-track">
            <i :style="{ width: `${assignment.progress.total ? Math.round((assignment.progress.solved / assignment.progress.total) * 100) : 0}%` }"></i>
          </div>
          <div class="problem-list">
            <router-link
              v-for="problem in assignment.problems"
              :key="problem.id"
              class="problem-row"
              :to="`/problems/${problem.id}`"
            >
              <span class="problem-title">{{ problem.order }}. {{ problem.title }}</span>
              <span class="problem-actions">
                <i class="problem-status" :class="problemStatusClass(problem.status)">
                  {{ problemStatusText(problem.status) }}
                </i>
                <small v-if="problem.attempts">{{ problem.attempts }} 次</small>
                <strong>{{ problem.status === 'ACCEPTED' ? '查看' : '去完成' }} <ExternalLink :size="13" /></strong>
              </span>
            </router-link>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        当前还没有可查看的作业。若老师已经发布，请确认你已通过班级审核，或点击刷新。
      </div>
    </section>

    <section class="membership-section">
      <div class="section-heading">
        <div>
          <h2>班级记录</h2>
          <p>审核状态变化后可刷新查看。</p>
        </div>
        <button class="refresh-button" :disabled="loading" title="刷新班级状态" @click="loadClasses">
          <RefreshCw :size="17" />刷新
        </button>
      </div>

      <div v-if="loading" class="empty-state">正在加载班级信息...</div>
      <div v-else-if="memberships.length" class="membership-list">
        <article v-for="membership in memberships" :key="membership.id" class="membership-row">
          <div class="class-mark">{{ membership.class.name.slice(0, 1) }}</div>
          <div class="class-copy">
            <div class="class-title">
              <h3>{{ membership.class.name }}</h3>
              <span class="status" :class="membership.status.toLowerCase()">
                <component :is="statusMeta(membership.status).icon" :size="15" />
                {{ statusMeta(membership.status).label }}
              </span>
            </div>
            <p>{{ membership.class.course?.name || '未关联课程' }} · 任课老师 {{ membership.teacher?.nickname || membership.teacher?.username || '未知' }}</p>
            <span>申请时间 {{ formatDate(membership.appliedAt) }}</span>
            <router-link v-if="membership.status === 'APPROVED'" class="assignment-link" :to="`/classes/${membership.class.id}/assignments`"><FileText :size="14" />班级作业</router-link>
            <p v-if="membership.status === 'PENDING'" class="state-note pending-note">
              申请已送达，老师审核前不会进入正式名单，也暂时看不到班级作业。
            </p>
            <p v-if="membership.status === 'REJECTED'" class="state-note rejected-note">
              {{ membership.reviewNote || '老师未通过本次申请，可确认班级码后重新申请。' }}
            </p>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">还没有班级记录，输入班级码发起第一次申请。</div>
    </section>
  </div>
</template>

<style scoped>
.classes-page {
  --class-navy: #173b66;
  --class-blue: #2469ad;
  --class-line: #dfe7ef;
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 28px 0 48px;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}
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
.join-panel, .assignment-section, .membership-section {
  margin-top: 18px;
  padding: 22px;
  border: 1px solid var(--class-line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 7px 20px rgba(23, 59, 102, .04);
}
.join-copy {
  display: flex;
  align-items: center;
  gap: 12px;
}
.join-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 8px;
  background: var(--class-blue);
  color: #fff;
}
.join-copy h2, .section-heading h2 { font-size: 17px; }
.join-copy p { margin: 4px 0 0; color: #6f7d8e; font-size: 13px; }
.join-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 18px;
}
.join-form input {
  min-width: 0;
  height: 46px;
  padding: 0 14px;
  border: 1px solid #bfcde0;
  border-radius: 7px;
  background: #fff;
  color: #18365f;
  font-family: Consolas, monospace;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 3px;
  text-transform: uppercase;
}
.join-form input:focus {
  border-color: #2f72ca;
  outline: 3px solid rgba(47, 114, 202, .13);
}
.join-form button, .refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 7px;
  font-weight: 800;
  cursor: pointer;
}
.join-form button {
  min-width: 116px;
  border: 0;
  background: var(--class-blue);
  color: #fff;
}
.join-form button:disabled, .refresh-button:disabled { opacity: .5; cursor: default; }
.feedback {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-radius: 6px;
  font-size: 13px;
}
.feedback.success { background: #eaf7ef; color: #176b42; }
.feedback.error { background: #fff0ef; color: #a33c35; }
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
.state-note {
  margin-top: 9px !important;
  padding: 8px 10px;
  border-radius: 6px;
}
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
  .join-form { grid-template-columns: 1fr; }
  .join-form button { min-height: 44px; }
  .assignment-card header, .problem-row, .class-title {
    align-items: flex-start;
    flex-direction: column;
  }
  .membership-list { grid-template-columns: 1fr; }
  .problem-actions { width: 100%; justify-content: space-between; }
}
</style>
