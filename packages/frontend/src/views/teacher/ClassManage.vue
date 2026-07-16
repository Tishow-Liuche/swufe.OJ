<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Check, Clipboard, Clock3, RefreshCw, X } from '@lucide/vue';
import api from '../../api/client';

interface ClassInfo {
  id: string; name: string; memberCount?: number; createdAt: string; status: string;
  joinCode?: string | null; joinCodeExpiresAt?: string | null;
}
interface ClassMember {
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote?: string | null; joinedAt: string;
  user: { id: string; username: string; nickname?: string };
}
interface ProblemItem {
  id: string; title: string; source?: string; difficulty?: string;
  sourceInfo?: { platform?: string; remoteProblemId?: string };
}
interface AssignmentItem {
  id: string; title: string; description?: string; startTime: string; endTime: string;
  problems?: Array<{ problem: ProblemItem }>;
  _count?: { students: number; problems: number };
}
interface AssignmentReport {
  assignment: { id: string; title: string; startTime: string; endTime: string };
  problems: ProblemItem[];
  students: Array<{
    user: { id: string; username: string; nickname?: string };
    solvedCount: number; totalProblems: number; completed: boolean;
    problems: Array<{
      problemId: string; title: string; status: string; attempts: number;
      bestSubmissionId?: string | null; score: number;
      timeUsed?: number | null; memoryUsed?: number | null; submittedAt?: string | null;
    }>;
  }>;
  summary: { studentCount: number; problemCount: number; completedStudents: number };
}

const classes = ref<ClassInfo[]>([]);
const selectedClassId = ref('');
const members = ref<ClassMember[]>([]);
const assignments = ref<AssignmentItem[]>([]);
const selectedAssignmentId = ref('');
const report = ref<AssignmentReport | null>(null);
const problemResults = ref<ProblemItem[]>([]);
const selectedProblems = ref<ProblemItem[]>([]);

const loading = ref(true);
const membersLoading = ref(false);
const assignmentsLoading = ref(false);
const reportLoading = ref(false);
const problemSearching = ref(false);
const msg = ref('');
const newClassName = ref('');
const importText = ref('');
const assignmentTitle = ref('');
const assignmentDescription = ref('');
const assignmentEndTime = ref('');
const problemKeyword = ref('');
const joinCodeExpiresAt = ref('');
const joinCodeSaving = ref(false);
const reviewingUserId = ref('');

const selectedClass = computed(() => classes.value.find((item) => item.id === selectedClassId.value));
const pendingMembers = computed(() => members.value.filter((member) => member.status === 'PENDING'));
const approvedMembers = computed(() => members.value.filter((member) => member.status === 'APPROVED'));

onMounted(loadClasses);

