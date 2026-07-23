<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowRight,
  AtSign,
  BookOpenCheck,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  School,
  ShieldCheck,
  UserRound,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import FilterSelect from '../components/FilterSelect.vue';
import { useAuthStore } from '../stores/auth';

type AuthMode = 'login' | 'register';
type RequestedRole = 'STUDENT' | 'TEACHER';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const mode = ref<AuthMode>('login');
const submitting = ref(false);
const error = ref('');
const showLoginPassword = ref(false);
const showRegisterPassword = ref(false);
const showConfirmPassword = ref(false);

const loginForm = ref({
  account: '',
  password: '',
});

const registerForm = ref({
  username: '',
  email: '',
  school: '西南财经大学',
  customSchool: '',
  college: '',
  customCollege: '',
  studentId: '',
  requestedRole: 'STUDENT' as RequestedRole,
  password: '',
  confirmPassword: '',
});

const schoolOptions = [
  { value: '西南财经大学', label: '西南财经大学' },
  { value: '四川大学', label: '四川大学' },
  { value: '电子科技大学', label: '电子科技大学' },
  { value: '西南交通大学', label: '西南交通大学' },
  { value: '西南民族大学', label: '西南民族大学' },
  { value: '成都理工大学', label: '成都理工大学' },
  { value: '四川农业大学', label: '四川农业大学' },
  { value: '其他学校', label: '其他学校' },
];

const swufeCollegeOptions = [
  { value: '', label: '选择所在学院' },
  ...['金融学院、中国金融研究院', '经济学院', '会计学院', '统计与数据科学学院', '工商管理学院', '财政税务学院', '国际商学院', '经济与管理研究院', '中国西部经济研究院', '管理科学与工程学院', '计算机与人工智能学院', '法学院', '外国语学院', '公共管理学院', '马克思主义学院', '数学学院', '人文与艺术学院', '体育学院', '社会发展研究院', '特拉华数据科学学院', '继续教育学院（西南财经大学培训中心）', '国际教育学院', '北京研究院', '深圳高等研究院', '西部商学院', '出国留学预备学院'].map((value) => ({ value, label: value })),
];

const resolvedSchool = computed(() => (
  registerForm.value.school === '其他学校'
    ? registerForm.value.customSchool.trim()
    : registerForm.value.school
));
const resolvedCollege = computed(() => (
  registerForm.value.school === '西南财经大学'
    ? registerForm.value.college
    : registerForm.value.customCollege.trim()
));

const passwordChecks = computed(() => ({
  length: registerForm.value.password.length >= 8,
  letter: /[A-Za-z]/.test(registerForm.value.password),
  number: /\d/.test(registerForm.value.password),
}));

const passwordScore = computed(() => Object.values(passwordChecks.value).filter(Boolean).length);
const passwordLabel = computed(() => ['尚未输入', '较弱', '可用', '安全'][passwordScore.value]);
const passwordChangedNotice = computed(() => route.query.passwordChanged === '1');
const campusAccountPattern = /^[\p{L}\p{N}_-]{1,20}$/u;
const usernameHint = computed(() => {
  const username = registerForm.value.username;
  if (!username) return '';
  if (username.trim() !== username) return '用户名不能包含首尾空格';
  if (username.length < 1 || username.length > 20) return '用户名长度需为 1–20 个字符';
  if (!campusAccountPattern.test(username)) return '仅支持汉字、字母、数字、下划线和连字符';
  return '';
});

const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (mode.value === 'login') {
    return Boolean(loginForm.value.account.trim() && loginForm.value.password);
  }
  return Boolean(
    campusAccountPattern.test(registerForm.value.username.trim())
    && registerForm.value.email.trim()
    && resolvedSchool.value.length >= 2
    && (registerForm.value.requestedRole !== 'STUDENT' || /^\d{8}$/.test(registerForm.value.studentId.trim()))
    && (registerForm.value.requestedRole !== 'STUDENT' || resolvedCollege.value.length >= 2)
    && passwordScore.value === 3
    && registerForm.value.password === registerForm.value.confirmPassword,
  );
});

