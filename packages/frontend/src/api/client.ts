import axios from 'axios';

const api = axios.create({
  baseURL: '',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

function storedValue(key: string) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function activeStorage() {
  return localStorage.getItem('refreshToken') ? localStorage : sessionStorage;
}

function clearStoredTokens() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('accessToken');
    storage.removeItem('refreshToken');
  }
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(refreshToken: string) {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/auth/refresh', { refreshToken })
      .then(({ data }) => {
        const storage = activeStorage();
        storage.setItem('accessToken', data.accessToken);
        storage.setItem('refreshToken', data.refreshToken);
        return data.accessToken as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = storedValue('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 refresh
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = storedValue('refreshToken');
      if (refreshToken) {
        try {
          const accessToken = await refreshAccessToken(refreshToken);
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${accessToken}`;
          return api(original);
        } catch {
          clearStoredTokens();
          window.location.href = '/login';
        }
      } else {
        clearStoredTokens();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
