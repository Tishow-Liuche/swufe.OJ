import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectHelper, helperPlatform, type HelperPlatform } from './helper-presence';
afterEach(() => vi.restoreAllMocks());
describe('helper installation detection', () => {
  it.each([['CODEFORCES', '7.6', false], ['CODEFORCES', '7.7', true], ['QOJ', '2.6', false], ['QOJ', '2.7', true]] as const)('checks %s version %s', async (platform, version, expected) => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...data, type: 'SWUFE_HELPER_PONG', version } }));
    });
    expect(await detectHelper(platform as HelperPlatform, 15)).toBe(expected);
  });
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
        window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...body, type: 'SWUFE_HELPER_PONG', version: '1.11' } }));
      }
    });
    expect(await detectHelper('LUOGU', 15)).toBe(false);
  });
  it('accepts a matching response', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...data, type: 'SWUFE_HELPER_PONG', version: '1.11' } }));
    });
    expect(await detectHelper('LUOGU', 15)).toBe(true);
  });
  it.each(['1.9', '1.10', '1.10.99'])('rejects outdated Luogu %s', async version => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...data, type: 'SWUFE_HELPER_PONG', version } }));
    });
    expect(await detectHelper('LUOGU', 15)).toBe(false);
  });
  it.each(['1.11.0', '1.12', '2.0'])('accepts compatible current or newer Luogu %s', async version => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...data, type: 'SWUFE_HELPER_PONG', version } }));
    });
    expect(await detectHelper('LUOGU', 15)).toBe(true);
  });
  it('waits for a current response even if an old script responds first', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
      for (const version of ['1.10', '1.11']) window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { ...data, type: 'SWUFE_HELPER_PONG', version } }));
    });
    expect(await detectHelper('LUOGU', 15)).toBe(true);
  });
});
