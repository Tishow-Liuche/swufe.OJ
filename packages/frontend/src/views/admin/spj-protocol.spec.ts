import { createApp, nextTick } from 'vue';
import { describe, it, expect, vi } from 'vitest';
import CreateProblem from './CreateProblem.vue';
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../utils/markdown', () => ({ renderMarkdownWithMath: (value: string) => value }));
describe('SPJ authoring protocol', () => {
  it('defaults new SPJ to boolean and offers explicit exit-code mode', async () => {
    const host = document.createElement('div'); const app = createApp(CreateProblem); app.mount(host);
    try {
      const mode = [...host.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'SPJ'))!;
      mode.value = 'SPJ'; mode.dispatchEvent(new Event('change')); await nextTick();
      const protocol = host.querySelector<HTMLSelectElement>('select[aria-label="SPJ 判定协议"]');
      expect(protocol).not.toBeNull();
      expect(protocol!.value).toBe('BOOLEAN_STDOUT');
      expect([...protocol!.options].map(o => o.value)).toEqual(['BOOLEAN_STDOUT', 'EXIT_CODE']);
      expect(host.textContent).toContain('系统错误');
      const source = host.querySelector<HTMLTextAreaElement>('textarea.code-editor')!;
      const booleanStarter = source.value;
      protocol!.value = 'EXIT_CODE'; protocol!.dispatchEvent(new Event('change')); await nextTick();
      expect(source.value).toContain('sys.exit(0 if');
      protocol!.value = 'BOOLEAN_STDOUT'; protocol!.dispatchEvent(new Event('change')); await nextTick();
      expect(source.value).toBe(booleanStarter);
      source.value = 'print("custom checker")'; source.dispatchEvent(new Event('input')); await nextTick();
      protocol!.value = 'EXIT_CODE'; protocol!.dispatchEvent(new Event('change')); await nextTick();
      expect(source.value).toBe('print("custom checker")');
    } finally {app.unmount();}
  });
});
