<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { useRouter } from 'vue-router';
import {
  Activity,
  AtSign,
  Bell,
  BellOff,
  CheckCheck,
  CircleAlert,
  Mail,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../api/client';

type NotificationTab = 'all' | 'mention' | 'reply' | 'system' | 'activity';

interface PlatformNotification {
  id: string;
  type: string;
  title: string;
  content?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

const router = useRouter();
const notifications = ref<PlatformNotification[]>([]);
const unread = ref(0);
const activeTab = ref<NotificationTab>('all');
const loading = ref(false);
const error = ref('');
const sidebarCollapsed = useStorage('swufe-oj:notifications-sidebar-collapsed-v1', true);
const browserPermission = ref<'default' | 'granted' | 'denied' | 'unsupported'>(
  typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported',
);

const tabs: Array<{ id: NotificationTab; label: string; icon: any }> = [
  { id: 'all', label: '全部通知', icon: Bell },
  { id: 'mention', label: '@我的', icon: AtSign },
  { id: 'reply', label: '回复我的', icon: MessageCircle },
  { id: 'system', label: '系统通知', icon: CircleAlert },
  { id: 'activity', label: '活动通知', icon: Activity },
];

const visibleNotifications = computed(() => activeTab.value === 'all'
  ? notifications.value
  : notifications.value.filter((item) => notificationCategory(item) === activeTab.value));

onMounted(() => void loadNotifications());

function notificationCategory(item: PlatformNotification): Exclude<NotificationTab, 'all'> {
  if (item.type === 'MENTION') return 'mention';
  if (item.type === 'POST_REPLY') return 'reply';
  if (['DIRECT_MESSAGE', 'CLASS_APPLICATION', 'ASSIGNMENT', 'CONTEST', 'ACTIVITY'].some((prefix) => item.type.startsWith(prefix))) {
    return 'activity';
  }
  return 'system';
}

function notificationMeta(item: PlatformNotification) {
  const category = notificationCategory(item);
  if (category === 'mention') return { label: '@我的', icon: AtSign, className: 'mention' };
  if (category === 'reply') return { label: '回复', icon: MessageCircle, className: 'reply' };
  if (category === 'activity') return { label: item.type === 'DIRECT_MESSAGE' ? '私信' : '活动', icon: item.type === 'DIRECT_MESSAGE' ? Mail : Activity, className: 'activity' };
  return { label: '系统', icon: CircleAlert, className: 'system' };
}

function formatTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function loadNotifications() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<{ items: PlatformNotification[]; unread: number }>('/api/community/notifications');
    notifications.value = data.items || [];
    unread.value = data.unread || 0;
    notifyHeader();
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '通知中心暂时无法加载';
  } finally {
    loading.value = false;
  }
}

async function openNotification(item: PlatformNotification) {
  if (!item.readAt) {
    try {
      await api.patch(`/api/community/notifications/${item.id}/read`);
      item.readAt = new Date().toISOString();
      unread.value = Math.max(0, unread.value - 1);
      notifyHeader();
    } catch {
      error.value = '通知状态更新失败';
      return;
    }
  }
  if (item.link) void router.push(item.link);
}

async function markAllRead() {
  if (!unread.value) return;
  try {
    await api.post('/api/community/notifications/read-all');
    const readAt = new Date().toISOString();
    notifications.value.forEach((item) => { if (!item.readAt) item.readAt = readAt; });
    unread.value = 0;
    notifyHeader();
  } catch {
    error.value = '全部标记已读失败';
  }
}

async function enableBrowserNotifications() {
  if (!('Notification' in window)) {
    browserPermission.value = 'unsupported';
    return;
  }
  browserPermission.value = await window.Notification.requestPermission();
}

function notifyHeader() {
  window.dispatchEvent(new CustomEvent('swufe:notifications-changed', { detail: { unread: unread.value } }));
}
</script>

