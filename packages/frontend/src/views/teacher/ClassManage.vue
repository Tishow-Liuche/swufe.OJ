<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onClickOutside, useStorage } from '@vueuse/core';
import {
  BarChart3, BookOpenCheck, Check, ChevronDown, ChevronRight, Clipboard, ClipboardList,
  Clock3, Download, FileSpreadsheet, KeyRound, LayoutDashboard, Plus,
  PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Trash2, UploadCloud, UserCheck, UserPlus, UsersRound, X,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../../api/client';
import FilterSelect from '../../components/FilterSelect.vue';
import { pointDifficultyOptions, pointDifficultyShortLabel } from '../../utils/pointDifficulty';
import { isCurrentPageSelected, setCurrentPageSelected, toggleProblem } from './assignment-selection';
import { excelSafeFraction } from './excel-csv';

type WorkspacePanel = 'overview' | 'access' | 'members' | 'import' | 'assignment' | 'history' | 'report';
interface ClassInfo {
  id: string; name: string; memberCount?: number; createdAt: string; status: string;
  joinCode?: string | null; joinCodeExpiresAt?: string | null;
}
interface ClassMember {
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote?: string | null; joinedAt: string;
  user: { id: string; username: string; nickname?: string };
}
interface ProblemItem {
  id: string; title: string; source?: string; difficulty?: string | null;
  sourceInfo?: { platform?: string; remoteProblemId?: string } | null;
  tags: Array<{ name: string }>;
}
interface ProblemResponse {
  items: ProblemItem[]; total: number; page: number; pageSize: number;
}
interface ProblemMetadata {
  tags: Array<{ name: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}
interface AssignmentItem {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allowLate?: boolean;
  latePenalty?: number;
  passCondition?: string | null;
  countExternalAc?: boolean;
  lifecycle?: string;
  problems?: Array<{ problem: ProblemItem }>;
  _count?: { students: number; problems: number };
  summary?: { studentCount: number; problemCount: number; completedStudents: number };
}
interface AssignmentReport {
  assignment: {
    id: string; title: string; startTime: string; endTime: string;
    allowLate?: boolean; latePenalty?: number; passCondition?: string | null;
    countExternalAc?: boolean; lifecycle?: string;
  };
  problems: ProblemItem[];
  students: Array<{
    user: { id: string; username: string; nickname?: string };
    status?: string; statusLabel?: string;
    solvedCount: number; totalProblems: number; completed: boolean;
    score?: number; late?: boolean;
    problems: Array<{
      problemId: string; title: string; status: string; attempts: number;
      bestSubmissionId?: string | null; score: number;
      timeUsed?: number | null; memoryUsed?: number | null; submittedAt?: string | null;
      late?: boolean;
    }>;
  }>;
  summary: {
    studentCount: number; problemCount: number; completedStudents: number;
    filteredCount?: number; lateStudents?: number; expiredStudents?: number;
    inProgressStudents?: number; notStartedStudents?: number;
  };
}
interface CombinedAssignmentCell {
  assignmentId: string;
  title: string;
  present: boolean;
  completed: boolean;
  status: string;
  statusLabel: string;
  solvedCount: number;
  totalProblems: number;
  score: number;
}
interface CombinedStudentRow {
  user: { id: string; username: string; nickname?: string };
  completedAssignments: number;
  totalAssignments: number;
  totalScore: number;
  byAssignment: CombinedAssignmentCell[];
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
  { id: 'history' as const, label: '历史作业', detail: '修改与删除', icon: Clock3 },
  { id: 'report' as const, label: '作业报告', detail: '完成情况', icon: BarChart3 },
];

const classes = ref<ClassInfo[]>([]);
const selectedClassId = ref('');
const activePanel = ref<WorkspacePanel>('overview');
const members = ref<ClassMember[]>([]);
const assignments = ref<AssignmentItem[]>([]);
const selectedAssignmentIds = ref<string[]>([]);
const reports = ref<AssignmentReport[]>([]);
const assignmentPickerOpen = ref(false);
const assignmentPickerRoot = ref<HTMLElement | null>(null);
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
const assignmentAllowLate = ref(false);
const assignmentLatePenalty = ref(0);
const assignmentPassCondition = ref('ALL');
const assignmentCountExternalAc = ref(false);
const editingAssignmentId = ref('');
const assignmentSaving = ref(false);
const deletingAssignmentId = ref('');
const reportKeyword = ref('');
const reportStatus = ref('');
const reportCompletion = ref<'all' | 'completed' | 'incomplete'>('all');
const problemKeyword = ref('');
const problemPage = ref(1);
const problemPageSize = 10;
const problemTotal = ref(0);
const problemSource = ref('');
const problemDifficulty = ref('');
const problemTag = ref('');
const problemMetadata = ref<ProblemMetadata | null>(null);
const problemMetadataLoading = ref(false);
const joinCodeExpiresAt = ref('');
const importMode = ref<'excel' | 'text'>('excel');
const excelRows = ref<ExcelStudentRow[]>([]);
const excelDragging = ref(false);
const excelImporting = ref(false);
const excelInput = ref<HTMLInputElement | null>(null);
const sidebarCollapsed = useStorage('swufe-oj:class-sidebar-collapsed-v1', true);

const selectedClass = computed(() => classes.value.find((item) => item.id === selectedClassId.value));
const pendingMembers = computed(() => members.value.filter((member) => member.status === 'PENDING'));
const approvedMembers = computed(() => members.value.filter((member) => member.status === 'APPROVED'));
const totalMembers = computed(() => classes.value.reduce((sum, item) => sum + (item.memberCount || 0), 0));
const invalidExcelRows = computed(() => excelRows.value.filter((row) => !row.valid));
const problemTotalPages = computed(() => Math.max(1, Math.ceil(problemTotal.value / problemPageSize)));
const problemTagOptions = computed(() => [
  { value: '', label: '全部标签' },
  ...(problemMetadata.value?.tags || []).map((item) => ({ value: item.name, label: `${item.name} (${item.count})` })),
]);
const problemSourceOptions = computed(() => [
  { value: '', label: '全部来源' },
  ...(problemMetadata.value?.sources || []).map((item) => ({
    value: item.source,
    label: item.source === 'LOCAL' ? '原创' : item.source,
  })),
]);
const selectedProblemIds = computed(() => new Set(selectedProblems.value.map((item) => item.id)));
const currentPageFullySelected = computed(() => isCurrentPageSelected(selectedProblems.value, problemResults.value));
const passConditionOptions = [
  { value: 'ALL', label: '全部题目通过' },
  { value: 'COUNT:1', label: '至少通过 1 题' },
  { value: 'PERCENT:50', label: '完成 50%' },
  { value: 'PERCENT:80', label: '完成 80%' },
];
const reportStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'NOT_STARTED', label: '未开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'LATE', label: '已补交' },
  { value: 'EXPIRED', label: '已截止' },
  { value: 'SETTLED', label: '已结算' },
];
const reportCompletionOptions = [
  { value: 'all', label: '完成度不限' },
  { value: 'completed', label: '仅已完成' },
  { value: 'incomplete', label: '仅未完成' },
];
const reportAssignmentOptions = computed(() => assignments.value.map((item) => ({
  value: item.id,
  label: `${item.title}（${item._count?.problems || item.problems?.length || 0} 题 / ${item._count?.students || 0} 人）`,
})));
const selectedAssignmentIdSet = computed(() => new Set(selectedAssignmentIds.value));
const hasSelectedAssignments = computed(() => selectedAssignmentIds.value.length > 0);
const selectedAssignmentLabel = computed(() => {
  if (!selectedAssignmentIds.value.length) return '选择作业（可多选）';
  if (selectedAssignmentIds.value.length === 1) {
    const only = assignments.value.find((item) => item.id === selectedAssignmentIds.value[0]);
    return only?.title || '已选 1 项作业';
  }
  return `已选 ${selectedAssignmentIds.value.length} 项作业`;
});
const showCombinedReport = computed(() => reports.value.length > 1);
const combinedReportRows = computed<CombinedStudentRow[]>(() => {
  if (reports.value.length < 2) return [];
  const keyword = reportKeyword.value.trim().toLowerCase();
  const byUser = new Map<string, CombinedStudentRow>();

  for (const report of reports.value) {
    for (const student of report.students) {
      const userId = student.user.id;
      let row = byUser.get(userId);
      if (!row) {
        row = {
          user: student.user,
          completedAssignments: 0,
          totalAssignments: reports.value.length,
          totalScore: 0,
          byAssignment: reports.value.map((item) => ({
            assignmentId: item.assignment.id,
            title: item.assignment.title,
            present: false,
            completed: false,
            status: 'MISSING',
            statusLabel: '无数据',
            solvedCount: 0,
            totalProblems: item.problems?.length || item.summary.problemCount || 0,
            score: 0,
          })),
        };
        byUser.set(userId, row);
      }
      const cell = row.byAssignment.find((item) => item.assignmentId === report.assignment.id);
      if (!cell) continue;
      cell.present = true;
      cell.completed = Boolean(student.completed);
      cell.status = student.status || (student.completed ? 'COMPLETED' : 'IN_PROGRESS');
      cell.statusLabel = student.statusLabel || statusLabel(cell.status);
      cell.solvedCount = student.solvedCount;
      cell.totalProblems = student.totalProblems;
      cell.score = student.score ?? 0;
    }
  }

  const rows = [...byUser.values()].map((row) => {
    row.completedAssignments = row.byAssignment.filter((item) => item.completed).length;
    row.totalScore = row.byAssignment.reduce((sum, item) => sum + (item.present ? item.score : 0), 0);
    return row;
  });

  const filtered = keyword
    ? rows.filter((row) => {
      const name = `${row.user.username} ${row.user.nickname || ''}`.toLowerCase();
      return name.includes(keyword);
    })
    : rows;

  return filtered.sort((a, b) => {
    if (b.completedAssignments !== a.completedAssignments) return b.completedAssignments - a.completedAssignments;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return (a.user.nickname || a.user.username).localeCompare(b.user.nickname || b.user.username, 'zh-CN');
  });
});
function formatPublishDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
const combinedReportSummary = computed(() => {
  if (!showCombinedReport.value) return null;
  const rows = combinedReportRows.value;
  const totalAssignments = reports.value.length;
  const fullCompleted = rows.filter((row) => row.completedAssignments === totalAssignments).length;
  const publishTimes = reports.value
    .map((item) => item.assignment.startTime)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  let publishDateLabel = '-';
  if (publishTimes.length) {
    const earliest = formatPublishDate(new Date(publishTimes[0]).toISOString());
    const latest = formatPublishDate(new Date(publishTimes[publishTimes.length - 1]).toISOString());
    publishDateLabel = earliest === latest ? earliest : `${earliest}–${latest}`;
  }
  return {
    studentCount: rows.length,
    assignmentCount: totalAssignments,
    fullCompleted,
    averageCompleted: rows.length
      ? (rows.reduce((sum, row) => sum + row.completedAssignments, 0) / rows.length).toFixed(1)
      : '0',
    publishDateLabel,
  };
});
let problemSearchRequest = 0;

onClickOutside(assignmentPickerRoot, () => {
  assignmentPickerOpen.value = false;
});

onMounted(() => {
  void loadClasses();
});

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
async function selectClass(id: string) {
  if (id !== selectedClassId.value) selectedClassId.value = id;
  await loadClassData();
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACCEPTED: '已通过', LATE_ACCEPTED: '补交通过', WRONG_ANSWER: '答案错误', TIME_LIMIT_EXCEEDED: '超时',
    MEMORY_LIMIT_EXCEEDED: '超内存', COMPILE_ERROR: '编译错误', RUNTIME_ERROR: '运行错误',
    QUEUING: '排队中', JUDGING: '评测中', PENDING: '等待中', NOT_SUBMITTED: '未提交',
    NOT_STARTED: '未开始', EXPIRED: '已截止', COMPLETED: '已完成', LATE: '已补交',
    IN_PROGRESS: '进行中', SETTLED: '已结算',
  };
  return labels[status] || status;
}
function statusClass(status: string) {
  if (status === 'ACCEPTED' || status === 'COMPLETED' || status === 'SETTLED') return 'ok';
  if (status === 'LATE_ACCEPTED' || status === 'LATE') return 'pending';
  if (status === 'NOT_SUBMITTED' || status === 'NOT_STARTED' || status === 'EXPIRED') return 'muted';
  if (['QUEUING', 'JUDGING', 'PENDING', 'IN_PROGRESS'].includes(status)) return 'pending';
  return 'bad';
}
function formatImportMessage(data: { added: number; skipped: number; notFound?: string[]; alreadyInClass?: string[]; duplicatedInput?: string[]; invalidRole?: string[] }) {
  const parts = [`导入完成：成功 ${data.added} 人，跳过 ${data.skipped} 人`];
  if (data.notFound?.length) parts.push(`未找到：${data.notFound.join('、')}`);
  if (data.alreadyInClass?.length) parts.push(`已在班级：${data.alreadyInClass.join('、')}`);
  if (data.duplicatedInput?.length) parts.push(`重复输入：${data.duplicatedInput.join('、')}`);
  if (data.invalidRole?.length) parts.push(`非学生账号：${data.invalidRole.join('、')}`);
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
  reports.value = [];
  selectedAssignmentIds.value = [];
  assignmentPickerOpen.value = false;
  if (editingAssignmentId.value) resetAssignmentBuilder();
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
  if (panel === 'assignment') {
    void loadProblemMetadata();
    void searchProblems(1);
  }
  if (panel === 'history') {
    void loadAssignments();
  }
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
    showMessage(selectedClass.value?.joinCode ? '新班级码已生效，旧班级码已失效' : '班级码已生成');
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
function problemSourceLabel(problem: ProblemItem) {
  const source = problem.sourceInfo?.platform || problem.source || 'LOCAL';
  return source === 'LOCAL' ? '原创' : source;
}
function problemDifficultyLabel(problem: ProblemItem) {
  return pointDifficultyShortLabel(problem.difficulty || '');
}
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
  const requestId = ++problemSearchRequest;
  problemSearching.value = true;
  try {
    const params: Record<string, string | number> = {
      page,
      pageSize: problemPageSize,
      status: 'PUBLISHED',
    };
    if (problemKeyword.value.trim()) params.keyword = problemKeyword.value.trim();
    if (problemSource.value) params.source = problemSource.value;
    if (problemDifficulty.value) params.difficulty = problemDifficulty.value;
    if (problemTag.value) params.tag = problemTag.value;
    const { data } = await api.get<ProblemResponse>('/api/problems', { params });
    if (requestId !== problemSearchRequest) return;
    problemResults.value = data.items || [];
    problemTotal.value = data.total || 0;
    problemPage.value = Math.min(data.page || page, Math.max(1, Math.ceil(problemTotal.value / problemPageSize)));
  } catch (e: any) {
    if (requestId === problemSearchRequest) showMessage('加载题目失败：' + (e.response?.data?.message || e.message));
  } finally {
    if (requestId === problemSearchRequest) problemSearching.value = false;
  }
}
function resetProblemPage() {
  problemPage.value = 1;
  void searchProblems(1);
}
function selectProblemDifficulty(value: string) {
  problemDifficulty.value = value;
  resetProblemPage();
}
function toggleAssignmentProblem(problem: ProblemItem) {
  selectedProblems.value = toggleProblem(selectedProblems.value, problem);
}
function toggleCurrentProblemPage() {
  selectedProblems.value = setCurrentPageSelected(
    selectedProblems.value,
    problemResults.value,
    !currentPageFullySelected.value,
  );
}
function removeProblem(problemId: string) { selectedProblems.value = selectedProblems.value.filter((item) => item.id !== problemId); }
function clearSelectedProblems() { selectedProblems.value = []; }

