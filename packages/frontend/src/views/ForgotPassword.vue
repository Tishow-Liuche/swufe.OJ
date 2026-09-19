<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import api from '../api/client';
const enabled = ref(false);
const checked = ref(false);
const phone = ref('');
const code = ref('');
const password = ref('');
const confirm = ref('');
const busy = ref(false);
const sending = ref(false);
const seconds = ref(0);
const message = ref('');
const error = ref('');
const done = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  try { enabled.value = (await api.get('/api/auth/password-recovery')).data.enabled; }
  catch { error.value = '暂时无法获取短信服务状态，请稍后再试'; }
  finally { checked.value = true; }
});
onUnmounted(() => { if (timer) clearInterval(timer); });
function describe(e: any) { return e.response?.data?.message || '请求失败，请稍后重试'; }
async function send() {
  if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) { error.value = '请输入有效的手机号码'; return; }
  sending.value = true; error.value = ''; message.value = '';
  try {
    const { data } = await api.post('/api/auth/password-recovery/code', { phone: phone.value.trim() });
    message.value = data.message;
    seconds.value = data.retryAfter || 60;
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (seconds.value > 0) seconds.value--; else if (timer) clearInterval(timer); }, 1000);
  } catch(e) { error.value = describe(e); }
  finally { sending.value = false; }
}
async function reset() {
  error.value = ''; message.value = '';
  if (password.value !== confirm.value) { error.value = '两次输入的密码不一致'; return; }
  busy.value = true;
  try {
    message.value = (await api.post('/api/auth/password-recovery/reset', {
      phone: phone.value.trim(), code: code.value.trim(), password: password.value,
    })).data.message;
    done.value = true; password.value = ''; confirm.value = ''; code.value = '';
  } catch(e) { error.value = describe(e); }
  finally { busy.value = false; }
}
</script>
<template>
  <main class="recovery-page">
    <section class="recovery-card">
      <router-link to="/login">返回登录</router-link>
      <h1>找回密码</h1>
      <p>使用账号已绑定的手机号码验证身份。</p>
      <p v-if="checked && !enabled" class="notice" role="status">短信服务尚未开通，请联系平台管理员协助重置密码。</p>
      <form v-if="!done" @submit.prevent="reset">
        <label>手机号码<input v-model="phone" required type="tel" autocomplete="tel" maxlength="11" placeholder="已绑定的手机号码" /></label>
        <label>短信验证码<div class="code-row"><input v-model="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="六位验证码" /><button type="button" :disabled="!enabled || sending || seconds > 0" @click="send">{{ sending ? '发送中…' : seconds > 0 ? seconds + '秒后重发' : '获取验证码' }}</button></div></label>
        <label>新密码<input v-model="password" required type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="至少八位，包含字母和数字" /></label>
        <label>确认新密码<input v-model="confirm" required type="password" minlength="8" maxlength="72" autocomplete="new-password" /></label>
        <button class="primary" :disabled="!enabled || busy">{{ busy ? '正在重置…' : '重置密码' }}</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <router-link v-if="done" to="/login">使用新密码登录</router-link>
    </section>
  </main>
</template>
<style scoped>
.recovery-page { min-height:calc(100vh - 60px); padding:48px 20px; background:#f4f6f8; color:#283c50; }
.recovery-card { width:min(440px, 100%); box-sizing:border-box; margin:auto; padding:28px; border:1px solid #dce3eb; border-radius:10px; background:white; }
h1 { margin:20px 0 10px; font-size:26px; } p { font-size:13px; line-height:1.7; }
a { color:#456784; } form, label { display:grid; gap:8px; } form { gap:18px; margin-top:24px; } label { font-size:13px; }
input { min-width:0; box-sizing:border-box; width:100%; padding:11px; border:1px solid #c9d4dd; border-radius:5px; font:inherit; }
input:focus { outline:2px solid #afc4d5; outline-offset:1px; }
.code-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
button { padding:10px 12px; border:1px solid #bccbd8; border-radius:5px; color:#385976; background:#edf2f6; cursor:pointer; }
button.primary { color:white; background:#456784; } button:disabled { opacity:.55; cursor:not-allowed; }
.notice { padding:10px; background:#edf3f5; border-radius:5px; }.error { color:#9a4444; }
</style>