function showMessage(text: string) { msg.value = text; }
function defaultJoinCodeExpiry() {
  const date = new Date(Date.now() + 7 * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}
function parseIdentifiers(text: string) {
  return text.split(/[\n,，\s]+/).map((item) => item.trim()).filter(Boolean);
}
function statusLabel(status: string) {
  const map: Record<string, string> = {
    ACCEPTED: '已通过',
    WRONG_ANSWER: '答案错误',
    TIME_LIMIT_EXCEEDED: '超时',
    MEMORY_LIMIT_EXCEEDED: '超内存',
    COMPILE_ERROR: '编译错误',
    RUNTIME_ERROR: '运行错误',
    QUEUING: '排队中',
    JUDGING: '评测中',
    PENDING: '等待中',
    NOT_SUBMITTED: '未提交',
  };
  return map[status] || status;
}
function statusClass(status: string) {
  if (status === 'ACCEPTED') return 'ok';
  if (status === 'NOT_SUBMITTED') return 'muted';
  if (['QUEUING', 'JUDGING', 'PENDING'].includes(status)) return 'pending';
  return 'bad';
}
function formatImportMessage(data: {
  added: number; skipped: number; notFound?: string[]; alreadyInClass?: string[]; duplicatedInput?: string[];
}) {
  const parts = [`导入完成：成功 ${data.added} 人，跳过 ${data.skipped} 人`];
  if (data.notFound?.length) parts.push(`未找到：${data.notFound.join('、')}`);
  if (data.alreadyInClass?.length) parts.push(`已在班级：${data.alreadyInClass.join('、')}`);
  if (data.duplicatedInput?.length) parts.push(`重复输入：${data.duplicatedInput.join('、')}`);
  return parts.join('；');
}

async function loadClasses() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/teacher/classes');
    classes.value = data;
    if (!selectedClassId.value && classes.value.length) {
      selectedClassId.value = classes.value[0].id;
      await loadClassData();
    }
  } catch (e: any) {
    showMessage('加载班级失败：' + (e.response?.data?.message || e.message));
  } finally {
    loading.value = false;
  }
}
async function loadClassData() {
  report.value = null;
  selectedAssignmentId.value = '';
  joinCodeExpiresAt.value = selectedClass.value?.joinCodeExpiresAt
    ? (() => {
        const date = new Date(selectedClass.value!.joinCodeExpiresAt!);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().slice(0, 16);
      })()
    : defaultJoinCodeExpiry();
  await Promise.all([loadMembers(), loadAssignments()]);
}
async function createClass() {
  const name = newClassName.value.trim();
  if (!name) return showMessage('请输入班级名称');
  try {
    const { data } = await api.post('/api/teacher/classes', { name });
    newClassName.value = '';
    selectedClassId.value = data.id;
    showMessage('班级已创建');
    await loadClasses();
  } catch (e: any) {
    showMessage('创建失败：' + (e.response?.data?.message || e.message));
  }
}
async function importStudents() {
  if (!selectedClassId.value) return showMessage('请先选择班级');
  const usernames = parseIdentifiers(importText.value);
  if (!usernames.length) return showMessage('请输入学生用户名或邮箱');
  try {
    const { data } = await api.post(`/api/teacher/classes/${selectedClassId.value}/import`, { usernames });
    importText.value = '';
    showMessage(formatImportMessage(data));
    await loadClasses();
    await loadMembers();
  } catch (e: any) {
    showMessage('导入失败：' + (e.response?.data?.message || e.message));
  }
}
async function loadMembers() {
  if (!selectedClassId.value) return;
  membersLoading.value = true;
  try {
    const { data } = await api.get(`/api/teacher/classes/${selectedClassId.value}/members`);
    members.value = data;
  } catch (e: any) {
    showMessage('加载学生名单失败：' + (e.response?.data?.message || e.message));
  } finally {
    membersLoading.value = false;
  }
}
async function removeStudent(userId: string, username: string) {
  if (!selectedClassId.value) return;
  if (!window.confirm(`确定将 ${username} 移出 ${selectedClass.value?.name || '该班级'} 吗？`)) return;
  try {
    await api.delete(`/api/teacher/classes/${selectedClassId.value}/members/${userId}`);
    showMessage('已移出学生');
    await loadClasses();
    await loadMembers();
  } catch (e: any) {
    showMessage('移出失败：' + (e.response?.data?.message || e.message));
  }
}
async function saveJoinCode() {
  if (!selectedClassId.value) return showMessage('请先选择班级');
  if (!joinCodeExpiresAt.value) return showMessage('请设置班级码有效期');
  joinCodeSaving.value = true;
  try {
    await api.put(`/api/teacher/classes/${selectedClassId.value}/join-code`, {
      expiresAt: new Date(joinCodeExpiresAt.value).toISOString(),
    });
    showMessage('班级码已生成，旧班级码已失效');
    await loadClasses();
  } catch (e: any) {
    showMessage('设置班级码失败：' + (e.response?.data?.message || e.message));
  } finally {
    joinCodeSaving.value = false;
  }
}
async function disableJoinCode() {
  if (!selectedClassId.value || !selectedClass.value?.joinCode) return;
  try {
    await api.delete(`/api/teacher/classes/${selectedClassId.value}/join-code`);
    showMessage('班级码已停用');
    await loadClasses();
  } catch (e: any) {
    showMessage('停用班级码失败：' + (e.response?.data?.message || e.message));
  }
}
async function copyJoinCode() {
  if (!selectedClass.value?.joinCode) return;
  await navigator.clipboard.writeText(selectedClass.value.joinCode);
  showMessage('班级码已复制');
}
async function reviewMember(member: ClassMember, status: 'APPROVED' | 'REJECTED') {
  reviewingUserId.value = member.user.id;
  try {
    await api.patch(`/api/teacher/classes/${selectedClassId.value}/members/${member.user.id}/review`, { status });
    showMessage(status === 'APPROVED' ? '已通过入班申请' : '已拒绝入班申请');
    await Promise.all([loadClasses(), loadMembers(), loadAssignments()]);
  } catch (e: any) {
    showMessage('审核失败：' + (e.response?.data?.message || e.message));
  } finally {
    reviewingUserId.value = '';
  }
}
async function searchProblems() {
  problemSearching.value = true;
  try {
    const { data } = await api.get('/api/problems', {
      params: { keyword: problemKeyword.value.trim(), pageSize: 20, status: 'PUBLISHED' },
    });
    problemResults.value = data.items || [];
  } catch (e: any) {
    showMessage('搜索题目失败：' + (e.response?.data?.message || e.message));
  } finally {
    problemSearching.value = false;
  }
}
function addProblem(problem: ProblemItem) {
  if (!selectedProblems.value.some((item) => item.id === problem.id)) selectedProblems.value.push(problem);
}
function removeProblem(problemId: string) {
  selectedProblems.value = selectedProblems.value.filter((item) => item.id !== problemId);
}
async function createAssignment() {
  if (!selectedClassId.value) return showMessage('请先选择班级');
  if (!assignmentTitle.value.trim()) return showMessage('请输入作业标题');
  if (!selectedProblems.value.length) return showMessage('请至少选择一道题目');
  try {
    await api.post('/api/teacher/assignments', {
      classId: selectedClassId.value,
      title: assignmentTitle.value.trim(),
      description: assignmentDescription.value.trim(),
      endTime: assignmentEndTime.value ? new Date(assignmentEndTime.value).toISOString() : undefined,
      problemIds: selectedProblems.value.map((item) => item.id),
    });
    assignmentTitle.value = '';
    assignmentDescription.value = '';
    assignmentEndTime.value = '';
    selectedProblems.value = [];
    showMessage('作业已发布');
    await loadAssignments();
  } catch (e: any) {
    showMessage('发布作业失败：' + (e.response?.data?.message || e.message));
  }
}
async function loadAssignments() {
  if (!selectedClassId.value) return;
  assignmentsLoading.value = true;
  try {
    const { data } = await api.get(`/api/teacher/classes/${selectedClassId.value}/assignments`);
    assignments.value = data;
  } catch (e: any) {
    showMessage('加载作业失败：' + (e.response?.data?.message || e.message));
  } finally {
    assignmentsLoading.value = false;
  }
}
async function loadReport(assignmentId = selectedAssignmentId.value) {
  if (!assignmentId) return;
  selectedAssignmentId.value = assignmentId;
  reportLoading.value = true;
  try {
    const { data } = await api.get(`/api/teacher/assignments/${assignmentId}/report`);
    report.value = data;
  } catch (e: any) {
    showMessage('加载作业情况失败：' + (e.response?.data?.message || e.message));
  } finally {
    reportLoading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <h2>班级管理</h2>
    <p class="hint">导入学生、查看班级、发布作业、查看作业情况已经拆成独立区域。</p>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <div class="card">
      <h3>班级选择</h3>
      <div class="row">
        <select v-model="selectedClassId" class="input" @change="loadClassData">
          <option value="">选择班级</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}（{{ c.memberCount ?? 0 }} 人）</option>
        </select>
        <input v-model="newClassName" class="input" placeholder="新班级名称，例如：2024 级计算机 1 班" @keyup.enter="createClass" />
        <button class="btn" @click="createClass">创建班级</button>
      </div>
      <p v-if="loading" class="empty small">正在加载班级...</p>
    </div>

    <section v-if="selectedClass" class="card join-code-card">
      <div class="section-heading">
        <div>
          <h3>班级码</h3>
          <p class="hint small">学生凭码提交入班申请，通过后才会进入正式名单和作业统计。</p>
        </div>
        <span class="class-state" :class="selectedClass.status.toLowerCase()">
          {{ selectedClass.status === 'APPROVED' ? '班级已启用' : selectedClass.status === 'PENDING' ? '等待管理员审核' : '班级未启用' }}
        </span>
      </div>
      <div class="join-code-layout">
        <div class="code-display" :class="{ inactive: !selectedClass.joinCode }">
          <span class="code-label">当前班级码</span>
          <strong>{{ selectedClass.joinCode || '尚未生成' }}</strong>
          <span class="code-expiry"><Clock3 :size="15" /> {{ selectedClass.joinCode ? `有效至 ${formatDate(selectedClass.joinCodeExpiresAt)}` : '设置有效期后生成' }}</span>
        </div>
        <div class="code-controls">
          <label>有效期
            <input v-model="joinCodeExpiresAt" class="input" type="datetime-local" :disabled="selectedClass.status !== 'APPROVED'" />
          </label>
          <div class="code-actions">
            <button class="btn btn-blue icon-btn" :disabled="joinCodeSaving || selectedClass.status !== 'APPROVED'" @click="saveJoinCode">
              <RefreshCw :size="16" /> {{ selectedClass.joinCode ? '重新生成' : '生成班级码' }}
            </button>
            <button v-if="selectedClass.joinCode" class="btn-sm icon-btn" @click="copyJoinCode"><Clipboard :size="16" />复制</button>
            <button v-if="selectedClass.joinCode" class="btn-sm danger icon-btn" @click="disableJoinCode"><X :size="16" />停用</button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="selectedClass" class="card applications-card">
      <div class="section-heading">
        <div><h3>入班申请</h3><p class="hint small">待审核 {{ pendingMembers.length }} 人，审核通过后自动加入当前班级已有作业。</p></div>
        <button class="btn-sm" :disabled="membersLoading" @click="loadMembers">刷新</button>
      </div>
      <div v-if="pendingMembers.length" class="application-list">
        <article v-for="member in pendingMembers" :key="member.user.id" class="application-row">
          <div class="student-avatar">{{ (member.user.nickname || member.user.username).slice(0, 1).toUpperCase() }}</div>
          <div class="application-copy">
            <strong>{{ member.user.nickname || member.user.username }}</strong>
            <span>@{{ member.user.username }} · 申请于 {{ formatDate(member.joinedAt) }}</span>
          </div>
          <div class="review-actions">
            <button class="approve-action" :disabled="reviewingUserId === member.user.id" title="通过申请" @click="reviewMember(member, 'APPROVED')"><Check :size="18" />通过</button>
            <button class="reject-action" :disabled="reviewingUserId === member.user.id" title="拒绝申请" @click="reviewMember(member, 'REJECTED')"><X :size="18" />拒绝</button>
          </div>
        </article>
      </div>
      <p v-else class="empty small">暂无待审核的入班申请。</p>
    </section>

    <div class="grid">
      <section class="card">
        <h3>导入学生</h3>
        <p class="hint small">只负责导入。支持用户名或邮箱，换行、空格、逗号分隔。</p>
        <textarea v-model="importText" rows="5" class="textarea" placeholder="例如：student001&#10;student002@school.edu"></textarea>
        <button class="btn btn-blue" :disabled="!selectedClassId" @click="importStudents">导入到当前班级</button>
      </section>

      <section class="card">
        <h3>查看班级学生</h3>
        <button class="btn-sm" :disabled="!selectedClassId || membersLoading" @click="loadMembers">刷新学生名单</button>
        <p v-if="membersLoading" class="empty small">正在加载学生...</p>
        <table v-else-if="approvedMembers.length" class="table compact">
          <thead><tr><th>用户名</th><th>昵称</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="m in approvedMembers" :key="m.user.id">
              <td>{{ m.user.username }}</td>
              <td>{{ m.user.nickname || '-' }}</td>
              <td><button class="btn-sm danger" @click="removeStudent(m.user.id, m.user.username)">移出</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty small">当前班级暂无学生。</p>
      </section>
    </div>

    <section class="card">
      <h3>发布作业：从题库拉题</h3>
      <div class="form-grid">
        <input v-model="assignmentTitle" class="input" placeholder="作业标题，例如：第一周基础练习" />
        <input v-model="assignmentEndTime" class="input" type="datetime-local" />
      </div>
      <textarea v-model="assignmentDescription" rows="2" class="textarea" placeholder="作业说明，可选"></textarea>
      <div class="row">
        <input v-model="problemKeyword" class="input" placeholder="搜索题库标题，例如 A+B、P1001、Codeforces" @keyup.enter="searchProblems" />
        <button class="btn-sm" :disabled="problemSearching" @click="searchProblems">搜索题目</button>
      </div>
      <div v-if="problemResults.length" class="problem-list">
        <button v-for="p in problemResults" :key="p.id" class="problem-pill" @click="addProblem(p)">
          <span>{{ p.title }}</span><small>{{ p.sourceInfo?.platform || p.source || 'LOCAL' }}</small>
        </button>
      </div>
      <div class="selected-box">
        <strong>已选题目（{{ selectedProblems.length }}）</strong>
        <p v-if="!selectedProblems.length" class="empty small">还没有选择题目。</p>
        <span v-for="p in selectedProblems" :key="p.id" class="selected-pill">
          {{ p.title }} <button @click="removeProblem(p.id)">×</button>
        </span>
      </div>
      <button class="btn btn-blue" :disabled="!selectedClassId || !selectedProblems.length" @click="createAssignment">发布作业</button>
    </section>

    <section class="card">
      <h3>查看学生作业情况</h3>
      <div class="row">
        <select v-model="selectedAssignmentId" class="input">
          <option value="">选择作业</option>
          <option v-for="a in assignments" :key="a.id" :value="a.id">
            {{ a.title }}（{{ a._count?.problems || a.problems?.length || 0 }} 题 / {{ a._count?.students || 0 }} 人）
          </option>
        </select>
        <button class="btn-sm" :disabled="!selectedAssignmentId || reportLoading" @click="loadReport()">查看情况</button>
        <button class="btn-sm" :disabled="!selectedClassId || assignmentsLoading" @click="loadAssignments">刷新作业</button>
      </div>
      <p v-if="assignmentsLoading || reportLoading" class="empty small">正在加载...</p>
      <div v-if="report" class="report">
        <p class="summary">{{ report.assignment.title }}：{{ report.summary.completedStudents }}/{{ report.summary.studentCount }} 人完成，共 {{ report.summary.problemCount }} 题</p>
        <table class="table report-table">
          <thead>
            <tr><th>学生</th><th>完成</th><th v-for="p in report.problems" :key="p.id">{{ p.title }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in report.students" :key="s.user.id">
              <td>{{ s.user.nickname || s.user.username }}</td>
              <td>{{ s.solvedCount }}/{{ s.totalProblems }}</td>
              <td v-for="p in s.problems" :key="p.problemId">
                <span class="status" :class="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
                <small v-if="p.attempts">{{ p.attempts }} 次</small>
                <small v-if="p.timeUsed !== null && p.timeUsed !== undefined">{{ p.timeUsed }}ms</small>
                <small v-if="p.memoryUsed !== null && p.memoryUsed !== undefined">{{ p.memoryUsed }}KB</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty small">请选择一个作业查看学生完成情况。</p>
    </section>
  </div>
</template>

<style scoped>
.page { max-width: 1180px; margin: 0 auto; padding: 24px; }
h2 { margin-bottom: 8px; }
h3 { margin: 0 0 12px; font-size: 16px; }
.hint { color: #667085; font-size: 14px; margin-bottom: 12px; }
.small { font-size: 13px; }
.msg { padding: 9px 12px; background: #e8f5e9; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }
.card { background: #fff; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.section-heading h3 { margin-bottom: 5px; }
.class-state { padding: 5px 9px; border-radius: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.class-state.approved { background: #e9f7ef; color: #177245; }
.class-state.pending { background: #fff7df; color: #8c6200; }
.class-state.rejected { background: #fff0ef; color: #a63b34; }
.join-code-card { border-left: 4px solid #2d6cdf; }
.join-code-layout { display: grid; grid-template-columns: minmax(250px, .8fr) minmax(320px, 1.2fr); gap: 18px; align-items: stretch; }
.code-display { display: flex; min-height: 118px; flex-direction: column; justify-content: center; padding: 18px; border: 1px solid #cfe0f8; border-radius: 8px; background: #f4f8ff; }
.code-display.inactive { border-style: dashed; background: #fafbfc; }
.code-label { color: #6b7788; font-size: 12px; font-weight: 700; }
.code-display strong { margin: 5px 0 8px; color: #173f77; font-family: Consolas, monospace; font-size: 29px; letter-spacing: 3px; }
.code-display.inactive strong { color: #7f8996; font-family: inherit; font-size: 20px; letter-spacing: 0; }
.code-expiry { display: flex; align-items: center; gap: 6px; color: #67768a; font-size: 12px; }
.code-controls { display: flex; flex-direction: column; justify-content: center; gap: 12px; }
.code-controls label { display: grid; gap: 6px; color: #475467; font-size: 13px; font-weight: 700; }
.code-actions, .review-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.icon-btn, .review-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.applications-card { border-top: 3px solid #e4a72c; }
.application-list { display: grid; gap: 8px; }
.application-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e8edf3; border-radius: 8px; background: #fcfdff; }
.student-avatar { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 50%; background: #e8f1ff; color: #24599e; font-weight: 800; }
.application-copy { display: grid; gap: 3px; min-width: 0; }
.application-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.application-copy span { color: #778395; font-size: 12px; }
.review-actions button { padding: 7px 10px; border-radius: 6px; background: #fff; font-weight: 700; cursor: pointer; }
.approve-action { border: 1px solid #b9ddca; color: #177245; }
.reject-action { border: 1px solid #ecc7c4; color: #a63b34; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.form-grid { display: grid; grid-template-columns: 1fr 260px; gap: 10px; margin-bottom: 10px; }
.input, .textarea { width: 100%; padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.textarea { resize: vertical; font-family: inherit; margin-bottom: 10px; }
.btn, .btn-sm { border: none; border-radius: 6px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn { padding: 9px 20px; background: #4fc3f7; color: #1a1a2e; }
.btn-blue { background: #3498db; color: #fff; }
.btn-sm { padding: 7px 12px; background: #eef6ff; color: #2563eb; }
.danger { color: #c0392b; background: #fff1f0; }
button:disabled { opacity: .5; cursor: default; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 9px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; vertical-align: top; }
.table th { background: #f8f9fa; font-weight: 600; color: #666; }
.compact th, .compact td { padding: 7px 9px; }
.empty { color: #999; text-align: center; padding: 18px; }
.problem-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.problem-pill, .selected-pill { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; border: 1px solid #d8e7ff; background: #f7fbff; padding: 7px 10px; color: #1f4f8f; }
.problem-pill { cursor: pointer; }
.problem-pill small { color: #789; }
.selected-box { min-height: 44px; margin: 12px 0; }
.selected-pill { margin: 6px 6px 0 0; }
.selected-pill button { border: 0; background: transparent; color: #c0392b; cursor: pointer; font-weight: bold; }
.summary { margin: 8px 0 12px; color: #344054; }
.report-table { min-width: 900px; }
.report { overflow-x: auto; }
.status { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: 12px; margin-right: 5px; }
.status.ok { background: #e8f8ef; color: #18864b; }
.status.bad { background: #fff1f0; color: #c0392b; }
.status.pending { background: #fff8e1; color: #a66b00; }
.status.muted { background: #f2f4f7; color: #667085; }
td small { display: block; color: #667085; margin-top: 3px; }
@media (max-width: 900px) {
  .grid, .form-grid, .join-code-layout { grid-template-columns: 1fr; }
  .row { flex-direction: column; align-items: stretch; }
  .application-row { grid-template-columns: 40px minmax(0, 1fr); }
  .review-actions { grid-column: 1 / -1; }
}
</style>
