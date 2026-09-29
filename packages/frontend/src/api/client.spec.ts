import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, {
  clearAccessToken,
  refreshAccessToken,
  refreshClient,
  setAccessToken,
  logoutSession,
  establishSession,
} from './client';

function response(config: InternalAxiosRequestConfig, data: unknown = {}): AxiosResponse<unknown> {
  return {
    config,
    data,
    headers: {},
    status: 200,
    statusText: 'OK',
  };
}

function authorization(config: InternalAxiosRequestConfig): string | undefined {
  const headers = config.headers as { get?: (name: string) => string | undefined; Authorization?: string } | undefined;
  return headers?.get?.('Authorization') ?? headers?.Authorization;
}

describe('API session client', () => {
  const apiAdapter = api.defaults.adapter;
  const refreshAdapter = refreshClient.defaults.adapter;

  beforeEach(() => {
    clearAccessToken();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
    api.defaults.adapter = apiAdapter;
    refreshClient.defaults.adapter = refreshAdapter;
  });

  it('only sends an access token held in process memory', async () => {
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return response(config);
    };

    localStorage.setItem('accessToken', 'persisted-token');
    await api.get('/api/protected');
    expect(authorization(request!)).toBeUndefined();

    setAccessToken('memory-token');
    await api.get('/api/protected');
    expect(authorization(request!)).toBe('Bearer memory-token');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('refreshes through a credentialed Cookie request without a JSON token body', async () => {
    let request: InternalAxiosRequestConfig | undefined;
    refreshClient.defaults.adapter = async (config) => {
      request = config;
      return response(config, { accessToken: 'renewed-token' });
    };

    await expect(refreshAccessToken()).resolves.toBe('renewed-token');
    expect(request?.url).toBe('/api/auth/refresh');
    expect(request?.data).toBeUndefined();
    expect(request?.withCredentials).toBe(true);
  });

  it('immediately retries a lost response once with the same cryptographic attempt', async () => {
    const attempts: unknown[] = [];
    refreshClient.defaults.adapter = async config => {
      attempts.push(config.headers.get('X-Refresh-Attempt'));
      if (attempts.length === 1) throw new Error('response lost after server commit');
      return response(config, { accessToken: 'recovered' });
    };
    await expect(refreshAccessToken()).resolves.toBe('recovered');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(attempts[1]).toBe(attempts[0]);
    expect(localStorage.getItem('swufe-refresh-attempt')).toBeNull();
  });

  it.each([undefined, 429, 503])('retains only the retry key after transient status %s, then uses it on retry', async status => {
    const attempts: unknown[] = [];
    refreshClient.defaults.adapter = async config => {
      attempts.push(config.headers.get('X-Refresh-Attempt'));
      throw { response: status ? { status } : undefined };
    };
    await expect(refreshAccessToken()).rejects.toBeDefined();
    expect(attempts.length).toBeLessThanOrEqual(2);
    expect(attempts[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(localStorage.getItem('swufe-refresh-attempt')).toBe(attempts[0]);
    expect(localStorage.length).toBe(1);
    refreshClient.defaults.adapter = async config => {
      expect(config.headers.get('X-Refresh-Attempt')).toBe(attempts[0]);
      return response(config, { accessToken: 'renewed' });
    };
    await refreshAccessToken();
    expect(localStorage.length).toBe(0);
  });

  it('reuses a pending key after a reload or in another tab', async () => {
    refreshClient.defaults.adapter = async () => { throw { response: { status: 429 } }; };
    await expect(refreshAccessToken()).rejects.toBeDefined();
    const pending = localStorage.getItem('swufe-refresh-attempt');
    expect(pending).toMatch(/^[a-f0-9]{64}$/);
    vi.resetModules();
    const reloaded = await import('./client');
    reloaded.refreshClient.defaults.adapter = async config => {
      expect(config.headers.get('X-Refresh-Attempt')).toBe(pending);
      return response(config, { accessToken: 'renewed' });
    };
    await reloaded.refreshAccessToken();
    expect(localStorage.length).toBe(0);
  });

  it('retains the attempt in memory if storage writes are denied but reads still work', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    let firstAttempt: unknown;
    refreshClient.defaults.adapter = async config => {
      firstAttempt = config.headers.get('X-Refresh-Attempt');
      throw { response: { status: 429 } };
    };
    await expect(refreshAccessToken()).rejects.toBeDefined();
    refreshClient.defaults.adapter = async config => {
      expect(config.headers.get('X-Refresh-Attempt')).toBe(firstAttempt);
      return response(config, { accessToken: 'renewed' });
    };
    await refreshAccessToken();
  });

  it.each([400, 401, 403])('clears a pending key on definitive auth failure %s', async status => {
    localStorage.setItem('swufe-refresh-attempt', 'a'.repeat(64));
    refreshClient.defaults.adapter = async () => { throw { response: { status } }; };
    await expect(refreshAccessToken()).rejects.toBeDefined();
    expect(localStorage.getItem('swufe-refresh-attempt')).toBeNull();
  });

  it('starts a new retry generation after a new login', async () => {
    localStorage.setItem('swufe-refresh-attempt', 'a'.repeat(64));
    setAccessToken('new-login', { newSession: true });
    expect(localStorage.getItem('swufe-refresh-attempt')).toBeNull();
    refreshClient.defaults.adapter = async config => {
      expect(config.headers.get('X-Refresh-Attempt')).toMatch(/^[a-f0-9]{64}$/);
      expect(config.headers.get('X-Refresh-Attempt')).not.toBe('a'.repeat(64));
      return response(config, { accessToken: 'renewed' });
    };
    await refreshAccessToken();
  });

  it('sends the pending key on logout before clearing it so an undelivered cookie is revoked', async () => {
    localStorage.setItem('swufe-refresh-attempt', 'a'.repeat(64));
    api.defaults.adapter = async config => {
      expect(config.headers.get('X-Refresh-Attempt')).toBe('a'.repeat(64));
      return response(config);
    };
    await logoutSession();
    expect(localStorage.length).toBe(0);
  });

  it('does not clear another tab retry key when merely assigning a restored token', () => {
    localStorage.setItem('swufe-refresh-attempt', 'b'.repeat(64));
    setAccessToken('restored-token');
    expect(localStorage.getItem('swufe-refresh-attempt')).toBe('b'.repeat(64));
  });

  it('keeps the shared attempt while logout waits and revokes the latest key under the lock', async () => {
    let release!: () => void;
    const request = vi.fn((_name, callback) => new Promise(resolve => { release = () => resolve(callback()); }));
    vi.stubGlobal('navigator', { locks: { request } });
    localStorage.setItem('swufe-refresh-attempt', 'a'.repeat(64));
    api.defaults.adapter = async config => {
      expect(config.headers.get('X-Refresh-Attempt')).toBe('b'.repeat(64));
      expect(localStorage.getItem('swufe-refresh-attempt')).toBe('b'.repeat(64));
      return response(config);
    };
    const logout = logoutSession();
    await Promise.resolve();
    expect(localStorage.getItem('swufe-refresh-attempt')).toBe('a'.repeat(64));
    // Another tab completed its prior rotation then lost the next response while holding the lock.
    localStorage.setItem('swufe-refresh-attempt', 'b'.repeat(64));
    release();
    await logout;
    expect(localStorage.getItem('swufe-refresh-attempt')).toBeNull();
  });

  it('does not execute a queued old logout after a new login', async () => {
    let release!: () => void;
    vi.stubGlobal('navigator', { locks: { request: (_name: string, callback: () => unknown) =>
      new Promise(resolve => { release = () => resolve(callback()); }) } });
    const adapter = vi.fn(async config => response(config));
    api.defaults.adapter = adapter;
    const logout = logoutSession();
    await Promise.resolve();
    setAccessToken('new-login', { newSession: true });
    localStorage.setItem('swufe-refresh-attempt', 'b'.repeat(64));
    release();
    await expect(logout).rejects.toThrow('Session changed during logout');
    expect(adapter).not.toHaveBeenCalled();
    expect(localStorage.getItem('swufe-refresh-attempt')).toBe('b'.repeat(64));
  });

  it('does not clear a new login attempt when an in-flight logout finishes', async () => {
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    api.defaults.adapter = config => new Promise(resolve => {
      finish = () => resolve(response(config));
      started();
    });
    localStorage.setItem('swufe-refresh-attempt', 'a'.repeat(64));
    const logout = logoutSession();
    await running;
    setAccessToken('new-login', { newSession: true });
    localStorage.setItem('swufe-refresh-attempt', 'b'.repeat(64));
    finish();
    await logout;
    expect(localStorage.getItem('swufe-refresh-attempt')).toBe('b'.repeat(64));
  });

  it('does not retry or restore an old attempt after login changed during a failed refresh', async () => {
    let reject!: (error: unknown) => void;
    let calls = 0;
    refreshClient.defaults.adapter = () => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); };
    const pending = refreshAccessToken();
    await Promise.resolve();
    setAccessToken('new-login', { newSession: true });
    reject(new Error('response lost'));
    await expect(pending).rejects.toBeDefined();
    expect(calls).toBe(1);
    expect(localStorage.length).toBe(0);
  });
  it('preserves the token when optional avatar recovery cannot refresh authentication', async () => {
    setAccessToken('existing-token');
    api.defaults.adapter = async config => { throw { config, response: { status: 401 } }; };
    refreshClient.defaults.adapter = async () => { throw new Error('temporary network failure'); };
    await expect(api.get('/api/user/profile', { preserveSessionOnFailure: true })).rejects.toBeDefined();
    let seen: string | undefined;
    api.defaults.adapter = async config => { seen = authorization(config); return response(config); };
    await api.get('/api/protected');
    expect(seen).toBe('Bearer existing-token');
  });

  it.each([undefined, 429, 503])('does not discard authentication on transient refresh status %s', async status => {
    setAccessToken('existing-token');
    api.defaults.adapter = async config => { throw { config, response: { status: 401 } }; };
    const failure = { response: status ? { status } : undefined };
    refreshClient.defaults.adapter = async () => { throw failure; };
    await expect(api.get('/api/protected')).rejects.toBe(failure);
    let seen: string | undefined;
    api.defaults.adapter = async config => { seen = authorization(config); return response(config); };
    await api.get('/api/protected');
    expect(seen).toBe('Bearer existing-token');
  });

  it('reuses an already renewed token for a late old-token 401', async () => {
    setAccessToken('old-token');
    let refreshes = 0;
    refreshClient.defaults.adapter = async config => { refreshes++; return response(config, { accessToken: 'new-token' }); };
    api.defaults.adapter = async config => {
      if (authorization(config) === 'Bearer old-token') {
        setAccessToken('new-token');
        throw { config, response: { status: 401 } };
      }
      return response(config);
    };
    await api.get('/api/protected');
    expect(refreshes).toBe(0);
  });

  it.each(['switch', 'logout'])('never replays a delayed old-session POST after %s', async action => {
    setAccessToken('account-A', { newSession: true });
    let fail!: () => void;
    let started!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    const calls: string[] = [];
    api.defaults.adapter = config => {
      calls.push(String(authorization(config)));
      if (calls.length > 1) return Promise.resolve(response(config));
      return new Promise((_resolve, reject) => {
        fail = () => reject({ config, response: { status: 401 } }); started();
      });
    };
    const refresh = vi.fn(async config => response(config, { accessToken: 'restored-A' }));
    refreshClient.defaults.adapter = refresh;
    const pending = api.post('/api/contests/test/submit', { sourceCode: 'A draft' });
    await running;
    if (action === 'switch') setAccessToken('account-B', { newSession: true });
    else clearAccessToken();
    fail();
    await expect(pending).rejects.toBeDefined();
    expect(calls).toEqual(['Bearer account-A']);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('discards a successful response belonging to a previous login', async () => {
    setAccessToken('A', { newSession: true });
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    api.defaults.adapter = config => new Promise(resolve => {
      finish = () => resolve(response(config, { privateData: 'A' })); started();
    });
    const pending = api.get('/api/user/profile');
    await running;
    setAccessToken('B', { newSession: true }); finish();
    await expect(pending).rejects.toBeDefined();
  });

  it('captures identity before returning from a business request call', async () => {
    setAccessToken('A', { newSession: true });
    const identities: unknown[] = [];
    api.defaults.adapter = async config => { identities.push(authorization(config)); return response(config); };
    const pending = api.post('/api/contests/test/submit', { sourceCode: 'A draft' });
    setAccessToken('B', { newSession: true });
    await expect(pending).rejects.toBeDefined();
    expect(identities).not.toContain('Bearer B');
  });

  it('does not replay an A request using a B token obtained from a changed shared cookie', async () => {
    const token = (sub: string) => `e30.${btoa(JSON.stringify({ sub }))}.test`;
    setAccessToken(token('A'), { newSession: true });
    let calls = 0;
    api.defaults.adapter = async config => {
      calls++;
      if (calls === 1) throw { config, response: { status: 401 } };
      return response(config);
    };
    refreshClient.defaults.adapter = async config => response(config, { accessToken: token('B') });
    await expect(api.post('/api/contests/test/submit', { sourceCode: 'A draft' })).rejects.toBeDefined();
    expect(calls).toBe(1);
  });

  it('does not resurrect a token after local logout during refresh', async () => {
    let finish!: (value: AxiosResponse) => void;
    refreshClient.defaults.adapter = config => new Promise(resolve => { finish = data => resolve(response(config, data.data)); });
    const pending = refreshAccessToken();
    await Promise.resolve();
    clearAccessToken();
    finish({ data: { accessToken: 'late-token' } } as AxiosResponse);
    await expect(pending).rejects.toBeDefined();
  });

  it('serializes cookie rotation across tabs with a browser lock', async () => {
    const request = vi.fn(async (_name, callback) => callback());
    vi.stubGlobal('navigator', { locks: { request } });
    refreshClient.defaults.adapter = async config => response(config, { accessToken: 'renewed' });
    await refreshAccessToken();
    expect(request).toHaveBeenCalledWith('swufe-auth-cookie', expect.any(Function));
  });

  it('clears a refreshed token which the server still rejects without a refresh loop', async () => {
    window.history.replaceState({}, '', '/login');
    setAccessToken('old');
    let refreshes = 0;
    refreshClient.defaults.adapter = async config => { refreshes++; return response(config, { accessToken: 'revoked' }); };
    api.defaults.adapter = async config => { throw { config, response: { status: 401 } }; };
    await expect(api.get('/api/protected')).rejects.toBeDefined();
    let seen: string | undefined;
    api.defaults.adapter = async config => { seen = authorization(config); return response(config); };
    await api.get('/api/protected');
    expect(seen).toBeUndefined();
    expect(refreshes).toBe(1);
  });

  it('does not overwrite a newer login with an old refresh response', async () => {
    let finish!: () => void;
    refreshClient.defaults.adapter = config => new Promise(resolve => {
      finish = () => resolve(response(config, { accessToken: 'stale' }));
    });
    const pending = refreshAccessToken();
    await Promise.resolve();
    setAccessToken('new-login', { newSession: true });
    finish();
    await expect(pending).rejects.toBeDefined();
  });

  it('waits for an in-flight rotation before deleting the cookie-backed session', async () => {
    let finish!: () => void;
    const order: string[] = [];
    refreshClient.defaults.adapter = config => new Promise(resolve => {
      finish = () => { order.push('refreshed'); resolve(response(config, { accessToken: 'late' })); };
    });
    api.defaults.adapter = async config => { order.push('logout'); return response(config); };
    const refreshing = refreshAccessToken().catch(() => undefined);
    await Promise.resolve();
    const logout = logoutSession();
    await Promise.resolve();
    expect(order).toEqual([]);
    finish();
    await Promise.all([refreshing, logout]);
    expect(order).toEqual(['refreshed', 'logout']);
  });

  it.each(['login', 'register'] as const)('serializes %s after a cookie rotation even without Web Locks', async mode => {
    vi.stubGlobal('navigator', {});
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    const order: string[] = [];
    refreshClient.defaults.adapter = config => {
      if (config.url === '/api/auth/refresh') return new Promise(resolve => {
        started(); finish = () => { order.push('refresh'); resolve(response(config, { accessToken: 'old' })); };
      });
      order.push(mode);
      return Promise.resolve(response(config, { accessToken: 'new-login' }));
    };
    const refreshing = refreshAccessToken();
    await running;
    const login = establishSession(mode, { account: 'new', password: 'test' });
    await Promise.resolve(); expect(order).toEqual([]);
    finish(); await Promise.all([refreshing, login]);
    expect(order).toEqual(['refresh', mode]);
  });

  it.each([false, true])('a later logout revokes an earlier pending login (Web Locks %s)', async locks => {
    let tail = Promise.resolve();
    vi.stubGlobal('navigator', locks ? { locks: { request: (_: string, work: () => any) => {
      const pending = tail.then(work); tail = pending.catch(() => undefined); return pending;
    } } } : {});
    setAccessToken('A', { newSession: true });
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    refreshClient.defaults.adapter = config => new Promise(resolve => {
      started(); finish = () => resolve(response(config, { accessToken: 'B' }));
    });
    const logoutRequests: string[] = [];
    api.defaults.adapter = async config => {
      if (config.url === '/api/auth/logout') logoutRequests.push(config.url);
      return response(config, { authorization: authorization(config) });
    };
    const login = establishSession('login', { account: 'B' });
    const loginResult = login.then(() => 'accepted', () => 'cancelled');
    await running;
    const logout = logoutSession();
    const logoutResult = logout.then(() => 'completed', () => 'failed');
    finish();
    expect(await loginResult).toBe('cancelled');
    expect(await logoutResult).toBe('completed');
    expect(logoutRequests).toEqual(['/api/auth/logout']);
    expect((await api.get('/api/check')).data.authorization).toBeUndefined();
  });

  it('a later failed login does not cancel revocation of the previous cookie', async () => {
    vi.stubGlobal('navigator', {});
    setAccessToken('A', { newSession: true });
    const requests: string[] = [];
    api.defaults.adapter = async config => { requests.push(config.url!); return response(config); };
    refreshClient.defaults.adapter = async config => { throw { config, response: { status: 401 } }; };
    const logout = logoutSession();
    const outcome = logout.then(() => 'revoked', () => 'cancelled');
    await expect(establishSession('login', { account: 'B', password: 'wrong' })).rejects.toBeDefined();
    expect(await outcome).toBe('revoked'); expect(requests).toEqual(['/api/auth/logout']);
  });
});
