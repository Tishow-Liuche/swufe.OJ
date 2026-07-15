<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Download, FileSpreadsheet, GraduationCap, RefreshCw, UploadCloud, UsersRound } from '@lucide/vue';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import FilterSelect from '../../components/FilterSelect.vue';

type ClassInfo = { id: string; name: string; course?: { name: string } | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote?: string | null; members?: number; _count?: { members: number }; createdAt: string };
type StudentRow = { studentId: string; college: string; name: string; phone: string; email: string; valid: boolean; reason?: string };

const classes = ref<ClassInfo[]>([]);
const loading = ref(true);
const message = ref('');
const newClassName = ref('');
const importClassId = ref('');
const rows = ref<StudentRow[]>([]);
const dragging = ref(false);
const importing = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const approvedClasses = computed(() => classes.value.filter((item) => item.status === 'APPROVED'));
const approvedClassOptions = computed(() => [
  { value: '', label: '选择已审核通过的班级' },
  ...approvedClasses.value.map((item) => ({ value: item.id, label: item.name })),
]);
const invalidRows = computed(() => rows.value.filter((item) => !item.valid));
const selectedClass = computed(() => approvedClasses.value.find((item) => item.id === importClassId.value));

onMounted(loadClasses);

function statusText(status: ClassInfo['status']) { return ({ PENDING: '等待审核', APPROVED: '已启用', REJECTED: '未通过' } as Record<string, string>)[status]; }

async function loadClasses() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/teacher/classes');
    classes.value = data;
    if (importClassId.value && !approvedClasses.value.some((item) => item.id === importClassId.value)) importClassId.value = '';
  } catch (e: any) { message.value = '加载失败：' + (e.response?.data?.message || e.message); }
  finally { loading.value = false; }
}

async function createClass() {
  const name = newClassName.value.trim();
  if (!name) { message.value = '请填写班级名称'; return; }
  try {
    await api.post('/api/teacher/classes', { name });
    newClassName.value = '';
    message.value = '班级申请已提交，管理员审核通过后即可导入学生和发布作业。';
    await loadClasses();
  } catch (e: any) { message.value = '提交失败：' + (e.response?.data?.message || e.message); }
}

function normalize(value: unknown) { return String(value ?? '').trim(); }
function validateRow(raw: Record<string, unknown>): StudentRow {
  const studentId = normalize(raw['学号']); const college = normalize(raw['学院']); const name = normalize(raw['姓名']); const phone = normalize(raw['手机号']); const email = normalize(raw['邮箱']).toLowerCase();
  if (!/^\d{8}$/.test(studentId)) return { studentId, college, name, phone, email, valid: false, reason: '学号必须为 8 位数字' };
  if (!college) return { studentId, college, name, phone, email, valid: false, reason: '学院不能为空' };
  if (!name) return { studentId, college, name, phone, email, valid: false, reason: '姓名不能为空' };
  if (!/^1\d{10}$/.test(phone)) return { studentId, college, name, phone, email, valid: false, reason: '手机号须为 11 位大陆号码' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { studentId, college, name, phone, email, valid: false, reason: '邮箱格式不正确' };
  return { studentId, college, name, phone, email, valid: true };
}

async function readFile(file?: File) {
  if (!file) return;
  message.value = '';
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const headers = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0 })[0] || [];
    const required = ['学号', '学院', '姓名', '手机号', '邮箱'];
    if (required.some((key) => !headers.includes(key))) throw new Error('表头必须严格包含：学号、学院、姓名、手机号、邮箱');
    if (!data.length) throw new Error('Excel 中没有可导入的学生数据');
    const seen = new Set<string>();
    rows.value = data.map(validateRow).map((row) => {
      if (row.valid && seen.has(row.studentId)) return { ...row, valid: false, reason: '文件内学号重复' };
      seen.add(row.studentId); return row;
    });
    message.value = `已读取 ${rows.value.length} 行；${invalidRows.value.length ? `${invalidRows.value.length} 行需修正后再导入。` : '字段校验通过，可以一键导入。'}`;
  } catch (e: any) { rows.value = []; message.value = '文件读取失败：' + (e.message || '请使用 .xlsx、.xls 或 .csv 文件'); }
  finally { if (fileInput.value) fileInput.value.value = ''; }
}

function onDrop(event: DragEvent) { dragging.value = false; void readFile(event.dataTransfer?.files?.[0]); }
function chooseFile() { fileInput.value?.click(); }

function downloadTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([['学号', '学院', '姓名', '手机号', '邮箱'], ['xxxxxxxx', '计算机与人工智能学院', '示例同学', '13800000000', 'example@swufe.edu.cn']]);
  sheet['!cols'] = [{ wch: 13 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 30 }];
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '学生名单');
  XLSX.writeFile(book, '西财OJ_学生导入模板.xlsx');
}

