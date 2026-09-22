export type HelperPlatform = 'CODEFORCES' | 'LUOGU' | 'QOJ';
export const helperNames: Record<HelperPlatform, string> = { CODEFORCES: 'Codeforces', LUOGU: '洛谷', QOJ: 'QOJ' };

export function helperPlatform(problem: any): HelperPlatform | null {
  const platform = problem?.sourceInfo?.platform;
  return ['CODEFORCES', 'LUOGU', 'QOJ'].includes(platform) ? platform : null;
}

/** Live availability only, never a persisted "installed" checkbox. */
export function detectHelper(platform: HelperPlatform, timeout = 1200): Promise<boolean> {
  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (found: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', receive);
      clearTimeout(timer);
      resolve(found);
    };
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== window || event.origin !== location.origin || !data ||
          data.type !== 'SWUFE_HELPER_PONG' || data.platform !== platform ||
          data.requestId !== requestId || typeof data.version !== 'string' ||
          !/^\d+\.\d+(?:\.\d+)?$/.test(data.version)) return;
      finish(true);
    };
    const timer = setTimeout(() => finish(false), timeout);
    window.addEventListener('message', receive);
    window.postMessage({ type: 'SWUFE_HELPER_PING', platform, requestId }, location.origin);
  });
}