function switchMode(nextMode: AuthMode) {
  mode.value = nextMode;
  error.value = '';
}

function errorMessage(reason: any) {
  const message = reason.response?.data?.message;
  if (Array.isArray(message)) return message.join('；');
  if (message) return message;
  if (reason.code === 'ERR_NETWORK' || !reason.response) {
    return '无法连接后端服务，请确认 backend 已启动';
  }
  return mode.value === 'register' ? '注册失败，请稍后重试' : '登录失败，请稍后重试';
}

function postAuthPath() {
  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/problems';
}

async function submit() {
  error.value = '';

  if (mode.value === 'register') {
    if (registerForm.value.password !== registerForm.value.confirmPassword) {
      error.value = '两次输入的密码不一致';
      return;
    }
    if (!resolvedSchool.value) {
      error.value = '请填写学校名称';
      return;
    }
    if (registerForm.value.requestedRole === 'STUDENT' && !resolvedCollege.value) {
      error.value = '请选择或填写所在学院';
      return;
    }
  }

  if (mode.value === 'register' && registerForm.value.requestedRole === 'STUDENT' && !/^\d{8}$/.test(registerForm.value.studentId.trim())) {
    error.value = '学号必须为 8 位数字';
    return;
  }

  submitting.value = true;
  try {
    const payload = mode.value === 'register'
      ? {
          username: registerForm.value.username.trim(),
          email: registerForm.value.email.trim(),
          password: registerForm.value.password,
          school: resolvedSchool.value,
          studentId: registerForm.value.requestedRole === 'STUDENT' ? registerForm.value.studentId.trim() : undefined,
          college: registerForm.value.requestedRole === 'STUDENT' ? resolvedCollege.value : undefined,
          requestedRole: registerForm.value.requestedRole,
        }
      : {
          account: loginForm.value.account.trim(),
          password: loginForm.value.password,
    };
    const { data } = await api.post(`/api/auth/${mode.value}`, payload);
    await auth.setAuth(data.accessToken);
    await router.push(postAuthPath());
  } catch (reason: any) {
    error.value = errorMessage(reason);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-frame">
      <router-link to="/" class="auth-brand" aria-label="返回 SWUFE Singularity OJ 首页">
        <span class="brand-mark">
          <img class="brand-seal" src="/swufe-seal.png" width="34" height="34" alt="" />
        </span>
        <span>
          <strong>SWUFE Singularity OJ</strong>
          <small>西财奇点OJ · 校园算法训练平台</small>
        </span>
      </router-link>

      <main class="auth-panel" aria-labelledby="auth-heading">
        <div class="mode-switch" role="tablist" aria-label="账号操作">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'login'"
            :class="{ active: mode === 'login' }"
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'register'"
            :class="{ active: mode === 'register' }"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <header class="panel-heading">
          <span class="heading-icon" aria-hidden="true">
            <KeyRound v-if="mode === 'login'" :size="21" />
            <GraduationCap v-else :size="22" />
          </span>
          <div>
            <h1 id="auth-heading">{{ mode === 'login' ? '登录账号' : '创建校园账号' }}</h1>
          </div>
        </header>

        <form class="auth-form" novalidate @submit.prevent="submit">
          <template v-if="mode === 'login'">
            <label class="field-group" for="login-account">
              <span class="field-label">用户名或邮箱</span>
              <span class="input-shell">
                <AtSign :size="18" aria-hidden="true" />
                <input
                  id="login-account"
                  v-model="loginForm.account"
                  type="text"
                  autocomplete="username"
                  placeholder="输入用户名或邮箱"
                  autofocus
                  required
                />
              </span>
            </label>

            <label class="field-group" for="login-password">
              <span class="field-label">密码</span>
              <span class="input-shell">
                <LockKeyhole :size="18" aria-hidden="true" />
                <input
                  id="login-password"
                  v-model="loginForm.password"
                  :type="showLoginPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="输入密码"
                  required
                />
                <button
                  type="button"
                  class="visibility-button"
                  :aria-label="showLoginPassword ? '隐藏密码' : '显示密码'"
                  :title="showLoginPassword ? '隐藏密码' : '显示密码'"
                  @click="showLoginPassword = !showLoginPassword"
                >
                  <EyeOff v-if="showLoginPassword" :size="18" aria-hidden="true" />
                  <Eye v-else :size="18" aria-hidden="true" />
                </button>
              </span>
            </label>

          </template>

          <template v-else>
            <div class="field-grid">
              <label class="field-group" for="register-username">
                <span class="field-label">用户名</span>
                <span class="input-shell" :class="{ invalid: usernameHint }">
                  <UserRound :size="18" aria-hidden="true" />
                  <input
                    id="register-username"
                    v-model="registerForm.username"
                    type="text"
                    autocomplete="username"
                    minlength="1"
                    maxlength="20"
                    placeholder="1-20 位，支持汉字、字母、数字或 _ -"
                    required
                  />
                </span>
                <small v-if="usernameHint" class="field-error" role="status">{{ usernameHint }}</small>
              </label>

              <label class="field-group" for="register-email">
                <span class="field-label">邮箱</span>
                <span class="input-shell">
                  <Mail :size="18" aria-hidden="true" />
                  <input
                    id="register-email"
                    v-model="registerForm.email"
                    type="email"
                    autocomplete="email"
                    placeholder="name@example.com"
                    required
                  />
                </span>
              </label>
            </div>

            <div class="field-group">
              <span class="field-label">学校</span>
              <FilterSelect
                v-model="registerForm.school"
                class="school-select"
                :options="schoolOptions"
                label="选择学校"
              >
                <template #icon><School :size="18" aria-hidden="true" /></template>
              </FilterSelect>
            </div>

            <label v-if="registerForm.school === '其他学校'" class="field-group" for="custom-school">
              <span class="field-label">学校全称</span>
              <span class="input-shell">
                <School :size="18" aria-hidden="true" />
                <input
                  id="custom-school"
                  v-model="registerForm.customSchool"
                  type="text"
                  maxlength="80"
                  placeholder="输入学校全称"
                  required
                />
              </span>
            </label>

            <fieldset class="role-fieldset">
              <legend class="field-label">注册身份</legend>
              <div class="role-switch">
                <button
                  type="button"
                  :class="{ active: registerForm.requestedRole === 'STUDENT' }"
                  :aria-pressed="registerForm.requestedRole === 'STUDENT'"
                  @click="registerForm.requestedRole = 'STUDENT'"
                >
                  <BookOpenCheck :size="19" aria-hidden="true" />
                  <span><strong>学生</strong><small>参与训练与提交</small></span>
                </button>
                <button
                  type="button"
                  :class="{ active: registerForm.requestedRole === 'TEACHER' }"
                  :aria-pressed="registerForm.requestedRole === 'TEACHER'"
                  @click="registerForm.requestedRole = 'TEACHER'"
                >
                  <GraduationCap :size="20" aria-hidden="true" />
                  <span><strong>教师</strong><small>申请教学权限</small></span>
                </button>
              </div>
            </fieldset>

            <div v-if="registerForm.requestedRole === 'TEACHER'" class="teacher-notice" role="status">
              <ShieldCheck :size="19" aria-hidden="true" />
              <span>注册后可正常训练；教师管理权限将在管理员审核通过后开通。</span>
            </div>

            <label v-if="registerForm.requestedRole === 'STUDENT'" class="field-group" for="register-student-id">
              <span class="field-label">学号</span>
              <span class="input-shell" :class="{ invalid: registerForm.studentId && !/^\d{8}$/.test(registerForm.studentId.trim()) }">
                <UserRound :size="18" aria-hidden="true" />
                <input
                  id="register-student-id"
                  v-model="registerForm.studentId"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="8"
                  pattern="\d{8}"
                  placeholder="8 位数字学号"
                  required
                />
              </span>
              <small class="college-help">学生账号必须绑定本人 8 位学号。</small>
            </label>

            <div v-if="registerForm.requestedRole === 'STUDENT'" class="field-group">
              <span class="field-label">学院</span>
              <FilterSelect
                v-if="registerForm.school === '西南财经大学'"
                v-model="registerForm.college"
                class="school-select"
                :options="swufeCollegeOptions"
                label="选择所在学院"
              >
                <template #icon><GraduationCap :size="18" aria-hidden="true" /></template>
              </FilterSelect>
              <label v-else class="field-group nested-field" for="custom-college">
                <span class="input-shell">
                  <GraduationCap :size="18" aria-hidden="true" />
                  <input id="custom-college" v-model="registerForm.customCollege" type="text" maxlength="80" placeholder="填写本人所在学院" required />
                </span>
              </label>
              <small class="college-help">{{ registerForm.school === '西南财经大学' ? '请选择西南财经大学所属学院。' : '外校学生请填写本人所在学院。' }}</small>
            </div>

            <div class="field-grid">
              <label class="field-group" for="register-password">
                <span class="field-label">设置密码</span>
                <span class="input-shell">
                  <LockKeyhole :size="18" aria-hidden="true" />
                  <input
                    id="register-password"
                    v-model="registerForm.password"
                    :type="showRegisterPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    minlength="8"
                    maxlength="72"
                    placeholder="至少 8 位"
                    required
                  />
                  <button
                    type="button"
                    class="visibility-button"
                    :aria-label="showRegisterPassword ? '隐藏密码' : '显示密码'"
                    :title="showRegisterPassword ? '隐藏密码' : '显示密码'"
                    @click="showRegisterPassword = !showRegisterPassword"
                  >
                    <EyeOff v-if="showRegisterPassword" :size="18" aria-hidden="true" />
                    <Eye v-else :size="18" aria-hidden="true" />
                  </button>
                </span>
              </label>

              <label class="field-group" for="confirm-password">
                <span class="field-label">确认密码</span>
                <span class="input-shell" :class="{ invalid: registerForm.confirmPassword && registerForm.confirmPassword !== registerForm.password }">
                  <ShieldCheck :size="18" aria-hidden="true" />
                  <input
                    id="confirm-password"
                    v-model="registerForm.confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="再次输入密码"
                    required
                  />
                  <button
                    type="button"
                    class="visibility-button"
                    :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
                    :title="showConfirmPassword ? '隐藏密码' : '显示密码'"
                    @click="showConfirmPassword = !showConfirmPassword"
                  >
                    <EyeOff v-if="showConfirmPassword" :size="18" aria-hidden="true" />
                    <Eye v-else :size="18" aria-hidden="true" />
                  </button>
                </span>
              </label>
            </div>

            <div class="password-meter" aria-live="polite">
              <div class="meter-heading">
                <span>密码强度</span>
                <strong :class="`score-${passwordScore}`">{{ passwordLabel }}</strong>
              </div>
              <div class="meter-bars" aria-hidden="true">
                <span v-for="index in 3" :key="index" :class="{ active: passwordScore >= index }"></span>
              </div>
              <p>至少 8 位，同时包含字母和数字</p>
            </div>
          </template>

          <p v-if="passwordChangedNotice" class="form-success" role="status">密码已修改，请使用新密码重新登录。</p>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <button class="primary-action" type="submit" :disabled="!canSubmit">
            <LoaderCircle v-if="submitting" class="spin" :size="19" aria-hidden="true" />
            <template v-else>
              <span>{{ mode === 'login' ? '登录' : '创建账号' }}</span>
              <ArrowRight :size="18" aria-hidden="true" />
            </template>
          </button>
        </form>
      </main>

      <p class="auth-footer">
        {{ mode === 'login' ? '还没有账号？' : '已经有账号？' }}
        <button type="button" @click="switchMode(mode === 'login' ? 'register' : 'login')">
          {{ mode === 'login' ? '立即注册' : '返回登录' }}
        </button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  --auth-primary: #2457d6;
  --auth-primary-dark: #183f9e;
  --auth-ink: #20252c;
  --auth-muted: #66717f;
  --auth-outline: #d5dbe4;
  min-height: calc(100vh - 56px);
  padding: 42px 20px 56px;
  background: #eef1f4;
  color: var(--auth-ink);
  font-family: 'Noto Sans SC Variable', sans-serif;
  letter-spacing: 0;
}

.auth-frame {
  width: min(100%, 620px);
  margin: 0 auto;
}

.auth-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  margin: 0 0 18px 4px;
  color: var(--auth-ink);
  text-decoration: none;
}

