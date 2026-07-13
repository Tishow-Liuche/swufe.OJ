import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as querystring from 'querystring';

@Injectable()
export class CodeforcesAdapter {
  private readonly logger = new Logger(CodeforcesAdapter.name);
  private cookieJar: string[] = [];
  private handle: string;
  private password: string;

  constructor(private config: ConfigService) {
    this.handle = config.get('CF_HANDLE', 'Tishow__Liuche');
    this.password = config.get('CF_PASSWORD', 'alxy1314520');
  }

  private async request(url: string, opts: any = {}): Promise<{ body: string; status: number; headers: any }> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html,application/json',
          'Cookie': this.cookieJar.join('; '),
          ...(opts.headers || {}),
        },
        rejectUnauthorized: false,
      }, (res: any) => {
        let body = '';
        res.on('data', (c: string) => body += c);
        res.on('end', () => {
          const sc = res.headers['set-cookie'];
          if (sc) {
            for (const c of sc) {
              const v = c.split(';')[0];
              const n = v.split('=')[0];
              const idx = this.cookieJar.findIndex((x: string) => x.startsWith(n + '='));
              if (idx >= 0) this.cookieJar[idx] = v;
              else this.cookieJar.push(v);
            }
          }
          resolve({ body, status: res.statusCode || 500, headers: res.headers });
        });
      });
      req.on('error', reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  async login(): Promise<boolean> {
    try {
      const enterPage = await this.request('https://codeforces.com/enter');
      const csrf = (enterPage.body.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1] || '';
      if (!csrf) return false;

      const ftaa = this.rndHex(18);
      const body = querystring.stringify({
        csrf_token: csrf, action: 'enter', ftaa,
        bfaa: 'f1b3f18c715565b589b7823cda7448ce',
        handleOrEmail: this.handle, password: this.password, remember: 'on', _tta: '176',
      });

      const loginRes = await this.request('https://codeforces.com/enter', {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://codeforces.com', 'Referer': 'https://codeforces.com/enter' },
      });

      return !loginRes.body.includes('Invalid handle') && !(loginRes.headers['location'] || '').includes('enter');
    } catch (e: any) { this.logger.error('Login: ' + e.message); return false; }
  }

  async submit(contestId: number, problemIndex: string, language: string, code: string): Promise<{ submissionId?: number; error?: string }> {
    try {
      const page = await this.request(`https://codeforces.com/problemset/submit/${contestId}/${problemIndex}`);
      const csrf = (page.body.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1] || '';
      if (!csrf) return { error: 'No CSRF token on submit page' };

      const langMap: any = { cpp: '73', c: '61', python: '70', java: '60' };
      const body = querystring.stringify({
        csrf_token: csrf, ftaa: this.rndHex(18),
        bfaa: 'f1b3f18c715565b589b7823cda7448ce',
        action: 'submitSolutionFormSubmitted',
        submittedProblemIndex: problemIndex,
        programTypeId: langMap[language] || '73',
        source: code, tabSize: '4', sourceFile: '', _tta: '594',
      });

      const res = await this.request(
        `https://codeforces.com/problemset/submit/${contestId}/${problemIndex}?csrf_token=${encodeURIComponent(csrf)}`,
        {
          method: 'POST', body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://codeforces.com', 'Referer': `https://codeforces.com/problemset/submit/${contestId}/${problemIndex}` },
        }
      );

      const loc = res.headers['location'] || '';
      const m = loc.match(/status\/(\d+)\/my/);
      if (m) return { submissionId: parseInt(m[1]) };
      return { error: 'No submission ID in response' };
    } catch (e: any) { return { error: e.message }; }
  }

  async querySubmissions(handle: string): Promise<any[]> {
    try {
      const res = await this.request(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=5`, {});
      const d = JSON.parse(res.body);
      return d.status === 'OK' ? d.result : [];
    } catch { return []; }
  }

  async checkHandle(handle: string): Promise<boolean> {
    try {
      const res = await this.request(`https://codeforces.com/api/user.info?handles=${handle}`, {});
      return JSON.parse(res.body).status === 'OK';
    } catch { return false; }
  }

  mapVerdict(verdict: string | null): string {
    if (!verdict) return 'JUDGING';
    const m: any = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
      MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR', COMPILATION_ERROR: 'COMPILE_ERROR',
      SKIPPED: 'CANCELLED', TESTING: 'JUDGING' };
    return m[verdict] || 'UNKNOWN';
  }

  private rndHex(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
}
