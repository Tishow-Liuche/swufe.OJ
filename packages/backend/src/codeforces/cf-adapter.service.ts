import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

@Injectable()
export class CodeforcesAdapter {
  private readonly logger = new Logger(CodeforcesAdapter.name);
  private cookies: string[] = [];
  private loggedIn = false;
  private handle: string;
  private password: string;

  constructor(private config: ConfigService) {
    this.handle = config.get('CF_HANDLE', 'Tishow__Liuche');
    this.password = config.get('CF_PASSWORD', 'alxy1314520');
  }

  private async http(url: string, opts: any = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': opts.accept || 'text/html,application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': this.cookies.join('; '),
          ...(opts.headers || {}),
        },
        rejectUnauthorized: false,
      }, (res) => {
        let body = '';
        res.on('data', (c: string) => body += c);
        res.on('end', () => {
          const sc = res.headers['set-cookie'];
          if (sc) {
            for (const c of sc) {
              const val = c.split(';')[0];
              const name = val.split('=')[0];
              const idx = this.cookies.findIndex((x: string) => x.startsWith(name + '='));
              if (idx >= 0) this.cookies[idx] = val;
              else this.cookies.push(val);
            }
          }
          // Handle redirect
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && opts.follow !== false) {
            this.http(res.headers.location.startsWith('http') ? res.headers.location : `https://codeforces.com${res.headers.location}`, { ...opts, follow: false })
              .then(resolve).catch(reject);
          } else {
            resolve(body);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  async login(): Promise<boolean> {
    if (this.loggedIn) return true;
    try {
      this.cookies = [];
      // 1. Get CSRF from enter page
      this.logger.log('Fetching CF enter page...');
      const enter = await this.http('https://codeforces.com/enter');
      const csrf = (enter.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
      if (!csrf) { this.logger.error('No CSRF on enter page'); return false; }
      this.logger.log('CSRF obtained: ' + csrf.substring(0, 20) + '...');

      // 2. POST login
      const ftaa = this.randHex(18);
      const body = new URLSearchParams({
        csrf_token: csrf, action: 'enter', ftaa,
        bfaa: 'f1b3f18c715565b589b7823cda7448ce',
        handleOrEmail: this.handle, password: this.password, remember: 'on', _tta: '176',
      }).toString();

      this.logger.log('Posting login...');
      const loginRes = await this.http('https://codeforces.com/enter', {
        method: 'POST', body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://codeforces.com',
          'Referer': 'https://codeforces.com/enter',
        },
      });

      this.loggedIn = !loginRes.includes('Invalid handle') && !loginRes.includes('error for__handleOrEmail');
      this.logger.log('Login result: ' + (this.loggedIn ? 'SUCCESS' : 'FAILED'));
      return this.loggedIn;
    } catch (e: any) {
      this.logger.error('Login error: ' + e.message);
      return false;
    }
  }

  async submit(contestId: number, problemIndex: string, language: string, code: string) {
    if (!this.loggedIn) {
      const ok = await this.login();
      if (!ok) return { error: 'CF 登录失败: 账号 Tishow__Liuche' };
    }

    try {
      // 1. Get submit page CSRF
      const submitUrl = `https://codeforces.com/problemset/submit/${contestId}/${problemIndex}`;
      const page = await this.http(submitUrl);
      const csrf = (page.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
      if (!csrf) {
        // Login may have expired — retry
        this.loggedIn = false;
        const ok2 = await this.login();
        if (!ok2) return { error: 'CF 登录失败' };
        const page2 = await this.http(submitUrl);
        const csrf2 = (page2.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
        if (!csrf2) return { error: 'CF 提交页面无法获取 CSRF' };
        return this.submit(contestId, problemIndex, language, code); // retry once
      }

      // 2. Map language
      const langMap: any = { cpp: '73', c: '61', python: '70', java: '60' };
      const pt = langMap[language] || '73';

      // 3. POST submit
      const ftaa = this.randHex(18);
      const body = new URLSearchParams({
        csrf_token: csrf, ftaa,
        bfaa: 'f1b3f18c715565b589b7823cda7448ce',
        action: 'submitSolutionFormSubmitted',
        submittedProblemIndex: problemIndex,
        programTypeId: pt,
        source: code,
        tabSize: '4',
        sourceFile: '',
        _tta: '594',
      }).toString();

      const result = await this.http(`${submitUrl}?csrf_token=${encodeURIComponent(csrf)}`, {
        method: 'POST', body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://codeforces.com',
          'Referer': submitUrl,
        },
      });

      // 4. Extract submission ID from redirect or body
      const sid1 = result.match(/data-submission-id="(\d+)"/);
      if (sid1) return { submissionId: parseInt(sid1[1]) };

      const sid2 = result.match(/\/status\/(\d+)\/my/);
      if (sid2) return { submissionId: parseInt(sid2[1]) };

      // 5. Reconciliation via API
      this.logger.log('No direct SID, reconciling via CF API...');
      await this.sleep(5000);
      const api = await this.http('https://codeforces.com/api/user.status?handle=' + this.handle + '&from=1&count=10');
      const data = JSON.parse(api);
      if (data.status === 'OK') {
        const match = (data.result || []).find((s: any) =>
          s.problem?.contestId === contestId &&
          s.problem?.index === problemIndex &&
          (Date.now() / 1000 - s.creationTimeSeconds) < 180
        );
        if (match) return { submissionId: match.id };
      }

      return { error: '无法获取CF Submission ID' };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async queryResult(handle: string): Promise<any[]> {
    try {
      const api = await this.http('https://codeforces.com/api/user.status?handle=' + handle + '&from=1&count=10');
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
