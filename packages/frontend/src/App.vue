<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Menu, X } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const mobileMenuOpen = ref(false);
const mobileMenuToggle = ref<HTMLButtonElement | null>(null);

watch(() => route.fullPath, closeMobileMenu);

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown));

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !mobileMenuOpen.value) return;
  closeMobileMenu();
  void nextTick(() => mobileMenuToggle.value?.focus());
}

async function logout() {
  await auth.logout();
  closeMobileMenu();
  void router.push('/');
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-left">
        <router-link to="/" class="logo">西财 OJ</router-link>
        <nav class="desktop-nav" aria-label="主导航">
          <router-link to="/problems">题库</router-link>
          <router-link to="/leaderboard">排行榜</router-link>
          <router-link to="/contests">比赛</router-link>
          <router-link to="/problem-lists">题单</router-link>
          <router-link v-if="auth.isTeacher()" to="/teacher/classes">班级</router-link>
        </nav>
      </div>

      <div class="header-right desktop-actions">
        <template v-if="auth.isLoggedIn()">
          <router-link v-if="auth.isAdmin()" to="/admin/create-problem" class="admin-link">录题</router-link>
          <router-link v-if="auth.isAdmin()" to="/admin/users" class="admin-link">管理</router-link>
          <router-link to="/profile">个人中心</router-link>
          <button type="button" class="btn-logout" @click="logout">退出</button>
        </template>
        <router-link v-else to="/login">登录</router-link>
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

    <Transition name="mobile-nav">
      <nav v-if="mobileMenuOpen" id="mobile-navigation" class="mobile-navigation" aria-label="移动端导航">
        <router-link to="/problems" @click="closeMobileMenu">题库</router-link>
        <router-link to="/leaderboard" @click="closeMobileMenu">排行榜</router-link>
        <router-link to="/contests" @click="closeMobileMenu">比赛</router-link>
        <router-link to="/problem-lists" @click="closeMobileMenu">题单</router-link>
        <router-link v-if="auth.isTeacher()" to="/teacher/classes" @click="closeMobileMenu">班级</router-link>
        <template v-if="auth.isLoggedIn()">
          <router-link v-if="auth.isAdmin()" to="/admin/create-problem" class="admin-link" @click="closeMobileMenu">录题</router-link>
          <router-link v-if="auth.isAdmin()" to="/admin/users" class="admin-link" @click="closeMobileMenu">管理</router-link>
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
  background: #171a1f;
  box-shadow: 0 1px 8px rgba(14, 18, 24, 0.22);
  color: #eee;
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
  font-size: 22px;
  font-weight: 800;
  text-decoration: none;
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

.mobile-menu-toggle,
.mobile-navigation {
  display: none;
}

@media (max-width: 900px) {
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
    color: #d9e2ec;
  }

  .mobile-menu-toggle:hover,
  .mobile-menu-toggle:focus-visible {
    background: rgba(255, 255, 255, 0.1);
    outline: 2px solid #69c6ff;
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
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: #171a1f;
    box-shadow: 0 8px 20px rgba(14, 18, 24, 0.24);
  }

  .mobile-navigation a,
  .mobile-navigation button {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.04);
    color: #d5dde6;
    font: inherit;
    font-size: 14px;
    text-decoration: none;
  }

  .mobile-navigation a.router-link-active,
  .mobile-navigation a:hover,
  .mobile-navigation button:hover {
    border-color: rgba(105, 198, 255, 0.35);
    background: rgba(105, 198, 255, 0.12);
    color: #69c6ff;
  }
}

.mobile-nav-enter-active,
.mobile-nav-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
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
