<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const isLoggedIn = ref(!!localStorage.getItem('accessToken'));

function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  isLoggedIn.value = false;
  router.push('/');
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <router-link to="/" class="logo">西财 OJ</router-link>
      <nav>
        <router-link to="/problems">题库</router-link>
        <router-link to="/submissions">提交</router-link>
        <router-link to="/contests">比赛</router-link>
        <router-link to="/problem-lists">题单</router-link>
      </nav>
    </div>
    <div class="header-right">
      <template v-if="isLoggedIn">
        <router-link to="/admin/create-problem">录题</router-link>
        <router-link to="/profile">个人中心</router-link>
        <button @click="logout">退出</button>
      </template>
      <template v-else>
        <router-link to="/login">登录</router-link>
      </template>
    </div>
  </header>
  <main>
    <router-view />
  </main>
</template>

<style scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 56px;
  background: #0f0c29;
  color: #eee;
  position: sticky; top: 0; z-index: 100;
  box-shadow: 0 1px 8px rgba(0,0,0,0.15);
}
.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}
.logo {
  font-size: 22px;
  font-weight: 800;
  background: linear-gradient(90deg, #4fc3f7, #81d4fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-decoration: none;
  margin-right: 8px;
}
nav { display: flex; gap: 4px; }
nav a, .header-right a {
  color: #b0bec5; text-decoration: none;
  padding: 6px 14px; border-radius: 6px;
  font-size: 14px; font-weight: 500;
  transition: all 0.2s;
}
nav a:hover, .header-right a:hover { color: #fff; background: rgba(255,255,255,0.08); }
nav a.router-link-exact-active, .header-right a.router-link-exact-active { color: #4fc3f7; background: rgba(79,195,247,0.1); }
button {
  background: #e74c3c; color: #fff; border: none;
  padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;
}
button:hover { background: #c0392b; }
main { max-width: 100%; overflow-x: hidden; }
</style>
