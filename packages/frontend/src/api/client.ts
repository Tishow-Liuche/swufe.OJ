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
// Unlike token rotation, a login/logout changes which identity owns requests.
let identityEpoch = 0;
let cookieOperation: Promise<unknown> | null = null;
let cookieIntent = 0;
const refreshAttemptStorageKey = 'swufe-refresh-attempt';
let memoryRefreshAttempt: string | null = null;
let memoryOnlyRefreshAttempt = false;

function pendingRefreshAttempt(): string | null {
  if (memoryOnlyRefreshAttempt) return memoryRefreshAttempt;
  try {
    // Read afresh under the Web Lock so another tab/reload can resume this attempt.
    const stored = localStorage.getItem(refreshAttemptStorageKey);
    return stored && /^[a-f0-9]{64}$/.test(stored) ? stored : null;
  } catch {
    return memoryRefreshAttempt;
  }
}

function clearRefreshAttempt(expected?: string | null) {
  if (expected !== undefined && pendingRefreshAttempt() !== expected) return;
  memoryRefreshAttempt = null;
  memoryOnlyRefreshAttempt = false;
  try { localStorage.removeItem(refreshAttemptStorageKey); } catch { /* Storage may be disabled. */ }
}

function getRefreshAttempt(): string {
  const pending = pendingRefreshAttempt();
  if (pending) return pending;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const attempt = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  memoryRefreshAttempt = attempt;
  // This is not a credential: without the HttpOnly cookie and server secret it grants nothing.
  try { localStorage.setItem(refreshAttemptStorageKey, attempt); } catch { memoryOnlyRefreshAttempt = true; }
  return attempt;
}

export function setAccessToken(token: string, options?: { newSession?: boolean }) {
  sessionGeneration++;
  if (options?.newSession) identityEpoch++;
  // Ordinary assignments (including store restoration) must not erase another tab's attempt.
  if (options?.newSession) clearRefreshAttempt();
  accessToken = token;
}

export function clearAccessToken() {
  sessionGeneration++;
  identityEpoch++;
  // Shared retry state belongs to the cookie operation under the browser lock.
  memoryRefreshAttempt = null;
  memoryOnlyRefreshAttempt = false;
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
  const pending = cookieOperation
    ? cookieOperation.catch(() => undefined).then(operation)
    : operation();
  const tracked = pending.finally(() => { if (cookieOperation === tracked) cookieOperation = null; });
  cookieOperation = tracked;
  return tracked;
}

/** Login/registration also write the shared HttpOnly cookie; use the same lock. */
export function establishSession(mode: 'login' | 'register', payload: unknown) {
  const intent = ++cookieIntent;
  return withRefreshLock(async () => {
    if (intent !== cookieIntent) throw new Error('登录操作已被后续操作取消');
    const result = await refreshClient.post(`/api/auth/${mode}`, payload);
    // A queued later logout must revoke even a cookie installed by this response.
    if (intent !== cookieIntent) throw new Error('登录操作已被后续操作取消');
    if (typeof result.data?.accessToken !== 'string' || !result.data.accessToken) {
      throw new Error('登录时未返回访问令牌');
    }
    setAccessToken(result.data.accessToken, { newSession: true });
    return result;
  });
}

export async function logoutSession() {
  ++cookieIntent;
  const fallbackAttempt = pendingRefreshAttempt();
  clearAccessToken();
  const generation = sessionGeneration;
  // A rotation may still install its cookie even if its access-token result is ignored.
  // Wait for it before revoking that cookie, including browsers without Web Locks.
  await refreshPromise?.catch(() => undefined);
  return withRefreshLock(async () => {
    if (generation !== sessionGeneration) throw new Error('Session changed during logout');
    const attempt = pendingRefreshAttempt() ?? fallbackAttempt;
    try {
      return await api.post('/api/auth/logout', undefined, {
        headers: attempt ? { 'X-Refresh-Attempt': attempt } : undefined,
      });
    } finally {
      if (generation === sessionGeneration) clearRefreshAttempt(attempt);
    }
  });
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const generation = sessionGeneration;
    const expectedSubject = tokenSubject(accessToken);
    refreshPromise = withRefreshLock(async () => {
      if (generation !== sessionGeneration) throw new Error('Session changed during refresh');
      const attempt = getRefreshAttempt();
      const request = () => refreshClient.post('/api/auth/refresh', undefined, {
        headers: { 'X-Refresh-Attempt': attempt },
      });
      try {
        const result = await request().catch(error => {
          const status = (error as AxiosError)?.response?.status;
          // One immediate retry for a lost response/server error; respect rate limits.
          if (generation === sessionGeneration && (status === undefined || status >= 500)) return request();
          throw error;
        });
        const { data } = result;
        if (generation !== sessionGeneration) throw new Error('Session changed during refresh');
        if (typeof data?.accessToken !== 'string' || !data.accessToken) {
          throw new Error('刷新登录状态时未返回访问令牌');
        }
        // A different tab may have logged into another account using the shared cookie.
        // This comparison is only a replay safety check; server verification authorizes requests.
        if (expectedSubject && tokenSubject(data.accessToken) !== expectedSubject) {
          throw new Error('登录账号已变更，请重新加载页面；原提交未自动重试');
        }
        clearRefreshAttempt(attempt);
        setAccessToken(data.accessToken);
        return data.accessToken;
      } catch (error) {
        const status = (error as AxiosError)?.response?.status;
        if (generation === sessionGeneration && [400, 401, 403].includes(status ?? 0)) clearRefreshAttempt(attempt);
        throw error;
      }
    })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

type RetryableRequest = InternalAxiosRequestConfig & { _retry?: boolean; _identityEpoch?: number };

function tokenSubject(token: string): string | undefined {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch { return undefined; }
}

function assertCurrentIdentity(config: RetryableRequest) {
  if (config._identityEpoch !== undefined && config._identityEpoch !== identityEpoch) {
    throw new axios.CanceledError('登录会话已变更，已取消旧请求', config);
  }
}

api.interceptors.request.use((config: RetryableRequest) => {
  assertCurrentIdentity(config);
  config._identityEpoch ??= identityEpoch;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
}, error => { throw error; }, { synchronous: true });

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

api.interceptors.response.use(
  (res) => {
    if (res.config.headers.Authorization) assertCurrentIdentity(res.config);
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as RetryableRequest | undefined;
    const hasAccessToken = Boolean(original?.headers.Authorization);
    const isRefreshRequest = original?.url === '/api/auth/refresh';
    if (original) assertCurrentIdentity(original);

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
        assertCurrentIdentity(original);
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
