import { afterEach, expect, it, vi } from 'vitest';

const response = (config: any, data = {}) => ({ config, data, headers: {}, status: 200, statusText: 'OK' });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('100 simultaneous expired requests share one refresh and all complete', async () => {
  vi.resetModules();
  const client = await import('./client');
  client.setAccessToken('expired');
  let count = 0;
  client.refreshClient.defaults.adapter = async config => { count++; await new Promise(r => setTimeout(r, 5)); return response(config, { accessToken: 'fresh' }); };
  client.default.defaults.adapter = async config => {
    if (config.headers.Authorization === 'Bearer expired') throw { config, response: { status: 401 } };
    expect(config.headers.Authorization).toBe('Bearer fresh');
    return response(config);
  };
  const results = await Promise.all(Array.from({ length: 100 }, () => client.default.get('/api/contests/test/submissions')));
  expect(results).toHaveLength(100);
  expect(count).toBe(1);
});

it('two independent tabs serialize shared-cookie rotation through Web Locks', async () => {
  vi.resetModules(); const first = await import('./client');
  vi.resetModules(); const second = await import('./client');
  let tail = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_name: string, work: () => any) => {
    const result = tail.then(work); tail = result.catch(() => undefined); return result;
  } } });
  let cookie = 0;
  let active = 0;
  let maximum = 0;
  const adapter = async (config: any) => {
    const receivedCookie = cookie;
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(receivedCookie).toBe(cookie);
    cookie++; active--;
    return response(config, { accessToken: `tab-access-${cookie}` });
  };
  first.refreshClient.defaults.adapter = adapter;
  second.refreshClient.defaults.adapter = adapter;
  expect(await Promise.all([first.refreshAccessToken(), second.refreshAccessToken()])).toEqual(['tab-access-1', 'tab-access-2']);
  expect(maximum).toBe(1);
  expect(cookie).toBe(2);
});
