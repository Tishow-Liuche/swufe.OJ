import { createApp } from 'vue';
import { expect, it, vi } from 'vitest';
import EditProblem from './EditProblem.vue';
const mocks = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'p1' } }), useRouter: () => ({ push() {} }) }));
vi.mock('../../api/client', () => ({ default: {
  get: async () => ({ data: { title: '测试题', status: 'PUBLISHED', versions: [{ description: '题面', testCases: [{}] }] } }),
  patch: mocks.patch, post: mocks.post,
} }));
it('uses long timeouts for edit and ZIP replacement, preserves selected ZIP on failure', async () => {
  const app = createApp(EditProblem);
  const host = document.createElement('div'); app.mount(host);
  const state = (app as any)._instance.setupState;
  try {
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const zip = new File(['zip'], 'data.zip');
    state.testDataFile = zip;
    mocks.patch.mockClear();
    mocks.patch.mockResolvedValue({ data: {} });
    mocks.post.mockRejectedValue({ code: 'ECONNABORTED' });
    await state.saveProblem();
    expect(mocks.patch.mock.calls[0][2].timeout).toBe(60000);
    expect(mocks.post.mock.calls[0][2].timeout).toBe(900000);
    expect(state.error).toContain('上传测试数据');
    expect(state.error).toContain('题目信息已保存');
    expect(state.testDataFile).toBe(zip);
    mocks.post.mockResolvedValue({ data: { testCount: 2 } });
    await state.saveProblem();
    expect(state.error).toBe('');
    expect(state.message).toBe('题目已保存');
    expect(mocks.patch.mock.calls.every(([url]) => !url.endsWith('/status'))).toBe(true);
  } finally { app.unmount(); }
});
