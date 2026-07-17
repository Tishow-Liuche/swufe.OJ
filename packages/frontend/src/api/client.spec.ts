import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api, {
  clearAccessToken,
  refreshAccessToken,
  refreshClient,
  setAccessToken,
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
});
