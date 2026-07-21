<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  BarChart3, BookOpenCheck, Check, ChevronDown, ChevronRight, Clipboard, ClipboardList,
  Clock3, Download, FileSpreadsheet, KeyRound, LayoutDashboard, Plus,
  PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Trash2, UploadCloud, UserCheck, UserPlus, UsersRound, X,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../../api/client';

type WorkspacePanel = 'overview' | 'access' | 'members' | 'import' | 'assignment' | 'report';
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
interface ExcelStudentRow {
  studentId: string; name: string; phone: string; email: string;
  valid: boolean; reason?: string;
}

const panels = [
  { id: 'overview' as const, label: '班级概览', detail: '全部班级', icon: LayoutDashboard },
  { id: 'access' as const, label: '班级码与审核', detail: '入班管理', icon: KeyRound },
  { id: 'members' as const, label: '学生名单', detail: '正式成员', icon: UserCheck },
  { id: 'import' as const, label: '导入学生', detail: '批量加入', icon: UserPlus },
  { id: 'assignment' as const, label: '发布作业', detail: '从题库选题', icon: ClipboardList },
  { id: 'report' as const, label: '作业报告', detail: '完成情况', icon: BarChart3 },
];

const classes = ref<ClassInfo[]>([]);
const selectedClassId = ref('');
const activePanel = ref<WorkspacePanel>('overview');
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
const joinCodeSaving = ref(false);
const reviewingUserId = ref('');
const msg = ref('');
const newClassName = ref('');
const importText = ref('');
const assignmentTitle = ref('');
const assignmentDescription = ref('');
const assignmentEndTime = ref('');
const problemKeyword = ref('');
const joinCodeExpiresAt = ref('');
const importMode = ref<'excel' | 'text'>('excel');
const excelRows = ref<ExcelStudentRow[]>([]);
const excelDragging = ref(false);
const excelImporting = ref(false);
const excelInput = ref<HTMLInputElement | null>(null);
const classMenuOpen = ref(false);
const classSwitcher = ref<HTMLElement | null>(null);
const sidebarCollapsed = useStorage('swufe-oj:class-sidebar-collapsed-v1', true);

const selectedClass = computed(() => classes.value.find((item) => item.id === selectedClassId.value));
const pendingMembers = computed(() => members.value.filter((member) => member.status === 'PENDING'));
const approvedMembers = computed(() => members.value.filter((member) => member.status === 'APPROVED'));
const totalMembers = computed(() => classes.value.reduce((sum, item) => sum + (item.memberCount || 0), 0));
const activeCodes = computed(() => classes.value.filter((item) => item.joinCode && item.joinCodeExpiresAt && new Date(item.joinCodeExpiresAt) > new Date()).length);
const invalidExcelRows = computed(() => excelRows.value.filter((row) => !row.valid));

onMounted(() => {
  void loadClasses();
  document.addEventListener('pointerdown', closeClassMenuOnOutside);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeClassMenuOnOutside));

