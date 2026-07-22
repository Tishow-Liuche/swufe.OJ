<script setup lang="ts">
import { ref } from 'vue';
import { ArrowLeft, DoorOpen, ShieldCheck } from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../api/client';

const joinCode = ref('');
const submitting = ref(false);
const message = ref('');
const error = ref('');

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
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '提交入班申请失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="class-join-page">
    <section class="join-shell">
      <router-link to="/classes" class="back-link"><ArrowLeft :size="16" />返回班级工作台</router-link>
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
</template>

<style scoped>
.class-join-page { display: grid; min-height: calc(100vh - 56px); place-items: start center; padding: 56px 20px; background: #f3f5f7; font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif; }.join-shell { width: min(620px, 100%); padding: 30px; border: 1px solid #dce5ef; border-radius: 18px; background: #fff; box-shadow: 0 14px 30px rgba(31, 66, 104, .08); }.back-link { display: inline-flex; align-items: center; gap: 6px; color: #3977aa; font-size: 12px; font-weight: 800; text-decoration: none; }.back-link:hover { color: #1f5eff; }.join-shell header { display: flex; align-items: center; gap: 14px; margin: 28px 0 24px; }.join-icon { display: grid; width: 50px; height: 50px; flex: 0 0 50px; place-items: center; border-radius: 14px; color: #1f5eff; background: #e7efff; }.join-shell header p { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 5px; color: #3977aa; font-size: 10px; font-weight: 900; }.join-shell h1 { margin: 0; color: #263b51; font-size: 25px; }.join-shell header span { display: block; margin-top: 6px; color: #6d7d90; font-size: 13px; }.join-shell form { display: grid; gap: 8px; }.join-shell label { color: #57687b; font-size: 12px; font-weight: 850; }.join-shell input { height: 48px; padding: 0 14px; border: 1px solid #bfcde0; border-radius: 10px; color: #18365f; background: #fff; font: 800 19px Consolas, monospace; letter-spacing: 3px; text-transform: uppercase; }.join-shell input:focus { border-color: #2f72ca; outline: 3px solid rgba(47, 114, 202, .13); }.join-shell button { min-height: 44px; margin-top: 8px; border: 0; border-radius: 10px; color: #fff; background: #2469ad; font: inherit; font-size: 13px; font-weight: 850; cursor: pointer; }.join-shell button:disabled { opacity: .5; cursor: default; }.feedback { margin: 14px 0 0; padding: 10px 12px; border-radius: 8px; font-size: 13px; }.feedback.success { color: #176b42; background: #eaf7ef; }.feedback.error { color: #a33c35; background: #fff0ef; }@media (max-width: 560px) { .class-join-page { padding: 24px 14px; }.join-shell { padding: 22px; }.join-shell header { align-items: flex-start; }.join-shell h1 { font-size: 22px; } }
</style>
