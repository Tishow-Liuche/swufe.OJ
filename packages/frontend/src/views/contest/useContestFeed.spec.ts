import { createApp, defineComponent, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import api from '../../api/client';
import { useContestFeed } from './useContestFeed';
vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('does not request private feeds until eligible', async () => {
  const host = document.createElement('div');
  const app = createApp(defineComponent({ setup() { useContestFeed(() => '/standings', () => false); return () => null; } }));
  app.mount(host); await Promise.resolve(); expect(api.get).not.toHaveBeenCalled(); app.unmount();
});
it('aborts in-flight requests and stops polling when unmounted', async () => {
  vi.useFakeTimers(); vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
  const host = document.createElement('div');
  const app = createApp(defineComponent({ setup() { useContestFeed(() => '/standings', () => true); return () => null; } }));
  app.mount(host); expect(api.get).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(api.get).mock.calls[0]![1]!.signal as AbortSignal;
  app.unmount(); expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(30000); expect(api.get).toHaveBeenCalledTimes(1);
});
it('only polls the current feed and does not retain stale data on URL change', async () => {
  vi.useFakeTimers(); vi.mocked(api.get).mockResolvedValue({ data: { rows: [] } });
  const url = ref('/c1/standings'); let feed: ReturnType<typeof useContestFeed>;
  const app = createApp(defineComponent({ setup() { feed = useContestFeed(() => url.value, () => true); return () => null; } }));
  app.mount(document.createElement('div')); await vi.advanceTimersByTimeAsync(0);
  url.value = '/c2/standings'; await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(10000);
  expect(vi.mocked(api.get).mock.calls.slice(1).every(call => call[0] === '/c2/standings')).toBe(true);
  expect(feed!.error.value).toBe(''); app.unmount();
});