function showMessage(text: string) { msg.value = text; }
function defaultJoinCodeExpiry() {
  const date = new Date(Date.now() + 7 * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString('zh-CN') : '-'; }
function formatShortDate(value?: string | null) { return value ? new Date(value).toLocaleDateString('zh-CN') : '-'; }
function parseIdentifiers(text: string) { return text.split(/[\n,，\s]+/).map((item) => item.trim()).filter(Boolean); }
function classStatus(status: string) {
  return status === 'APPROVED' ? '已启用' : status === 'PENDING' ? '待管理员审核' : '未启用';
}
function closeClassMenuOnOutside(event: PointerEvent) {
  if (!classSwitcher.value?.contains(event.target as Node)) classMenuOpen.value = false;
}
async function selectClassFromMenu(id: string) {
  classMenuOpen.value = false;
  if (id === selectedClassId.value) return;
  selectedClassId.value = id;
  await loadClassData();
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACCEPTED: '已通过', WRONG_ANSWER: '答案错误', TIME_LIMIT_EXCEEDED: '超时',
    MEMORY_LIMIT_EXCEEDED: '超内存', COMPILE_ERROR: '编译错误', RUNTIME_ERROR: '运行错误',
    QUEUING: '排队中', JUDGING: '评测中', PENDING: '等待中', NOT_SUBMITTED: '未提交',
  };
  return labels[status] || status;
}
function statusClass(status: string) {
  if (status === 'ACCEPTED') return 'ok';
  if (status === 'NOT_SUBMITTED') return 'muted';
  if (['QUEUING', 'JUDGING', 'PENDING'].includes(status)) return 'pending';
  return 'bad';
}
function formatImportMessage(data: { added: number; skipped: number; notFound?: string[]; alreadyInClass?: string[]; duplicatedInput?: string[] }) {
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
    if (!selectedClassId.value && classes.value.length) selectedClassId.value = classes.value[0].id;
    if (selectedClassId.value) await loadClassData();
  } catch (e: any) {
    showMessage('加载班级失败：' + (e.response?.data?.message || e.message));
  } finally { loading.value = false; }
}
async function loadClassData() {
  report.value = null;
  selectedAssignmentId.value = '';
  joinCodeExpiresAt.value = selectedClass.value?.joinCodeExpiresAt
    ? (() => { const date = new Date(selectedClass.value!.joinCodeExpiresAt!); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); })()
    : defaultJoinCodeExpiry();
  await Promise.all([loadMembers(), loadAssignments()]);
}
async function chooseClass(id: string, panel: WorkspacePanel = 'access') {
  selectedClassId.value = id;
  await loadClassData();
  activePanel.value = panel;
}
function openPanel(panel: WorkspacePanel) {
  if (panel !== 'overview' && !selectedClassId.value) return showMessage('请先创建或选择一个班级');
  activePanel.value = panel;
}
async function createClass() {
  const name = newClassName.value.trim();
  if (!name) return showMessage('请输入班级名称');
  try {
    const { data } = await api.post('/api/teacher/classes', { name });
    newClassName.value = '';
    selectedClassId.value = data.id;
    showMessage('班级已创建，等待管理员审核');
    await loadClasses();
  } catch (e: any) { showMessage('创建失败：' + (e.response?.data?.message || e.message)); }
}
async function importTextStudents() {
  if (!selectedClassId.value) return showMessage('请先选择班级');
  const usernames = parseIdentifiers(importText.value);
  if (!usernames.length) return showMessage('请输入学生用户名或邮箱');
  try {
    const { data } = await api.post(`/api/teacher/classes/${selectedClassId.value}/import`, { students: usernames });
    importText.value = '';
    showMessage(formatImportMessage(data));
    await Promise.all([loadClasses(), loadMembers()]);
  } catch (e: any) { showMessage('导入失败：' + (e.response?.data?.message || e.message)); }
}
function normalizeCell(value: unknown) { return String(value ?? '').trim(); }
function validateExcelRow(raw: Record<string, unknown>): ExcelStudentRow {
  const studentId = normalizeCell(raw['学号']);
  const name = normalizeCell(raw['姓名']);
  const phone = normalizeCell(raw['手机号']);
  const email = normalizeCell(raw['邮箱']).toLowerCase();
  if (!/^\d{8}$/.test(studentId)) return { studentId, name, phone, email, valid: false, reason: '学号必须为 8 位数字' };
  if (!name || name.length > 40) return { studentId, name, phone, email, valid: false, reason: '姓名不能为空且不能超过 40 个字符' };
  if (!/^1\d{10}$/.test(phone)) return { studentId, name, phone, email, valid: false, reason: '手机号必须为 11 位大陆号码' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { studentId, name, phone, email, valid: false, reason: '邮箱格式不正确' };
  return { studentId, name, phone, email, valid: true };
}
async function readExcelFile(file?: File) {
  if (!file) return;
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0, raw: false })[0] || []).map(normalizeCell);
    const required = ['学号', '姓名', '手机号', '邮箱'];
    if (required.some((header) => !headers.includes(header))) throw new Error('表头必须包含：学号、姓名、手机号、邮箱');
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    if (!data.length) throw new Error('Excel 中没有可导入的学生数据');
    const seen = new Set<string>();
    excelRows.value = data.map(validateExcelRow).map((row) => {
      if (row.valid && seen.has(row.studentId)) return { ...row, valid: false, reason: '文件内学号重复' };
      seen.add(row.studentId);
      return row;
    });
    showMessage(`已读取 ${excelRows.value.length} 行；${invalidExcelRows.value.length ? `${invalidExcelRows.value.length} 行需要修正` : '全部校验通过'}`);
  } catch (e: any) {
    excelRows.value = [];
    showMessage('文件读取失败：' + (e.message || '请使用 .xlsx、.xls 或 .csv 文件'));
  } finally {
    if (excelInput.value) excelInput.value.value = '';
  }
}
function chooseExcelFile() { excelInput.value?.click(); }
function onExcelDrop(event: DragEvent) {
  excelDragging.value = false;
  void readExcelFile(event.dataTransfer?.files?.[0]);
}
async function downloadExcelTemplate() {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['学号', '姓名', '手机号', '邮箱'],
    ['20240001', '示例同学', '13800000000', 'example@swufe.edu.cn'],
  ]);
  sheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 30 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '学生名单');
  XLSX.writeFile(workbook, 'SWUFE_Singularity_OJ_学生导入模板.xlsx');
}
async function importExcelStudents() {
  if (!excelRows.value.length || invalidExcelRows.value.length) return showMessage('请先上传并修正 Excel 中的异常行');
  excelImporting.value = true;
  try {
    const { data } = await api.post(`/api/teacher/classes/${selectedClassId.value}/import`, {
      students: excelRows.value.map(({ studentId, name, phone, email }) => ({ studentId, name, phone, email })),
    });
    const serverErrors = data.errors?.length ? `；服务端跳过 ${data.errors.length} 行` : '';
    showMessage(`导入完成：新增 ${data.added} 人，更新 ${data.updated} 人，跳过 ${data.skipped} 人${serverErrors}。初始密码为学号。`);
    excelRows.value = [];
    await Promise.all([loadClasses(), loadMembers()]);
  } catch (e: any) {
    showMessage('Excel 导入失败：' + (e.response?.data?.message || e.message));
  } finally { excelImporting.value = false; }
}
async function loadMembers() {
  if (!selectedClassId.value) return;
  membersLoading.value = true;
  try { const { data } = await api.get(`/api/teacher/classes/${selectedClassId.value}/members`); members.value = data; }
  catch (e: any) { showMessage('加载学生名单失败：' + (e.response?.data?.message || e.message)); }
  finally { membersLoading.value = false; }
}
async function removeStudent(userId: string, username: string) {
  if (!window.confirm(`确定将 ${username} 移出 ${selectedClass.value?.name || '该班级'} 吗？`)) return;
  try {
    await api.delete(`/api/teacher/classes/${selectedClassId.value}/members/${userId}`);
    showMessage('已移出学生');
    await Promise.all([loadClasses(), loadMembers()]);
  } catch (e: any) { showMessage('移出失败：' + (e.response?.data?.message || e.message)); }
}
async function saveJoinCode() {
  if (!joinCodeExpiresAt.value) return showMessage('请设置班级码有效期');
  joinCodeSaving.value = true;
  try {
    await api.put(`/api/teacher/classes/${selectedClassId.value}/join-code`, { expiresAt: new Date(joinCodeExpiresAt.value).toISOString() });
    showMessage('班级码已生成，旧班级码已失效');
    await loadClasses();
  } catch (e: any) { showMessage('设置班级码失败：' + (e.response?.data?.message || e.message)); }
  finally { joinCodeSaving.value = false; }
}
async function disableJoinCode() {
  if (!selectedClass.value?.joinCode) return;
  try { await api.delete(`/api/teacher/classes/${selectedClassId.value}/join-code`); showMessage('班级码已停用'); await loadClasses(); }
  catch (e: any) { showMessage('停用班级码失败：' + (e.response?.data?.message || e.message)); }
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
  } catch (e: any) { showMessage('审核失败：' + (e.response?.data?.message || e.message)); }
  finally { reviewingUserId.value = ''; }
}
async function searchProblems() {
  problemSearching.value = true;
  try {
    const { data } = await api.get('/api/problems', { params: { keyword: problemKeyword.value.trim(), pageSize: 20, status: 'PUBLISHED' } });
    problemResults.value = data.items || [];
  } catch (e: any) { showMessage('搜索题目失败：' + (e.response?.data?.message || e.message)); }
  finally { problemSearching.value = false; }
}
function addProblem(problem: ProblemItem) { if (!selectedProblems.value.some((item) => item.id === problem.id)) selectedProblems.value.push(problem); }
function removeProblem(problemId: string) { selectedProblems.value = selectedProblems.value.filter((item) => item.id !== problemId); }
async function createAssignment() {
  if (!assignmentTitle.value.trim()) return showMessage('请输入作业标题');
  if (!selectedProblems.value.length) return showMessage('请至少选择一道题目');
  try {
    await api.post('/api/teacher/assignments', {
      classId: selectedClassId.value, title: assignmentTitle.value.trim(), description: assignmentDescription.value.trim(),
      endTime: assignmentEndTime.value ? new Date(assignmentEndTime.value).toISOString() : undefined,
      problemIds: selectedProblems.value.map((item) => item.id),
    });
    assignmentTitle.value = ''; assignmentDescription.value = ''; assignmentEndTime.value = ''; selectedProblems.value = [];
    showMessage('作业已发布'); await loadAssignments();
  } catch (e: any) { showMessage('发布作业失败：' + (e.response?.data?.message || e.message)); }
}
async function loadAssignments() {
  if (!selectedClassId.value) return;
  assignmentsLoading.value = true;
  try { const { data } = await api.get(`/api/teacher/classes/${selectedClassId.value}/assignments`); assignments.value = data; }
  catch (e: any) { showMessage('加载作业失败：' + (e.response?.data?.message || e.message)); }
  finally { assignmentsLoading.value = false; }
}
async function loadReport(assignmentId = selectedAssignmentId.value) {
  if (!assignmentId) return;
  selectedAssignmentId.value = assignmentId; reportLoading.value = true;
  try { const { data } = await api.get(`/api/teacher/assignments/${assignmentId}/report`); report.value = data; }
  catch (e: any) { showMessage('加载作业情况失败：' + (e.response?.data?.message || e.message)); }
  finally { reportLoading.value = false; }
}
</script>

