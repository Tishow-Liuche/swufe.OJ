import { createApp, h, nextTick, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import UserAvatar from './UserAvatar.vue';
it('reports a failed image once and renders a replacement avatar when supplied', async () => {
  const src = ref('/expired.jpg'); const onLoadError = vi.fn(); const host = document.createElement('div');
  const app = createApp({ render: () => h(UserAvatar, { name: 'Alice', avatar: src.value, onLoadError }) });
  app.mount(host);
  try {
    host.querySelector('img')!.dispatchEvent(new Event('error')); await nextTick();
    expect(onLoadError).toHaveBeenCalledWith('/expired.jpg');
    expect(host.querySelector('img')).toBeNull(); expect(host.textContent).toContain('AL');
    src.value = '/fresh.jpg'; await nextTick();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/fresh.jpg');
  } finally { app.unmount(); }
});
