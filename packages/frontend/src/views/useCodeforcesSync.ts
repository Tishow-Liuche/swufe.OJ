import { computed, onMounted, onUnmounted, ref } from 'vue';
import api from '../api/client';

export interface SyncStatus {
  state: 'idle' | 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: { phase: 'fetching' | 'saving'; fetchedCount: number; acceptedCount: number; savedCount?: number } | null;
  result: { acceptedCount: number; matchedCount: number; unmatchedCount: number } | null;
  error?: string;
}

export function acceptedProblemLocation(item: any) {
  if (item.statementAvailable === false || !item.problemId) return null;
  return { path: `/problems/${item.problemId}`, query: item.contestId ? { contestId: item.contestId } : {} };
}

export function useCodeforcesSync(onComplete: () => unknown | Promise<unknown>) {
  const status = ref<SyncStatus>({ state: 'idle', progress: null, result: null });
  const error = ref('');
  const requesting = ref(false);
  const pending = computed(() => requesting.value || ['waiting', 'active', 'delayed'].includes(status.value.state));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let disposed = false;
  let refreshed = false;
  function schedule() {
    clearTimeout(timer);
    if (!disposed && ['waiting', 'active', 'delayed'].includes(status.value.state)) timer = setTimeout(() => void request(false), 2500);
  }
  async function request(start: boolean) {
    if (disposed || requesting.value) return;
    clearTimeout(timer);
    requesting.value = true;
    error.value = '';
    controller = new AbortController();
    try {
      const { data } = start
        ? await api.post('/api/user/external-accounts/codeforces/sync/start', undefined, { signal: controller.signal })
        : await api.get('/api/user/external-accounts/codeforces/sync/status', { signal: controller.signal });
      if (disposed) return;
      status.value = data;
      if (data.state !== 'completed') refreshed = false;
      if (data.state === 'failed') error.value = data.error || '同步失败，请重试';
      if (data.state === 'completed' && !refreshed) {
        await onComplete();
        refreshed = true;
      }
    } catch {
      if (!disposed) error.value = '同步状态暂时无法获取，请重试；后台任务可能仍在继续。';
    } finally {
      requesting.value = false;
      schedule();
    }
  }
  onMounted(() => void request(false));
  onUnmounted(() => { disposed = true; clearTimeout(timer); controller?.abort(); });
  return { status, error, pending, start: () => request(true), retry: () => request(false) };
}
