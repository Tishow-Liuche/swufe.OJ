import { SyncAdapter, RemoteProblemData } from '../sync.service';
import { Logger } from '@nestjs/common';
import { mapLuoguDifficultyToPointDifficulty } from '../../problem/point-difficulty';

/**
 * 洛谷题目同步适配器
 *
 * 使用洛谷开放 API：https://www.luogu.com.cn/problem/P{id}?_contentOnly=1
 *
 * 前置条件：
 * 1. 需要从可正常访问洛谷的网络环境运行（服务器或 WSL2）
 * 2. 需要设置合适的 User-Agent 和 Referer
 * 3. 建议设置 1-3 秒的请求间隔，避免触发反爬
 *
 * 同步策略：
 * - 逐题拉取：遍历 P1000-P9999 范围
 * - 跳过不存在/已删除的题目
 * - 记录同步日志
 * - 支持增量更新（只拉取新题目）
 */
export class LuoguAdapter implements SyncAdapter {
  readonly platform = 'LUOGU';
  readonly baseUrl = 'https://www.luogu.com.cn';
  private readonly logger = new Logger(LuoguAdapter.name);

  async fetchList(page: number, pageSize: number) {
    // 洛谷没有直接的分页列表 API，采用 ID 范围遍历策略
    // P1000 开始，每次取 P1000 + (page-1)*pageSize 到 P1000 + page*pageSize
    const start = 1000 + (page - 1) * pageSize;
    const end = start + pageSize;
    const items: Array<{ remoteId: string }> = [];
    for (let i = start; i < end; i++) {
      items.push({ remoteId: `P${i}` });
    }
    return { items, total: 9000 };
  }

  async fetchProblem(remoteId: string): Promise<RemoteProblemData | null> {
    try {
      const resp = await this.httpGet(`/problem/${remoteId}?_contentOnly=1`);
      const data = JSON.parse(resp);
      if (!data?.currentData?.problem) return null;

      const p = data.currentData.problem;

      // 构建完整 Markdown 题面
      const parts: string[] = [];
      if (p.background) parts.push(p.background);
      if (p.description) parts.push(p.description);
      // samples 是 [[input, output], [input, output], ...]
      if (p.samples?.length) {
        parts.push('## 样例');
        p.samples.forEach((s: string[], i: number) => {
          parts.push(`### 样例 #${i + 1}`);
          parts.push('```input');
          parts.push(s[0]?.trim() || '');
          parts.push('```');
          parts.push('```output');
          parts.push(s[1]?.trim() || '');
          parts.push('```');
        });
      }
      if (p.hint) {
        parts.push('## 提示');
        if (Array.isArray(p.hint)) parts.push(p.hint.map(String).join('\n\n'));
        else parts.push(String(p.hint));
      }
      const fullDesc = parts.join('\n\n');

      // 解析 limits
      const timeMs = (p.limits?.time?.[0] || 1) * 1000;
      const memMB = p.limits?.memory?.[0] || 256;

      return {
        remoteId,
        title: `${remoteId} ${p.title}`,
        difficulty: this.mapDifficulty(p.difficulty),
        timeLimit: timeMs > 100 ? timeMs : timeMs * 1000, // 洛谷用秒，OJs用毫秒
        memoryLimit: memMB,
        tags: (p.tags || []).map((t: any) => typeof t === 'string' ? t : t.name).filter(Boolean),
        url: `${this.baseUrl}/problem/${remoteId}`,
        description: fullDesc,
        background: p.background,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        samples: (p.samples || []).map((s: string[]) => ({ input: s[0] || '', output: s[1] || '' })),
        hint: Array.isArray(p.hint) ? p.hint.join('\n\n') : (p.hint || undefined),
        dataRange: p.dataRange || p.limits ? `Time: ${timeMs}ms, Memory: ${memMB}MB` : undefined,
      };
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await this.httpGet('/problem/P1001?_contentOnly=1');
      const data = JSON.parse(resp);
      return !!data?.currentData?.problem;
    } catch {
      return false;
    }
  }

  private async httpGet(path: string): Promise<string> {
    // 使用 Node.js 原生 fetch（需要 Node 18+）
    const resp = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Referer': this.baseUrl + '/',
        'x-luogu-type': 'content-only',
        'Accept': '*/*',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
  }

  private mapDifficulty(diff: number): string {
    return mapLuoguDifficultyToPointDifficulty(diff);
  }
}