<template>
  <div class="teacher-workspace" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="workspace-sidebar">
      <div class="sidebar-brand"><span><UsersRound :size="20" /></span><div><strong>班级工作台</strong><small>教学与成员管理</small></div><button class="sidebar-collapse-button" type="button" :title="sidebarCollapsed ? '展开班级侧栏' : '收起班级侧栏'" :aria-label="sidebarCollapsed ? '展开班级侧栏' : '收起班级侧栏'" :aria-expanded="!sidebarCollapsed" @click="sidebarCollapsed = !sidebarCollapsed"><PanelLeftOpen v-if="sidebarCollapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button></div>
      <p class="sidebar-label">功能</p>
      <nav class="workspace-nav">
        <button v-for="item in panels" :key="item.id" :class="{ active: activePanel === item.id }" :title="sidebarCollapsed ? item.label : undefined" :aria-label="sidebarCollapsed ? item.label : undefined" @click="openPanel(item.id)">
          <component :is="item.icon" :size="18" /><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span>
          <b v-if="item.id === 'access' && pendingMembers.length">{{ pendingMembers.length }}</b>
        </button>
      </nav>
      <div class="sidebar-divider"></div>
      <div ref="classSwitcher" class="class-switcher" @keydown.esc="classMenuOpen = false">
        <span class="class-switcher-label">当前班级</span>
        <button class="class-switcher-trigger" type="button" aria-haspopup="listbox" :aria-expanded="classMenuOpen" @click="classMenuOpen = !classMenuOpen" @keydown.down.prevent="classMenuOpen = true">
          <i>{{ selectedClass?.name?.slice(0, 1) || '?' }}</i>
          <span><strong>{{ selectedClass?.name || '选择班级' }}</strong><small>{{ selectedClass ? `${selectedClass.memberCount || 0} 名学生` : '从班级列表中选择' }}</small></span>
          <ChevronDown :size="15" :class="{ rotated: classMenuOpen }" />
        </button>
        <div v-if="classMenuOpen" class="class-switcher-menu" role="listbox" aria-label="选择班级">
          <p v-if="!classes.length">暂无可选班级</p>
          <button v-for="item in classes" :key="item.id" type="button" role="option" :aria-selected="selectedClassId === item.id" :class="{ selected: selectedClassId === item.id }" @click="selectClassFromMenu(item.id)">
            <i>{{ item.name.slice(0, 1) }}</i>
            <span><strong>{{ item.name }}</strong><small><b :class="item.status.toLowerCase()"></b>{{ classStatus(item.status) }} · {{ item.memberCount || 0 }} 人</small></span>
            <Check v-if="selectedClassId === item.id" :size="15" />
          </button>
        </div>
      </div>
      <button class="sidebar-overview" @click="activePanel = 'overview'"><LayoutDashboard :size="16" />查看全部班级</button>
    </aside>

    <main class="workspace-main">
      <header class="workspace-hero">
        <div><p>TEACHING WORKSPACE</p><h1>{{ activePanel === 'overview' ? '我的班级' : selectedClass?.name || '班级管理' }}</h1><span>{{ activePanel === 'overview' ? '查看班级状态与教学概况，再进入具体功能。' : panels.find((item) => item.id === activePanel)?.label }}</span></div>
        <div class="hero-facts"><div><strong>{{ classes.length }}</strong><small>班级</small></div><div><strong>{{ totalMembers }}</strong><small>学生</small></div><div><strong>{{ activeCodes }}</strong><small>有效班级码</small></div></div>
      </header>

      <p v-if="msg" class="message-bar">{{ msg }}<button title="关闭" @click="msg = ''"><X :size="15" /></button></p>
      <div v-if="loading" class="empty-state">正在加载班级数据...</div>

      <template v-else>
        <section v-if="activePanel === 'overview'" class="overview-view">
          <div class="view-heading"><div><p>CLASS OVERVIEW</p><h2>班级概览</h2><span>点击班级卡片进入班级码与审核。</span></div><form class="create-class" @submit.prevent="createClass"><input v-model="newClassName" placeholder="新班级名称"><button><Plus :size="17" />创建班级</button></form></div>
          <div v-if="classes.length" class="class-grid">
            <button v-for="item in classes" :key="item.id" class="class-card" :class="{ selected: selectedClassId === item.id }" @click="chooseClass(item.id)">
              <div class="class-card-top"><span class="class-initial">{{ item.name.slice(0, 1) }}</span><span class="class-state" :class="item.status.toLowerCase()">{{ classStatus(item.status) }}</span></div>
              <h3>{{ item.name }}</h3>
              <p>{{ item.memberCount || 0 }} 名正式成员</p>
              <div class="class-meta"><span><KeyRound :size="14" />{{ item.joinCode ? '班级码已启用' : '未启用班级码' }}</span><span><Clock3 :size="14" />{{ formatShortDate(item.createdAt) }}</span></div>
              <footer>进入班级 <ChevronRight :size="17" /></footer>
            </button>
          </div>
          <div v-else class="empty-state"><UsersRound :size="30" /><strong>还没有班级</strong><span>创建班级后，管理员审核通过即可生成班级码。</span></div>
        </section>

        <section v-else-if="activePanel === 'access'" class="content-view">
          <div class="view-heading"><div><p>ACCESS CONTROL</p><h2>班级码与入班审核</h2><span>学生凭码申请，审核通过后进入正式名单。</span></div><button class="secondary-command" :disabled="membersLoading" @click="loadMembers"><RefreshCw :size="16" />刷新</button></div>
          <div class="access-grid">
            <section class="surface code-surface"><div class="surface-title"><span><KeyRound :size="18" /></span><div><h3>班级码</h3><p>{{ selectedClass?.status === 'APPROVED' ? '设置有效期后生成或轮换班级码。' : '班级通过管理员审核后才能启用。' }}</p></div></div><div class="code-value" :class="{ inactive: !selectedClass?.joinCode }">{{ selectedClass?.joinCode || '未启用' }}</div><p class="code-expiry"><Clock3 :size="15" />{{ selectedClass?.joinCode ? `有效至 ${formatDate(selectedClass.joinCodeExpiresAt)}` : '当前没有有效班级码' }}</p><label>有效期<input v-model="joinCodeExpiresAt" type="datetime-local" :disabled="selectedClass?.status !== 'APPROVED'"></label><div class="button-row"><button class="primary-command" :disabled="joinCodeSaving || selectedClass?.status !== 'APPROVED'" @click="saveJoinCode"><RefreshCw :size="16" />{{ selectedClass?.joinCode ? '重新生成' : '生成班级码' }}</button><button v-if="selectedClass?.joinCode" class="secondary-command" @click="copyJoinCode"><Clipboard :size="16" />复制</button><button v-if="selectedClass?.joinCode" class="danger-command" title="停用班级码" @click="disableJoinCode"><X :size="17" /></button></div></section>
            <section class="surface review-surface"><div class="surface-title"><span><UserCheck :size="18" /></span><div><h3>待审核申请</h3><p>{{ pendingMembers.length }} 人等待处理</p></div></div><div v-if="pendingMembers.length" class="application-list"><article v-for="member in pendingMembers" :key="member.user.id"><span class="student-avatar">{{ (member.user.nickname || member.user.username).slice(0, 1).toUpperCase() }}</span><div><strong>{{ member.user.nickname || member.user.username }}</strong><small>@{{ member.user.username }} · {{ formatDate(member.joinedAt) }}</small></div><footer><button class="approve" :disabled="reviewingUserId === member.user.id" @click="reviewMember(member, 'APPROVED')"><Check :size="16" />通过</button><button class="reject" :disabled="reviewingUserId === member.user.id" @click="reviewMember(member, 'REJECTED')"><X :size="16" />拒绝</button></footer></article></div><div v-else class="surface-empty">暂无待审核申请</div></section>
          </div>
        </section>

        <section v-else-if="activePanel === 'members'" class="content-view">
          <div class="view-heading"><div><p>MEMBERS</p><h2>学生名单</h2><span>{{ approvedMembers.length }} 名正式成员</span></div><button class="secondary-command" @click="loadMembers"><RefreshCw :size="16" />刷新</button></div>
          <section class="surface table-surface"><table><thead><tr><th>学生</th><th>用户名</th><th>加入时间</th><th></th></tr></thead><tbody><tr v-for="member in approvedMembers" :key="member.user.id"><td><span class="member-name"><i>{{ (member.user.nickname || member.user.username).slice(0,1).toUpperCase() }}</i>{{ member.user.nickname || member.user.username }}</span></td><td>@{{ member.user.username }}</td><td>{{ formatDate(member.joinedAt) }}</td><td><button class="table-action" title="移出班级" @click="removeStudent(member.user.id, member.user.username)"><Trash2 :size="16" /></button></td></tr></tbody></table><div v-if="!approvedMembers.length" class="surface-empty">当前班级暂无正式成员</div></section>
        </section>

        <section v-else-if="activePanel === 'import'" class="content-view narrow-view">
          <div class="view-heading"><div><p>BULK IMPORT</p><h2>导入学生</h2><span>批量创建或关联学生账号，并直接加入 {{ selectedClass?.name }}。</span></div></div>
          <div class="import-mode" role="tablist" aria-label="导入方式">
            <button :class="{ active: importMode === 'excel' }" role="tab" :aria-selected="importMode === 'excel'" @click="importMode = 'excel'"><FileSpreadsheet :size="16" />Excel 导入</button>
            <button :class="{ active: importMode === 'text' }" role="tab" :aria-selected="importMode === 'text'" @click="importMode = 'text'"><UserPlus :size="16" />快速导入</button>
          </div>

          <section v-if="importMode === 'excel'" class="surface import-surface excel-import">
            <header class="import-heading">
              <div class="surface-title"><span><FileSpreadsheet :size="18" /></span><div><h3>按固定格式导入</h3><p>表头固定为学号、姓名、手机号、邮箱，单次最多 500 人。</p></div></div>
              <button class="secondary-command template-command" @click="downloadExcelTemplate"><Download :size="16" />下载模板</button>
            </header>
            <div class="format-strip"><span><b>学号</b>8 位数字</span><span><b>姓名</b>必填</span><span><b>手机号</b>11 位大陆号码</span><span><b>邮箱</b>有效邮箱地址</span></div>
            <input ref="excelInput" class="file-input" type="file" accept=".xlsx,.xls,.csv" @change="readExcelFile(($event.target as HTMLInputElement).files?.[0])">
            <button
              class="excel-dropzone"
              :class="{ dragging: excelDragging }"
              type="button"
              @click="chooseExcelFile"
              @dragenter.prevent="excelDragging = true"
              @dragover.prevent="excelDragging = true"
              @dragleave.prevent="excelDragging = false"
              @drop.prevent="onExcelDrop"
            >
              <span><UploadCloud :size="25" /></span>
              <strong>{{ excelRows.length ? '重新选择学生名单' : '拖入 Excel，或点击选择文件' }}</strong>
              <small>支持 .xlsx、.xls、.csv</small>
            </button>

            <div v-if="excelRows.length" class="excel-preview">
              <div class="preview-summary"><strong>文件预览</strong><span>共 {{ excelRows.length }} 行</span><span :class="invalidExcelRows.length ? 'preview-error' : 'preview-valid'">{{ invalidExcelRows.length ? `${invalidExcelRows.length} 行需修正` : '全部校验通过' }}</span></div>
              <div class="preview-table-wrap"><table><thead><tr><th>行</th><th>学号</th><th>姓名</th><th>手机号</th><th>邮箱</th><th>校验</th></tr></thead><tbody><tr v-for="(row, index) in excelRows.slice(0, 8)" :key="`${row.studentId}-${index}`" :class="{ invalid: !row.valid }"><td>{{ index + 2 }}</td><td>{{ row.studentId || '-' }}</td><td>{{ row.name || '-' }}</td><td>{{ row.phone || '-' }}</td><td>{{ row.email || '-' }}</td><td><span :class="row.valid ? 'row-valid' : 'row-error'">{{ row.valid ? '通过' : row.reason }}</span></td></tr></tbody></table></div>
              <p v-if="excelRows.length > 8" class="preview-more">另有 {{ excelRows.length - 8 }} 行将在导入时一并处理</p>
            </div>
            <div class="import-footer"><span>新账号初始密码为学号，首次登录须修改密码</span><button class="primary-command" :disabled="excelImporting || !excelRows.length || !!invalidExcelRows.length" @click="importExcelStudents"><UserPlus :size="16" />{{ excelImporting ? '正在导入' : `确认导入${excelRows.length ? ` ${excelRows.length} 人` : ''}` }}</button></div>
          </section>

          <section v-else class="surface import-surface">
            <div class="surface-title"><span><UserPlus :size="18" /></span><div><h3>按现有账号快速导入</h3><p>输入学生用户名或邮箱，使用换行、空格或逗号分隔。</p></div></div>
            <textarea v-model="importText" rows="10" placeholder="student001&#10;student002@school.edu"></textarea>
            <div class="import-footer"><span>单次最多 500 人</span><button class="primary-command" @click="importTextStudents"><UserPlus :size="16" />确认导入</button></div>
          </section>
        </section>

        <section v-else-if="activePanel === 'assignment'" class="content-view">
          <div class="view-heading"><div><p>ASSIGNMENT BUILDER</p><h2>发布作业</h2><span>从题库选择题目并设置截止时间。</span></div><span class="selection-count">已选 {{ selectedProblems.length }} 题</span></div>
          <section class="surface assignment-builder"><div class="form-grid"><label>作业标题<input v-model="assignmentTitle" placeholder="例如：第一周基础练习"></label><label>截止时间<input v-model="assignmentEndTime" type="datetime-local"></label></div><label>作业说明<textarea v-model="assignmentDescription" rows="3" placeholder="可选"></textarea></label><div class="problem-search"><Search :size="17" /><input v-model="problemKeyword" placeholder="搜索题目标题或编号" @keyup.enter="searchProblems"><button :disabled="problemSearching" @click="searchProblems">搜索</button></div><div v-if="problemResults.length" class="problem-results"><button v-for="problem in problemResults" :key="problem.id" @click="addProblem(problem)"><span>{{ problem.title }}</span><small>{{ problem.sourceInfo?.platform || problem.source || 'LOCAL' }} · 加入</small></button></div><div class="selected-problems"><p>已选题目</p><div v-if="selectedProblems.length"><span v-for="problem in selectedProblems" :key="problem.id">{{ problem.title }}<button title="移除" @click="removeProblem(problem.id)"><X :size="14" /></button></span></div><div v-else class="surface-empty compact">还没有选择题目</div></div><footer class="builder-footer"><span>发布后将同步到当前正式成员</span><button class="primary-command" :disabled="!selectedProblems.length" @click="createAssignment"><BookOpenCheck :size="16" />发布作业</button></footer></section>
        </section>

        <section v-else class="content-view">
          <div class="view-heading"><div><p>ASSIGNMENT REPORT</p><h2>作业报告</h2><span>按学生与题目查看完成情况。</span></div></div>
          <div class="report-toolbar"><select v-model="selectedAssignmentId"><option value="">选择作业</option><option v-for="item in assignments" :key="item.id" :value="item.id">{{ item.title }}（{{ item._count?.problems || item.problems?.length || 0 }} 题 / {{ item._count?.students || 0 }} 人）</option></select><button class="primary-command" :disabled="!selectedAssignmentId || reportLoading" @click="loadReport()"><BarChart3 :size="16" />生成报告</button></div>
          <section v-if="report" class="surface report-surface"><div class="report-summary"><div><strong>{{ report.summary.completedStudents }}/{{ report.summary.studentCount }}</strong><span>完成人数</span></div><div><strong>{{ report.summary.problemCount }}</strong><span>题目数</span></div><div><strong>{{ report.assignment.title }}</strong><span>当前作业</span></div></div><div class="report-table"><table><thead><tr><th>学生</th><th>完成</th><th v-for="problem in report.problems" :key="problem.id">{{ problem.title }}</th></tr></thead><tbody><tr v-for="student in report.students" :key="student.user.id"><td>{{ student.user.nickname || student.user.username }}</td><td>{{ student.solvedCount }}/{{ student.totalProblems }}</td><td v-for="problem in student.problems" :key="problem.problemId"><span class="judge-state" :class="statusClass(problem.status)">{{ statusLabel(problem.status) }}</span><small v-if="problem.attempts">{{ problem.attempts }} 次</small></td></tr></tbody></table></div></section><div v-else class="empty-state">选择一个作业查看完成情况</div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.teacher-workspace { --navy:#173b66; --blue:#2469ad; --pale:#eaf3fc; --ink:#203147; --muted:#728196; --line:#dfe7ef; display:flex; min-height:calc(100vh - 56px); color:var(--ink); background:#f3f5f7; font-family:'Manrope Variable','Noto Sans SC Variable',sans-serif; }
.workspace-sidebar { position:sticky; top:56px; width:264px; height:calc(100vh - 56px); flex:0 0 264px; padding:22px 14px; border-right:1px solid var(--line); background:#f8fbfe; }
.sidebar-brand { display:flex; align-items:center; gap:10px; padding:0 7px 18px; }.sidebar-brand>span { display:grid; width:38px; height:38px; place-items:center; border-radius:8px; color:#fff; background:var(--navy); }.sidebar-brand div { display:grid; gap:2px; }.sidebar-brand strong { font-size:14px; }.sidebar-brand small,.workspace-nav small { color:#8b98a9; font-size:10px; }.sidebar-label { margin:7px 9px; color:#8a98a8; font-size:10px; font-weight:900; }
.workspace-nav { display:grid; gap:4px; }.workspace-nav button { display:grid; grid-template-columns:22px minmax(0,1fr) auto; align-items:center; gap:9px; width:100%; min-height:48px; padding:7px 10px; border:0; border-radius:7px; color:#607187; text-align:left; background:transparent; cursor:pointer; }.workspace-nav button:hover { color:#1f5d94; background:#edf5fc; }.workspace-nav button.active { color:#fff; background:var(--navy); box-shadow:0 6px 14px rgba(23,59,102,.18); }.workspace-nav button span { display:grid; gap:2px; }.workspace-nav button strong { font-size:12px; }.workspace-nav button.active small { color:#cfdef0; }.workspace-nav b { display:grid; min-width:21px; height:20px; place-items:center; border-radius:6px; color:#8a5b00; background:#fff0bd; font-size:10px; }.sidebar-divider { height:1px; margin:16px 5px; background:var(--line); }.class-switcher { position:relative; display:grid; gap:7px; margin:0 7px; color:#718095; font-size:10px; font-weight:900; }.class-switcher-label { padding-left:2px; }.class-switcher-trigger { display:grid; grid-template-columns:32px minmax(0,1fr) 16px; min-height:50px; align-items:center; gap:8px; width:100%; padding:7px 8px; border:1px solid #cfdae5; border-radius:7px; color:#314a63; text-align:left; background:#fff; font:inherit; cursor:pointer; box-shadow:0 3px 8px rgba(23,59,102,.04); }.class-switcher-trigger:hover,.class-switcher-trigger[aria-expanded="true"] { border-color:#7fa9ce; box-shadow:0 0 0 3px rgba(36,105,173,.08); }.class-switcher-trigger i,.class-switcher-menu button>i { display:grid; width:32px; height:32px; place-items:center; border-radius:6px; color:#fff; background:#2469ad; font-size:12px; font-style:normal; font-weight:900; }.class-switcher-trigger>span,.class-switcher-menu button>span { display:grid; gap:2px; min-width:0; }.class-switcher-trigger strong,.class-switcher-menu strong { overflow:hidden; color:#30465d; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }.class-switcher-trigger small,.class-switcher-menu small { color:#8492a2; font-size:9px; font-weight:650; }.class-switcher-trigger>svg { transition:transform .16s; }.class-switcher-trigger>svg.rotated { transform:rotate(180deg); }.class-switcher-menu { position:absolute; z-index:20; top:calc(100% + 6px); left:0; display:grid; width:100%; max-height:250px; padding:5px; overflow-y:auto; border:1px solid #cfdae5; border-radius:7px; background:#fff; box-shadow:0 14px 30px rgba(23,59,102,.18); }.class-switcher-menu>p { margin:0; padding:14px 8px; color:#8a97a6; text-align:center; }.class-switcher-menu button { display:grid; grid-template-columns:32px minmax(0,1fr) 16px; align-items:center; gap:8px; width:100%; min-height:47px; padding:6px; border:0; border-radius:5px; color:#36506a; text-align:left; background:transparent; font:inherit; cursor:pointer; }.class-switcher-menu button:hover { background:#edf5fc; }.class-switcher-menu button.selected { background:#e5f1fc; }.class-switcher-menu button>i { color:#245f94; background:#dcecf9; }.class-switcher-menu small { display:flex; align-items:center; gap:4px; }.class-switcher-menu small b { width:6px; height:6px; border-radius:50%; background:#9aa6b3; }.class-switcher-menu small b.approved { background:#2b9a6d; }.class-switcher-menu small b.pending { background:#d69a27; }.class-switcher-menu small b.rejected { background:#c86159; }.class-switcher-menu button>svg { color:#2469ad; }.sidebar-overview { display:flex; align-items:center; gap:7px; width:calc(100% - 14px); margin:9px 7px 0; padding:8px 9px; border:0; color:#286195; background:transparent; font-weight:800; cursor:pointer; }
.workspace-main { min-width:0; flex:1; padding:26px 30px 64px; }.workspace-hero,.workspace-main>section,.workspace-main>.message-bar,.workspace-main>.empty-state { width:min(1160px,100%); margin-right:auto; margin-left:auto; }.workspace-hero { display:flex; min-height:158px; align-items:center; justify-content:space-between; gap:24px; padding:28px 34px; border-radius:8px; color:#fff; background:var(--navy); box-shadow:0 14px 32px rgba(23,59,102,.16); }.workspace-hero p,.view-heading p { margin:0 0 6px; color:#8fc2ec; font-size:10px; font-weight:900; }.workspace-hero h1 { margin:0; font-size:34px; letter-spacing:0; }.workspace-hero>div>span { display:block; margin-top:9px; color:#d8e7f5; font-size:13px; }.hero-facts { display:flex; border:1px solid rgba(255,255,255,.18); border-radius:8px; }.hero-facts div { display:grid; min-width:90px; gap:3px; padding:13px 16px; text-align:center; }.hero-facts div+div { border-left:1px solid rgba(255,255,255,.16); }.hero-facts strong { font-size:23px; }.hero-facts small { color:#bcd0e5; font-size:10px; }
.message-bar { position:relative; display:flex; align-items:center; justify-content:space-between; margin-top:15px; padding:10px 12px; border:1px solid #bad5ed; border-radius:6px; color:#245b8b; background:#edf7ff; font-size:13px; }.message-bar button { display:grid; width:26px; height:26px; place-items:center; border:0; color:inherit; background:transparent; cursor:pointer; }.overview-view,.content-view { margin-top:22px; }.view-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:16px; }.view-heading h2 { margin:0; font-size:25px; letter-spacing:0; }.view-heading>div>span { color:var(--muted); font-size:12px; }.create-class { display:flex; gap:8px; }.create-class input { width:250px; height:40px; padding:0 11px; border:1px solid #cad6e2; border-radius:6px; }.create-class button,.primary-command,.secondary-command,.danger-command { display:inline-flex; min-height:38px; align-items:center; justify-content:center; gap:7px; padding:0 13px; border-radius:6px; font:inherit; font-size:12px; font-weight:850; cursor:pointer; }.create-class button,.primary-command { border:0; color:#fff; background:var(--blue); }.secondary-command { border:1px solid #cbd9e6; color:#315c84; background:#fff; }.danger-command { width:38px; padding:0; border:1px solid #e8c4c0; color:#a13f37; background:#fff; }.primary-command:disabled,.secondary-command:disabled { opacity:.5; cursor:default; }
.class-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }.class-card { display:flex; min-height:222px; flex-direction:column; padding:18px; border:1px solid var(--line); border-radius:8px; color:var(--ink); text-align:left; background:#fff; cursor:pointer; transition:transform .18s,border-color .18s,box-shadow .18s; }.class-card:hover,.class-card.selected { border-color:#8eb8da; transform:translateY(-3px); box-shadow:0 12px 24px rgba(23,59,102,.09); }.class-card-top { display:flex; align-items:center; justify-content:space-between; }.class-initial { display:grid; width:42px; height:42px; place-items:center; border-radius:8px; color:#1c5e96; background:#dcecf9; font-size:18px; font-weight:900; }.class-state { padding:4px 7px; border-radius:5px; font-size:10px; font-weight:900; }.class-state.approved { color:#197050; background:#e4f5ec; }.class-state.pending { color:#916100; background:#fff2c8; }.class-state.rejected { color:#a34841; background:#fdecea; }.class-card h3 { margin:16px 0 5px; font-size:17px; }.class-card>p { margin:0; color:var(--muted); font-size:12px; }.class-meta { display:grid; gap:7px; margin-top:17px; color:#6d7c8e; font-size:11px; }.class-meta span { display:flex; align-items:center; gap:6px; }.class-card footer { display:flex; align-items:center; justify-content:space-between; margin-top:auto; padding-top:16px; color:#24669f; border-top:1px solid #edf1f5; font-size:12px; font-weight:900; }
.access-grid { display:grid; grid-template-columns:.8fr 1.2fr; gap:16px; }.surface { padding:19px; border:1px solid var(--line); border-radius:8px; background:#fff; box-shadow:0 7px 20px rgba(23,59,102,.04); }.surface-title { display:flex; align-items:center; gap:10px; }.surface-title>span { display:grid; width:36px; height:36px; place-items:center; border-radius:7px; color:#215d91; background:#e4f0fb; }.surface-title h3 { margin:0; font-size:15px; }.surface-title p { margin:3px 0 0; color:var(--muted); font-size:11px; }.code-value { margin:24px 0 8px; color:#174f84; font-family:Consolas,monospace; font-size:31px; font-weight:900; letter-spacing:3px; }.code-value.inactive { color:#8a97a6; font-family:inherit; font-size:24px; letter-spacing:0; }.code-expiry { display:flex; align-items:center; gap:6px; margin:0 0 19px; color:#738196; font-size:11px; }.code-surface label,.assignment-builder label { display:grid; gap:6px; color:#57687b; font-size:11px; font-weight:850; }.code-surface input,.assignment-builder input,.assignment-builder textarea,.import-surface textarea,.report-toolbar select { width:100%; padding:9px 10px; border:1px solid #ced9e4; border-radius:6px; color:#293d54; background:#fff; font:inherit; }.button-row { display:flex; gap:8px; margin-top:13px; }.application-list { display:grid; gap:8px; margin-top:17px; }.application-list article { display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:10px; padding:11px; border:1px solid #e5ebf1; border-radius:7px; background:#fbfdff; }.student-avatar { display:grid; width:40px; height:40px; place-items:center; border-radius:50%; color:#235d92; background:#e3eef9; font-weight:900; }.application-list article>div { display:grid; gap:3px; min-width:0; }.application-list strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }.application-list small { color:#8491a1; font-size:10px; }.application-list footer { display:flex; gap:6px; }.application-list footer button { display:inline-flex; align-items:center; gap:4px; padding:6px 8px; border-radius:5px; background:#fff; font-size:11px; font-weight:850; cursor:pointer; }.approve { border:1px solid #b9ddca; color:#177245; }.reject { border:1px solid #ecc7c4; color:#a63b34; }
.surface-empty,.empty-state { display:grid; min-height:130px; place-items:center; align-content:center; gap:7px; color:#8794a3; text-align:center; font-size:12px; }.empty-state { min-height:260px; }.surface-empty.compact { min-height:50px; }.table-surface { padding:0; overflow:hidden; }.table-surface table,.report-table table { width:100%; border-collapse:collapse; }.table-surface th,.table-surface td,.report-table th,.report-table td { padding:12px 15px; text-align:left; border-bottom:1px solid #edf1f5; font-size:12px; }.table-surface th,.report-table th { color:#6f7d8d; background:#f7f9fb; font-size:10px; }.member-name { display:flex; align-items:center; gap:9px; font-weight:800; }.member-name i { display:grid; width:31px; height:31px; place-items:center; border-radius:50%; color:#245f94; background:#e5f0fb; font-style:normal; }.table-action { display:grid; width:32px; height:32px; place-items:center; margin-left:auto; border:0; border-radius:6px; color:#a3433b; background:#fff1ef; cursor:pointer; }.narrow-view { max-width:820px; margin-right:auto!important; margin-left:auto!important; }.import-mode { display:inline-grid; grid-template-columns:1fr 1fr; gap:3px; margin-bottom:10px; padding:3px; border:1px solid #d7e1eb; border-radius:7px; background:#e9eef3; }.import-mode button { display:inline-flex; min-width:130px; height:36px; align-items:center; justify-content:center; gap:7px; border:0; border-radius:5px; color:#66778b; background:transparent; font:inherit; font-size:11px; font-weight:850; cursor:pointer; }.import-mode button.active { color:#184f82; background:#fff; box-shadow:0 2px 6px rgba(23,59,102,.1); }.import-surface textarea { min-height:220px; margin-top:20px; resize:vertical; }.import-heading { display:flex; align-items:center; justify-content:space-between; gap:14px; }.template-command { flex:0 0 auto; }.format-strip { display:grid; grid-template-columns:repeat(4,1fr); margin-top:18px; border:1px solid #dce6ef; border-radius:7px; overflow:hidden; }.format-strip span { display:grid; gap:2px; padding:9px 11px; color:#738195; background:#f8fbfd; font-size:9px; }.format-strip span+span { border-left:1px solid #dce6ef; }.format-strip b { color:#365a7d; font-size:11px; }.file-input { position:absolute; width:1px; height:1px; overflow:hidden; opacity:0; pointer-events:none; }.excel-dropzone { display:grid; width:100%; min-height:158px; place-items:center; align-content:center; gap:7px; margin-top:14px; border:1px dashed #91b5d5; border-radius:7px; color:#52708d; background:#f4f9fd; font:inherit; cursor:pointer; transition:border-color .15s,background .15s,transform .15s; }.excel-dropzone:hover,.excel-dropzone.dragging { border-color:#2469ad; background:#e9f4fc; transform:translateY(-1px); }.excel-dropzone>span { display:grid; width:45px; height:45px; place-items:center; border-radius:50%; color:#fff; background:#2469ad; }.excel-dropzone strong { color:#294b6c; font-size:13px; }.excel-dropzone small { color:#8090a1; font-size:10px; }.excel-preview { margin-top:15px; border:1px solid #dce5ed; border-radius:7px; overflow:hidden; }.preview-summary { display:flex; align-items:center; gap:10px; padding:10px 12px; color:#68788b; background:#f7f9fb; font-size:10px; }.preview-summary strong { margin-right:auto; color:#304a64; font-size:12px; }.preview-summary span { padding:3px 6px; border-radius:4px; background:#e9eef3; }.preview-summary .preview-valid { color:#17704e; background:#e4f5ec; }.preview-summary .preview-error { color:#a43d36; background:#fdecea; }.preview-table-wrap { overflow-x:auto; }.preview-table-wrap table { width:100%; min-width:700px; border-collapse:collapse; }.preview-table-wrap th,.preview-table-wrap td { padding:9px 10px; border-top:1px solid #edf1f5; text-align:left; white-space:nowrap; font-size:10px; }.preview-table-wrap th { color:#718093; background:#fbfcfd; font-size:9px; }.preview-table-wrap tr.invalid td { background:#fff8f7; }.row-valid { color:#17704e; }.row-error { color:#a43d36; font-weight:750; }.preview-more { margin:0; padding:8px 12px; border-top:1px solid #edf1f5; color:#778698; background:#fbfcfd; font-size:10px; }.import-footer,.builder-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px; color:#7b8999; font-size:11px; }
.selection-count { padding:5px 9px; border-radius:5px; color:#225f96; background:#e5f1fc; font-size:11px; font-weight:900; }.form-grid { display:grid; grid-template-columns:1fr 260px; gap:12px; }.assignment-builder>label { margin-top:13px; }.assignment-builder textarea { resize:vertical; }.problem-search { display:grid; grid-template-columns:20px minmax(0,1fr) auto; align-items:center; gap:7px; margin-top:16px; padding:7px 7px 7px 10px; border:1px solid #cfdbe6; border-radius:7px; color:#7c8998; }.problem-search input { border:0; outline:0; }.problem-search button { height:32px; padding:0 12px; border:0; border-radius:5px; color:#fff; background:var(--navy); font-weight:800; cursor:pointer; }.problem-results { max-height:220px; margin-top:8px; overflow:auto; border:1px solid #d8e5f0; }.problem-results button { display:flex; width:100%; justify-content:space-between; gap:12px; padding:9px 11px; border:0; border-bottom:1px solid #eaf0f5; color:#314a63; text-align:left; background:#f8fbfe; cursor:pointer; }.problem-results small { color:#24669f; }.selected-problems { margin-top:17px; }.selected-problems>p { color:#586b7f; font-size:11px; font-weight:900; }.selected-problems>div { display:flex; flex-wrap:wrap; gap:7px; }.selected-problems span { display:inline-flex; align-items:center; gap:6px; padding:6px 8px; border:1px solid #cfe0ef; border-radius:6px; color:#315b81; background:#f3f8fd; font-size:11px; }.selected-problems span button { display:grid; place-items:center; border:0; color:#8b4a43; background:transparent; cursor:pointer; }
.report-toolbar { display:flex; gap:9px; margin-bottom:14px; }.report-toolbar select { flex:1; max-width:620px; }.report-surface { padding:0; overflow:hidden; }.report-summary { display:grid; grid-template-columns:180px 130px minmax(0,1fr); gap:1px; background:#dce5ed; }.report-summary div { display:grid; gap:3px; padding:15px 17px; background:#f8fbfe; }.report-summary strong { color:#214f79; font-size:16px; }.report-summary span { color:#7e8b9a; font-size:10px; }.report-table { overflow:auto; }.report-table table { min-width:900px; }.judge-state { display:inline-block; padding:3px 6px; border-radius:5px; font-size:10px; }.judge-state.ok { color:#17704e; background:#e5f5ec; }.judge-state.bad { color:#a43d36; background:#fdecea; }.judge-state.pending { color:#8a6200; background:#fff2c9; }.judge-state.muted { color:#748293; background:#edf1f5; }.report-table td small { display:block; margin-top:3px; color:#8995a3; font-size:9px; }
@media(max-width:980px){.teacher-workspace{display:block}.workspace-sidebar{position:static;width:auto;height:auto;padding:12px}.sidebar-brand,.sidebar-label,.sidebar-divider,.class-switcher,.sidebar-overview{display:none}.workspace-nav{grid-template-columns:repeat(3,1fr)}.workspace-nav button{grid-template-columns:20px 1fr}.workspace-nav button small,.workspace-nav button b{display:none}.workspace-main{padding:18px 16px 48px}.class-grid{grid-template-columns:repeat(2,1fr)}.access-grid{grid-template-columns:1fr}}
@media(max-width:620px){.workspace-nav{grid-template-columns:repeat(2,1fr)}.workspace-hero{align-items:flex-start;flex-direction:column;padding:22px}.workspace-hero h1{font-size:28px}.hero-facts{width:100%}.hero-facts div{min-width:0;flex:1}.view-heading,.create-class,.report-toolbar,.import-footer,.builder-footer,.import-heading{align-items:stretch;flex-direction:column}.create-class input{width:100%}.class-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.application-list article{grid-template-columns:40px 1fr}.application-list footer{grid-column:1/-1}.report-summary{grid-template-columns:1fr}.import-mode{display:grid}.import-mode button{min-width:0}.format-strip{grid-template-columns:1fr 1fr}.format-strip span:nth-child(3){border-left:0;border-top:1px solid #dce6ef}.format-strip span:nth-child(4){border-top:1px solid #dce6ef}.excel-dropzone{min-height:140px;padding:18px}.preview-summary{align-items:flex-start;flex-wrap:wrap}.preview-summary strong{width:100%;margin:0}.preview-table-wrap table{min-width:0;table-layout:fixed}.preview-table-wrap th,.preview-table-wrap td{padding:8px 5px;white-space:normal;overflow-wrap:anywhere}.preview-table-wrap th:nth-child(1){width:26px}.preview-table-wrap th:nth-child(2){width:70px}.preview-table-wrap th:nth-child(3){width:52px}.preview-table-wrap th:nth-child(4),.preview-table-wrap td:nth-child(4),.preview-table-wrap th:nth-child(5),.preview-table-wrap td:nth-child(5){display:none}}
/* Teacher tools use the same white hero and pale-blue selected state as the problem library. */
.sidebar-brand > span {
  background: #e7efff;
  color: #1f5eff;
}
.sidebar-collapse-button { display:grid; width:34px; height:34px; flex:0 0 34px; margin-left:auto; place-items:center; border:0; border-radius:10px; color:#637488; background:transparent; cursor:pointer; }.sidebar-collapse-button:hover { color:#1f5eff; background:#e7efff; }.sidebar-collapse-button:focus-visible { outline:2px solid #1f5eff; outline-offset:2px; }
.teacher-workspace.sidebar-collapsed .workspace-sidebar { width:72px; flex-basis:72px; padding-right:10px; padding-left:10px; }.teacher-workspace.sidebar-collapsed .sidebar-brand { justify-content:center; padding-right:0; padding-left:0; }.teacher-workspace.sidebar-collapsed .sidebar-brand>span,.teacher-workspace.sidebar-collapsed .sidebar-brand>div,.teacher-workspace.sidebar-collapsed .sidebar-label,.teacher-workspace.sidebar-collapsed .sidebar-divider,.teacher-workspace.sidebar-collapsed .class-switcher,.teacher-workspace.sidebar-collapsed .sidebar-overview { display:none; }.teacher-workspace.sidebar-collapsed .sidebar-collapse-button { margin-left:0; }.teacher-workspace.sidebar-collapsed .workspace-nav button { grid-template-columns:1fr; justify-items:center; padding-right:0; padding-left:0; }.teacher-workspace.sidebar-collapsed .workspace-nav button>span,.teacher-workspace.sidebar-collapsed .workspace-nav button>b { display:none; }
.workspace-hero,.workspace-main>section,.workspace-main>.message-bar,.workspace-main>.empty-state { width:min(1440px,100%); max-width:none; }.workspace-hero,.surface,.class-card,.access-grid>section,.excel-preview { border-radius:18px; }.primary-command,.secondary-command,.create-class button,.create-class input,.message-bar { border-radius:10px; }
.workspace-nav button.active {
  background: #e7efff;
  color: #1f5eff;
  box-shadow: none;
}
.workspace-nav button.active small { color: #1f5eff; }
.workspace-hero {
  border: 1px solid #dce5ef;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 66, 104, 0.08);
  color: #1f2a37;
}
.workspace-hero p,
.view-heading p { color: #3977aa; }
.workspace-hero h1 { color: #1f2a37; }
.workspace-hero > div > span { color: #66778a; }
.hero-facts {
  border-color: #dce5ef;
  background: #f8faff;
}
.hero-facts div + div { border-left-color: #e4ebf3; }
.hero-facts strong { color: #1f5eff; }
.hero-facts small { color: #728092; }
</style>
