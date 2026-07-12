import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('accessToken') || '');
  const user = ref<any>(null);

  function setAuth(accessToken: string, refreshToken: string) {
    token.value = accessToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  function clearAuth() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  return { token, user, setAuth, clearAuth };
});
