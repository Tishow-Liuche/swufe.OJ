<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import api from '../../api/client';

interface ClassInfo { id: string; name: string; memberCount?: number; createdAt: string; }
interface ClassMember { user: { id: string; username: string; nickname?: string } }
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

const selectedClass = computed(() => classes.value.find((item) => item.id === selectedClassId.value));

onMounted(loadClasses);

function showMessage(text: string) { msg.value = text; }
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
        <table v-else-if="members.length" class="table compact">
          <thead><tr><th>用户名</th><th>昵称</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="m in members" :key="m.user.id">
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
  .grid, .form-grid { grid-template-columns: 1fr; }
  .row { flex-direction: column; align-items: stretch; }
}
</style>