.brand-mark,
.heading-icon {
  display: inline-grid;
  place-items: center;
  background: #dfe7ff;
  color: var(--auth-primary);
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #d7e2f5;
}

.brand-seal {
  width: 34px;
  height: 34px;
  object-fit: contain;
  display: block;
}

.auth-brand > span:last-child {
  display: flex;
  flex-direction: column;
}

.auth-brand strong {
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
  font-size: 18px;
  line-height: 1.15;
}

.auth-brand small {
  margin-top: 3px;
  color: var(--auth-muted);
  font-size: 11px;
}

.auth-panel {
  padding: 28px;
  border: 1px solid var(--auth-outline);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(32, 42, 56, 0.1), 0 2px 7px rgba(32, 42, 56, 0.06);
}

.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  padding: 4px;
  border-radius: 8px;
  background: #edf0f4;
}

.mode-switch button {
  height: 40px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5e6875;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.mode-switch button.active {
  background: #fff;
  box-shadow: 0 1px 4px rgba(32, 42, 56, 0.13);
  color: var(--auth-primary-dark);
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin: 25px 0 22px;
}

.heading-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 8px;
}

.panel-heading h1 {
  margin: 0;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
  font-size: 23px;
  line-height: 1.25;
  font-weight: 760;
}

.auth-form,
.field-group {
  display: flex;
  flex-direction: column;
}

