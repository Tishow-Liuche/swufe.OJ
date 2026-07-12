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
      </nav>
    </div>
    <div class="header-right">
      <template v-if="isLoggedIn">
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
  background: #1a1a2e;
  color: #eee;
}
.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}
.logo {
  font-size: 20px;
  font-weight: bold;
  color: #4fc3f7;
  text-decoration: none;
}
nav a, .header-right a {
  color: #ccc;
  text-decoration: none;
}
nav a:hover, .header-right a:hover {
  color: #fff;
}
button {
  background: #e74c3c;
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
}
main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
</style>
