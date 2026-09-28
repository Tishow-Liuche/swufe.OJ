import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  clearAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: client.api,
  clearAccessToken: client.clearAccessToken,
  refreshAccessToken: client.refreshAccessToken,
  setAccessToken: client.setAccessToken,
  logoutSession: () => client.api.post('/api/auth/logout'),
  isAuthenticationFailure: (error: any) => error?.response?.status === 401,
}));

import { useAuthStore } from './auth';

const profile = { id: 'u1', username: 'alice', role: 'STUDENT' };

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    client.api.get.mockResolvedValue({ data: profile });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a new login access token only in memory', async () => {
    localStorage.setItem('accessToken', 'legacy-access-token');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const auth = useAuthStore();

    await auth.setAuth('memory-token');

    expect(client.setAccessToken).toHaveBeenCalledWith('memory-token');
    expect(auth.token).toBe('memory-token');
    expect(auth.user).toEqual(profile);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores a Cookie-backed session before a protected route is entered', async () => {
    client.refreshAccessToken.mockResolvedValue('restored-token');
    const auth = useAuthStore();

    await expect(auth.restoreSession()).resolves.toBe(true);

    expect(client.refreshAccessToken).toHaveBeenCalledOnce();
    expect(client.setAccessToken).toHaveBeenCalledWith('restored-token');
    expect(client.api.get).toHaveBeenCalledWith('/api/user/profile');
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('logs out through the Cookie endpoint even without a local token', async () => {
    const auth = useAuthStore();

    await auth.logout();

    expect(client.api.post).toHaveBeenCalledWith('/api/auth/logout');
    expect(client.clearAccessToken).toHaveBeenCalledOnce();
  });

  it.each([undefined, 429, 503])('preserves the signed-in profile during temporary failure %s', async status => {
    const auth = useAuthStore();
    await auth.setAuth('valid-token');
    const failure = { response: status ? { status } : undefined };
    client.api.get.mockRejectedValueOnce(failure);
    await expect(auth.fetchProfile()).rejects.toBe(failure);
    expect(auth.isLoggedIn()).toBe(true);
    expect(client.clearAccessToken).not.toHaveBeenCalled();
  });

  it('distinguishes temporary restore failures from invalid credentials', async () => {
    const auth = useAuthStore();
    const failure = { response: { status: 503 } };
    client.refreshAccessToken.mockRejectedValueOnce(failure);
    await expect(auth.restoreSession()).resolves.toBe(null);
    expect(client.clearAccessToken).not.toHaveBeenCalled();
    client.refreshAccessToken.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(auth.restoreSession()).resolves.toBe(false);
    expect(client.clearAccessToken).toHaveBeenCalled();
  });

  it('ignores an old profile response after logout', async () => {
    const auth = useAuthStore();
    await auth.setAuth('valid');
    let finish!: (value: any) => void;
    client.api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = auth.fetchProfile();
    auth.clearAuth();
    finish({ data: profile });
    await pending;
    expect(auth.user).toBeNull();
  });

  it('does not clear a newer login when an older restore receives 401', async () => {
    const auth = useAuthStore();
    let fail!: (error: unknown) => void;
    client.refreshAccessToken.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const oldRestore = auth.restoreSession();
    await auth.setAuth('new-login');
    fail({ response: { status: 401 } });
    await oldRestore;
    expect(auth.token).toBe('new-login');
    expect(auth.user).toEqual(profile);
    expect(client.clearAccessToken).not.toHaveBeenCalled();
  });

  it('loads a new account independently and ignores the old account profile response', async () => {
    const auth = useAuthStore();
    await auth.setAuth('old-login');
    let finish!: (value: any) => void;
    client.api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const oldProfile = auth.fetchProfile();
    const newProfile = { id: 'u2', username: 'bob', role: 'TEACHER' };
    client.api.get.mockResolvedValueOnce({ data: newProfile });
    const newLogin = auth.setAuth('new-login');
    expect(client.api.get).toHaveBeenCalledTimes(3);
    finish({ data: profile });
    await Promise.all([oldProfile, newLogin]);
    expect(auth.user).toEqual(newProfile);
    expect(auth.token).toBe('new-login');
  });
});
