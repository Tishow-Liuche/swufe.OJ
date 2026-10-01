import { createApp, h, nextTick, reactive } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import Component from './ProblemDiscussionPanel.vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), push: vi.fn() }));
vi.mock('../api/client', () => ({ default: { get: mocks.get } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'u1' }, isLoggedIn: () => true, isTeacher: () => false, isAdmin: () => false }) }));
let dispose = () => {};
afterEach(() => { dispose(); vi.clearAllMocks(); });
async function mount() {
  const props = reactive({ problemId: 'p1', problemTitle: 'test', revision: 0 });
  const app = createApp({ render: () => h(Component, props) }); const host = document.createElement('div');
  app.mount(host); dispose = () => app.unmount();
  await nextTick(); await nextTick();
  return { host, props };
}
it('uses publishing eligibility, not published-only learning state', async () => {
  mocks.get.mockResolvedValue({ data: { canWriteSolution: true } });
  const { host } = await mount();
  expect(mocks.get).toHaveBeenCalledWith('/api/community/problems/p1/solution-eligibility');
  expect(host.textContent).toContain('去写题解');
});
it('refreshes eligibility when the parent receives a submission result', async () => {
  mocks.get.mockResolvedValueOnce({ data: { canWriteSolution: false } }).mockResolvedValue({ data: { canWriteSolution: true } });
  const { host, props } = await mount();
  expect(host.textContent).toContain('尚未通过');
  props.revision++;
  await nextTick(); await nextTick(); await nextTick();
  expect(host.textContent).toContain('去写题解');
});
it('does not mislabel a failed permission lookup as unsolved', async () => {
  mocks.get.mockRejectedValue(new Error('network'));
  const { host } = await mount();
  expect(host.textContent).not.toContain('尚未通过');
  expect(host.textContent).toContain('重新检查');
});
it('refreshes after returning from an external submission tab', async () => {
  mocks.get.mockResolvedValueOnce({ data: { canWriteSolution: false } }).mockResolvedValue({ data: { canWriteSolution: true } });
  const { host } = await mount();
  document.dispatchEvent(new Event('visibilitychange'));
  await nextTick(); await nextTick();
  expect(host.textContent).toContain('去写题解');
});
it('ignores old problem responses after navigation', async () => {
  let resolveOld!: (value: any) => void;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ data: { canWriteSolution: false } });
  const { host, props } = await mount();
  props.problemId = 'p2'; await nextTick(); await nextTick(); await nextTick();
  resolveOld({ data: { canWriteSolution: true } }); await nextTick(); await nextTick();
  expect(host.textContent).toContain('尚未通过');
});
