import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Component from './ContestArena.vue';
const state = vi.hoisted(() => ({ route: null as any, get: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => state.route }));
vi.mock('../../api/client', () => ({ default: { get: state.get } }));
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await nextTick(); };
const contest = (extra = {}) => ({ id: 'c1', title: 'Exam', contestNo: 1, mode: 'ACM',
  startTime: new Date(Date.now() - 60_000).toISOString(), endTime: new Date(Date.now() + 600_000).toISOString(),
  state: 'RUNNING', visibility: 'PUBLIC', problems: [], ...extra });
beforeEach(() => {
  vi.useFakeTimers(); state.get.mockReset();
  state.route = reactive({ params: { id: 'c1' }, fullPath: '/contests/c1/problems', name: 'contest-problems' });
  host = document.createElement('div');
});
afterEach(() => { app?.unmount(); vi.useRealTimers(); });
async function mount() {
  app = createApp(Component);
  app.component('router-link', defineComponent({ setup: (_, { slots }) => () => h('a', slots.default?.()) }));
  app.component('router-view', { render: () => h('div') });
  app.mount(host); await flush();
}
it('recovers initial 503 without navigation or losing the current page', async () => {
  state.get.mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValue({ data: contest() });
  await mount();
  expect(state.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2100); await flush();
  expect(state.get).toHaveBeenCalledTimes(2); expect(host.textContent).toContain('Exam');
});
it('honors Retry-After for 429 instead of sending an immediate burst', async () => {
  state.get.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '5' } } })
    .mockResolvedValue({ data: contest() });
  await mount(); await vi.advanceTimersByTimeAsync(4999); expect(state.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1001); await flush(); expect(state.get).toHaveBeenCalledTimes(2);
});
it('keeps contest content and recovers a failed automatic end transition', async () => {
  state.get.mockResolvedValueOnce({ data: contest({ endTime: new Date(Date.now() + 1000).toISOString() }) })
    .mockRejectedValueOnce({ response: { status: 502 } })
    .mockResolvedValue({ data: contest({ state: 'ENDED', endTime: new Date(Date.now() - 1).toISOString() }) });
  await mount(); await vi.advanceTimersByTimeAsync(1250); await flush();
  expect(host.textContent).toContain('Exam');
  await vi.advanceTimersByTimeAsync(2100); await flush();
  expect(state.get).toHaveBeenCalledTimes(3); expect(host.querySelector('.arena-state')?.classList.contains('ended')).toBe(true);
});
it.each([401, 403, 404])('does not repeatedly request a definitive %s', async status => {
  state.get.mockRejectedValue({ response: { status } }); await mount();
  await vi.advanceTimersByTimeAsync(120000); expect(state.get).toHaveBeenCalledTimes(1);
});
it('cancels pending retries when navigating to a different contest', async () => {
  state.get.mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValue({ data: contest({ id: 'c2', title: 'New exam' }) });
  await mount(); state.route.params.id = 'c2'; state.route.fullPath = '/contests/c2/problems'; await flush();
  await vi.advanceTimersByTimeAsync(2100); expect(state.get).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('New exam');
});
it('does not send another request after unmount', async () => {
  state.get.mockRejectedValue({ response: { status: 503 } }); await mount(); app.unmount();
  await vi.advanceTimersByTimeAsync(120000); expect(state.get).toHaveBeenCalledTimes(1);
});
it('backs off repeated failures at 2, 4, 8, 16 then at most 30 seconds', async () => {
  state.get.mockRejectedValue({ response: { status: 503 } }); await mount();
  let calls = 1;
  for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    await vi.advanceTimersByTimeAsync(delay - 1); expect(state.get).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1); expect(state.get).toHaveBeenCalledTimes(++calls);
  }
});
it('honors an HTTP date Retry-After', async () => {
  vi.setSystemTime(new Date('2026-09-29T04:00:00Z'));
  state.get.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': 'Tue, 29 Sep 2026 04:00:10 GMT' } } })
    .mockResolvedValue({ data: contest() });
  await mount(); await vi.advanceTimersByTimeAsync(9999); expect(state.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(state.get).toHaveBeenCalledTimes(2);
});
