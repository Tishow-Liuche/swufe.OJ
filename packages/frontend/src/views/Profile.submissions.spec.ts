import { createApp, nextTick } from 'vue';
import { expect, it, vi } from 'vitest';
import Profile from './Profile.vue';
import api from '../api/client';
vi.mock('../api/client', () => ({ default: { get: vi.fn() } }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ user: { role: 'TEACHER' } }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
it('shows submitter and date, searches nickname, resets pagination', async () => {
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/api/submissions'
    ? { total: 120, items: [{ id: 's1', status: 'ACCEPTED', createdAt: '2026-09-26T08:12:34Z', user: { nickname: '测试选手', username: 'student01' }, problem: { title: 'A+B' } }] }
    : url.endsWith('/profile') ? { username: 'teacher' } : { overview: {}, heatmap: [], difficultyDist: [], recentSubmissions: [] } }));
  const app = createApp(Profile); app.component('RouterLink', { template: '<a><slot /></a>' });
  const host = document.createElement('div'); app.mount(host);
  const state = (app as any)._instance.setupState;
  try {
    await state.loadAllSubmissions(); await nextTick();
    expect(host.textContent).toContain('测试选手');
    expect(host.textContent).toContain('student01');
    expect(host.textContent).toContain('2026');
    state.submissionPage = 3; state.submissionNickname = ' 测试选手 ';
    state.searchSubmissions(); await nextTick();
    expect(api.get).toHaveBeenLastCalledWith('/api/submissions', { params: { pageSize: 50, page: 1, nickname: '测试选手' } });
  } finally { app.unmount(); }
});
