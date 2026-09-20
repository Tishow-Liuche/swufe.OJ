import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, expect, it, vi } from 'vitest';
import Profile from './Profile.vue';
import api from '../api/client';
vi.mock('../api/client', () => ({ default: { get: vi.fn() } }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({}) }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); document.body.innerHTML = ''; });
it('shows missing statements in a dismissible modal and keeps mapped records as new-tab links', async () => {
  vi.useFakeTimers();
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/profile') ? { username: 'test' }
    : url.endsWith('/stats') ? { overview: {}, heatmap: [], difficultyDist: [], recentSubmissions: [] }
    : url.endsWith('/settings') ? { profile: { username: 'test' } }
    : url.endsWith('/status') ? { state: 'idle', progress: null, result: null }
    : { items: [
      { key: 'external:CODEFORCES:1A', problemId: null, statementAvailable: false, remoteProblemId: '1A', problem: { id: null, title: 'Theatre Square' } },
      { key: 'local:p1', problemId: 'p1', statementAvailable: true, problem: { id: 'p1', title: 'Local' } },
    ] } }));
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Profile }, { path: '/problems/:id', component: { template: '<div />' } }] });
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(Profile); app.use(router); app.mount(host);
  await vi.advanceTimersByTimeAsync(0);
  const tab = [...host.querySelectorAll('button')].find(el => el.textContent?.includes('已通过题目'))!;
  tab.click(); await vi.advanceTimersByTimeAsync(0);
  const missing = host.querySelector('button.accepted-row') as HTMLButtonElement;
  expect(missing).not.toBeNull(); expect(host.querySelector('a[href*="null"]')).toBeNull();
  expect(host.querySelector('a.accepted-row')?.getAttribute('target')).toBe('_blank');
  missing.focus(); missing.click(); await vi.advanceTimersByTimeAsync(0);
  const dialog = host.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('本地暂未收录题面'); expect(dialog.textContent).toContain('1A');
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await vi.advanceTimersByTimeAsync(0); expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(missing);
  missing.click(); await vi.advanceTimersByTimeAsync(0); (host.querySelector('.modal-overlay') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(0); expect(host.querySelector('[role="dialog"]')).toBeNull();
  app.unmount();
});
