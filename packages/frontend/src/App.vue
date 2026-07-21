<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Bell, CalendarCheck, Mail, Menu, Search, X } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import api from './api/client';
import { useAuthStore } from './stores/auth';
import UserAvatar from './components/UserAvatar.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const mobileMenuOpen = ref(false);
const mobileMenuToggle = ref<HTMLButtonElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchOpen = ref(false);
const searchInput = ref('');
const notificationUnread = ref(0);
let notificationPoll: number | undefined;
const isHomeRoute = computed(() => route.path === '/');

watch(() => route.fullPath, closeMobileMenu);
watch(() => auth.user?.id, () => void fetchNotificationUnread());

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('swufe:notifications-changed', handleNotificationChanged);
  void fetchNotificationUnread();
  notificationPoll = window.setInterval(() => void fetchNotificationUnread(), 60_000);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('swufe:notifications-changed', handleNotificationChanged);
  if (notificationPoll) window.clearInterval(notificationPoll);
});

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

function closeSearch() {
  searchOpen.value = false;
}

function openSearch() {
  closeMobileMenu();
  searchOpen.value = true;
  void nextTick(() => searchInputRef.value?.focus());
}

function submitProblemSearch() {
  const keyword = searchInput.value.trim();
  closeSearch();
  void router.push({ path: '/problems', query: keyword ? { keyword } : {} });
}

function protectedNavigation(path: string) {
  if (auth.isLoggedIn()) return path;
  return { path: '/login', query: { redirect: path } };
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
  if (event.key === 'Escape') {
    if (searchOpen.value) {
      closeSearch();
      return;
    }
    if (!mobileMenuOpen.value) return;
    closeMobileMenu();
    void nextTick(() => mobileMenuToggle.value?.focus());
    return;
  }
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    openSearch();
  }
}

async function fetchNotificationUnread() {
  if (!auth.isLoggedIn()) {
    notificationUnread.value = 0;
    return;
  }
  try {
    const { data } = await api.get<{ unread?: number }>('/api/community/notifications');
    notificationUnread.value = data.unread || 0;
  } catch {
    notificationUnread.value = 0;
  }
}

function handleNotificationChanged(event: Event) {
  const detail = (event as CustomEvent<{ unread?: number }>).detail;
  if (typeof detail?.unread === 'number') notificationUnread.value = detail.unread;
  else void fetchNotificationUnread();
}

