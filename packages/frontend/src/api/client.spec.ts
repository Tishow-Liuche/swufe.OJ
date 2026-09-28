import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, {
  clearAccessToken,
  refreshAccessToken,
  refreshClient,
  setAccessToken,
  logoutSession,
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
    setAccessToken('new-login');
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
});
