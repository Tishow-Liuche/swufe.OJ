import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';

/**
 * Codeforces Adapter v4 — 用 curl 子进程绕过 Cloudflare 403
 * Node.js 的 https 模块被 CF 拦截，但 curl/MSYS2 可以正常访问
 */
@Injectable()
export class CodeforcesAdapter {
  private readonly logger = new Logger(CodeforcesAdapter.name);
  private cookieFile = '/tmp/cf_cookies_' + Math.random().toString(36).slice(2) + '.txt';
  private handle: string;
  private password: string;
  private loggedIn = false;

  constructor(private config: ConfigService) {
    this.handle = config.get('CF_HANDLE', 'Tishow__Liuche');
    this.password = config.get('CF_PASSWORD', 'alxy1314520');
  }

  private curl(url: string, opts: string = ''): string {
    try {
      const cmd = 'curl -sL --max-time 20 -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -b ' +
        this.cookieFile + ' -c ' + this.cookieFile + ' ' + opts + ' "' + url + '"';
      return execSync(cmd, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }).toString();
    } catch (e: any) {
      // curl non-200: still return output
      if (e.stdout) return e.stdout.toString();
      throw e;
    }
  }

  async login(): Promise<boolean> {
    if (this.loggedIn) return true;
    try {
      // 1. GET enter page → extract CSRF
      const enter = this.curl('https://codeforces.com/enter', '-c ' + this.cookieFile);
      const csrf = (enter.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
      if (!csrf) { this.logger.error('No CSRF from CF enter page'); return false; }
      this.logger.log('CF CSRF: ' + csrf.substring(0, 20) + '...');

      // 2. POST login
      const ftaa = this.randHex(18);
      const loginBody = 'csrf_token=' + encodeURIComponent(csrf) +
        '&action=enter&ftaa=' + ftaa +
        '&bfaa=f1b3f18c715565b589b7823cda7448ce' +
        '&handleOrEmail=' + encodeURIComponent(this.handle) +
        '&password=' + encodeURIComponent(this.password) +
        '&remember=on&_tta=176';

      const loginRes = this.curl('https://codeforces.com/enter',
        '-c ' + this.cookieFile + ' -b ' + this.cookieFile +
        ' -H "Content-Type: application/x-www-form-urlencoded"' +
        ' -H "Origin: https://codeforces.com"' +
        ' -H "Referer: https://codeforces.com/enter"' +
        ' --data-raw "' + loginBody + '"');

      this.loggedIn = !loginRes.includes('Invalid handle') && loginRes.length > 100;
      this.logger.log('CF Login: ' + (this.loggedIn ? 'OK' : 'FAILED'));
      return this.loggedIn;
    } catch (e: any) {
      this.logger.error('CF Login error: ' + e.message);
      return false;
    }
  }

  async submit(contestId: number, problemIndex: string, language: string, code: string) {
    if (!this.loggedIn) { const ok = await this.login(); if (!ok) return { error: 'CF登录失败' }; }

    try {
      const submitUrl = 'https://codeforces.com/problemset/submit/' + contestId + '/' + problemIndex;

      // Get CSRF from submit page
      const page = this.curl(submitUrl, '-b ' + this.cookieFile);
      const csrf = (page.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
      if (!csrf) {
        this.loggedIn = false;
        await this.login();
        const page2 = this.curl(submitUrl, '-b ' + this.cookieFile);
        const csrf2 = (page2.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
        if (!csrf2) return { error: 'CF提交页CSRF获取失败' };
        // Retry once with fresh login
        const lOk2 = await this.login();
        if (!lOk2) return { error: 'CF登录重试失败' };
        const page3 = this.curl(submitUrl, '-b ' + this.cookieFile);
        const csrf3 = (page3.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
        if (!csrf3) return { error: 'CF提交页CSRF失败（已重试）' };
        return this.submit(contestId, problemIndex, language, code);
      }

      const langMap: any = { cpp: '73', c: '61', python: '70', java: '60' };
      const pt = langMap[language] || '73';
      const ftaa = this.randHex(18);

      const submitBody = 'csrf_token=' + encodeURIComponent(csrf) +
        '&ftaa=' + ftaa +
        '&bfaa=f1b3f18c715565b589b7823cda7448ce' +
        '&action=submitSolutionFormSubmitted' +
        '&submittedProblemIndex=' + problemIndex +
        '&programTypeId=' + pt +
        '&source=' + encodeURIComponent(code) +
        '&tabSize=4&sourceFile=&_tta=594';

      const result = this.curl(submitUrl + '?csrf_token=' + encodeURIComponent(csrf),
        '-b ' + this.cookieFile + ' -c ' + this.cookieFile +
        ' -H "Content-Type: application/x-www-form-urlencoded"' +
        ' -H "Origin: https://codeforces.com"' +
        ' -H "Referer: ' + submitUrl + '"' +
        ' --data-raw "' + submitBody + '"');

      const sid1 = result.match(/data-submission-id="(\d+)"/);
      if (sid1) return { submissionId: parseInt(sid1[1]) };

      const sid2 = result.match(/\/status\/(\d+)\/my/);
      if (sid2) return { submissionId: parseInt(sid2[1]) };

      // Reconciliation via CF API
      await this.sleep(6000);
      const api = this.curl('https://codeforces.com/api/user.status?handle=' + this.handle + '&from=1&count=10');
      const data = JSON.parse(api);
      if (data.status === 'OK') {
        const match = (data.result || []).find((s: any) =>
          s.problem?.contestId === contestId &&
          s.problem?.index === problemIndex &&
          (Date.now() / 1000 - s.creationTimeSeconds) < 180
        );
        if (match) return { submissionId: match.id };
      }

      return { error: '无法提取 Submission ID' };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async queryResult(handle: string): Promise<any[]> {
    try {
      const api = this.curl('https://codeforces.com/api/user.status?handle=' + handle + '&from=1&count=10');
      const data = JSON.parse(api);
      return data.status === 'OK' ? data.result : [];
    } catch { return []; }
  }

  mapVerdict(verdict: string | null): string {
    if (!verdict) return 'JUDGING';
    const m: any = {
      OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
      MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR',
      COMPILATION_ERROR: 'COMPILE_ERROR', SKIPPED: 'CANCELLED', TESTING: 'JUDGING',
    };
    return m[verdict] || verdict;
  }

  private randHex(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
