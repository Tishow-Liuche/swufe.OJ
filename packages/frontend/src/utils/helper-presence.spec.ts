import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectHelper, helperPlatform } from './helper-presence';
afterEach(() => vi.restoreAllMocks());
describe('helper installation detection', () => {
  it('requires only a supported remote platform', () => {
    expect(helperPlatform({ sourceInfo: { platform: 'LUOGU' } })).toBe('LUOGU');
    expect(helperPlatform({ sourceInfo: { platform: 'CODEFORCES' } })).toBe('CODEFORCES');
    expect(helperPlatform({ sourceInfo: { platform: 'QOJ' } })).toBe('QOJ');
    expect(helperPlatform({})).toBeNull();
  });
  it('times out when script is absent', async () => {
    expect(await detectHelper('LUOGU', 15)).toBe(false);
  });
  it('ignores mismatched platform and stale request IDs', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      for (const body of [{ ...data, platform: 'QOJ' }, { ...data, requestId: 'stale' }]) {
        window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...body, type: 'SWUFE_HELPER_PONG', version: '1.9' } }));
      }
    });
    expect(await detectHelper('LUOGU', 15)).toBe(false);
  });
  it('accepts a matching response', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...data, type: 'SWUFE_HELPER_PONG', version: '1.9' } }));
    });
    expect(await detectHelper('LUOGU', 15)).toBe(true);
  });
});
