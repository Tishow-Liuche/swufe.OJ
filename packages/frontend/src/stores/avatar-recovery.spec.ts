import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, clearAccessToken: vi.fn(), refreshAccessToken: vi.fn(), setAccessToken: vi.fn() }));
vi.mock('../api/client', () => ({ default: client.api, clearAccessToken: client.clearAccessToken, refreshAccessToken: client.refreshAccessToken, setAccessToken: client.setAccessToken }));
import { useAuthStore } from './auth';
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); setActivePinia(createPinia()); });
afterEach(() => vi.useRealTimers());
function loggedIn() {
  const auth = useAuthStore();
  auth.token = 'token'; auth.user = { id: 'u1', username: 'alice', role: 'STUDENT', avatar: '/expired.jpg' };
  return auth;
}
it('coalesces recovery, updates only avatar and limits repeated failures', async () => {
  const auth = loggedIn();
  client.api.get.mockResolvedValue({ data: { id: 'u1', username: 'stale-name', avatar: '/fresh.jpg' } });
  const first = auth.recoverAvatar('/expired.jpg'); const second = auth.recoverAvatar('/expired.jpg');
  await vi.advanceTimersByTimeAsync(1100); await Promise.all([first, second]);
  expect(client.api.get).toHaveBeenCalledTimes(1);
  expect(auth.user?.avatar).toBe('/fresh.jpg'); expect(auth.user?.username).toBe('alice');
  expect(auth.avatarRevision).toBe(1);
  await auth.recoverAvatar('/fresh.jpg');
  expect(client.api.get).toHaveBeenCalledTimes(1);
});
it('keeps login state if avatar metadata refresh fails', async () => {
  const auth = loggedIn(); client.api.get.mockRejectedValue(new Error('network'));
  const pending = auth.recoverAvatar('/expired.jpg'); await vi.advanceTimersByTimeAsync(1100); await pending;
  expect(auth.isLoggedIn()).toBe(true); expect(client.clearAccessToken).not.toHaveBeenCalled();
});
it('does not restore a user after logout during recovery', async () => {
  const auth = loggedIn(); let resolve: (data: any) => void;
  client.api.get.mockImplementation(() => new Promise(r => { resolve = r; }));
  const pending = auth.recoverAvatar('/expired.jpg'); await vi.advanceTimersByTimeAsync(1100);
  auth.clearAuth(); resolve!({ data: { id: 'u1', avatar: '/fresh.jpg' } }); await pending;
  expect(auth.user).toBeNull(); expect(auth.token).toBe('');
});
it('ignores an error from an old avatar and avoids overwriting a newly uploaded image', async () => {
  const auth = loggedIn();
  await auth.recoverAvatar('/somebody-else.jpg'); expect(client.api.get).not.toHaveBeenCalled();
  const pending = auth.recoverAvatar('/expired.jpg');
  auth.user!.avatar = '/new-upload.jpg';
  await vi.advanceTimersByTimeAsync(1100); await pending;
  expect(client.api.get).not.toHaveBeenCalled(); expect(auth.user?.avatar).toBe('/new-upload.jpg');
});
it('allows a newly uploaded avatar to recover while the old image recovery is pending', async () => {
  const auth = loggedIn();
  client.api.get.mockResolvedValue({ data: { id: 'u1', avatar: '/new-fresh.jpg' } });
  const old = auth.recoverAvatar('/expired.jpg');
  auth.user!.avatar = '/new-upload.jpg';
  const fresh = auth.recoverAvatar('/new-upload.jpg');
  await vi.advanceTimersByTimeAsync(1100); await Promise.all([old, fresh]);
  expect(auth.user?.avatar).toBe('/new-fresh.jpg');
  expect(client.api.get).toHaveBeenCalledTimes(1);
});
