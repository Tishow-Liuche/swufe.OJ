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
});
