<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.clearAuth();
  router.push('/');
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-left">
        <router-link to="/" class="logo">西财 OJ</router-link>
        <nav>
          <router-link to="/problems">题库</router-link>
          <router-link to="/leaderboard">排行榜</router-link>
          <router-link to="/contests">比赛</router-link>
          <router-link to="/problem-lists">题单</router-link>
          <!-- 教师/管理员 -->
          <router-link v-if="auth.isTeacher()" to="/teacher/classes">班级</router-link>
        </nav>
      </div>
      <div class="header-right">
        <template v-if="auth.isLoggedIn()">
          <!-- 仅管理员可见 -->
          <router-link v-if="auth.isAdmin()" to="/admin/create-problem" class="admin-link">录题</router-link>
          <router-link v-if="auth.isAdmin()" to="/admin/import-atcoder" class="admin-link">AtCoder</router-link>
          <router-link v-if="auth.isAdmin()" to="/admin/users" class="admin-link">管理</router-link>
          <router-link to="/profile">个人中心</router-link>
          <button class="btn-logout" @click="logout">退出</button>
        </template>
        <template v-else>
          <router-link to="/login">登录</router-link>
        </template>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter','PingFang SC','Microsoft YaHei',sans-serif; background: #f5f6fa; color: #1a1a2e; }
#app { width: 100%; min-height: 100vh; }
.app-shell { width: 100%; min-height: 100vh; display: flex; flex-direction: column; }

.app-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 24px; height: 56px; background: #0f0c29; color: #eee;
  position: sticky; top: 0; z-index: 100; flex-shrink: 0;
  box-shadow: 0 1px 8px rgba(0,0,0,0.15);
}
.header-left, .header-right { display: flex; align-items: center; gap: 20px; }
.logo {
  font-size: 22px; font-weight: 800;
  background: linear-gradient(90deg, #4fc3f7, #81d4fa);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  text-decoration: none; margin-right: 8px;
}
nav { display: flex; gap: 2px; }
nav a, .header-right a {
  color: #b0bec5; text-decoration: none; padding: 6px 12px;
  border-radius: 6px; font-size: 14px; font-weight: 500; transition: all 0.2s;
}
nav a:hover, .header-right a:hover { color: #fff; background: rgba(255,255,255,0.08); }
nav a.router-link-exact-active, .header-right a.router-link-exact-active {
  color: #4fc3f7; background: rgba(79,195,247,0.1);
}
.admin-link { color: #ffd54f !important; }
.admin-link:hover { color: #fff !important; background: rgba(255,213,79,0.12) !important; }
.btn-logout { background: #e74c3c; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
.btn-logout:hover { background: #c0392b; }
.app-main { flex: 1; width: 100%; }
</style>
