<script setup lang="ts">
import { computed, ref } from 'vue';
import { KeyRound, LockKeyhole, ShieldCheck } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const password = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const error = ref('');
const valid = computed(() => password.value.length >= 8 && /[A-Za-z]/.test(password.value) && /\d/.test(password.value) && password.value === confirmPassword.value);

async function submit() {
  if (!valid.value) { error.value = '请设置至少 8 位、同时含字母和数字的新密码，并确认两次输入一致。'; return; }
  submitting.value = true; error.value = '';
  try {
    await api.post('/api/user/password', { password: password.value });
    await auth.fetchProfile();
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/problems';
    await router.replace(redirect);
  } catch (e: any) {
    error.value = e.response?.data?.message || '密码修改失败，请稍后重试';
  } finally { submitting.value = false; }
}
</script>

<template>
  <main class="change-page">
    <section class="change-card">
      <div class="icon"><KeyRound :size="28" aria-hidden="true" /></div>
      <p class="eyebrow">ACCOUNT SECURITY</p>
      <h1>请先设置新密码</h1>
      <p class="intro">你的初始密码为学号。为保护个人账号安全，首次登录后必须设置新的密码才能继续使用系统。</p>
      <form @submit.prevent="submit">
        <label>新密码
          <span><LockKeyhole :size="17" aria-hidden="true" /><input v-model="password" type="password" autocomplete="new-password" placeholder="至少 8 位，包含字母和数字" /></span>
        </label>
        <label>确认新密码
          <span><ShieldCheck :size="17" aria-hidden="true" /><input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" /></span>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button :disabled="submitting || !valid">{{ submitting ? '正在保存…' : '保存新密码并进入系统' }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.change-page { min-height:calc(100vh - 56px); display:grid; place-items:center; padding:32px 18px; background:radial-gradient(circle at 15% 18%,#e4f3ff 0,transparent 34%),#f5f7fa; color:#17253a; }.change-card { width:min(480px,100%); padding:36px; border:1px solid #e0e8f0; border-radius:24px; background:#fffdf9; box-shadow:0 20px 50px rgba(24,52,83,.12); }.icon { display:grid; width:52px; height:52px; place-items:center; color:#235f99; border-radius:15px; background:#e4f1fc; }.eyebrow { margin:22px 0 7px; color:#5b89b4; font-size:11px; font-weight:900; letter-spacing:.14em; }.change-card h1 { margin:0; font-size:28px; letter-spacing:-.04em; }.intro { margin:11px 0 24px; color:#6d7d90; font-size:14px; line-height:1.7; }.change-card form { display:grid; gap:15px; }.change-card label { display:grid; gap:7px; color:#405168; font-size:13px; font-weight:800; }.change-card label span { display:flex; align-items:center; gap:9px; padding:0 12px; color:#6b89a5; border:1px solid #dbe5ee; border-radius:10px; background:#fff; }.change-card input { width:100%; padding:12px 0; border:0; outline:0; color:#17253a; background:transparent; font:inherit; }.change-card button { margin-top:4px; padding:13px 18px; border:0; border-radius:10px; background:#1d5f98; color:#fff; font:inherit; font-weight:900; cursor:pointer; transition:.18s; }.change-card button:hover:not(:disabled) { background:#154c7b; transform:translateY(-1px); }.change-card button:disabled { opacity:.46; cursor:not-allowed; }.error { margin:0; color:#b3372f; font-size:12px; line-height:1.5; }
</style>
