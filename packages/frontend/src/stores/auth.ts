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
  const avatarRevision = ref(0);
  let avatarRecovery: { source: string; at: number; promise: Promise<void> | null } | null = null;
  let avatarGeneration = 0;
  let profilePromise: Promise<void> | null = null;
  let restorePromise: Promise<boolean> | null = null;

  async function setAuth(accessToken: string) {
    token.value = accessToken;
    setAccessToken(accessToken);
    await fetchProfile();
  }

  function clearAuth() {
    avatarGeneration++;
    avatarRecovery = null;
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

  async function recoverAvatar(failedSource: string) {
    if (!isLoggedIn() || !failedSource || user.value?.avatar !== failedSource) return;
    if (avatarRecovery?.source === failedSource) {
      if (avatarRecovery.promise) return avatarRecovery.promise;
      if (Date.now() - avatarRecovery.at < 30_000) return;
    }
    const recovery = { source: failedSource, at: Date.now(), promise: null as Promise<void> | null };
    avatarRecovery = recovery;
    const generation = avatarGeneration;
    const userId = user.value!.id;
    const stillCurrent = () => generation === avatarGeneration && isLoggedIn()
      && user.value?.id === userId && user.value.avatar === failedSource;
    const pending = (async () => {
      // S3 signatures use whole seconds; wait before requesting a fresh URL.
      await new Promise(resolve => setTimeout(resolve, 1100));
      if (!stillCurrent()) return;
      try {
        const { data } = await api.get('/api/user/profile', { preserveSessionOnFailure: true });
        if (!stillCurrent() || data.id !== userId) return;
        user.value!.avatar = data.avatar ?? null;
        recovery.source = data.avatar ?? failedSource;
        avatarRevision.value++;
      } catch {
        // An optional image failure must not clear the authenticated session.
      }
    })();
    recovery.promise = pending;
    try {
      await pending;
    } finally {
      recovery.promise = null;
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
    avatarRevision,
    recoverAvatar,
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
