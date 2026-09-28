import { createApp, nextTick } from 'vue';
import { expect, it, vi } from 'vitest';
import UserManage from './UserManage.vue';

vi.mock('../../stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'admin' } }) }));
vi.mock('../../api/client', () => ({ default: { get: vi.fn(async (path: string) => ({ data: path.endsWith('/list') ? [
  { id: '1', username: 'alice', nickname: '昵称甲', email: 'alice@example.com', studentId: '42411036' },
  { id: '2', username: 'bob', nickname: '昵称乙', email: 'bob@example.com', studentId: null },
  { id: '3', username: 'carol', email: 'carol@example.com', studentId: '' },
] : [] })) } }));

it('shows nickname and bound student number, without email or an empty secondary line', async () => {
  const host = document.createElement('div');
  const app = createApp(UserManage); app.mount(host);
  try {
    await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
    const cells = [...host.querySelectorAll('tbody tr')].map(row => row.querySelector('td')!);
    expect(cells).toHaveLength(3);
    expect(cells[0]!.querySelector('strong')!.textContent).toBe('昵称甲');
    expect(cells[0]!.querySelector('small')!.textContent).toBe('学号：42411036');
    expect(cells[1]!.querySelector('small')).toBeNull();
    expect(cells[2]!.querySelector('small')).toBeNull();
    expect(cells[2]!.querySelector('strong')!.textContent).toBe('carol');
    expect(host.textContent).not.toContain('@example.com');
  } finally { app.unmount(); }
});