<template>
  <div class="notifications-page">
    <header class="notifications-hero">
      <div><p>NOTIFICATION CENTER</p><h1>通知中心</h1><span>查看提及、回复、平台消息和训练动态。</span></div>
      <div class="hero-actions">
        <button class="secondary-button" type="button" @click="enableBrowserNotifications">
          <Bell :size="16" />{{ browserPermission === 'granted' ? '浏览器通知已开启' : browserPermission === 'denied' ? '浏览器通知已拒绝' : '开启浏览器通知' }}
        </button>
        <button class="primary-button" type="button" :disabled="!unread" @click="markAllRead"><CheckCheck :size="16" />全部标为已读</button>
      </div>
    </header>

    <div class="notification-workspace" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <aside class="notification-nav" aria-label="通知分类">
        <div class="nav-heading"><Bell :size="18" /><strong>通知</strong><span v-if="unread">{{ unread }}</span><button class="sidebar-collapse-button" type="button" :title="sidebarCollapsed ? '展开通知侧栏' : '收起通知侧栏'" :aria-label="sidebarCollapsed ? '展开通知侧栏' : '收起通知侧栏'" :aria-expanded="!sidebarCollapsed" @click="sidebarCollapsed = !sidebarCollapsed"><PanelLeftOpen v-if="sidebarCollapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button></div>
        <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" :title="sidebarCollapsed ? tab.label : undefined" @click="activeTab = tab.id">
          <component :is="tab.icon" :size="17" /><span>{{ tab.label }}</span>
          <i v-if="tab.id === 'all' && unread">{{ unread > 99 ? '99+' : unread }}</i>
        </button>
      </aside>

      <section class="notification-list" aria-live="polite">
        <header><div><h2>{{ tabs.find((tab) => tab.id === activeTab)?.label }}</h2><span>{{ visibleNotifications.length }} 条消息</span></div><button type="button" title="刷新通知" @click="loadNotifications"><Bell :size="17" /></button></header>
        <div v-if="loading" class="notification-state">正在加载通知...</div>
        <div v-else-if="error" class="notification-error">{{ error }}</div>
        <template v-else>
          <button v-for="item in visibleNotifications" :key="item.id" class="notification-item" :class="{ unread: !item.readAt }" type="button" @click="openNotification(item)">
            <span class="notification-icon" :class="notificationMeta(item).className"><component :is="notificationMeta(item).icon" :size="18" /></span>
            <span class="notification-copy"><span><b>{{ item.title }}</b><time>{{ formatTime(item.createdAt) }}</time></span><p>{{ item.content || '点击查看详情' }}</p><small>{{ notificationMeta(item).label }}</small></span>
            <i v-if="!item.readAt" class="unread-indicator"></i>
          </button>
          <div v-if="!visibleNotifications.length" class="notification-state empty"><BellOff :size="40" /><b>没有更多通知了</b><span>新的互动和平台消息会显示在这里。</span></div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.notifications-page { width: min(1180px, calc(100% - 40px)); min-height: calc(100vh - 56px); margin: 0 auto; padding: 28px 0 56px; color: #24364b; font-family: 'Manrope Variable', 'Noto Sans SC Variable', 'Microsoft YaHei', sans-serif; }
.notifications-hero { display: flex; min-height: 132px; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 18px; padding: 24px 30px; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 9px 22px rgba(31, 66, 104, .07); }.notifications-hero p { margin: 0 0 5px; color: #3977aa; font-size: 11px; font-weight: 850; letter-spacing: 0; }.notifications-hero h1 { margin: 0; color: #1f2a37; font-size: 30px; }.notifications-hero span { display: block; margin-top: 7px; color: #6d7d90; font-size: 13px; }
.hero-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }.primary-button, .secondary-button { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border-radius: 6px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }.primary-button { border: 0; background: #2469ad; color: #fff; }.primary-button:hover { background: #1b578f; }.primary-button:disabled { cursor: not-allowed; opacity: .55; }.secondary-button { border: 1px solid #bfd4ed; background: #f6faff; color: #2469ad; }.secondary-button:hover { border-color: #8eb6de; background: #edf5ff; }
.notification-workspace { display: grid; min-height: 620px; grid-template-columns: 210px minmax(0, 1fr); overflow: hidden; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 8px 20px rgba(31, 66, 104, .05); }.notification-nav { display: flex; flex-direction: column; gap: 4px; padding: 10px; border-right: 1px solid #e2e9f1; background: #fbfcfe; }.nav-heading { display: flex; height: 48px; align-items: center; gap: 8px; padding: 0 8px 8px; border-bottom: 1px solid #e2e9f1; color: #273c52; }.nav-heading svg { color: #1f5eff; }.nav-heading strong { font-size: 15px; }.nav-heading span { display: inline-grid; min-width: 18px; height: 18px; place-items: center; margin-left: auto; border-radius: 9px; background: #e24a4a; color: #fff; font-size: 10px; font-weight: 800; }.notification-nav button { display: flex; min-height: 39px; align-items: center; gap: 9px; padding: 0 9px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #637488; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }.notification-nav button:hover { background: #f0f6fe; color: #2469ad; }.notification-nav button.active { border-color: #c8dbf7; background: #eaf2ff; color: #1f5eff; font-weight: 800; }.notification-nav button i { display: inline-grid; min-width: 17px; height: 17px; place-items: center; margin-left: auto; border-radius: 9px; background: #e24a4a; color: #fff; font-size: 9px; font-style: normal; font-weight: 800; }
.notification-list { min-width: 0; background: #fff; }.notification-list > header { display: flex; min-height: 60px; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid #e2e9f1; }.notification-list h2 { margin: 0; color: #2a3d53; font-size: 16px; }.notification-list header span { display: block; margin-top: 3px; color: #8593a3; font-size: 11px; }.notification-list > header button { display: inline-grid; width: 32px; height: 32px; place-items: center; border: 1px solid #d6e2ee; border-radius: 6px; background: #fff; color: #4d637a; cursor: pointer; }.notification-list > header button:hover { background: #f1f7ff; color: #2469ad; }
.notification-item { position: relative; display: flex; width: 100%; align-items: flex-start; gap: 12px; padding: 16px 20px; border: 0; border-bottom: 1px solid #edf1f5; background: #fff; color: inherit; font: inherit; text-align: left; cursor: pointer; }.notification-item:hover { background: #f8fbff; }.notification-item.unread { background: #f4f8ff; }.notification-icon { display: inline-grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 1px solid #d6e5f7; border-radius: 6px; background: #eaf3ff; color: #2469ad; }.notification-icon.reply { border-color: #c8e4d7; background: #edf9f4; color: #207653; }.notification-icon.system { border-color: #ead9bc; background: #fff7e8; color: #a46e13; }.notification-icon.activity { border-color: #dbd0f0; background: #f5f1ff; color: #7156ad; }.notification-copy { display: grid; min-width: 0; flex: 1; gap: 4px; }.notification-copy > span { display: flex; min-width: 0; justify-content: space-between; gap: 12px; }.notification-copy b { overflow: hidden; color: #34495f; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.notification-copy time { flex: 0 0 auto; color: #8b99a9; font-size: 11px; }.notification-copy p { display: -webkit-box; overflow: hidden; margin: 0; color: #6e7e90; font-size: 12px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.notification-copy small { color: #8494a6; font-size: 10px; }.unread-indicator { width: 7px; height: 7px; flex: 0 0 7px; margin-top: 5px; border-radius: 50%; background: #e24a4a; }.notification-state { display: grid; min-height: 450px; place-items: center; padding: 24px; color: #8897a8; font-size: 13px; text-align: center; }.notification-state.empty { align-content: center; justify-items: center; gap: 9px; }.notification-state.empty svg { color: #9db9da; }.notification-state.empty b { color: #53687e; font-size: 15px; }.notification-state.empty span { color: #8996a5; font-size: 12px; }.notification-error { margin: 18px; padding: 10px 12px; border: 1px solid #f1c9ca; border-radius: 6px; background: #fff5f5; color: #bf3c42; font-size: 13px; }
@media (max-width: 720px) { .notifications-page { width: min(100% - 28px, 1180px); padding-top: 18px; }.notifications-hero { align-items: flex-start; flex-direction: column; padding: 20px; }.notifications-hero h1 { font-size: 26px; }.hero-actions { width: 100%; justify-content: stretch; }.hero-actions button { flex: 1; }.notification-workspace { min-height: calc(100vh - 250px); grid-template-columns: 1fr; }.notification-nav { flex-direction: row; overflow-x: auto; padding: 8px; border-right: 0; border-bottom: 1px solid #e2e9f1; }.nav-heading { display: none; }.notification-nav button { flex: 0 0 auto; }.notification-list > header { padding: 0 15px; }.notification-item { padding: 15px; }.notification-copy > span { align-items: flex-start; flex-direction: column; gap: 3px; }.notification-copy time { white-space: nowrap; } }
.notifications-page { width:min(1440px,calc(100% - 40px)); }.nav-heading .sidebar-collapse-button { display:grid; width:34px; height:34px; flex:0 0 34px; place-items:center; margin-left:0; padding:0; border:0; border-radius:10px; color:#637488; background:transparent; cursor:pointer; }.nav-heading .sidebar-collapse-button:hover { color:#1f5eff; background:#e7efff; }.notification-workspace.sidebar-collapsed { grid-template-columns:72px minmax(0,1fr); }.notification-workspace.sidebar-collapsed .notification-nav { padding-right:10px; padding-left:10px; }.notification-workspace.sidebar-collapsed .nav-heading { justify-content:center; padding-right:0; padding-left:0; }.notification-workspace.sidebar-collapsed .nav-heading>svg,.notification-workspace.sidebar-collapsed .nav-heading>strong,.notification-workspace.sidebar-collapsed .nav-heading>span { display:none; }.notification-workspace.sidebar-collapsed .notification-nav>button { justify-content:center; padding-right:0; padding-left:0; }.notification-workspace.sidebar-collapsed .notification-nav>button>span,.notification-workspace.sidebar-collapsed .notification-nav>button>i { display:none; }
@media (max-width:720px) { .notifications-page { width:min(100% - 28px,1440px); }.notification-workspace.sidebar-collapsed { grid-template-columns:1fr; }.notification-workspace.sidebar-collapsed .notification-nav { padding:8px; }.notification-workspace.sidebar-collapsed .notification-nav>button { justify-content:initial; padding-right:9px; padding-left:9px; }.notification-workspace.sidebar-collapsed .notification-nav>button>span { display:inline; }.notification-workspace.sidebar-collapsed .notification-nav>button>i { display:inline-grid; } }
</style>
