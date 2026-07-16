<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CheckCircle2, Clock3, DoorOpen, RefreshCw, ShieldCheck, XCircle } from '@lucide/vue';
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

const memberships = ref<Membership[]>([]);
const joinCode = ref('');
const loading = ref(true);
const submitting = ref(false);
const message = ref('');
const error = ref('');

const approvedCount = computed(() => memberships.value.filter((item) => item.status === 'APPROVED').length);
const pendingCount = computed(() => memberships.value.filter((item) => item.status === 'PENDING').length);

onMounted(loadClasses);

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

function statusMeta(status: Membership['status']) {
  if (status === 'APPROVED') return { label: '已加入', icon: CheckCircle2 };
  if (status === 'REJECTED') return { label: '未通过', icon: XCircle };
  return { label: '等待审核', icon: Clock3 };
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
    await loadClasses();
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
        <p>使用老师提供的班级码申请加入，老师审核通过后即可进入正式名单。</p>
      </div>
      <div class="summary-strip">
        <div><strong>{{ approvedCount }}</strong><span>已加入</span></div>
        <div><strong>{{ pendingCount }}</strong><span>待审核</span></div>
      </div>
    </header>

    <section class="join-panel">
      <div class="join-copy">
        <span class="join-icon"><DoorOpen :size="24" /></span>
        <div><h2>申请加入班级</h2><p>班级码为 8 位字母和数字，不区分大小写。</p></div>
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

    <section class="membership-section">
      <div class="section-heading">
        <div><h2>申请记录</h2><p>审核状态有变化时可刷新查看。</p></div>
        <button class="refresh-button" :disabled="loading" title="刷新班级状态" @click="loadClasses"><RefreshCw :size="17" />刷新</button>
      </div>

      <div v-if="loading" class="empty-state">正在加载班级信息...</div>
      <div v-else-if="memberships.length" class="membership-list">
        <article v-for="membership in memberships" :key="membership.id" class="membership-row">
          <div class="class-mark">{{ membership.class.name.slice(0, 1) }}</div>
          <div class="class-copy">
            <div class="class-title"><h3>{{ membership.class.name }}</h3><span class="status" :class="membership.status.toLowerCase()"><component :is="statusMeta(membership.status).icon" :size="15" />{{ statusMeta(membership.status).label }}</span></div>
            <p>{{ membership.class.course?.name || '未关联课程' }} · 任课老师 {{ membership.teacher?.nickname || membership.teacher?.username || '未知' }}</p>
            <span>申请时间 {{ formatDate(membership.appliedAt) }}</span>
            <p v-if="membership.status === 'PENDING'" class="state-note pending-note">申请已送达，老师审核前不会进入班级名单。</p>
            <p v-if="membership.status === 'REJECTED'" class="state-note rejected-note">{{ membership.reviewNote || '老师未通过本次申请，可确认班级码后重新申请。' }}</p>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">还没有班级记录，输入班级码发起第一次申请。</div>
    </section>
  </div>
</template>

<style scoped>
.classes-page { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 48px; }
.page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.eyebrow { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 7px; color: #2a66b7; font-size: 13px; font-weight: 800; }
h1 { margin: 0; color: #182437; font-size: 30px; }
.page-heading p, .section-heading p { margin: 6px 0 0; color: #6c7888; font-size: 14px; }
.summary-strip { display: flex; min-width: 220px; border: 1px solid #dfe6ee; border-radius: 8px; background: #fff; }
.summary-strip div { display: grid; flex: 1; gap: 2px; padding: 12px 18px; text-align: center; }
.summary-strip div + div { border-left: 1px solid #e7ebf0; }
.summary-strip strong { color: #1d3557; font-size: 22px; }
.summary-strip span { color: #7b8796; font-size: 12px; }
.join-panel { padding: 22px; border: 1px solid #cfdff3; border-radius: 8px; background: #f7faff; }
.join-copy { display: flex; align-items: center; gap: 12px; }
.join-icon { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 8px; background: #2869bd; color: #fff; }
h2, h3 { margin: 0; color: #202c3d; }
.join-copy h2, .section-heading h2 { font-size: 17px; }
.join-copy p { margin: 4px 0 0; color: #6f7d8e; font-size: 13px; }
.join-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; margin-top: 18px; }
.join-form input { min-width: 0; height: 46px; padding: 0 14px; border: 1px solid #bfcde0; border-radius: 7px; background: #fff; color: #18365f; font-family: Consolas, monospace; font-size: 19px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; }
.join-form input:focus { border-color: #2f72ca; outline: 3px solid rgba(47, 114, 202, .13); }
.join-form button, .refresh-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 7px; font-weight: 700; cursor: pointer; }
.join-form button { min-width: 116px; border: 0; background: #245fae; color: #fff; }
.join-form button:disabled, .refresh-button:disabled { opacity: .5; cursor: default; }
.feedback { margin: 12px 0 0; padding: 9px 11px; border-radius: 6px; font-size: 13px; }
.feedback.success { background: #eaf7ef; color: #176b42; }
.feedback.error { background: #fff0ef; color: #a33c35; }
.membership-section { margin-top: 20px; padding: 22px; border: 1px solid #e1e6ec; border-radius: 8px; background: #fff; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.refresh-button { min-height: 38px; padding: 0 12px; border: 1px solid #d3dde9; background: #fff; color: #36526f; }
.membership-list { display: grid; gap: 9px; }
.membership-row { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 13px; padding: 14px; border: 1px solid #e7ebf0; border-radius: 7px; background: #fcfdff; }
.class-mark { display: grid; width: 46px; height: 46px; place-items: center; border-radius: 7px; background: #e8f1fd; color: #285e9f; font-size: 19px; font-weight: 800; }
.class-copy { min-width: 0; }
.class-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.class-title h3 { overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.class-copy > p { margin: 5px 0 3px; color: #647286; font-size: 13px; }
.class-copy > span { color: #8993a1; font-size: 12px; }
.status { display: inline-flex; flex-shrink: 0; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 800; }
.status.approved { background: #e8f7ee; color: #197047; }
.status.pending { background: #fff6dc; color: #8a6200; }
.status.rejected { background: #fff0ef; color: #a13d36; }
.state-note { margin-top: 9px !important; padding: 8px 10px; border-radius: 6px; }
.pending-note { background: #fff9e9; color: #775b12 !important; }
.rejected-note { background: #fff2f1; color: #8f403b !important; }
.empty-state { padding: 42px 16px; color: #8a95a3; text-align: center; }
@media (max-width: 680px) {
  .page-heading { align-items: stretch; flex-direction: column; }
  .summary-strip { width: 100%; }
  .join-form { grid-template-columns: 1fr; }
  .join-form button { min-height: 44px; }
  .class-title { align-items: flex-start; flex-direction: column; }
}

.classes-page { --class-navy:#173b66; --class-blue:#2469ad; --class-pale:#eaf3fc; --class-line:#dfe7ef; width:min(1120px,calc(100% - 40px)); padding-top:28px; font-family:'Manrope Variable','Noto Sans SC Variable',sans-serif; }
.page-heading { min-height:158px; align-items:center; padding:26px 30px; border-radius:8px; color:#fff; background:var(--class-navy); box-shadow:0 14px 32px rgba(23,59,102,.16); }
.eyebrow { color:#8fc2ec; }
h1 { color:#fff; font-size:34px; letter-spacing:0; }
.page-heading p { color:#d9e8f5; }
.summary-strip { border-color:rgba(255,255,255,.18); background:rgba(255,255,255,.08); }
.summary-strip div+div { border-left-color:rgba(255,255,255,.16); }
.summary-strip strong { color:#fff; }
.summary-strip span { color:#c4d6e8; }
.join-panel,.membership-section { border-color:var(--class-line); border-radius:8px; background:#fff; box-shadow:0 7px 20px rgba(23,59,102,.04); }
.join-panel { margin-top:18px; }
.join-icon { background:var(--class-blue); }
.join-form button { background:var(--class-blue); }
.membership-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.membership-row { min-height:176px; align-content:start; border-color:var(--class-line); border-radius:8px; background:#fcfdff; transition:transform .18s,border-color .18s,box-shadow .18s; }
.membership-row:hover { border-color:#8eb8da; transform:translateY(-2px); box-shadow:0 10px 22px rgba(23,59,102,.08); }
.class-mark { color:#205f96; background:#e3effa; }
.refresh-button { color:#285d8a; }
@media(max-width:760px){.membership-list{grid-template-columns:1fr}.page-heading{align-items:stretch;flex-direction:column}.summary-strip{width:100%}}
</style>
