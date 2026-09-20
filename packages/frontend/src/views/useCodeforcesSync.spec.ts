import { createApp, defineComponent } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import api from '../api/client';
import { useCodeforcesSync, acceptedProblemLocation } from './useCodeforcesSync';

vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function mount(onComplete = vi.fn()) {
  let sync!: ReturnType<typeof useCodeforcesSync>;
  const app = createApp(defineComponent({ setup() { sync = useCodeforcesSync(onComplete); return () => null; } }));
  app.mount(document.createElement('div'));
  return { sync, app, onComplete };
}
it('never creates a local route for a missing statement', () => {
  expect(acceptedProblemLocation({ problemId: null, statementAvailable: false })).toBeNull();
  expect(acceptedProblemLocation({ problemId: 'p1', statementAvailable: true, contestId: 'c1' })).toEqual({ path: '/problems/p1', query: { contestId: 'c1' } });
});
it('restores pending work, polls every 2.5 seconds and refreshes only after completion', async () => {
  vi.useFakeTimers();
  vi.mocked(api.get).mockResolvedValueOnce({ data: { state: 'active', progress: { phase: 'fetching', fetchedCount: 100, acceptedCount: 5 }, result: null } })
    .mockResolvedValueOnce({ data: { state: 'completed', progress: null, result: { acceptedCount: 5, matchedCount: 2, unmatchedCount: 3 } } });
  const { sync, app, onComplete } = mount();
  await vi.advanceTimersByTimeAsync(0);
  expect(sync.pending.value).toBe(true);
  await vi.advanceTimersByTimeAsync(2499); expect(api.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(onComplete).toHaveBeenCalledTimes(1);
  expect(sync.pending.value).toBe(false); expect(sync.status.value.result?.unmatchedCount).toBe(3);
  app.unmount(); await vi.advanceTimersByTimeAsync(10000); expect(api.get).toHaveBeenCalledTimes(2);
});
it('starts the queue endpoint and keeps pending state across a transient status error', async () => {
  vi.useFakeTimers(); vi.mocked(api.get).mockResolvedValueOnce({ data: { state: 'idle', progress: null, result: null } })
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { state: 'failed', error: 'CF unavailable', progress: null, result: null } });
  vi.mocked(api.post).mockResolvedValue({ data: { state: 'waiting', progress: null, result: null } });
  const { sync, app, onComplete } = mount(); await vi.advanceTimersByTimeAsync(0);
  await sync.start(); expect(api.post).toHaveBeenCalledWith('/api/user/external-accounts/codeforces/sync/start', undefined, expect.any(Object));
  await vi.advanceTimersByTimeAsync(2500); expect(sync.pending.value).toBe(true); expect(sync.error.value).toContain('重试'); expect(onComplete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2500); expect(sync.error.value).toBe('CF unavailable'); expect(sync.pending.value).toBe(false);
  app.unmount();
});
it('aborts an in-flight restoration on unmount', async () => {
  vi.useFakeTimers(); vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
  const { app } = mount(); const signal = vi.mocked(api.get).mock.calls[0]![1]!.signal as AbortSignal;
  app.unmount(); expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(10000); expect(api.get).toHaveBeenCalledTimes(1);
});
