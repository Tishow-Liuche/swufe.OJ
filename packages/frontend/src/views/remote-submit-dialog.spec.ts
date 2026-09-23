import { createApp, nextTick } from 'vue';
import { expect, it, vi } from 'vitest';
import ProblemDetail from './ProblemDetail.vue';

const mocks = vi.hoisted(() => ({ receive: null as any }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, params: { id: 'p1' } }) }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ isLoggedIn: () => true }) }));
vi.mock('../api/client', () => ({ default: { get: () => new Promise(() => {}) } }));
vi.mock('../utils/submission-poller', async original => ({
  ...await original<any>(),
  createSubmissionPoller: (options: any) => {
    mocks.receive = options.receive;
    return { stop() {}, start() {}, refresh() {} };
  },
}));

it.each(['Codeforces', '洛谷', 'QOJ'])('closes %s guidance after its verdict and prevents reopening', async platform => {
  const host = document.createElement('div');
  const app = createApp(ProblemDetail);
  app.component('RouterLink', { template: '<a><slot /></a>' });
  app.mount(host);
  const state = (app as any)._instance.setupState;
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  try {
    state.cfData = { platform, submissionId: 's1', url: 'https://example.com' };
    state.cfDialog = true;
    state.result = { id: 's1', status: 'QUEUING' };
    state.retryOpenCf();
    await nextTick();
    expect(host.textContent).not.toContain('浏览器拦截了新标签页');
    mocks.receive('s1', { id: 's1', status: 'ACCEPTED' }, true);
    await nextTick();
    expect(state.cfDialog).toBe(false);
    const calls = open.mock.calls.length;
    state.retryOpenCf();
    expect(open).toHaveBeenCalledTimes(calls);
  } finally { app.unmount(); open.mockRestore(); }
});

it('does not dismiss a new task for an old result; history can finish its own task', async () => {
  const app = createApp(ProblemDetail);
  app.component('RouterLink', { template: '<a><slot /></a>' });
  app.mount(document.createElement('div'));
  const state = (app as any)._instance.setupState;
  try {
    state.cfData = { submissionId: 'new' };
    state.cfDialog = true;
    state.result = { id: 'old', status: 'ACCEPTED' };
    await nextTick();
    expect(state.cfDialog).toBe(true);
    state.problemSubmissions = [{ id: 'new', status: 'WRONG_ANSWER' }];
    await nextTick();
    expect(state.cfDialog).toBe(false);
  } finally { app.unmount(); }
});
