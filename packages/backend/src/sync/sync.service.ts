import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RemoteProblemData {
  remoteId: string;
  title: string;
  difficulty?: string;
  timeLimit?: number;
  memoryLimit?: number;
  tags?: string[];
  url?: string;
  description?: string;
  background?: string;
  inputFormat?: string;
  outputFormat?: string;
  samples?: Array<{ input: string; output: string }>;
  hint?: string;
  dataRange?: string;
}

export interface SyncAdapter {
  readonly platform: string;
  readonly baseUrl: string;
  /** 获取题目列表（分页） */
  fetchList(page: number, pageSize: number): Promise<{ items: Array<{ remoteId: string }>; total: number }>;
  /** 获取单题详情 */
  fetchProblem(remoteId: string): Promise<RemoteProblemData | null>;
  /** 检查适配器是否可用 */
  healthCheck(): Promise<boolean>;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private adapters = new Map<string, SyncAdapter>();

  constructor(private prisma: PrismaService) {}

  registerAdapter(adapter: SyncAdapter) {
    this.adapters.set(adapter.platform, adapter);
    this.logger.log(`Registered adapter: ${adapter.platform}`);
  }

  getAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** 同步单个题目到本地数据库 */
  async syncProblem(platform: string, remoteId: string): Promise<string | null> {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new Error(`No adapter for platform: ${platform}`);

    // 检查是否已存在 — 如果已有题面则跳过，否则拉取完整题面更新
    const existing = await this.prisma.problemSource.findFirst({
      where: { platform, remoteProblemId: remoteId },
      include: { problem: { include: { versions: { where: { isCurrent: true } } } } },
    });
    if (existing) {
      // 如果已有真实题面（非占位符），跳过
      const cv = existing.problem.versions[0];
      if (cv && !cv.description.startsWith('来自 ' + platform)) return existing.problem.id;
      // 否则刷新题面
      const data = await adapter.fetchProblem(remoteId);
      if (data && data.description) {
        await this.prisma.problemVersion.update({ where: { id: cv!.id }, data: {
          description: data.description, inputFormat: data.inputFormat, outputFormat: data.outputFormat,
          sampleInput: data.samples?.map(s => s.input).join('\n---\n'), sampleOutput: data.samples?.map(s => s.output).join('\n---\n'),
          hint: data.hint, dataRange: data.dataRange,
        }});
        this.logger.log('Refreshed description: ' + remoteId);
      }
      return existing.problem.id;
    }

    // 获取题目数据
    const data = await adapter.fetchProblem(remoteId);
    if (!data) return null;

    // 创建题目
    const problem = await this.prisma.problem.create({
      data: {
        title: data.title,
        source: 'EXTERNAL',
        difficulty: data.difficulty || 'POPULAR',
        timeLimit: data.timeLimit || 1000,
        memoryLimit: data.memoryLimit || 256,
        status: 'PUBLISHED',
        versions: {
          create: {
            version: 1,
            description: data.description || `来自 ${platform} 题库：${data.url || ''}`,
            inputFormat: data.inputFormat,
            outputFormat: data.outputFormat,
            sampleInput: data.samples?.map(s => s.input).join('\n---\n'),
            sampleOutput: data.samples?.map(s => s.output).join('\n---\n'),
            hint: data.hint,
            dataRange: data.dataRange,
          },
        },
        tags: { create: (data.tags || []).map(n => ({ name: n, type: 'TAG' })) },
        sourceInfo: {
          create: { platform, remoteProblemId: remoteId, remoteUrl: data.url },
        },
      },
    });

    return problem.id;
  }

  /** 批量同步 */
  async syncBatch(platform: string, page: number, pageSize: number) {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new Error(`No adapter for platform: ${platform}`);

    const { items } = await adapter.fetchList(page, pageSize);
    const results: Array<{ remoteId: string; status: string; problemId?: string | null; error?: string }> = [];
    for (const item of items) {
      try {
        const id = await this.syncProblem(platform, item.remoteId);
        results.push({ remoteId: item.remoteId, status: id ? 'created' : 'skipped', problemId: id });
      } catch (e: any) {
        results.push({ remoteId: item.remoteId, status: 'error', error: e.message });
      }
    }
    return results;
  }
}
