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

    // 检查是否已存在
    const existing = await this.prisma.problemSource.findFirst({
      where: { platform, remoteProblemId: remoteId },
      include: { problem: true },
    });
    if (existing) return existing.problem.id;

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
          create: { version: 1, description: `来自 ${platform} 题库：${data.url || ''}` },
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
