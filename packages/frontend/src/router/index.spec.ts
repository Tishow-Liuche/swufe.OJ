import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  isLoggedIn: vi.fn(),
  isAdmin: vi.fn(),
  isStudent: vi.fn(),
  isTeacher: vi.fn(),
  restoreSession: vi.fn(),
  token: '',
  user: null as { mustChangePassword?: boolean } | null,
}));

vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }));

import router from './index';

describe('protected route session restore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.token = '';
    auth.user = null;
    auth.isLoggedIn.mockReturnValue(false);
    auth.isAdmin.mockReturnValue(false);
    auth.isStudent.mockReturnValue(true);
    auth.isTeacher.mockReturnValue(true);
    auth.restoreSession.mockResolvedValue(false);
    await router.replace('/');
  });

  it('tries the HttpOnly-Cookie session before redirecting a protected route to login', async () => {
    auth.restoreSession.mockImplementation(async () => {
      auth.token = 'restored-token';
      auth.user = {};
      auth.isLoggedIn.mockReturnValue(true);
      return true;
    });

    await router.push('/profile');

    expect(auth.restoreSession).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/profile');
  });

  it('redirects an anonymous visitor away from the community', async () => {
    await router.push('/community');

    expect(auth.restoreSession).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/community');
  });

  it('does not expose administrator routes to an authenticated teacher', async () => {
    auth.token = 'teacher-token';
    auth.user = {};
    auth.isLoggedIn.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(false);

    await router.push('/admin/users');

    expect(router.currentRoute.value.path).toBe('/problems');
  });
});
