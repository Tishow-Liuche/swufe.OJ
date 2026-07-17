import { defineStore } from 'pinia';
import { ref } from 'vue';
import api, { clearAccessToken, refreshAccessToken, setAccessToken } from '../api/client';

interface AuthUser {
  id: string;
  username: string;
  role: string;
  nickname?: string;
  avatar?: string | null;
  school?: string;
  studentId?: string;
  college?: string;
  phone?: string;
  mustChangePassword?: boolean;
  requestedRole?: 'STUDENT' | 'TEACHER';
  teacherApplicationStatus?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('');
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  let profilePromise: Promise<void> | null = null;
  let restorePromise: Promise<boolean> | null = null;

  async function setAuth(accessToken: string) {
    token.value = accessToken;
    setAccessToken(accessToken);
    await fetchProfile();
  }

  function clearAuth() {
    token.value = '';
    user.value = null;
    clearAccessToken();
  }

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      clearAuth();
    }
  }

  async function fetchProfile() {
    if (!token.value) return;
    if (profilePromise) return profilePromise;

    profilePromise = (async () => {
      try {
        loading.value = true;
        const { data } = await api.get('/api/user/profile');
        user.value = data;
      } catch {
        clearAuth();
      } finally {
        loading.value = false;
        profilePromise = null;
      }
    })();
    return profilePromise;
  }

  async function restoreSession(): Promise<boolean> {
    if (isLoggedIn()) return true;
    if (restorePromise) return restorePromise;

    restorePromise = (async () => {
      try {
        if (!token.value) {
          token.value = await refreshAccessToken();
          setAccessToken(token.value);
        }
        await fetchProfile();
        return isLoggedIn();
      } catch {
        clearAuth();
        return false;
      } finally {
        restorePromise = null;
      }
    })();
    return restorePromise;
  }

  const isLoggedIn = () => !!user.value && !!token.value;
  const isAdmin = () => user.value?.role === 'ADMIN';
  const isTeacher = () => user.value?.role === 'TEACHER' || user.value?.role === 'ADMIN';
  const isStudent = () => user.value?.role === 'STUDENT';

  return {
    token,
    user,
    loading,
    setAuth,
    clearAuth,
    logout,
    fetchProfile,
    restoreSession,
    isLoggedIn,
    isAdmin,
    isTeacher,
    isStudent,
  };
});