.auth-form {
  gap: 17px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field-group {
  min-width: 0;
  gap: 7px;
}

.field-label {
  color: #3e4753;
  font-size: 13px;
  font-weight: 700;
}

.input-shell {
  display: flex;
  height: 50px;
  align-items: center;
  gap: 10px;
  padding: 0 13px;
  border: 1px solid var(--auth-outline);
  border-radius: 7px;
  background: #fff;
  color: #7a8491;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.input-shell:focus-within {
  border-color: var(--auth-primary);
  box-shadow: 0 0 0 3px rgba(36, 87, 214, 0.13);
  color: var(--auth-primary);
}

.input-shell.invalid {
  border-color: #c83b31;
  background: #fffafa;
}

.field-error {
  margin-top: -1px;
  color: #b63730;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.4;
}

.input-shell input {
  width: 100%;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--auth-ink);
  font: inherit;
  font-size: 14px;
}

.input-shell input::placeholder {
  color: #9aa3ad;
}

.visibility-button {
  display: inline-grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #7a8491;
  cursor: pointer;
}

.visibility-button:hover,
.visibility-button:focus-visible {
  background: #edf1f6;
  color: var(--auth-primary);
  outline: 0;
}

.school-select {
  height: 50px;
  --outline: var(--auth-outline);
  --ink: var(--auth-ink);
  --muted: var(--auth-muted);
  --primary: var(--auth-primary);
  --primary-strong: var(--auth-primary-dark);
  --primary-container: #dfe7ff;
  --surface: #fff;
  --surface-low: #f3f5f8;
}

