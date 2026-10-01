import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectHelper, helperPlatform, requiredHelperVersions, type HelperPlatform } from './helper-presence';
import { readFileSync } from 'node:fs';
afterEach(() => vi.restoreAllMocks());
describe('helper installation detection', () => {
  it('keeps the required versions aligned with distributed standalone and bundled helpers', () => {
    const bundle = readFileSync('public/oj-helpers.user.js', 'utf8');
    for (const [platform, file] of [['CODEFORCES', 'cf'], ['LUOGU', 'luogu'], ['QOJ', 'qoj']] as const) {
      const source = readFileSync(`public/${file}-helper.user.js`, 'utf8');
      const version = requiredHelperVersions[platform];
      expect(source.match(/@version\s+(\S+)/)?.[1]).toBe(version);
      expect(source).toContain(`requestId: data.requestId, version: '${version}'`);
      expect(bundle).toContain(`requestId: data.requestId, version: '${version}'`);
    }
  });
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
