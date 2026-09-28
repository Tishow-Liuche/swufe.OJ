import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Optional media recovery must never redirect or clear login on failure. */
    preserveSessionOnFailure?: boolean;
  }
}

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
let sessionGeneration = 0;

export function setAccessToken(token: string) {
  sessionGeneration++;
  accessToken = token;
}

export function clearAccessToken() {
  sessionGeneration++;
  accessToken = '';
}

export function isAuthenticationFailure(error: unknown): boolean {
  return (error as AxiosError | undefined)?.response?.status === 401;
}

function withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  // The HttpOnly cookie is shared by tabs; serialize rotation without exposing it.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('swufe-auth-cookie', operation);
  }
  return operation();
}

export async function logoutSession() {
  clearAccessToken();
  // A rotation may still install its cookie even if its access-token result is ignored.
  // Wait for it before revoking that cookie, including browsers without Web Locks.
  await refreshPromise?.catch(() => undefined);
  return withRefreshLock(() => api.post('/api/auth/logout'));
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const generation = sessionGeneration;
    refreshPromise = withRefreshLock(() => {
      if (generation !== sessionGeneration) return Promise.reject(new Error('Session changed during refresh'));
      return refreshClient.post('/api/auth/refresh');
    })
      .then(({ data }) => {
        if (generation !== sessionGeneration) throw new Error('Session changed during refresh');
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

    if (error.response?.status === 401 && original?._retry && !original.preserveSessionOnFailure
      && original.headers.Authorization === `Bearer ${accessToken}`) {
      clearAccessToken();
      redirectToLogin();
    }

    if (error.response?.status === 401 && original && hasAccessToken && !original._retry && !isRefreshRequest) {
      original._retry = true;
      const generation = sessionGeneration;
      try {
        const token = accessToken && original.headers.Authorization !== `Bearer ${accessToken}`
          ? accessToken : await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        if (isAuthenticationFailure(refreshError) && generation === sessionGeneration && !original.preserveSessionOnFailure) {
          clearAccessToken();
          redirectToLogin();
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
