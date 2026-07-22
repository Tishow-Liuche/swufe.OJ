<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UsersRound,
  XCircle,
} from '@lucide/vue';
import { useStorage } from '@vueuse/core';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRouter } from 'vue-router';
import api from '../api/client';

interface Membership {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  class: { id: string; name: string; course?: { name: string } | null };
}

const router = useRouter();
const memberships = ref<Membership[]>([]);
const classesLoading = ref(true);
const joinCode = ref('');
const submitting = ref(false);
const message = ref('');
const error = ref('');
const sidebarCollapsed = useStorage('swufe-oj:student-class-sidebar-collapsed-v1', true);

onMounted(loadClasses);

function statusMeta(status: Membership['status']) {
  if (status === 'APPROVED') return { label: '已加入', icon: CheckCircle2 };
  if (status === 'REJECTED') return { label: '未通过', icon: XCircle };
  return { label: '等待审核', icon: Clock3 };
}

function openClassWorkspace(membership: Membership) {
  if (membership.status === 'APPROVED') {
    void router.push(`/classes/${membership.class.id}/assignments`);
    return;
  }
  void router.push('/classes');
}

async function loadClasses() {
  classesLoading.value = true;
  try {
    const { data } = await api.get<Membership[]>('/api/user/classes');
    memberships.value = data;
  } catch {
    memberships.value = [];
  } finally {
    classesLoading.value = false;
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
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '提交入班申请失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="class-join-page" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="class-sidebar" aria-label="班级导航">
      <div class="sidebar-title">
        <span class="sidebar-title-icon"><UsersRound :size="19" /></span>
        <span class="sidebar-title-copy"><strong>班级工作台</strong><small>学习与作业</small></span>
        <button class="sidebar-collapse-button" type="button" :title="sidebarCollapsed ? '展开班级侧栏' : '收起班级侧栏'" :aria-label="sidebarCollapsed ? '展开班级侧栏' : '收起班级侧栏'" :aria-expanded="!sidebarCollapsed" @click="sidebarCollapsed = !sidebarCollapsed">
          <PanelLeftOpen v-if="sidebarCollapsed" :size="18" />
          <PanelLeftClose v-else :size="18" />
        </button>
      </div>

      <router-link to="/classes/join" class="sidebar-join-link active"><DoorOpen :size="18" /><span>申请加入新班级</span></router-link>
      <p class="sidebar-label">选择班级</p>
      <div v-if="classesLoading" class="sidebar-state">正在加载...</div>
      <div v-else-if="memberships.length" class="sidebar-class-list">
        <button v-for="membership in memberships" :key="membership.id" type="button" @click="openClassWorkspace(membership)">
          <span class="class-mark">{{ membership.class.name.slice(0, 1) }}</span>
          <span class="sidebar-class-copy"><strong>{{ membership.class.name }}</strong><small>{{ membership.class.course?.name || '未关联课程' }}</small></span>
          <i class="sidebar-class-status" :class="membership.status.toLowerCase()">{{ statusMeta(membership.status).label }}</i>
        </button>
      </div>
      <p v-else class="sidebar-state">还没有班级</p>

      <div class="sidebar-divider"></div>
      <nav class="sidebar-navigation" aria-label="班级视图">
        <router-link to="/classes"><BookOpenCheck :size="18" /><span>班级作业</span></router-link>
        <router-link to="/classes"><Info :size="18" /><span>基本信息</span></router-link>
      </nav>
    </aside>

    <main class="join-main">
      <section class="join-shell">
        <header>
          <span class="join-icon"><DoorOpen :size="24" /></span>
          <div><p><ShieldCheck :size="15" />CLASS ENROLLMENT</p><h1>申请加入班级</h1><span>输入老师提供的班级码，提交后等待任课老师审核。</span></div>
        </header>
        <form @submit.prevent="applyToClass">
          <label for="join-code">班级码</label>
          <input id="join-code" v-model="joinCode" maxlength="8" autocomplete="off" placeholder="输入 8 位班级码" @input="joinCode = joinCode.toUpperCase().replace(/[^A-Z2-9]/g, '')">
          <button type="submit" :disabled="submitting || joinCode.length !== 8">{{ submitting ? '正在提交' : '提交申请' }}</button>
        </form>
        <p v-if="message" class="feedback success">{{ message }}</p>
        <p v-if="error" class="feedback error">{{ error }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.class-join-page { --class-line: #dce5ef; display: flex; min-height: calc(100vh - 56px); color: #24364b; background: #f3f5f7; font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif; }.class-sidebar { position: sticky; top: 56px; display: flex; width: 282px; height: calc(100vh - 56px); flex: 0 0 282px; flex-direction: column; padding: 20px 14px; overflow: hidden; border-right: 1px solid var(--class-line); border-radius: 0 18px 18px 0; background: #f8fbfe; box-shadow: 8px 0 22px rgba(23, 59, 102, .035); transition: width .22s ease, flex-basis .22s ease, padding .22s ease; }.sidebar-title { display: flex; align-items: center; gap: 9px; padding: 0 5px 16px; }.sidebar-title-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 10px; color: #1f5eff; background: #e7efff; }.sidebar-title-copy { display: grid; min-width: 0; gap: 2px; }.sidebar-title-copy strong { color: #293f56; font-size: 13px; }.sidebar-title-copy small { color: #8190a1; font-size: 10px; }.sidebar-collapse-button { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; margin-left: auto; border: 0; border-radius: 10px; color: #637488; background: transparent; cursor: pointer; }.sidebar-collapse-button:hover { color: #1f5eff; background: #e7efff; }.sidebar-label { margin: 3px 7px 8px; color: #8493a5; font-size: 10px; font-weight: 900; }.sidebar-class-list { display: grid; min-height: 0; gap: 5px; overflow-y: auto; padding: 0 2px 4px; }.sidebar-class-list > button { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; min-height: 54px; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid transparent; border-radius: 11px; color: #314a63; background: transparent; font: inherit; text-align: left; cursor: pointer; }.sidebar-class-list > button:hover { background: #edf5fc; }.class-mark { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; color: #245f94; background: #dcecf9; font-size: 13px; font-weight: 900; }.sidebar-class-copy { display: grid; min-width: 0; gap: 3px; }.sidebar-class-copy strong,.sidebar-class-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.sidebar-class-copy strong { font-size: 11px; }.sidebar-class-copy small { color: #8492a2; font-size: 9px; }.sidebar-class-status { max-width: 46px; overflow: hidden; color: #7c8997; font-size: 9px; font-style: normal; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }.sidebar-class-status.approved { color: #197149; }.sidebar-class-status.pending { color: #a06f08; }.sidebar-class-status.rejected { color: #a13d36; }.sidebar-state { margin: 0; padding: 12px 7px; color: #8493a5; font-size: 11px; text-align: center; }.sidebar-divider { height: 1px; flex: 0 0 1px; margin: 14px 4px; background: #dce5ee; }.sidebar-navigation { display: grid; gap: 4px; }.sidebar-navigation a { display: grid; grid-template-columns: 20px minmax(0, 1fr); min-height: 44px; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 10px; color: #607187; font-size: 12px; font-weight: 800; text-decoration: none; }.sidebar-navigation a:hover { color: #1f5eff; background: #edf5fc; }.sidebar-navigation a.active { color: #1f5eff; background: #e7efff; }
.sidebar-join-link { display: grid; grid-template-columns: 20px minmax(0, 1fr); min-height: 42px; align-items: center; gap: 9px; margin: 0 0 13px; padding: 7px 10px; border: 1px solid #c9dcf0; border-radius: 10px; color: #1f5eff; background: #edf4ff; font-size: 12px; font-weight: 850; text-decoration: none; }.sidebar-join-link:hover { border-color: #8fb8ef; background: #e4efff; }
.class-join-page.sidebar-collapsed .class-sidebar { width: 72px; flex-basis: 72px; padding-right: 10px; padding-left: 10px; }.class-join-page.sidebar-collapsed .sidebar-title { justify-content: center; padding-right: 0; padding-left: 0; }.class-join-page.sidebar-collapsed .sidebar-title-icon,.class-join-page.sidebar-collapsed .sidebar-title-copy,.class-join-page.sidebar-collapsed .sidebar-label,.class-join-page.sidebar-collapsed .sidebar-class-copy,.class-join-page.sidebar-collapsed .sidebar-class-status,.class-join-page.sidebar-collapsed .sidebar-state,.class-join-page.sidebar-collapsed .sidebar-divider { display: none; }.class-join-page.sidebar-collapsed .sidebar-collapse-button { margin-left: 0; }.class-join-page.sidebar-collapsed .sidebar-class-list { gap: 6px; overflow-y: auto; }.class-join-page.sidebar-collapsed .sidebar-class-list > button { grid-template-columns: 1fr; justify-items: center; min-height: 46px; padding: 6px 0; }.class-join-page.sidebar-collapsed .sidebar-navigation a { grid-template-columns: 1fr; justify-items: center; padding-right: 0; padding-left: 0; }.class-join-page.sidebar-collapsed .sidebar-navigation a span { display: none; }
.class-join-page.sidebar-collapsed .sidebar-join-link { grid-template-columns: 1fr; justify-items: center; padding-right: 0; padding-left: 0; }.class-join-page.sidebar-collapsed .sidebar-join-link span { display: none; }
.join-main { display: grid; min-width: 0; flex: 1; place-items: start center; padding: 56px 30px; }.join-shell { width: min(620px, 100%); padding: 30px; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 14px 30px rgba(31, 66, 104, .08); }.join-shell header { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }.join-icon { display: grid; width: 50px; height: 50px; flex: 0 0 50px; place-items: center; border-radius: 10px; color: #1f5eff; background: #e7efff; }.join-shell header p { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 5px; color: #3977aa; font-size: 10px; font-weight: 900; }.join-shell h1 { margin: 0; color: #263b51; font-size: 25px; }.join-shell header span { display: block; margin-top: 6px; color: #6d7d90; font-size: 13px; }.join-shell form { display: grid; gap: 8px; }.join-shell label { color: #57687b; font-size: 12px; font-weight: 850; }.join-shell input { height: 48px; padding: 0 14px; border: 1px solid #bfcde0; border-radius: 8px; color: #18365f; background: #fff; font: 800 19px Consolas, monospace; letter-spacing: 3px; text-transform: uppercase; }.join-shell input:focus { border-color: #2f72ca; outline: 3px solid rgba(47, 114, 202, .13); }.join-shell button[type='submit'] { min-height: 44px; margin-top: 8px; border: 0; border-radius: 8px; color: #fff; background: #2469ad; font: inherit; font-size: 13px; font-weight: 850; cursor: pointer; }.join-shell button[type='submit']:disabled { opacity: .5; cursor: default; }.feedback { margin: 14px 0 0; padding: 10px 12px; border-radius: 8px; font-size: 13px; }.feedback.success { color: #176b42; background: #eaf7ef; }.feedback.error { color: #a33c35; background: #fff0ef; }
@media (max-width: 860px) { .class-join-page { display: block; }.class-sidebar,.class-join-page.sidebar-collapsed .class-sidebar { position: static; display: grid; width: auto; height: auto; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; padding: 12px; border: 0; border-bottom: 1px solid var(--class-line); border-radius: 0; box-shadow: none; }.sidebar-title,.class-join-page.sidebar-collapsed .sidebar-title { grid-column: 1 / -1; justify-content: flex-start; padding: 0 5px 4px; }.sidebar-title-icon,.sidebar-title-copy,.class-join-page.sidebar-collapsed .sidebar-title-icon,.class-join-page.sidebar-collapsed .sidebar-title-copy { display: grid; }.sidebar-collapse-button { display: none; }.sidebar-label,.class-join-page.sidebar-collapsed .sidebar-label { display: none; }.sidebar-join-link,.class-join-page.sidebar-collapsed .sidebar-join-link { grid-column: 1 / -1; grid-template-columns: 20px minmax(0, 1fr); justify-items: initial; margin-bottom: 0; padding: 7px 10px; }.sidebar-join-link span,.class-join-page.sidebar-collapsed .sidebar-join-link span { display: inline; }.sidebar-class-list,.class-join-page.sidebar-collapsed .sidebar-class-list { display: flex; grid-column: 1 / -1; gap: 7px; overflow-x: auto; overflow-y: hidden; padding: 0 2px 2px; }.sidebar-class-list > button,.class-join-page.sidebar-collapsed .sidebar-class-list > button { grid-template-columns: 34px minmax(110px, 1fr); justify-items: stretch; min-width: 190px; min-height: 52px; padding: 7px 8px; }.sidebar-class-copy,.class-join-page.sidebar-collapsed .sidebar-class-copy { display: grid; }.sidebar-class-status,.class-join-page.sidebar-collapsed .sidebar-class-status { display: none; }.sidebar-state,.class-join-page.sidebar-collapsed .sidebar-state { display: block; grid-column: 1 / -1; }.sidebar-divider,.class-join-page.sidebar-collapsed .sidebar-divider { display: none; }.sidebar-navigation,.class-join-page.sidebar-collapsed .sidebar-navigation { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; grid-column: 1 / -1; }.sidebar-navigation a,.class-join-page.sidebar-collapsed .sidebar-navigation a { grid-template-columns: 20px minmax(0, 1fr); justify-items: initial; min-height: 42px; padding: 7px 10px; }.sidebar-navigation a span,.class-join-page.sidebar-collapsed .sidebar-navigation a span { display: inline; }.join-main { padding: 30px 16px 48px; } }
@media (max-width: 560px) { .sidebar-navigation,.class-join-page.sidebar-collapsed .sidebar-navigation { grid-template-columns: 1fr; }.join-main { padding: 24px 14px; }.join-shell { padding: 22px; }.join-shell header { align-items: flex-start; }.join-shell h1 { font-size: 22px; } }
</style>