async function logout() {
  await auth.logout();
  closeMobileMenu();
  void router.push('/');
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header" :class="{ 'home-header': isHomeRoute }">
      <div class="header-left">
        <router-link to="/" class="logo" aria-label="SWUFE Singularity OJ 首页">SWUFE Singularity OJ</router-link>
        <nav class="desktop-nav" aria-label="主导航">
          <router-link :to="protectedNavigation('/problems')">题库</router-link>
          <router-link :to="protectedNavigation('/leaderboard')">排行榜</router-link>
          <router-link :to="protectedNavigation('/contests')">比赛</router-link>
          <router-link :to="protectedNavigation('/problem-lists')">学习</router-link>
          <router-link to="/community">社区</router-link>
          <router-link v-if="auth.isTeacher()" to="/teacher/classes">班级</router-link>
          <router-link v-if="auth.isStudent()" to="/classes">班级</router-link>
        </nav>
      </div>

      <div class="header-right desktop-actions">
        <template v-if="auth.isLoggedIn()">
          <router-link v-if="auth.isTeacher()" to="/admin/create-problem" class="admin-link">录题</router-link>
          <router-link v-if="auth.isTeacher()" to="/admin/problems/history" class="admin-link">历史录题</router-link>
          <router-link v-if="auth.isAdmin()" to="/admin/users" class="admin-link">管理</router-link>
          <router-link to="/check-in" class="checkin-link"><CalendarCheck :size="15" />签到</router-link>
          <div class="header-utility" aria-label="账号工具">
            <button class="header-icon" type="button" title="搜索题目" aria-label="搜索题目" @click="openSearch"><Search :size="19" /></button>
            <router-link class="header-icon" to="/messages" title="个人私信" aria-label="个人私信"><Mail :size="19" /></router-link>
            <router-link class="header-icon notification-link" to="/notifications" title="通知中心" aria-label="通知中心"><Bell :size="19" /><i v-if="notificationUnread" class="header-notification-count">{{ notificationUnread > 99 ? '99+' : notificationUnread }}</i></router-link>
            <router-link class="header-avatar-link" to="/profile" title="个人中心" aria-label="个人中心">
              <UserAvatar :name="auth.user?.nickname || auth.user?.username" :avatar="auth.user?.avatar" :size="32" />
              <span>个人中心</span>
            </router-link>
          </div>
          <button type="button" class="btn-logout" @click="logout">退出</button>
        </template>
        <template v-else>
          <button class="header-icon" type="button" title="搜索题目" aria-label="搜索题目" @click="openSearch"><Search :size="19" /></button>
          <router-link to="/login">登录</router-link>
        </template>
      </div>

      <button
        ref="mobileMenuToggle"
        type="button"
        class="mobile-menu-toggle"
        :aria-expanded="mobileMenuOpen"
        aria-controls="mobile-navigation"
        :aria-label="mobileMenuOpen ? '关闭导航' : '打开导航'"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <X v-if="mobileMenuOpen" :size="21" aria-hidden="true" />
        <Menu v-else :size="21" aria-hidden="true" />
      </button>
    </header>

    <Transition name="header-search">
      <form v-if="searchOpen" class="global-problem-search" @submit.prevent="submitProblemSearch">
        <Search :size="19" />
        <input ref="searchInputRef" v-model="searchInput" type="search" placeholder="搜索题目 ID、标题或来源" aria-label="搜索题目" />
        <button type="submit">搜索</button>
        <button class="close-search" type="button" title="关闭搜索" aria-label="关闭搜索" @click="closeSearch"><X :size="18" /></button>
      </form>
    </Transition>

    <Transition name="mobile-nav">
      <nav v-if="mobileMenuOpen" id="mobile-navigation" class="mobile-navigation" aria-label="移动端导航">
        <router-link :to="protectedNavigation('/problems')" @click="closeMobileMenu">题库</router-link>
        <router-link :to="protectedNavigation('/leaderboard')" @click="closeMobileMenu">排行榜</router-link>
        <router-link :to="protectedNavigation('/contests')" @click="closeMobileMenu">比赛</router-link>
        <router-link :to="protectedNavigation('/problem-lists')" @click="closeMobileMenu">学习</router-link>
        <router-link to="/community" @click="closeMobileMenu">社区</router-link>
        <router-link v-if="auth.isTeacher()" to="/teacher/classes" @click="closeMobileMenu">班级</router-link>
        <router-link v-if="auth.isStudent()" to="/classes" @click="closeMobileMenu">班级</router-link>
        <button type="button" @click="openSearch"><Search :size="17" />搜索题目</button>
        <template v-if="auth.isLoggedIn()">
          <router-link to="/messages" @click="closeMobileMenu"><Mail :size="17" />个人私信</router-link>
          <router-link to="/notifications" @click="closeMobileMenu"><Bell :size="17" />通知中心</router-link>
          <router-link v-if="auth.isTeacher()" to="/admin/create-problem" class="admin-link" @click="closeMobileMenu">录题</router-link>
          <router-link v-if="auth.isTeacher()" to="/admin/problems/history" class="admin-link" @click="closeMobileMenu">历史录题</router-link>
          <router-link v-if="auth.isAdmin()" to="/admin/users" class="admin-link" @click="closeMobileMenu">管理</router-link>
          <router-link to="/check-in" class="checkin-link" @click="closeMobileMenu"><CalendarCheck :size="15" />签到</router-link>
          <router-link to="/profile" @click="closeMobileMenu">个人中心</router-link>
          <button type="button" @click="logout">退出登录</button>
        </template>
        <router-link v-else to="/login" @click="closeMobileMenu">登录</router-link>
      </nav>
    </Transition>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style>
@import './styles/workspace-sidebars.css';

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: #f5f6fa;
  color: #1a1a2e;
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

#app,
.app-shell {
  width: 100%;
  min-height: 100vh;
}

.app-shell {
  display: flex;
  flex-direction: column;
}

.app-header {
  position: sticky;
  z-index: 100;
  top: 0;
  display: flex;
  height: 56px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid rgba(117, 151, 207, 0.16);
  background: rgba(253, 254, 255, 0.92);
  box-shadow: 0 1px 10px rgba(79, 112, 164, 0.08);
  color: #1c2a43;
  backdrop-filter: blur(14px);
}

.app-header .logo { color: #276be8; }

.app-header nav a,
.app-header .header-right a {
  color: #53627a;
}

.app-header nav a:hover,
.app-header .header-right a:hover {
  background: #edf4ff;
  color: #225fd0;
}

.app-header nav a.router-link-exact-active,
.app-header .header-right a.router-link-exact-active {
  background: #e9f1ff;
  color: #2164dc;
}

.app-header .mobile-menu-toggle { color: #2f466a; }

.app-header .mobile-menu-toggle:hover,
.app-header .mobile-menu-toggle:focus-visible {
  background: #edf4ff;
  outline-color: #3e7ee6;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.logo {
  position: relative;
  margin-right: 8px;
  color: #69c6ff;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.03em;
  text-decoration: none;
  white-space: nowrap;
}

.logo::after {
  position: absolute;
  top: 1px;
  right: -7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
  content: '';
}

nav {
  display: flex;
  gap: 2px;
}

nav a,
.header-right a {
  padding: 6px 12px;
  border-radius: 6px;
  color: #b0bec5;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: color 160ms ease, background 160ms ease;
}

.header-avatar-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px !important;
}

.header-avatar-link span {
  white-space: nowrap;
}

.header-utility {
  display: flex;
  align-items: center;
  gap: 5px;
}

.header-right .header-icon {
  position: relative;
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #53627a;
  cursor: pointer;
}

.header-right .header-icon:hover,
.header-right .header-icon.router-link-active,
.header-right .header-avatar-link:hover,
.header-right .header-avatar-link.router-link-active {
  border-color: #d4e3f6;
  background: #edf4ff;
  color: #2164dc;
}

.header-right .header-avatar-link {
  position: relative;
  border: 1px solid transparent;
}

.header-notification-count {
  position: absolute;
  top: -6px;
  right: -8px;
  display: inline-grid;
  min-width: 17px;
  height: 17px;
  place-items: center;
  padding: 0 3px;
  border: 2px solid #fdfefe;
  border-radius: 9px;
  background: #e24a4a;
  color: #fff;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
}

nav a:hover,
.header-right a:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

nav a.router-link-exact-active,
.header-right a.router-link-exact-active {
  background: rgba(79, 195, 247, 0.1);
  color: #4fc3f7;
}

.checkin-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.admin-link {
  color: #ffd54f !important;
}

.admin-link:hover {
  background: rgba(255, 213, 79, 0.12) !important;
  color: #fff !important;
}

.btn-logout {
  padding: 6px 16px;
  border: 0;
  border-radius: 6px;
  background: #e74c3c;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.btn-logout:hover {
  background: #c0392b;
}

.app-main {
  width: 100%;
  flex: 1;
}

.global-problem-search {
  position: fixed;
  z-index: 101;
  top: 66px;
  left: 50%;
  display: flex;
  width: min(540px, calc(100% - 32px));
  height: 48px;
  align-items: center;
  gap: 9px;
  padding: 0 8px 0 14px;
  transform: translateX(-50%);
  border: 1px solid #b9d2f1;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 14px 30px rgba(43, 80, 125, 0.18);
  color: #56708d;
}

.global-problem-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #273b50;
  font: inherit;
  font-size: 14px;
}

.global-problem-search > button {
  display: inline-flex;
  height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: #2469ad;
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.global-problem-search > .close-search {
  width: 32px;
  padding: 0;
  background: #edf3fa;
  color: #59708a;
}

.global-problem-search > .close-search:hover {
  background: #e1eaf5;
  color: #304e70;
}

.mobile-menu-toggle,
.mobile-navigation {
  display: none;
}

@media (max-width: 1180px) {
  .app-header {
    padding: 0 16px;
  }

  .desktop-nav,
  .desktop-actions {
    display: none;
  }

  .mobile-menu-toggle {
    display: inline-grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #2f466a;
  }

  .mobile-menu-toggle:hover,
  .mobile-menu-toggle:focus-visible {
    background: #edf4ff;
    outline: 2px solid #3e7ee6;
    outline-offset: 1px;
  }

  .mobile-navigation {
    position: fixed;
    z-index: 99;
    top: 56px;
    right: 0;
    left: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 14px 16px 18px;
    border-top: 1px solid #dce8fb;
    background: rgba(253, 254, 255, 0.98);
    box-shadow: 0 8px 20px rgba(67, 102, 158, 0.16);
  }

  .mobile-navigation a,
  .mobile-navigation button {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid #dae5f6;
    border-radius: 7px;
    background: #f5f9ff;
    color: #455a7b;
    font: inherit;
    font-size: 14px;
    text-decoration: none;
  }

  .mobile-navigation a.router-link-active,
  .mobile-navigation a:hover,
  .mobile-navigation button:hover {
    border-color: #a9c7f5;
    background: #e8f2ff;
    color: #2164dc;
  }
}

.mobile-nav-enter-active,
.mobile-nav-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.header-search-enter-active,
.header-search-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.header-search-enter-from,
.header-search-leave-to {
  opacity: 0;
  transform: translate(-50%, -7px);
}

.mobile-nav-enter-from,
.mobile-nav-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-nav-enter-active,
  .mobile-nav-leave-active {
    transition: none;
  }
}
</style>