function resetAssignmentBuilder() {
  editingAssignmentId.value = '';
  assignmentTitle.value = '';
  assignmentDescription.value = '';
  assignmentEndTime.value = '';
  assignmentAllowLate.value = false;
  assignmentLatePenalty.value = 0;
  assignmentPassCondition.value = 'ALL';
  assignmentCountExternalAc.value = false;
  selectedProblems.value = [];
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function assignmentLifecycleLabel(lifecycle?: string) {
  const map: Record<string, string> = {
    NOT_STARTED: '未开始',
    IN_PROGRESS: '进行中',
    CLOSED: '已截止',
    LATE_OPEN: '补交中',
  };
  return map[lifecycle || ''] || lifecycle || '未知';
}

function beginCreateAssignment() {
  resetAssignmentBuilder();
  activePanel.value = 'assignment';
  if (!problemResults.value.length) void searchProblems(1);
}

function startEditAssignment(item: AssignmentItem) {
  editingAssignmentId.value = item.id;
  assignmentTitle.value = item.title || '';
  assignmentDescription.value = item.description || '';
  assignmentEndTime.value = toLocalDateTimeInput(item.endTime);
  assignmentAllowLate.value = Boolean(item.allowLate);
  assignmentLatePenalty.value = Number(item.latePenalty) || 0;
  assignmentPassCondition.value = item.passCondition || 'ALL';
  assignmentCountExternalAc.value = Boolean(item.countExternalAc);
  selectedProblems.value = (item.problems || [])
    .map((entry) => entry.problem)
    .filter((problem): problem is ProblemItem => Boolean(problem?.id));
  activePanel.value = 'assignment';
  if (!problemResults.value.length) void searchProblems(1);
  showMessage(`正在编辑作业：${item.title}`);
}

function cancelEditAssignment() {
  resetAssignmentBuilder();
  showMessage('已取消编辑，可继续发布新作业');
}

async function createAssignment() {
  if (!assignmentTitle.value.trim()) return showMessage('请输入作业标题');
  if (!selectedProblems.value.length) return showMessage('请至少选择一道题目');
  assignmentSaving.value = true;
  try {
    if (editingAssignmentId.value) {
      await api.patch(`/api/teacher/assignments/${editingAssignmentId.value}`, {
        title: assignmentTitle.value.trim(),
        description: assignmentDescription.value.trim(),
        endTime: assignmentEndTime.value ? new Date(assignmentEndTime.value).toISOString() : undefined,
        problemIds: selectedProblems.value.map((item) => item.id),
        allowLate: assignmentAllowLate.value,
        latePenalty: Number(assignmentLatePenalty.value) || 0,
        passCondition: assignmentPassCondition.value || 'ALL',
        countExternalAc: assignmentCountExternalAc.value,
      });
      showMessage('作业已更新');
    } else {
      await api.post('/api/teacher/assignments', {
        classId: selectedClassId.value,
        title: assignmentTitle.value.trim(),
        description: assignmentDescription.value.trim(),
        endTime: assignmentEndTime.value ? new Date(assignmentEndTime.value).toISOString() : undefined,
        problemIds: selectedProblems.value.map((item) => item.id),
        allowLate: assignmentAllowLate.value,
        latePenalty: Number(assignmentLatePenalty.value) || 0,
        passCondition: assignmentPassCondition.value || 'ALL',
        countExternalAc: assignmentCountExternalAc.value,
      });
      showMessage('作业已发布');
    }
    resetAssignmentBuilder();
    await loadAssignments();
  } catch (e: any) {
    showMessage((editingAssignmentId.value ? '更新作业失败：' : '发布作业失败：') + (e.response?.data?.message || e.message));
  } finally {
    assignmentSaving.value = false;
  }
}

async function deleteAssignment(item: AssignmentItem) {
  if (!window.confirm(`确定删除作业「${item.title}」吗？学生进度记录也会一并删除。`)) return;
  deletingAssignmentId.value = item.id;
  try {
    await api.delete(`/api/teacher/assignments/${item.id}`);
    if (editingAssignmentId.value === item.id) resetAssignmentBuilder();
    selectedAssignmentIds.value = selectedAssignmentIds.value.filter((id) => id !== item.id);
    reports.value = reports.value.filter((report) => report.assignment.id !== item.id);
    showMessage('作业已删除');
    await loadAssignments();
  } catch (e: any) {
    showMessage('删除作业失败：' + (e.response?.data?.message || e.message));
  } finally {
    deletingAssignmentId.value = '';
  }
}
async function loadAssignments() {
  if (!selectedClassId.value) return;
  assignmentsLoading.value = true;
  try {
    const { data } = await api.get(`/api/teacher/classes/${selectedClassId.value}/assignments`);
    assignments.value = data;
    const validIds = new Set((data as AssignmentItem[]).map((item) => item.id));
    selectedAssignmentIds.value = selectedAssignmentIds.value.filter((id) => validIds.has(id));
    if (!selectedAssignmentIds.value.length) reports.value = [];
  }
  catch (e: any) { showMessage('加载作业失败：' + (e.response?.data?.message || e.message)); }
  finally { assignmentsLoading.value = false; }
}
function toggleReportAssignment(assignmentId: string) {
  const selected = new Set(selectedAssignmentIds.value);
  if (selected.has(assignmentId)) selected.delete(assignmentId);
  else selected.add(assignmentId);
  selectedAssignmentIds.value = assignments.value
    .map((item) => item.id)
    .filter((id) => selected.has(id));
  if (!selectedAssignmentIds.value.length) reports.value = [];
}
function selectAllReportAssignments() {
  selectedAssignmentIds.value = assignments.value.map((item) => item.id);
}
function clearReportAssignments() {
  selectedAssignmentIds.value = [];
  reports.value = [];
}
function matchesReportStudent(
  student: AssignmentReport['students'][number],
  options: { keyword?: string; status?: string; completion?: 'all' | 'completed' | 'incomplete' } = {},
) {
  const keyword = (options.keyword || '').trim().toLowerCase();
  if (keyword) {
    const name = `${student.user.username} ${student.user.nickname || ''}`.toLowerCase();
    if (!name.includes(keyword)) return false;
  }
  if (options.status && (student.status || '') !== options.status) return false;
  if (options.completion === 'completed' && !student.completed) return false;
  if (options.completion === 'incomplete' && student.completed) return false;
  return true;
}
function filteredReportStudents(report: AssignmentReport) {
  return report.students.filter((student) => matchesReportStudent(student, {
    keyword: reportKeyword.value,
    status: reportStatus.value,
    completion: reportCompletion.value,
  }));
}
async function loadReport(assignmentIds = selectedAssignmentIds.value) {
  if (!assignmentIds.length) {
    reports.value = [];
    return;
  }
  reportLoading.value = true;
  try {
    // Multi-select loads full student progress so the combined summary can count
    // completed assignments accurately; detail tables filter client-side.
    const multi = assignmentIds.length > 1;
    const params = multi
      ? {}
      : {
        keyword: reportKeyword.value || undefined,
        status: reportStatus.value || undefined,
        completion: reportCompletion.value === 'all' ? undefined : reportCompletion.value,
      };
    const results = await Promise.all(assignmentIds.map(async (assignmentId) => {
      const { data } = await api.get<AssignmentReport>(`/api/teacher/assignments/${assignmentId}/report`, { params });
      return data;
    }));
    reports.value = results;
  }
  catch (e: any) { showMessage('加载作业情况失败：' + (e.response?.data?.message || e.message)); }
  finally { reportLoading.value = false; }
}
function downloadCombinedReportCsv() {
  if (!showCombinedReport.value || !combinedReportRows.value.length) return false;
  const assignmentTitles = reports.value.map((item) => item.assignment.title);
  const header = ['用户名', '昵称', '完成作业数', '作业总数', '总得分', ...assignmentTitles.flatMap((title) => [
    `${title}-状态`,
    `${title}-完成题数`,
    `${title}-得分`,
  ])];
  const lines = [header];
  for (const row of combinedReportRows.value) {
    lines.push([
      row.user.username,
      row.user.nickname || '',
      String(row.completedAssignments),
      String(row.totalAssignments),
      String(row.totalScore),
      ...row.byAssignment.flatMap((cell) => [
        cell.present ? cell.statusLabel : '无数据',
        // Excel treats bare 1/2 as a date; force text via ="1/2".
        cell.present ? excelSafeFraction(cell.solvedCount, cell.totalProblems) : '-',
        cell.present ? String(cell.score) : '-',
      ]),
    ]);
  }
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = `﻿${lines.map((line) => line.map(escape).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `combined-assignment-report-${selectedClass.value?.name || 'class'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
function exportCombinedReportCsv() {
  if (!downloadCombinedReportCsv()) return showMessage('请先选择多项作业并生成报告');
  showMessage('跨作业汇总 CSV 已开始下载');
}
async function exportSingleAssignmentCsv(assignmentId: string, title?: string) {
  if (!assignmentId) return showMessage('请先选择作业');
  try {
    const params = {
      keyword: reportKeyword.value || undefined,
      status: reportStatus.value || undefined,
      completion: reportCompletion.value === 'all' ? undefined : reportCompletion.value,
    };
    const { data } = await api.get(`/api/teacher/assignments/${assignmentId}/report.csv`, {
      params,
      responseType: 'blob',
    });
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = (title || assignmentId).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
    link.download = `assignment-${safeTitle}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showMessage(`「${title || '作业'}」CSV 已开始下载`);
  } catch (e: any) {
    showMessage('导出失败：' + (e.response?.data?.message || e.message));
  }
}
async function settleCurrentAssignment() {
  if (!selectedAssignmentIds.value.length) return;
  const count = selectedAssignmentIds.value.length;
  if (!window.confirm(count > 1
    ? `确认结算已选的 ${count} 项作业？结算后自动进度更新将锁定。`
    : '确认结算该作业？结算后自动进度更新将锁定。')) return;
  try {
    await Promise.all(selectedAssignmentIds.value.map((assignmentId) => (
      api.post(`/api/teacher/assignments/${assignmentId}/settle`)
    )));
    showMessage(count > 1 ? `已结算 ${count} 项作业` : '作业已结算');
    await loadReport();
  } catch (e: any) {
    showMessage('结算失败：' + (e.response?.data?.message || e.message));
  }
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
      <section class="class-list-section" aria-label="当前班级">
        <span class="class-switcher-label">当前班级</span>
        <div v-if="classes.length" class="class-list" role="list">
          <button v-for="item in classes" :key="item.id" type="button" role="listitem" class="class-list-item" :class="{ selected: selectedClassId === item.id }" :title="sidebarCollapsed ? item.name : undefined" @click="selectClass(item.id)">
            <i>{{ item.name.slice(0, 1) }}</i>
            <span><strong>{{ item.name }}</strong><small>{{ item.memberCount || 0 }} 名学生</small></span>
            <Check v-if="selectedClassId === item.id" :size="15" />
          </button>
        </div>
        <p v-else class="class-list-empty">暂无可选班级</p>
      </section>
    </aside>

    <main class="workspace-main">
      <header class="workspace-hero">
        <div><p>TEACHING WORKSPACE</p><h1>{{ activePanel === 'overview' ? '我的班级' : selectedClass?.name || '班级管理' }}</h1><span>{{ activePanel === 'overview' ? '查看班级状态与教学概况，再进入具体功能。' : panels.find((item) => item.id === activePanel)?.label }}</span></div>
        <div class="hero-facts"><div><strong>{{ classes.length }}</strong><small>班级</small></div><div><strong>{{ totalMembers }}</strong><small>学生</small></div></div>
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
            <section class="surface code-surface"><div class="surface-title"><span><KeyRound :size="18" /></span><div><h3>班级码</h3><p>{{ selectedClass?.status === 'APPROVED' ? '每个班级仅保留一个班级码；生成新码后旧码立即失效。' : '班级通过管理员审核后才能启用。' }}</p></div></div><div class="code-value" :class="{ inactive: !selectedClass?.joinCode }">{{ selectedClass?.joinCode || '未启用' }}</div><p class="code-expiry"><Clock3 :size="15" />{{ selectedClass?.joinCode ? `有效至 ${formatDate(selectedClass.joinCodeExpiresAt)}` : '当前没有班级码' }}</p><label>有效期<input v-model="joinCodeExpiresAt" type="datetime-local" :disabled="selectedClass?.status !== 'APPROVED'"></label><div class="button-row"><button class="primary-command" :disabled="joinCodeSaving || selectedClass?.status !== 'APPROVED'" @click="saveJoinCode"><RefreshCw :size="16" />{{ selectedClass?.joinCode ? '生成新码并作废旧码' : '生成班级码' }}</button><button v-if="selectedClass?.joinCode" class="secondary-command" @click="copyJoinCode"><Clipboard :size="16" />复制</button><button v-if="selectedClass?.joinCode" class="danger-command" title="停用班级码" @click="disableJoinCode"><X :size="17" /></button></div></section>
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
          <div class="view-heading">
            <div>
              <p>ASSIGNMENT BUILDER</p>
              <h2>{{ editingAssignmentId ? '编辑作业' : '发布作业' }}</h2>
              <span>{{ editingAssignmentId ? '可修改标题、规则、截止时间与题目列表。' : '从题库选择题目并设置截止时间。' }}</span>
            </div>
            <div class="report-actions">
              <button v-if="editingAssignmentId" class="secondary-command" type="button" @click="cancelEditAssignment">取消编辑</button>
              <button class="secondary-command" type="button" @click="activePanel = 'history'; void loadAssignments()">历史作业</button>
              <span class="selection-count">已选 {{ selectedProblems.length }} 题</span>
            </div>
          </div>
          <section class="surface assignment-builder">
            <div v-if="editingAssignmentId" class="edit-banner" role="status">
              正在编辑已发布作业。保存后会按新规则重算学生进度（已结算状态除外）。
            </div>
            <div class="form-grid">
              <label>作业标题<input v-model="assignmentTitle" placeholder="例如：第一周基础练习"></label>
              <label>截止时间<input v-model="assignmentEndTime" type="datetime-local"></label>
            </div>
            <div class="assignment-rules-panel" aria-label="作业规则">
              <div class="rules-heading">
                <strong>完成规则</strong>
                <span>与题库筛选组件同一套交互，发布后可再修改</span>
              </div>
              <div class="assignment-rules-grid">
                <label class="rule-field">
                  <span>通过条件</span>
                  <FilterSelect v-model="assignmentPassCondition" :options="passConditionOptions" label="通过条件" />
                </label>
                <label class="rule-field">
                  <span>迟交扣分 (%)</span>
                  <input
                    v-model.number="assignmentLatePenalty"
                    type="number"
                    min="0"
                    max="100"
                    :disabled="!assignmentAllowLate"
                    placeholder="0"
                  >
                </label>
              </div>
              <div class="rule-toggles" role="group" aria-label="作业开关">
                <button
                  type="button"
                  class="rule-toggle"
                  :class="{ active: assignmentAllowLate }"
                  :aria-pressed="assignmentAllowLate"
                  @click="assignmentAllowLate = !assignmentAllowLate"
                >
                  允许补交
                </button>
                <button
                  type="button"
                  class="rule-toggle"
                  :class="{ active: assignmentCountExternalAc }"
                  :aria-pressed="assignmentCountExternalAc"
                  @click="assignmentCountExternalAc = !assignmentCountExternalAc"
                >
                  外部 OJ AC 计入
                </button>
              </div>
            </div>
            <label>作业说明<textarea v-model="assignmentDescription" rows="3" placeholder="可选"></textarea></label>

            <div class="assignment-workspace">
              <section class="problem-bank" aria-label="题库选题">
                <header class="problem-bank-heading">
                  <div><strong>题库</strong><span>筛选后可批量加入当前作业</span></div>
                  <span>{{ problemSearching ? '正在加载' : `共 ${problemTotal} 题` }}</span>
                </header>
                <div class="problem-filter-row">
                  <label class="problem-keyword"><Search :size="16" /><input v-model="problemKeyword" placeholder="搜索题目标题、编号" @keyup.enter="resetProblemPage"></label>
                  <FilterSelect v-model="problemSource" :options="problemSourceOptions" label="按来源筛选" @update:model-value="resetProblemPage" />
                  <FilterSelect v-model="problemTag" :options="problemTagOptions" label="按标签筛选" @update:model-value="resetProblemPage" />
                </div>
                <div class="difficulty-filter" role="group" aria-label="按难度筛选">
                  <button type="button" :class="{ active: !problemDifficulty }" :aria-pressed="!problemDifficulty" @click="selectProblemDifficulty('')">全部难度</button>
                  <button v-for="item in pointDifficultyOptions" :key="item.value" type="button" :class="{ active: problemDifficulty === item.value }" :aria-pressed="problemDifficulty === item.value" @click="selectProblemDifficulty(item.value)">{{ item.level }}</button>
                </div>

                <div v-if="problemSearching" class="assignment-empty">正在加载题库...</div>
                <template v-else>
                  <div v-if="problemResults.length" class="assignment-table-wrap">
                    <table class="assignment-table">
                      <thead><tr><th><input type="checkbox" :checked="currentPageFullySelected" :aria-label="currentPageFullySelected ? '取消选择当前页' : '选择当前页'" @change="toggleCurrentProblemPage"></th><th>题目</th><th>来源</th><th>难度</th><th>标签</th></tr></thead>
                      <tbody>
                        <tr v-for="problem in problemResults" :key="problem.id" class="assignment-selectable-row" :class="{ selected: selectedProblemIds.has(problem.id) }" tabindex="0" :aria-label="`选择题目 ${problem.title}`" @click="toggleAssignmentProblem(problem)" @keydown.enter.prevent="toggleAssignmentProblem(problem)" @keydown.space.prevent="toggleAssignmentProblem(problem)">
                          <td><input type="checkbox" :checked="selectedProblemIds.has(problem.id)" :aria-label="`选择题目 ${problem.title}`" @click.stop @change="toggleAssignmentProblem(problem)"></td>
                          <td><strong>{{ problem.title }}</strong><small v-if="problem.sourceInfo?.remoteProblemId">{{ problem.sourceInfo.remoteProblemId }}</small></td>
                          <td>{{ problemSourceLabel(problem) }}</td>
                          <td><span class="problem-difficulty">{{ problemDifficultyLabel(problem) }}</span></td>
                          <td><span v-for="tag in problem.tags.slice(0, 2)" :key="tag.name" class="assignment-tag">{{ tag.name }}</span><span v-if="problem.tags.length > 2" class="assignment-tag">+{{ problem.tags.length - 2 }}</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <label v-if="problemResults.length" class="assignment-mobile-page-toggle">
                    <input type="checkbox" :checked="currentPageFullySelected" :aria-label="currentPageFullySelected ? '取消选择当前页' : '选择当前页'" @change="toggleCurrentProblemPage">
                    <span>{{ currentPageFullySelected ? '取消选择当前页' : '选择当前页全部题目' }}</span>
                  </label>
                  <div v-if="problemResults.length" class="assignment-mobile-list">
                    <label v-for="problem in problemResults" :key="problem.id" class="assignment-mobile-item" :class="{ selected: selectedProblemIds.has(problem.id) }">
                      <input type="checkbox" :checked="selectedProblemIds.has(problem.id)" :aria-label="`选择题目 ${problem.title}`" @change="toggleAssignmentProblem(problem)">
                      <span><strong>{{ problem.title }}</strong><small>{{ problemSourceLabel(problem) }} · {{ problemDifficultyLabel(problem) }}</small><em><i v-for="tag in problem.tags.slice(0, 2)" :key="tag.name">{{ tag.name }}</i></em></span>
                    </label>
                  </div>
                  <div v-if="!problemResults.length" class="assignment-empty">没有符合筛选条件的题目</div>
                </template>
                <footer class="assignment-pagination">
                  <button type="button" :disabled="problemPage <= 1 || problemSearching" @click="searchProblems(problemPage - 1)">上一页</button>
                  <span>第 {{ problemPage }} / {{ problemTotalPages }} 页</span>
                  <button type="button" :disabled="problemPage >= problemTotalPages || problemSearching" @click="searchProblems(problemPage + 1)">下一页</button>
                </footer>
              </section>

              <aside class="assignment-problem-set" aria-label="作业题单">
                <header><div><strong>作业题单</strong><span>已选 {{ selectedProblems.length }} 题</span></div><button v-if="selectedProblems.length" type="button" class="clear-problem-set" @click="clearSelectedProblems">清空</button></header>
                <div v-if="selectedProblems.length" class="problem-set-list">
                  <article v-for="problem in selectedProblems" :key="problem.id">
                    <div><strong>{{ problem.title }}</strong><span>{{ problemSourceLabel(problem) }} · {{ problemDifficultyLabel(problem) }}</span></div>
                    <button type="button" title="移除题目" :aria-label="`移除题目 ${problem.title}`" @click="removeProblem(problem.id)"><X :size="15" /></button>
                  </article>
                </div>
                <div v-else class="problem-set-empty">从左侧题库勾选题目</div>
                <footer class="builder-footer">
                  <span>{{ editingAssignmentId ? '保存后将重算未结算学生的进度' : '发布后同步至当前正式成员' }}</span>
                  <button
                    class="primary-command"
                    :disabled="!selectedProblems.length || assignmentSaving"
                    @click="createAssignment"
                  >
                    <BookOpenCheck :size="16" />
                    {{ assignmentSaving ? '保存中…' : (editingAssignmentId ? '保存修改' : '发布作业') }}
                  </button>
                </footer>
              </aside>
            </div>
          </section>
        </section>

        <section v-else-if="activePanel === 'history'" class="content-view">
          <div class="view-heading">
            <div>
              <p>ASSIGNMENT HISTORY</p>
              <h2>历史作业</h2>
              <span>查看本班已发布作业，支持修改题目/规则或删除。</span>
            </div>
            <div class="report-actions">
              <button class="secondary-command" type="button" :disabled="assignmentsLoading" @click="loadAssignments">
                <RefreshCw :size="16" />刷新
              </button>
              <button class="primary-command" type="button" @click="beginCreateAssignment">
                <Plus :size="16" />新建作业
              </button>
            </div>
          </div>

          <section class="surface history-surface">
            <div v-if="assignmentsLoading" class="surface-empty">正在加载历史作业…</div>
            <div v-else-if="!assignments.length" class="surface-empty">
              当前班级还没有发布过作业。
              <button class="primary-command" type="button" style="margin-top:12px" @click="beginCreateAssignment">去发布第一份作业</button>
            </div>
            <div v-else class="history-list">
              <article v-for="item in assignments" :key="item.id" class="history-card">
                <header>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.description || '暂无作业说明' }}</p>
                  </div>
                  <span class="history-lifecycle" :class="(item.lifecycle || '').toLowerCase()">
                    {{ assignmentLifecycleLabel(item.lifecycle) }}
                  </span>
                </header>
                <div class="history-meta">
                  <span>题目 {{ item.summary?.problemCount ?? item._count?.problems ?? item.problems?.length ?? 0 }} 道</span>
                  <span>学生 {{ item.summary?.studentCount ?? item._count?.students ?? 0 }} 人</span>
                  <span>完成 {{ item.summary?.completedStudents ?? 0 }} 人</span>
                  <span>截止 {{ formatDate(item.endTime) }}</span>
                  <span>{{ item.allowLate ? `允许补交 · 扣 ${item.latePenalty || 0}%` : '不允许补交' }}</span>
                  <span>{{ item.countExternalAc ? '计入外部 AC' : '仅站内提交' }}</span>
                </div>
                <div v-if="item.problems?.length" class="history-problems">
                  <span v-for="entry in item.problems.slice(0, 8)" :key="entry.problem?.id || entry.problem?.title">
                    {{ entry.problem?.title || '题目' }}
                  </span>
                  <span v-if="(item.problems?.length || 0) > 8">+{{ (item.problems?.length || 0) - 8 }}</span>
                </div>
                <footer>
                  <button class="secondary-command" type="button" @click="startEditAssignment(item)">
                    修改
                  </button>
                  <button
                    class="secondary-command"
                    type="button"
                    @click="selectedAssignmentIds = [item.id]; activePanel = 'report'; void loadReport([item.id])"
                  >
                    查看报告
                  </button>
                  <button
                    class="danger-command"
                    type="button"
                    :disabled="deletingAssignmentId === item.id"
                    @click="deleteAssignment(item)"
                  >
                    <Trash2 :size="15" />
                    {{ deletingAssignmentId === item.id ? '删除中…' : '删除' }}
                  </button>
                </footer>
              </article>
            </div>
          </section>
        </section>

        <section v-else class="content-view">
          <div class="view-heading">
            <div>
              <p>ASSIGNMENT REPORT</p>
              <h2>作业报告</h2>
              <span>可一次选择多项作业查看完成情况，支持筛选与导出。</span>
            </div>
            <div class="report-actions">
              <button class="secondary-command" :disabled="!showCombinedReport" @click="exportCombinedReportCsv"><Download :size="16" />导出汇总 CSV</button>
              <button class="secondary-command" :disabled="!hasSelectedAssignments" @click="settleCurrentAssignment">结算作业</button>
              <button class="primary-command" :disabled="!hasSelectedAssignments || reportLoading" @click="loadReport()"><BarChart3 :size="16" />{{ reportLoading ? '生成中' : '生成报告' }}</button>
            </div>
          </div>

          <section class="surface report-filter-surface">
            <div class="report-filter-row">
              <label class="rule-field report-assignment-field">
                <span>作业（可多选）</span>
                <div ref="assignmentPickerRoot" class="assignment-picker" :class="{ open: assignmentPickerOpen }">
                  <button
                    type="button"
                    class="assignment-picker-trigger"
                    :aria-expanded="assignmentPickerOpen"
                    aria-haspopup="listbox"
                    @click="assignmentPickerOpen = !assignmentPickerOpen"
                  >
                    <span>{{ selectedAssignmentLabel }}</span>
                    <ChevronDown :size="17" :class="{ rotated: assignmentPickerOpen }" />
                  </button>
                  <div v-if="assignmentPickerOpen" class="assignment-picker-menu" role="listbox" aria-multiselectable="true">
                    <div class="assignment-picker-toolbar">
                      <button type="button" :disabled="!assignments.length" @click="selectAllReportAssignments">全选</button>
                      <button type="button" :disabled="!hasSelectedAssignments" @click="clearReportAssignments">清空</button>
                    </div>
                    <button
                      v-for="item in reportAssignmentOptions"
                      :key="item.value"
                      type="button"
                      class="assignment-picker-option"
                      :class="{ selected: selectedAssignmentIdSet.has(item.value) }"
                      role="option"
                      :aria-selected="selectedAssignmentIdSet.has(item.value)"
                      @click="toggleReportAssignment(item.value)"
                    >
                      <span>{{ item.label }}</span>
                      <Check v-if="selectedAssignmentIdSet.has(item.value)" :size="16" />
                    </button>
                    <p v-if="!reportAssignmentOptions.length" class="assignment-picker-empty">当前班级还没有作业</p>
                  </div>
                </div>
              </label>
              <label class="problem-keyword report-search">
                <Search :size="16" />
                <input v-model="reportKeyword" placeholder="搜索学生用户名或昵称" @keyup.enter="loadReport()">
              </label>
              <FilterSelect v-model="reportStatus" :options="reportStatusOptions" label="按状态筛选" />
              <FilterSelect
                v-model="reportCompletion"
                :options="reportCompletionOptions"
                label="按完成度筛选"
              />
            </div>
          </section>

          <div v-if="reports.length" class="report-list">
            <section v-if="showCombinedReport && combinedReportSummary" class="surface report-surface combined-report-surface">
              <div class="report-summary">
                <div><strong>跨作业汇总</strong><span>{{ combinedReportSummary.publishDateLabel }}</span></div>
                <div><strong>{{ combinedReportSummary.studentCount }}</strong><span>汇总学生</span></div>
                <div><strong>{{ combinedReportSummary.assignmentCount }}</strong><span>所选作业</span></div>
                <div><strong>{{ combinedReportSummary.fullCompleted }}</strong><span>全部完成</span></div>
                <div><strong>{{ combinedReportSummary.averageCompleted }}</strong><span>人均完成作业数</span></div>
              </div>
              <div v-if="!combinedReportRows.length" class="surface-empty">没有符合筛选条件的学生</div>
              <div v-else class="report-table">
                <table>
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>完成作业</th>
                      <th>总得分</th>
                      <th v-for="report in reports" :key="`h-${report.assignment.id}`">{{ report.assignment.title }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in combinedReportRows" :key="row.user.id">
                      <td>
                        <span class="member-name">
                          <i>{{ (row.user.nickname || row.user.username).slice(0, 1).toUpperCase() }}</i>
                          {{ row.user.nickname || row.user.username }}
                        </span>
                      </td>
                      <td>
                        <strong class="combined-count">{{ row.completedAssignments }}/{{ row.totalAssignments }}</strong>
                      </td>
                      <td>{{ row.totalScore }}</td>
                      <td v-for="cell in row.byAssignment" :key="`${row.user.id}-${cell.assignmentId}`">
                        <span class="judge-state" :class="statusClass(cell.completed ? 'COMPLETED' : cell.status)">{{ cell.statusLabel }}</span>
                        <small v-if="cell.present">{{ cell.solvedCount }}/{{ cell.totalProblems }} · {{ cell.score }} 分</small>
                        <small v-else>未计入本次筛选</small>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section v-for="report in reports" :key="report.assignment.id" class="surface report-surface">
              <div class="report-summary report-summary-assignment">
                <div class="report-title-cell"><strong>{{ report.assignment.title }}</strong><span>{{ formatPublishDate(report.assignment.startTime) }}</span></div>
                <div><strong>{{ report.summary.completedStudents }}/{{ report.summary.studentCount }}</strong><span>完成人数</span></div>
                <div><strong>{{ report.summary.problemCount }}</strong><span>题目数</span></div>
                <div class="report-export-cell">
                  <button
                    class="secondary-command report-export-button"
                    type="button"
                    @click="exportSingleAssignmentCsv(report.assignment.id, report.assignment.title)"
                  >
                    <Download :size="16" />导出 CSV
                  </button>
                </div>
              </div>
              <div v-if="!filteredReportStudents(report).length" class="surface-empty">没有符合筛选条件的学生</div>
              <div v-else class="report-table">
                <table>
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>状态</th>
                      <th>完成</th>
                      <th>得分</th>
                      <th v-for="problem in report.problems" :key="problem.id">{{ problem.title }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="student in filteredReportStudents(report)" :key="student.user.id">
                      <td>
                        <span class="member-name">
                          <i>{{ (student.user.nickname || student.user.username).slice(0, 1).toUpperCase() }}</i>
                          {{ student.user.nickname || student.user.username }}
                        </span>
                      </td>
                      <td><span class="judge-state" :class="statusClass(student.status || '')">{{ student.statusLabel || statusLabel(student.status || '') }}</span></td>
                      <td>{{ student.solvedCount }}/{{ student.totalProblems }}</td>
                      <td>{{ student.score ?? 0 }}</td>
                      <td v-for="problem in student.problems" :key="problem.problemId">
                        <span class="judge-state" :class="statusClass(problem.status)">{{ statusLabel(problem.status) }}</span>
                        <small v-if="problem.attempts">{{ problem.attempts }} 次</small>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <div v-else class="empty-state">{{ hasSelectedAssignments ? '点击「生成报告」查看所选作业完成情况' : '选择一个或多个作业查看完成情况' }}</div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.teacher-workspace { --navy:#173b66; --blue:#2469ad; --pale:#eaf3fc; --ink:#203147; --muted:#728196; --line:#dfe7ef; --surface:#fff; --surface-low:#f7fbff; --outline:#cbd9e6; --primary:#2469ad; --primary-strong:#174f84; --primary-container:#e7efff; display:flex; min-height:calc(100vh - 56px); color:var(--ink); background:#f3f5f7; font-family:'Manrope Variable','Noto Sans SC Variable',sans-serif; }
.workspace-sidebar { position:sticky; top:56px; width:264px; height:calc(100vh - 56px); flex:0 0 264px; padding:22px 14px; border-right:1px solid var(--line); background:#f8fbfe; }
.sidebar-brand { display:flex; align-items:center; gap:10px; padding:0 7px 18px; }.sidebar-brand>span { display:grid; width:38px; height:38px; place-items:center; border-radius:8px; color:#fff; background:var(--navy); }.sidebar-brand div { display:grid; gap:2px; }.sidebar-brand strong { font-size:14px; }.sidebar-brand small,.workspace-nav small { color:#8b98a9; font-size:10px; }.sidebar-label { margin:7px 9px; color:#8a98a8; font-size:10px; font-weight:900; }
.workspace-nav { display:grid; gap:4px; }.workspace-nav button { display:grid; grid-template-columns:22px minmax(0,1fr) auto; align-items:center; gap:9px; width:100%; min-height:48px; padding:7px 10px; border:0; border-radius:7px; color:#607187; text-align:left; background:transparent; cursor:pointer; }.workspace-nav button:hover { color:#1f5d94; background:#edf5fc; }.workspace-nav button.active { color:#fff; background:var(--navy); box-shadow:0 6px 14px rgba(23,59,102,.18); }.workspace-nav button span { display:grid; gap:2px; }.workspace-nav button strong { font-size:12px; }.workspace-nav button.active small { color:#cfdef0; }.workspace-nav b { display:grid; min-width:21px; height:20px; place-items:center; border-radius:6px; color:#8a5b00; background:#fff0bd; font-size:10px; }.sidebar-divider { height:1px; margin:16px 5px; background:var(--line); }.class-switcher { position:relative; display:grid; gap:7px; margin:0 7px; color:#718095; font-size:10px; font-weight:900; }.class-switcher-label { padding-left:2px; }.class-switcher-trigger { display:grid; grid-template-columns:32px minmax(0,1fr) 16px; min-height:50px; align-items:center; gap:8px; width:100%; padding:7px 8px; border:1px solid #cfdae5; border-radius:7px; color:#314a63; text-align:left; background:#fff; font:inherit; cursor:pointer; box-shadow:0 3px 8px rgba(23,59,102,.04); }.class-switcher-trigger:hover,.class-switcher-trigger[aria-expanded="true"] { border-color:#7fa9ce; box-shadow:0 0 0 3px rgba(36,105,173,.08); }.class-switcher-trigger i,.class-switcher-menu button>i { display:grid; width:32px; height:32px; place-items:center; border-radius:6px; color:#fff; background:#2469ad; font-size:12px; font-style:normal; font-weight:900; }.class-switcher-trigger>span,.class-switcher-menu button>span { display:grid; gap:2px; min-width:0; }.class-switcher-trigger strong,.class-switcher-menu strong { overflow:hidden; color:#30465d; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }.class-switcher-trigger small,.class-switcher-menu small { color:#8492a2; font-size:9px; font-weight:650; }.class-switcher-trigger>svg { transition:transform .16s; }.class-switcher-trigger>svg.rotated { transform:rotate(180deg); }.class-switcher-menu { position:absolute; z-index:20; top:calc(100% + 6px); left:0; display:grid; width:100%; max-height:250px; padding:5px; overflow-y:auto; border:1px solid #cfdae5; border-radius:7px; background:#fff; box-shadow:0 14px 30px rgba(23,59,102,.18); }.class-switcher-menu>p { margin:0; padding:14px 8px; color:#8a97a6; text-align:center; }.class-switcher-menu button { display:grid; grid-template-columns:32px minmax(0,1fr) 16px; align-items:center; gap:8px; width:100%; min-height:47px; padding:6px; border:0; border-radius:5px; color:#36506a; text-align:left; background:transparent; font:inherit; cursor:pointer; }.class-switcher-menu button:hover { background:#edf5fc; }.class-switcher-menu button.selected { background:#e5f1fc; }.class-switcher-menu button>i { color:#245f94; background:#dcecf9; }.class-switcher-menu small { display:flex; align-items:center; gap:4px; }.class-switcher-menu small b { width:6px; height:6px; border-radius:50%; background:#9aa6b3; }.class-switcher-menu small b.approved { background:#2b9a6d; }.class-switcher-menu small b.pending { background:#d69a27; }.class-switcher-menu small b.rejected { background:#c86159; }.class-switcher-menu button>svg { color:#2469ad; }.sidebar-overview { display:flex; align-items:center; gap:7px; width:calc(100% - 14px); margin:9px 7px 0; padding:8px 9px; border:0; color:#286195; background:transparent; font-weight:800; cursor:pointer; }
.workspace-main { min-width:0; flex:1; padding:26px 30px 64px; }.workspace-hero,.workspace-main>section,.workspace-main>.message-bar,.workspace-main>.empty-state { width:min(1160px,100%); margin-right:auto; margin-left:auto; }.workspace-hero { display:flex; min-height:158px; align-items:center; justify-content:space-between; gap:24px; padding:28px 34px; border-radius:8px; color:#fff; background:var(--navy); box-shadow:0 14px 32px rgba(23,59,102,.16); }.workspace-hero p,.view-heading p { margin:0 0 6px; color:#8fc2ec; font-size:10px; font-weight:900; }.workspace-hero h1 { margin:0; font-size:34px; letter-spacing:0; }.workspace-hero>div>span { display:block; margin-top:9px; color:#d8e7f5; font-size:13px; }.hero-facts { display:flex; border:1px solid rgba(255,255,255,.18); border-radius:8px; }.hero-facts div { display:grid; min-width:90px; gap:3px; padding:13px 16px; text-align:center; }.hero-facts div+div { border-left:1px solid rgba(255,255,255,.16); }.hero-facts strong { font-size:23px; }.hero-facts small { color:#bcd0e5; font-size:10px; }
.message-bar { position:relative; display:flex; align-items:center; justify-content:space-between; margin-top:15px; padding:10px 12px; border:1px solid #bad5ed; border-radius:6px; color:#245b8b; background:#edf7ff; font-size:13px; }.message-bar button { display:grid; width:26px; height:26px; place-items:center; border:0; color:inherit; background:transparent; cursor:pointer; }.overview-view,.content-view { margin-top:22px; }.view-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:16px; }.view-heading h2 { margin:0; font-size:25px; letter-spacing:0; }.view-heading>div>span { color:var(--muted); font-size:12px; }.create-class { display:flex; gap:8px; }.create-class input { width:250px; height:40px; padding:0 11px; border:1px solid #cad6e2; border-radius:6px; }.create-class button,.primary-command,.secondary-command,.danger-command { display:inline-flex; min-height:38px; align-items:center; justify-content:center; gap:7px; padding:0 13px; border-radius:6px; font:inherit; font-size:12px; font-weight:850; cursor:pointer; }.create-class button,.primary-command { border:0; color:#fff; background:var(--blue); }.secondary-command { border:1px solid #cbd9e6; color:#315c84; background:#fff; }.danger-command { width:38px; padding:0; border:1px solid #e8c4c0; color:#a13f37; background:#fff; }.primary-command:disabled,.secondary-command:disabled { opacity:.5; cursor:default; }
.class-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }.class-card { display:flex; min-height:222px; flex-direction:column; padding:18px; border:1px solid var(--line); border-radius:8px; color:var(--ink); text-align:left; background:#fff; cursor:pointer; transition:transform .18s,border-color .18s,box-shadow .18s; }.class-card:hover,.class-card.selected { border-color:#8eb8da; transform:translateY(-3px); box-shadow:0 12px 24px rgba(23,59,102,.09); }.class-card-top { display:flex; align-items:center; justify-content:space-between; }.class-initial { display:grid; width:42px; height:42px; place-items:center; border-radius:8px; color:#1c5e96; background:#dcecf9; font-size:18px; font-weight:900; }.class-state { padding:4px 7px; border-radius:5px; font-size:10px; font-weight:900; }.class-state.approved { color:#197050; background:#e4f5ec; }.class-state.pending { color:#916100; background:#fff2c8; }.class-state.rejected { color:#a34841; background:#fdecea; }.class-card h3 { margin:16px 0 5px; font-size:17px; }.class-card>p { margin:0; color:var(--muted); font-size:12px; }.class-meta { display:grid; gap:7px; margin-top:17px; color:#6d7c8e; font-size:11px; }.class-meta span { display:flex; align-items:center; gap:6px; }.class-card footer { display:flex; align-items:center; justify-content:space-between; margin-top:auto; padding-top:16px; color:#24669f; border-top:1px solid #edf1f5; font-size:12px; font-weight:900; }
.access-grid { display:grid; grid-template-columns:.8fr 1.2fr; gap:16px; }.surface { padding:19px; border:1px solid var(--line); border-radius:8px; background:#fff; box-shadow:0 7px 20px rgba(23,59,102,.04); }.surface-title { display:flex; align-items:center; gap:10px; }.surface-title>span { display:grid; width:36px; height:36px; place-items:center; border-radius:7px; color:#215d91; background:#e4f0fb; }.surface-title h3 { margin:0; font-size:15px; }.surface-title p { margin:3px 0 0; color:var(--muted); font-size:11px; }.code-value { margin:24px 0 8px; color:#174f84; font-family:Consolas,monospace; font-size:31px; font-weight:900; letter-spacing:3px; }.code-value.inactive { color:#8a97a6; font-family:inherit; font-size:24px; letter-spacing:0; }.code-expiry { display:flex; align-items:center; gap:6px; margin:0 0 19px; color:#738196; font-size:11px; }.code-surface label,.assignment-builder > label,.assignment-builder .form-grid > label { display:grid; gap:6px; color:#57687b; font-size:11px; font-weight:850; }.code-surface input,.assignment-builder .form-grid input,.assignment-builder > label > input,.assignment-builder > label > textarea,.import-surface textarea { width:100%; padding:9px 10px; border:1px solid #ced9e4; border-radius:8px; color:#293d54; background:#fff; font:inherit; }.button-row { display:flex; gap:8px; margin-top:13px; }.application-list { display:grid; gap:8px; margin-top:17px; }.application-list article { display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:10px; padding:11px; border:1px solid #e5ebf1; border-radius:7px; background:#fbfdff; }.student-avatar { display:grid; width:40px; height:40px; place-items:center; border-radius:50%; color:#235d92; background:#e3eef9; font-weight:900; }.application-list article>div { display:grid; gap:3px; min-width:0; }.application-list strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }.application-list small { color:#8491a1; font-size:10px; }.application-list footer { display:flex; gap:6px; }.application-list footer button { display:inline-flex; align-items:center; gap:4px; padding:6px 8px; border-radius:5px; background:#fff; font-size:11px; font-weight:850; cursor:pointer; }.approve { border:1px solid #b9ddca; color:#177245; }.reject { border:1px solid #ecc7c4; color:#a63b34; }
.surface-empty,.empty-state { display:grid; min-height:130px; place-items:center; align-content:center; gap:7px; color:#8794a3; text-align:center; font-size:12px; }.empty-state { min-height:260px; }.surface-empty.compact { min-height:50px; }.table-surface { padding:0; overflow:hidden; }.table-surface table,.report-table table { width:100%; border-collapse:collapse; }.table-surface th,.table-surface td,.report-table th,.report-table td { padding:12px 15px; text-align:left; border-bottom:1px solid #edf1f5; font-size:12px; }.table-surface th,.report-table th { color:#6f7d8d; background:#f7f9fb; font-size:10px; }.member-name { display:flex; align-items:center; gap:9px; font-weight:800; }.member-name i { display:grid; width:31px; height:31px; place-items:center; border-radius:50%; color:#245f94; background:#e5f0fb; font-style:normal; }.table-action { display:grid; width:32px; height:32px; place-items:center; margin-left:auto; border:0; border-radius:6px; color:#a3433b; background:#fff1ef; cursor:pointer; }.narrow-view { max-width:820px; margin-right:auto!important; margin-left:auto!important; }.import-mode { display:inline-grid; grid-template-columns:1fr 1fr; gap:3px; margin-bottom:10px; padding:3px; border:1px solid #d7e1eb; border-radius:7px; background:#e9eef3; }.import-mode button { display:inline-flex; min-width:130px; height:36px; align-items:center; justify-content:center; gap:7px; border:0; border-radius:5px; color:#66778b; background:transparent; font:inherit; font-size:11px; font-weight:850; cursor:pointer; }.import-mode button.active { color:#184f82; background:#fff; box-shadow:0 2px 6px rgba(23,59,102,.1); }.import-surface textarea { min-height:220px; margin-top:20px; resize:vertical; }.import-heading { display:flex; align-items:center; justify-content:space-between; gap:14px; }.template-command { flex:0 0 auto; }.format-strip { display:grid; grid-template-columns:repeat(4,1fr); margin-top:18px; border:1px solid #dce6ef; border-radius:7px; overflow:hidden; }.format-strip span { display:grid; gap:2px; padding:9px 11px; color:#738195; background:#f8fbfd; font-size:9px; }.format-strip span+span { border-left:1px solid #dce6ef; }.format-strip b { color:#365a7d; font-size:11px; }.file-input { position:absolute; width:1px; height:1px; overflow:hidden; opacity:0; pointer-events:none; }.excel-dropzone { display:grid; width:100%; min-height:158px; place-items:center; align-content:center; gap:7px; margin-top:14px; border:1px dashed #91b5d5; border-radius:7px; color:#52708d; background:#f4f9fd; font:inherit; cursor:pointer; transition:border-color .15s,background .15s,transform .15s; }.excel-dropzone:hover,.excel-dropzone.dragging { border-color:#2469ad; background:#e9f4fc; transform:translateY(-1px); }.excel-dropzone>span { display:grid; width:45px; height:45px; place-items:center; border-radius:50%; color:#fff; background:#2469ad; }.excel-dropzone strong { color:#294b6c; font-size:13px; }.excel-dropzone small { color:#8090a1; font-size:10px; }.excel-preview { margin-top:15px; border:1px solid #dce5ed; border-radius:7px; overflow:hidden; }.preview-summary { display:flex; align-items:center; gap:10px; padding:10px 12px; color:#68788b; background:#f7f9fb; font-size:10px; }.preview-summary strong { margin-right:auto; color:#304a64; font-size:12px; }.preview-summary span { padding:3px 6px; border-radius:4px; background:#e9eef3; }.preview-summary .preview-valid { color:#17704e; background:#e4f5ec; }.preview-summary .preview-error { color:#a43d36; background:#fdecea; }.preview-table-wrap { overflow-x:auto; }.preview-table-wrap table { width:100%; min-width:700px; border-collapse:collapse; }.preview-table-wrap th,.preview-table-wrap td { padding:9px 10px; border-top:1px solid #edf1f5; text-align:left; white-space:nowrap; font-size:10px; }.preview-table-wrap th { color:#718093; background:#fbfcfd; font-size:9px; }.preview-table-wrap tr.invalid td { background:#fff8f7; }.row-valid { color:#17704e; }.row-error { color:#a43d36; font-weight:750; }.preview-more { margin:0; padding:8px 12px; border-top:1px solid #edf1f5; color:#778698; background:#fbfcfd; font-size:10px; }.import-footer,.builder-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px; color:#7b8999; font-size:11px; }
.selection-count { padding:5px 9px; border-radius:5px; color:#225f96; background:#e5f1fc; font-size:11px; font-weight:900; }.form-grid { display:grid; grid-template-columns:1fr 260px; gap:12px; }.assignment-builder>label { margin-top:13px; }.assignment-builder textarea { resize:vertical; }.problem-search { display:grid; grid-template-columns:20px minmax(0,1fr) auto; align-items:center; gap:7px; margin-top:16px; padding:7px 7px 7px 10px; border:1px solid #cfdbe6; border-radius:7px; color:#7c8998; }.problem-search input { border:0; outline:0; }.problem-search button { height:32px; padding:0 12px; border:0; border-radius:5px; color:#fff; background:var(--navy); font-weight:800; cursor:pointer; }.problem-results { max-height:220px; margin-top:8px; overflow:auto; border:1px solid #d8e5f0; }.problem-results button { display:flex; width:100%; justify-content:space-between; gap:12px; padding:9px 11px; border:0; border-bottom:1px solid #eaf0f5; color:#314a63; text-align:left; background:#f8fbfe; cursor:pointer; }.problem-results small { color:#24669f; }.selected-problems { margin-top:17px; }.selected-problems>p { color:#586b7f; font-size:11px; font-weight:900; }.selected-problems>div { display:flex; flex-wrap:wrap; gap:7px; }.selected-problems span { display:inline-flex; align-items:center; gap:6px; padding:6px 8px; border:1px solid #cfe0ef; border-radius:6px; color:#315b81; background:#f3f8fd; font-size:11px; }.selected-problems span button { display:grid; place-items:center; border:0; color:#8b4a43; background:transparent; cursor:pointer; }
.report-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
.report-filter-surface { margin-bottom:14px; padding:16px 18px; }
.report-filter-row { display:grid; grid-template-columns:minmax(220px,1.2fr) minmax(180px,1fr) minmax(130px,.7fr) minmax(130px,.7fr); gap:10px; align-items:end; }
.report-search { width:100%; height:44px; }
.report-assignment-field { min-width:0; }
.assignment-picker { position:relative; width:100%; }
.assignment-picker-trigger { display:flex; width:100%; min-height:44px; align-items:center; justify-content:space-between; gap:10px; padding:0 12px; border:1px solid #ced9e4; border-radius:8px; color:#293d54; background:#fff; font:inherit; font-size:12px; font-weight:750; cursor:pointer; }
.assignment-picker-trigger:hover,.assignment-picker.open .assignment-picker-trigger { border-color:#81a9d0; box-shadow:0 0 0 3px rgba(36,105,173,.09); }
.assignment-picker-trigger>span { overflow:hidden; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
.assignment-picker-trigger>svg { flex:0 0 auto; color:#7a8a9b; transition:transform .16s; }
.assignment-picker-trigger>svg.rotated { transform:rotate(180deg); }
.assignment-picker-menu { position:absolute; z-index:30; top:calc(100% + 6px); left:0; display:grid; width:100%; max-height:280px; overflow:auto; padding:6px; border:1px solid #cfdae5; border-radius:10px; background:#fff; box-shadow:0 12px 30px rgba(23,59,102,.14),0 2px 7px rgba(23,59,102,.07); }
.assignment-picker-toolbar { display:flex; gap:6px; padding:2px 2px 8px; }
.assignment-picker-toolbar button { min-height:28px; padding:0 10px; border:1px solid #d7e1eb; border-radius:6px; color:#315c84; background:#f7fafd; font:inherit; font-size:11px; font-weight:800; cursor:pointer; }
.assignment-picker-toolbar button:disabled { opacity:.45; cursor:default; }
.assignment-picker-option { display:flex; width:100%; min-height:42px; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border:0; border-radius:7px; color:#314a63; text-align:left; background:transparent; font:inherit; font-size:12px; cursor:pointer; }
.assignment-picker-option:hover { background:#edf5fc; }
.assignment-picker-option.selected { color:#1f5eff; background:#e7efff; }
.assignment-picker-option>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.assignment-picker-empty { margin:0; padding:18px 8px; color:#8a97a6; text-align:center; font-size:12px; }
.report-filter-row :deep(.filter-select),
.rule-field :deep(.filter-select) { width:100%; }
.report-filter-row :deep(.filter-select__trigger),
.rule-field :deep(.filter-select__trigger) { width:100%; min-height:44px; }
.teacher-workspace :deep(.filter-select__menu) { border-radius:10px; box-shadow:0 12px 30px rgba(23,59,102,.14),0 2px 7px rgba(23,59,102,.07); }
.teacher-workspace :deep(.filter-select__option) { min-height:40px; border-radius:7px; color:#314a63; }
.teacher-workspace :deep(.filter-select__option.is-selected) { color:#1f5eff; background:#e7efff; }
.report-list { display:grid; gap:14px; }
.report-surface { padding:0; overflow:hidden; }
.combined-report-surface { border-color:#b7d0e8; box-shadow:0 10px 24px rgba(23,59,102,.08); }
.combined-count { color:#174f84; font-size:15px; }
.report-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; background:#dce5ed; }
.combined-report-surface > .report-summary { grid-template-columns:minmax(140px,1.2fr) repeat(4,minmax(0,1fr)); }
.report-summary-assignment { grid-template-columns:minmax(180px,1.4fr) minmax(100px,.8fr) minmax(90px,.7fr) minmax(130px,.9fr); }
.report-summary div { display:grid; gap:3px; padding:15px 17px; background:#f8fbfe; }
.report-summary strong { color:#214f79; font-size:16px; }
.report-summary span { color:#7e8b9a; font-size:10px; }
.report-title-cell strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:15px; }
.report-export-cell { align-content:center; justify-items:end; }
.report-export-button { min-height:34px; padding:0 12px; }
.report-table { overflow:auto; }
.report-table table { min-width:900px; }
.judge-state { display:inline-block; padding:3px 6px; border-radius:5px; font-size:10px; font-weight:800; }
.judge-state.ok { color:#17704e; background:#e5f5ec; }
.judge-state.bad { color:#a43d36; background:#fdecea; }
.judge-state.pending { color:#8a6200; background:#fff2c9; }
.judge-state.muted { color:#748293; background:#edf1f5; }
.report-table td small { display:block; margin-top:3px; color:#8995a3; font-size:9px; }
.assignment-rules-panel { margin-top:14px; padding:14px 15px; border:1px solid #dce5ed; border-radius:10px; background:#f8fbfd; }
.rules-heading { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; }
.rules-heading strong { color:#29475f; font-size:12px; }
.rules-heading span { color:#7c8998; font-size:10px; }
.assignment-rules-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }
.rule-field { display:grid !important; gap:6px; min-width:0; color:#57687b; font-size:11px; font-weight:850; }
.rule-field > span { color:#57687b; }
.rule-field input { width:100%; height:44px; padding:0 10px; border:1px solid #ced9e4; border-radius:8px; color:#293d54; background:#fff; font:inherit; }
.rule-field input:disabled { color:#9aa7b6; background:#f3f6f9; }
.rule-field input:focus { border-color:#81a9d0; outline:0; box-shadow:0 0 0 3px rgba(36,105,173,.09); }
.rule-toggles { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.rule-toggle { min-height:34px; padding:0 12px; border:1px solid #d7e1eb; border-radius:7px; color:#62768b; background:#fff; font:inherit; font-size:11px; font-weight:800; cursor:pointer; }
.rule-toggle:hover,.rule-toggle.active { border-color:#a9c7e2; color:#1f5eff; background:#e7efff; }
@media(max-width:980px){.teacher-workspace{display:block}.workspace-sidebar{position:static;width:auto;height:auto;padding:12px}.sidebar-brand,.sidebar-label,.sidebar-divider,.class-switcher,.sidebar-overview{display:none}.workspace-nav{grid-template-columns:repeat(3,1fr)}.workspace-nav button{grid-template-columns:20px 1fr}.workspace-nav button small,.workspace-nav button b{display:none}.workspace-main{padding:18px 16px 48px}.class-grid{grid-template-columns:repeat(2,1fr)}.access-grid{grid-template-columns:1fr}.report-filter-row{grid-template-columns:1fr 1fr}.report-assignment-field,.report-search{grid-column:1/-1}}
@media(max-width:620px){.workspace-nav{grid-template-columns:repeat(2,1fr)}.workspace-hero{align-items:flex-start;flex-direction:column;padding:22px}.workspace-hero h1{font-size:28px}.hero-facts{width:100%}.hero-facts div{min-width:0;flex:1}.view-heading,.create-class,.report-actions,.import-footer,.builder-footer,.import-heading{align-items:stretch;flex-direction:column}.report-actions .primary-command,.report-actions .secondary-command{width:100%}.create-class input{width:100%}.class-grid{grid-template-columns:1fr}.form-grid,.assignment-rules-grid,.report-filter-row{grid-template-columns:1fr}.application-list article{grid-template-columns:40px 1fr}.application-list footer{grid-column:1/-1}.report-summary{grid-template-columns:1fr}.import-mode{display:grid}.import-mode button{min-width:0}.format-strip{grid-template-columns:1fr 1fr}.format-strip span:nth-child(3){border-left:0;border-top:1px solid #dce6ef}.format-strip span:nth-child(4){border-top:1px solid #dce6ef}.excel-dropzone{min-height:140px;padding:18px}.preview-summary{align-items:flex-start;flex-wrap:wrap}.preview-summary strong{width:100%;margin:0}.preview-table-wrap table{min-width:0;table-layout:fixed}.preview-table-wrap th,.preview-table-wrap td{padding:8px 5px;white-space:normal;overflow-wrap:anywhere}.preview-table-wrap th:nth-child(1){width:26px}.preview-table-wrap th:nth-child(2){width:70px}.preview-table-wrap th:nth-child(3){width:52px}.preview-table-wrap th:nth-child(4),.preview-table-wrap td:nth-child(4),.preview-table-wrap th:nth-child(5),.preview-table-wrap td:nth-child(5){display:none}}
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

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.class-list-section {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 7px;
  margin: 0 7px;
  color: #718095;
  font-size: 10px;
  font-weight: 900;
}

.class-list {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 4px;
  overflow-y: auto;
  padding-right: 2px;
}

.class-list-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 16px;
  width: 100%;
  min-height: 48px;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #314a63;
  text-align: left;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.class-list-item:hover { background: #edf5fc; }
.class-list-item.selected { border-color: #c9dcf0; color: #1f5eff; background: #e7efff; }
.class-list-item > i { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 9px; color: #245f94; background: #dcecf9; font-size: 12px; font-style: normal; font-weight: 900; }
.class-list-item.selected > i { color: #fff; background: #1f5eff; }
.class-list-item > span { display: grid; min-width: 0; gap: 2px; }
.class-list-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.class-list-item small { color: #8492a2; font-size: 9px; font-weight: 650; }
.class-list-item > svg { color: #1f5eff; }
.class-list-empty { margin: 0; padding: 12px 6px; color: #8492a2; text-align: center; }

.assignment-builder { padding: 22px; }
.assignment-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 272px; align-items: start; gap: 18px; margin-top: 18px; }
.problem-bank { min-width: 0; }
.problem-bank-heading,.assignment-problem-set > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.problem-bank-heading > div,.assignment-problem-set > header > div { display: grid; gap: 3px; }
.problem-bank-heading strong,.assignment-problem-set strong { color: #29475f; font-size: 13px; }
.problem-bank-heading span,.assignment-problem-set header span { color: #7c8998; font-size: 10px; }
.problem-bank-heading > span { flex: 0 0 auto; padding: 4px 7px; border-radius: 999px; color: #245f94; background: #edf5fc; font-size: 10px; font-weight: 800; }
.problem-filter-row { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(130px, .62fr) minmax(130px, .62fr); gap: 8px; margin-top: 13px; }
.problem-keyword { display: flex !important; height: 44px; align-items: center; gap: 7px; padding: 0 10px; border: 1px solid #ced9e4; border-radius: 8px; color: #778697; background: #fff; }
.problem-keyword:focus-within { border-color: #81a9d0; box-shadow: 0 0 0 3px rgba(36, 105, 173, .09); }
.problem-keyword input { min-width: 0; height: auto; padding: 0; border: 0; outline: 0; }
.difficulty-filter { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.difficulty-filter button { min-width: 34px; height: 30px; padding: 0 8px; border: 1px solid #d7e1eb; border-radius: 7px; color: #62768b; background: #fff; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
.difficulty-filter button:hover,.difficulty-filter button.active { border-color: #a9c7e2; color: #1f5eff; background: #e7efff; }
.assignment-table-wrap { margin-top: 12px; overflow: auto; border: 1px solid #dce5ed; border-radius: 10px; }
.assignment-table { width: 100%; min-width: 660px; border-collapse: collapse; }
.assignment-table th,.assignment-table td { padding: 10px 11px; border-bottom: 1px solid #eaf0f5; color: #53677b; text-align: left; font-size: 11px; }
.assignment-table th { color: #718094; background: #f8fafc; font-size: 10px; }
.assignment-table th:first-child,.assignment-table td:first-child { width: 32px; text-align: center; }
.assignment-table tbody tr { transition: background .14s; }
.assignment-selectable-row { cursor: pointer; }
.assignment-table tbody tr:hover { background: #f7fbff; }
.assignment-table tbody tr.selected { background: #eef5ff; }
.assignment-selectable-row:focus-visible { position: relative; outline: 2px solid #1f5eff; outline-offset: -2px; }
.assignment-table td strong { display: block; color: #304a64; font-size: 12px; overflow-wrap: anywhere; }
.assignment-table td small { display: block; margin-top: 3px; color: #8794a2; font-size: 9px; }
.problem-difficulty { display: inline-flex; padding: 3px 5px; border-radius: 5px; color: #365d85; background: #edf4fa; font-size: 9px; white-space: nowrap; }
.assignment-tag { display: inline-block; max-width: 100px; margin: 2px 3px 2px 0; overflow: hidden; padding: 3px 5px; border-radius: 5px; color: #55708a; text-overflow: ellipsis; white-space: nowrap; background: #f0f3f6; font-size: 9px; }
.assignment-empty { display: grid; min-height: 160px; place-items: center; margin-top: 12px; border: 1px dashed #cfdce8; border-radius: 10px; color: #8492a1; font-size: 12px; }
.assignment-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 10px; color: #738297; font-size: 10px; }
.assignment-pagination button { min-height: 32px; padding: 0 10px; border: 1px solid #d4e0eb; border-radius: 7px; color: #315f88; background: #fff; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
.assignment-pagination button:disabled { opacity: .48; cursor: default; }
.assignment-problem-set { position: sticky; top: 76px; padding-left: 16px; border-left: 1px solid #dce5ed; }
.clear-problem-set { border: 0; color: #a43d36; background: transparent; font: inherit; font-size: 10px; font-weight: 850; cursor: pointer; }
.problem-set-list { display: grid; gap: 7px; max-height: 360px; margin-top: 13px; overflow-y: auto; }
.problem-set-list article { display: grid; grid-template-columns: minmax(0, 1fr) 30px; align-items: center; gap: 7px; padding: 9px 8px 9px 10px; border-left: 2px solid #9cc8f0; background: #f7fbff; }
.problem-set-list article > div { display: grid; min-width: 0; gap: 3px; }
.problem-set-list article strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.problem-set-list article span { overflow: hidden; color: #8290a0; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }
.problem-set-list article button { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 7px; color: #a3433b; background: #fff1ef; cursor: pointer; }
.problem-set-empty { display: grid; min-height: 144px; place-items: center; margin-top: 13px; border: 1px dashed #d1dce6; color: #8a97a5; text-align: center; font-size: 11px; }
.assignment-problem-set .builder-footer { align-items: stretch; flex-direction: column; margin-top: 14px; }
.assignment-problem-set .builder-footer .primary-command { width: 100%; }
.assignment-mobile-list,.assignment-builder .assignment-mobile-page-toggle { display: none; }

.teacher-workspace.sidebar-collapsed .class-list-section { display: block; margin: 0; }
.teacher-workspace.sidebar-collapsed .class-list-section .class-switcher-label { display: none; }
.teacher-workspace.sidebar-collapsed .class-list { gap: 5px; overflow-y: auto; }
.teacher-workspace.sidebar-collapsed .class-list-item { grid-template-columns: 1fr; justify-items: center; padding: 7px 0; }
.teacher-workspace.sidebar-collapsed .class-list-item > span,.teacher-workspace.sidebar-collapsed .class-list-item > svg { display: none; }

@media(max-width:980px) {
  .workspace-sidebar { display: block; overflow: visible; }
  .teacher-workspace.sidebar-collapsed .workspace-sidebar { width: auto; flex-basis: auto; padding: 12px; }
  .class-list-section { display: block; margin: 10px 4px 0; }
  .class-switcher-label { display: none; }
  .class-list { display: flex; width: max-content; max-width: 100%; overflow-x: auto; overflow-y: hidden; padding: 0 2px 2px; }
  .class-list-item { width: 142px; min-height: 42px; flex: 0 0 142px; }
  .teacher-workspace.sidebar-collapsed .class-list-section { display: block; }
  .teacher-workspace.sidebar-collapsed .class-list { display: flex; overflow-x: auto; }
  .teacher-workspace.sidebar-collapsed .class-list-item { grid-template-columns: 32px minmax(0, 1fr) 16px; justify-items: stretch; padding: 6px 8px; }
  .teacher-workspace.sidebar-collapsed .class-list-item > span,.teacher-workspace.sidebar-collapsed .class-list-item > svg { display: grid; }
  .assignment-workspace { grid-template-columns: 1fr; }
  .assignment-problem-set { position: static; padding-top: 16px; padding-left: 0; border-top: 1px solid #dce5ed; border-left: 0; }
  .assignment-problem-set .builder-footer { align-items: center; flex-direction: row; }
  .assignment-problem-set .builder-footer .primary-command { width: auto; }
}

.edit-banner {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid #f0d9a8;
  border-radius: 8px;
  color: #8a5a10;
  background: #fff8ea;
  font-size: 12px;
  font-weight: 700;
}
.history-surface { padding: 16px; }
.history-list {
  display: grid;
  gap: 12px;
}
.history-card {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #dce5ed;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #f8fbfd 100%);
}
.history-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.history-card > header strong {
  display: block;
  color: #274860;
  font-size: 15px;
}
.history-card > header p {
  margin: 5px 0 0;
  color: #708295;
  font-size: 12px;
  line-height: 1.5;
}
.history-lifecycle {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  color: #245f94;
  background: #e8f2fb;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.history-lifecycle.in_progress { color: #0f766e; background: #e6f7f3; }
.history-lifecycle.not_started { color: #6b7280; background: #f1f3f5; }
.history-lifecycle.closed { color: #9a3412; background: #ffedd5; }
.history-lifecycle.late_open { color: #92400e; background: #fef3c7; }
.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.history-meta span {
  padding: 4px 8px;
  border-radius: 6px;
  color: #526579;
  background: #eef2f6;
  font-size: 11px;
  font-weight: 700;
}
.history-problems {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.history-problems span {
  max-width: 220px;
  overflow: hidden;
  padding: 4px 8px;
  border-radius: 999px;
  color: #315f88;
  background: #edf5fc;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-card > footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.history-card .danger-command {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

@media(max-width:620px) {
  .assignment-builder { padding: 16px; }
  .problem-filter-row { grid-template-columns: 1fr; }
  .difficulty-filter button { min-width: 38px; min-height: 36px; }
  .assignment-table-wrap { display: none; }
  .history-card > header { flex-direction: column; }
  .history-card > footer .secondary-command,
  .history-card > footer .danger-command { width: 100%; justify-content: center; }
  .assignment-builder .assignment-mobile-page-toggle { display: inline-flex; width: fit-content; min-height: 38px; align-items: center; gap: 8px; margin-top: 12px; padding: 0 10px; border: 1px solid #d5e2ed; border-radius: 8px; color: #315f88; background: #f7fbff; font-size: 11px; font-weight: 800; }
  .assignment-mobile-list { display: grid; gap: 7px; margin-top: 12px; }
  .assignment-mobile-item { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 9px; padding: 11px; border: 1px solid #dce5ed; border-radius: 10px; background: #fff; }
  .assignment-mobile-item.selected { border-color: #a9c7e2; background: #eef5ff; }
  .assignment-mobile-item > span { display: grid; min-width: 0; gap: 4px; }
  .assignment-mobile-item strong { overflow-wrap: anywhere; color: #304a64; font-size: 12px; }
  .assignment-mobile-item small { color: #7b8998; font-size: 10px; }
  .assignment-mobile-item em { display: flex; flex-wrap: wrap; gap: 4px; font-style: normal; }
  .assignment-mobile-item i { padding: 2px 5px; border-radius: 4px; color: #58718a; background: #f0f3f6; font-size: 9px; font-style: normal; }
  .assignment-pagination { justify-content: space-between; }
  .assignment-problem-set .builder-footer { align-items: stretch; flex-direction: column; }
  .assignment-problem-set .builder-footer .primary-command { width: 100%; }
}
</style>
