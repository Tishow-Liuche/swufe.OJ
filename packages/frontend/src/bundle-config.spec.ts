// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('frontend request fragmentation', () => {
  it('groups used icons into one shared chunk instead of per-icon network requests', () => {
    const output = (config as any).build?.rollupOptions?.output;
    expect(output?.manualChunks?.icons).toEqual(['@lucide/vue']);
  });
});