.nested-field {
  margin: 0;
}

.college-help {
  color: #7f8a97;
  font-size: 11px;
  line-height: 1.45;
}

.role-fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.role-fieldset legend {
  margin-bottom: 8px;
}

.role-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.role-switch button {
  display: flex;
  min-height: 62px;
  align-items: center;
  gap: 11px;
  padding: 10px 13px;
  border: 1px solid var(--auth-outline);
  border-radius: 7px;
  background: #fff;
  color: #687381;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.role-switch button.active {
  border-color: var(--auth-primary);
  background: #f1f5ff;
  box-shadow: inset 3px 0 0 var(--auth-primary);
  color: var(--auth-primary-dark);
}

.role-switch button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.role-switch strong {
  color: var(--auth-ink);
  font-size: 14px;
}

.role-switch small {
  margin-top: 2px;
  color: var(--auth-muted);
  font-size: 11px;
}

.teacher-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 13px;
  border-left: 3px solid #d37b09;
  border-radius: 4px;
  background: #fff7e8;
  color: #6e4a13;
  font-size: 12px;
  line-height: 1.6;
}

.teacher-notice svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.password-meter {
  margin-top: -5px;
}

.meter-heading {
  display: flex;
  justify-content: space-between;
  color: var(--auth-muted);
  font-size: 11px;
}

