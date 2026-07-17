import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const clientOptions = {
  baseURL: '',
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
};

const api = axios.create(clientOptions);

// This separate client deliberately has no 401 interceptor, avoiding a refresh loop.
export const refreshClient = axios.create(clientOptions);

let accessToken = '';
let refreshPromise: Promise<string> | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = '';
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/api/auth/refresh')
      .then(({ data }) => {
        if (typeof data?.accessToken !== 'string' || !data.accessToken) {
          throw new Error('刷新登录状态时未返回访问令牌');
        }
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

type RetryableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetryableRequest | undefined;
    const hasAccessToken = Boolean(original?.headers.Authorization);
    const isRefreshRequest = original?.url === '/api/auth/refresh';

    if (error.response?.status === 401 && original && hasAccessToken && !original._retry && !isRefreshRequest) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        clearAccessToken();
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  },
);

export default api;
