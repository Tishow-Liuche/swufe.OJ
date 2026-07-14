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
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          const storage = activeStorage();
          storage.setItem('accessToken', data.accessToken);
          storage.setItem('refreshToken', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          clearStoredTokens();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
