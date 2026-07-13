import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api/client';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('accessToken') || '');
  const user = ref<{ id: string; username: string; role: string; nickname?: string } | null>(null);
  const loading = ref(false);

  function setAuth(accessToken: string, refreshToken: string) {
    token.value = accessToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    // 登录后立即获取用户信息
    fetchProfile();
  }

  function clearAuth() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async function fetchProfile() {
    if (!token.value) return;
    try {
      loading.value = true;
      const { data } = await api.get('/api/user/profile');
      user.value = data;
    } catch {
      clearAuth();
    } finally {
      loading.value = false;
    }
  }

  const isLoggedIn = () => !!user.value && !!token.value;
  const isAdmin = () => user.value?.role === 'ADMIN';
  const isTeacher = () => user.value?.role === 'TEACHER' || user.value?.role === 'ADMIN';
  const isStudent = () => user.value?.role === 'STUDENT';

  // 启动时如果有 token 就加载 profile
  if (token.value) fetchProfile();

  return { token, user, loading, setAuth, clearAuth, fetchProfile, isLoggedIn, isAdmin, isTeacher, isStudent };
});
