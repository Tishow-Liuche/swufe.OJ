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
it('filters users by student number and clears back to all accounts', async () => {
  const host = document.createElement('div'); const app = createApp(UserManage); app.mount(host);
  try {
    await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
    const input = host.querySelector('input[aria-label="查询用户"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = ' 42411036 '; input.dispatchEvent(new Event('input')); await nextTick();
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(host.querySelector('tbody')?.textContent).toContain('昵称甲');
    expect(host.querySelector('tbody')?.textContent).toContain('重置密码');
    input.value = 'missing'; input.dispatchEvent(new Event('input')); await nextTick();
    expect(host.textContent).toContain('没有匹配的用户');
    (host.querySelector('[aria-label="清空用户查询"]') as HTMLButtonElement).click(); await nextTick();
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3);
    input.value = 'BOB'; input.dispatchEvent(new Event('input')); await nextTick();
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(host.querySelector('tbody')?.textContent).toContain('昵称乙');
  } finally { app.unmount(); }
});