async function importStudents() {
  if (!importClassId.value) { message.value = '请先选择已审核通过的班级'; return; }
  if (!rows.value.length || invalidRows.value.length) { message.value = '请先修正 Excel 中标记为异常的行'; return; }
  importing.value = true;
  try {
    const { data } = await api.post(`/api/teacher/classes/${importClassId.value}/import`, { students: rows.value.map(({ studentId, college, name, phone, email }) => ({ studentId, college, name, phone, email })) });
    message.value = `导入完成：新增 ${data.added} 人，更新 ${data.updated} 人，跳过 ${data.skipped} 人。仅新建账号的初始密码为学号；已有账号会保留原密码。`;
    rows.value = [];
    await loadClasses();
  } catch (e: any) { message.value = '导入失败：' + (e.response?.data?.message || e.message); }
  finally { importing.value = false; }
}
</script>

<template>
  <main class="class-page">
    <section class="hero">
      <div><p>TEACHING WORKSPACE</p><h1>班级管理</h1><span>先申请，后建班；统一学籍字段，让教学名单可追溯。</span></div>
      <button type="button" @click="loadClasses"><RefreshCw :size="16" aria-hidden="true" />刷新状态</button>
    </section>
    <p v-if="message" class="notice">{{ message }}</p>

    <section class="create-card">
      <div class="section-title"><span class="title-icon"><GraduationCap :size="19" /></span><div><h2>申请创建班级</h2><p>提交后由管理员审核；审核通过才可导入学生、布置作业。</p></div></div>
      <div class="create-row"><input v-model="newClassName" maxlength="80" placeholder="例如：2024级计算机科学与技术1班" @keyup.enter="createClass" /><button type="button" @click="createClass">提交审核</button></div>
    </section>

    <section class="import-card">
      <header class="section-title"><span class="title-icon gold"><FileSpreadsheet :size="19" /></span><div><h2>Excel 一键导入学生</h2><p>固定字段：学号、学院、姓名、手机号、邮箱。学号必须为 8 位数字。</p></div><button type="button" class="template" @click="downloadTemplate"><Download :size="15" />下载模板</button></header>
      <div class="import-toolbar"><FilterSelect v-model="importClassId" class="class-select" :options="approvedClassOptions" label="选择已审核通过的班级"><template #icon><UsersRound :size="16" aria-hidden="true" /></template></FilterSelect><span v-if="selectedClass">将导入至「{{ selectedClass.name }}」</span></div>
      <div class="drop-zone" :class="{ dragging }" role="button" tabindex="0" @dragenter.prevent="dragging = true" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop" @click="chooseFile" @keydown.enter.prevent="chooseFile">
        <UploadCloud :size="31" aria-hidden="true" /><strong>拖拽 Excel 文件到此处</strong><span>或点击选择 .xlsx / .xls / .csv 文件</span><input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="readFile(($event.target as HTMLInputElement).files?.[0])" />
      </div>
      <div v-if="rows.length" class="preview"><div class="preview-head"><strong>导入预览</strong><span>{{ rows.length }} 人 · <b :class="{ bad: invalidRows.length }">{{ invalidRows.length ? `${invalidRows.length} 行异常` : '全部通过' }}</b></span></div><div class="preview-table"><table><thead><tr><th>学号</th><th>学院</th><th>姓名</th><th>手机号</th><th>邮箱</th><th>校验</th></tr></thead><tbody><tr v-for="(row, index) in rows.slice(0, 8)" :key="index" :class="{ invalid: !row.valid }"><td>{{ row.studentId }}</td><td>{{ row.college }}</td><td>{{ row.name }}</td><td>{{ row.phone }}</td><td>{{ row.email }}</td><td>{{ row.valid ? '通过' : row.reason }}</td></tr></tbody></table></div><p v-if="rows.length > 8">仅展示前 8 行，共 {{ rows.length }} 行。</p><button type="button" class="import-button" :disabled="importing || !importClassId || !!invalidRows.length" @click="importStudents"><UsersRound :size="17" />{{ importing ? '正在导入…' : '一键创建学生账号并导入班级' }}</button></div>
    </section>

    <section class="classes-card"><header><div><h2>我的班级</h2><p>审核状态与人数实时显示</p></div><strong>{{ classes.length }}</strong></header><div v-if="loading" class="loading">正在加载班级…</div><div v-else-if="classes.length" class="class-grid"><article v-for="item in classes" :key="item.id" class="class-item"><div><span class="status" :class="item.status.toLowerCase()">{{ statusText(item.status) }}</span><h3>{{ item.name }}</h3><p>{{ item.course?.name || '未关联课程' }} · {{ item._count?.members || item.members || 0 }} 名学生</p></div><small>{{ item.status === 'REJECTED' && item.reviewNote ? `审核说明：${item.reviewNote}` : item.createdAt.slice(0, 10) }}</small></article></div><div v-else class="loading">暂无班级申请</div></section>
  </main>
</template>

