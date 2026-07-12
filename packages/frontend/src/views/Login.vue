<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const isRegister = ref(false);
const form = ref({ username: '', email: '', password: '' });
const error = ref('');

async function submit() {
  error.value = '';
  try {
    const url = isRegister.value ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister.value
      ? { username: form.value.username, email: form.value.email, password: form.value.password }
      : { username: form.value.username, password: form.value.password };
    const { data } = await api.post(url, payload);
    auth.setAuth(data.accessToken, data.refreshToken);
    router.push('/problems');
  } catch (e: any) {
    error.value = e.response?.data?.message || '操作失败';
  }
}
</script>

<template>
  <div class="login-page">
    <h2>{{ isRegister ? '注册' : '登录' }}</h2>
    <form @submit.prevent="submit" class="form">
      <input v-model="form.username" placeholder="用户名" required />
      <input v-if="isRegister" v-model="form.email" type="email" placeholder="邮箱" required />
      <input v-model="form.password" type="password" placeholder="密码" required minlength="6" />
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit">{{ isRegister ? '注册' : '登录' }}</button>
    </form>
    <p class="toggle">
      {{ isRegister ? '已有账号？' : '没有账号？' }}
      <a @click="isRegister = !isRegister; error = ''">{{ isRegister ? '去登录' : '去注册' }}</a>
    </p>
  </div>
</template>

<style scoped>
.login-page { max-width: 400px; margin: 60px auto; }
h2 { text-align: center; margin-bottom: 24px; }
.form { display: flex; flex-direction: column; gap: 12px; }
input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}
button {
  padding: 10px;
  background: #4fc3f7;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}
.error { color: #e74c3c; font-size: 14px; }
.toggle { text-align: center; margin-top: 16px; }
.toggle a { color: #4fc3f7; cursor: pointer; }
</style>