.meter-heading strong.score-1 { color: #c83b31; }
.meter-heading strong.score-2 { color: #b66a08; }
.meter-heading strong.score-3 { color: #167652; }

.meter-bars {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 6px;
}

.meter-bars span {
  height: 4px;
  border-radius: 2px;
  background: #e3e7ec;
}

.meter-bars span.active:nth-child(1) { background: #c83b31; }
.meter-bars span.active:nth-child(2) { background: #d37b09; }
.meter-bars span.active:nth-child(3) { background: #16805c; }

.password-meter p {
  margin: 6px 0 0;
  color: #7a8491;
  font-size: 11px;
}

.remember-row {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  color: #596472;
  font-size: 13px;
  cursor: pointer;
}

.remember-row input {
  width: 17px;
  height: 17px;
  accent-color: var(--auth-primary);
}

.form-error {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid #c83b31;
  border-radius: 4px;
  background: #fff0ef;
  color: #9c2f28;
  font-size: 13px;
  line-height: 1.5;
}

.form-success {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid #22a06b;
  border-radius: 4px;
  background: #eefaf4;
  color: #177245;
  font-size: 13px;
  line-height: 1.5;
}

.primary-action {
  position: relative;
  display: inline-flex;
  width: 100%;
  height: 50px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
  border: 0;
  border-radius: 7px;
  background: var(--auth-primary);
  box-shadow: 0 3px 8px rgba(36, 87, 214, 0.22);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  cursor: pointer;
  transition: background 150ms ease, box-shadow 150ms ease, transform 100ms ease;
}

.primary-action:hover:not(:disabled) {
  background: var(--auth-primary-dark);
  box-shadow: 0 5px 12px rgba(36, 87, 214, 0.26);
}

.primary-action:active:not(:disabled) {
  transform: translateY(1px);
}

.primary-action:disabled {
  background: #a8b1bd;
  box-shadow: none;
  cursor: not-allowed;
}

.auth-footer {
  margin: 17px 0 0;
  color: var(--auth-muted);
  font-size: 13px;
  text-align: center;
}

.auth-footer button {
  margin-left: 4px;
  padding: 3px 4px;
  border: 0;
  background: transparent;
  color: var(--auth-primary-dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.auth-footer button:hover {
  text-decoration: underline;
}

.spin {
  animation: spin 750ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--auth-primary);
  outline-offset: 2px;
}

@media (max-width: 620px) {
  .auth-page {
    padding: 24px 12px 40px;
  }

  .auth-panel {
    padding: 20px 16px;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .role-switch {
    gap: 8px;
  }

  .role-switch button {
    min-height: 66px;
    padding: 9px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition: none !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
