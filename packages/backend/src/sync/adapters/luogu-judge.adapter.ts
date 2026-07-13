import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 洛谷开放平台 Remote Judge 适配器
 *
 * API 文档：https://docs.lgapi.cn/open/
 *
 * 前置条件：
 * 1. 在洛谷开放平台注册 OpenApp
 * 2. 获取 OpenApp Token（格式：username:password）
 * 3. 购买套餐（1500元/季度起，含 30000 计费点）
 * 4. 将 Token 配置到 .env：LUOGU_OPENAPP_TOKEN=xxx
 *
 * 支持：
 * - 提交代码到洛谷评测
 * - 查询评测结果
 * - WebSocket 被动推送
 */

export interface LuoguSubmitRequest {
  pid: string;      // P1001
  lang: string;     // cxx/14/gcc, python3/c, java/8, ...
  o2: boolean;      // -O2 编译优化
  code: string;     // 源代码
  trackId: string;  // 本平台提交 ID，结果中原样返回
}

export interface LuoguSubmitResponse {
  requestId: string;
}

export interface LuoguJudgeResult {
  requestId: string;
  trackId: string;
  status: string;      // COMPLETED / FAILED / ...
  result?: {
    verdict: string;   // ACCEPTED / WRONG_ANSWER / TIME_LIMIT_EXCEEDED / ...
    score: number;
    time: number;       // ms
    memory: number;     // KB
    subtasks?: any[];
    compile?: {
      success: boolean;
      message: string;
    };
  };
}

// 语言映射
export const LUOGU_LANG_MAP: Record<string, string> = {
  cpp:    'cxx/14/gcc',
  c:      'c/99/gcc',
  python: 'python3/c',
  java:   'java/8',
};

// 洛谷评测结果 → 本平台统一状态
export const LUOGU_VERDICT_MAP: Record<string, string> = {
  ACCEPTED: 'ACCEPTED',
  WRONG_ANSWER: 'WRONG_ANSWER',
  TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  COMPILE_ERROR: 'COMPILE_ERROR',
  OUTPUT_LIMIT_EXCEEDED: 'OUTPUT_LIMIT_EXCEEDED',
  PRESENTATION_ERROR: 'PRESENTATION_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
};

@Injectable()
export class LuoguJudgeAdapter {
  private readonly logger = new Logger(LuoguJudgeAdapter.name);
  private readonly baseUrl = 'https://open-v1.lgapi.cn';
  private credentials: string;

  constructor(private config: ConfigService) {
    this.credentials = this.config.get('LUOGU_OPENAPP_TOKEN', '');
  }

  get enabled(): boolean {
    return !!this.credentials;
  }

  /** 提交代码到洛谷评测 */
  async submit(req: LuoguSubmitRequest): Promise<LuoguSubmitResponse> {
    if (!this.enabled) throw new Error('洛谷 OpenApp Token 未配置');

    const lang = LUOGU_LANG_MAP[req.lang] || 'cxx/14/gcc';
    const body = JSON.stringify({
      pid: req.pid,
      lang,
      o2: true,
      code: req.code,
      trackId: req.trackId,
    });

    const auth = Buffer.from(this.credentials).toString('base64');

    const resp = await fetch(`${this.baseUrl}/judge/problem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'swufe-oj/1.0',
      },
      body,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`Luogu submit failed: ${resp.status} ${err.errorMessage || ''}`);
    }

    return resp.json();
  }

  /** 查询评测结果 */
  async getResult(requestId: string): Promise<LuoguJudgeResult | null> {
    if (!this.enabled) throw new Error('洛谷 OpenApp Token 未配置');
    const auth = Buffer.from(this.credentials).toString('base64');

    const resp = await fetch(`${this.baseUrl}/judge/result/${requestId}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'swufe-oj/1.0',
      },
    });

    if (resp.status === 404) return null;
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`Luogu result failed: ${resp.status} ${err.errorMessage || ''}`);
    }

    return resp.json();
  }

  /** 映射洛谷评测结果到统一状态 */
  mapVerdict(luoguVerdict: string): string {
    return LUOGU_VERDICT_MAP[luoguVerdict] || 'SYSTEM_ERROR';
  }
}