<style scoped>
.class-page { --ink:#1b2a41; --blue:#276ba8; --line:#e1e9f0; max-width:1120px; margin:auto; padding:28px 22px 62px; color:var(--ink); }.hero { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:29px 33px; border-radius:22px; color:#fff; background:linear-gradient(120deg,#163c65,#3479aa); box-shadow:0 15px 32px rgba(25,68,111,.17); }.hero p { margin:0 0 7px; color:#f4c978; font-size:10px; font-weight:900; letter-spacing:.15em; }.hero h1 { margin:0 0 8px; font-size:34px; letter-spacing:-.05em; }.hero span { color:#dbeaf7; font-size:14px; }.hero button,.create-row button,.import-button,.template { display:inline-flex; align-items:center; justify-content:center; gap:7px; border:0; border-radius:9px; font:inherit; font-weight:900; cursor:pointer; }.hero button { padding:10px 14px; color:#e6f2fc; background:rgba(255,255,255,.14); }.notice { margin:16px 0; padding:11px 14px; color:#24597f; border:1px solid #cce1f0; border-radius:10px; background:#edf7ff; font-size:13px; line-height:1.55; }.create-card,.import-card,.classes-card { margin-top:18px; padding:22px; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 8px 24px rgba(34,66,95,.04); }.section-title { display:flex; align-items:center; gap:11px; }.section-title h2,.classes-card h2 { margin:0; font-size:17px; }.section-title p,.classes-card header p { margin:4px 0 0; color:#8290a1; font-size:12px; }.title-icon { display:grid; width:38px; height:38px; place-items:center; color:#2467a1; border-radius:10px; background:#e5f2fc; }.title-icon.gold { color:#a86d0d; background:#fff2d9; }.create-row { display:flex; gap:10px; margin-top:18px; }.create-row input { min-width:0; flex:1; padding:11px 13px; color:var(--ink); border:1px solid #d9e3eb; border-radius:9px; background:#fff; font:inherit; font-size:13px; }.create-row button { padding:0 18px; color:#fff; background:var(--blue); }.template { margin-left:auto; padding:8px 11px; color:#26669e; background:#edf6fd; font-size:12px; }.import-toolbar { display:flex; align-items:center; gap:12px; margin:20px 0 12px; }.class-select { width:min(330px,100%); --outline:#d9e3eb; --ink:var(--ink); --muted:#6e8297; --primary:#276ba8; --primary-strong:#1b588e; --primary-container:#e8f3fc; --surface:#fff; --surface-low:#f1f7fc; }.import-toolbar span { color:#708298; font-size:12px; }.drop-zone { display:grid; min-height:180px; place-items:center; align-content:center; gap:8px; color:#5c88ad; border:1.5px dashed #a6c9e5; border-radius:14px; background:#f8fcff; cursor:pointer; transition:.18s; }.drop-zone:hover,.drop-zone.dragging { color:#1d639b; border-color:#418bc3; background:#edf8ff; transform:translateY(-1px); }.drop-zone strong { color:#365875; font-size:14px; }.drop-zone span { color:#8a9aab; font-size:12px; }.preview { margin-top:18px; padding:15px; border:1px solid #dfe9f1; border-radius:12px; background:#fcfdff; }.preview-head { display:flex; justify-content:space-between; align-items:center; color:#51677c; font-size:12px; }.preview-head b { color:#178156; }.preview-head b.bad { color:#b14336; }.preview-table { margin-top:11px; overflow:auto; }.preview table { width:100%; min-width:720px; border-collapse:collapse; font-size:12px; }.preview th,.preview td { padding:8px; text-align:left; border-bottom:1px solid #edf1f5; }.preview th { color:#758699; background:#f5f8fb; font-weight:900; }.preview tr.invalid { color:#b44739; background:#fff6f4; }.preview>p { margin:10px 0 0; color:#8d9baa; font-size:11px; }.import-button { margin-top:15px; padding:11px 16px; color:#fff; background:#17669f; }.import-button:disabled { opacity:.45; cursor:not-allowed; }.classes-card header { display:flex; align-items:center; justify-content:space-between; padding-bottom:15px; border-bottom:1px solid var(--line); }.classes-card header strong { color:#24679f; font-size:28px; }.class-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:15px; }.class-item { display:flex; justify-content:space-between; gap:12px; padding:16px; border:1px solid #e4ebf1; border-radius:13px; background:#fcfdff; }.status { display:inline-block; padding:3px 7px; border-radius:5px; background:#eef1f4; color:#758292; font-size:10px; font-weight:900; }.status.approved { color:#13714e; background:#e4f5ec; }.status.pending { color:#98600c; background:#fff2da; }.status.rejected { color:#a13a32; background:#fdeceb; }.class-item h3 { margin:10px 0 5px; font-size:14px; }.class-item p,.class-item small { margin:0; color:#8190a1; font-size:11px; line-height:1.5; }.class-item small { max-width:130px; text-align:right; }.loading { display:grid; min-height:100px; place-items:center; color:#8a98a8; font-size:13px; }@media(max-width:680px){.class-page{padding:18px 13px 44px}.hero,.create-row,.import-toolbar{align-items:stretch;flex-direction:column}.hero h1{font-size:30px}.template{margin-left:auto}.class-select{width:100%}.class-grid{grid-template-columns:1fr}.section-title{align-items:flex-start}.import-card,.create-card,.classes-card{padding:17px}.class-item{flex-direction:column}.class-item small{text-align:left}}
</style>
