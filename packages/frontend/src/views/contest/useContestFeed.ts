import { onScopeDispose, ref, shallowRef, watch } from 'vue';
import api from '../../api/client';
import { errorText } from './contest';

export function useContestFeed<T>(url: () => string, enabled: () => boolean) {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref('');
  const updatedAt = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let disposed = false;
  let generation = 0;
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  async function refresh() {
    if (disposed || !enabled() || loading.value) return;
    clear();
    const version = generation;
    controller = new AbortController();
    const current = controller;
    loading.value = true;
    let retry = true;
    try {
      const response = await api.get<T>(url(), { signal: current.signal });
      if (disposed || version !== generation) return;
      data.value = response.data; error.value = ''; updatedAt.value = new Date().toISOString();
    } catch (e: any) {
      if (disposed || current.signal.aborted || version !== generation) return;
      error.value = errorText(e, '加载失败，请稍后重试');
      retry = ![401, 403, 404].includes(e.response?.status);
    } finally {
      if (!disposed && version === generation) {
        loading.value = false;
        if (retry && enabled()) timer = setTimeout(() => {
          if (document.visibilityState === 'hidden') { scheduleHidden(); return; }
          void refresh();
        }, 10000);
      }
    }
  }
  function scheduleHidden() {
    if (disposed || !enabled()) return;
    timer = setTimeout(() => {
      if (document.visibilityState === 'hidden') scheduleHidden(); else void refresh();
    }, 30000);
  }
  watch([url, enabled], () => {
    generation++; clear(); controller?.abort(); loading.value = false;
    data.value = null; error.value = ''; updatedAt.value = null;
    if (enabled()) void refresh();
  }, { immediate: true });
  onScopeDispose(() => { disposed = true; generation++; clear(); controller?.abort(); });
  return { data, loading, error, updatedAt, refresh };
}
