import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api/client';

interface AuthUser {
  id: string;
  username: string;
  role: string;
  nickname?: string;
  school?: string;
  requestedRole?: 'STUDENT' | 'TEACHER';
  teacherApplicationStatus?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

function storedValue(key: string) {
  return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(storedValue('accessToken'));
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);

  async function setAuth(accessToken: string, refreshToken: string, remember = true) {
    clearStoredTokens();
    const storage = remember ? localStorage : sessionStorage;
    token.value = accessToken;
    storage.setItem('accessToken', accessToken);
    storage.setItem('refreshToken', refreshToken);
    await fetchProfile();
  }

  function clearStoredTokens() {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem('accessToken');
      storage.removeItem('refreshToken');
    }
  }

  function clearAuth() {
    token.value = '';
    user.value = null;
    clearStoredTokens();
  }

  async function logout() {
    const refreshToken = storedValue('refreshToken');
    try {
      if (refreshToken) await api.post('/api/auth/logout', { refreshToken });
    } finally {
      clearAuth();
    }
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

  return {
    token,
    user,
    loading,
    setAuth,
    clearAuth,
    logout,
    fetchProfile,
    isLoggedIn,
    isAdmin,
    isTeacher,
    isStudent,
  };
});
