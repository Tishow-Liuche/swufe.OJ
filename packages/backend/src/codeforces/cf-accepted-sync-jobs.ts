import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CfAcceptedSyncService } from './cf-accepted-sync.service';

export const CF_ACCEPTED_QUEUE = 'cf-accepted-sync';

@Injectable()
export class CfAcceptedSyncJobs implements OnModuleInit {
  constructor(@InjectQueue(CF_ACCEPTED_QUEUE) private readonly queue: Queue, private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.queue.setGlobalConcurrency(1); }

  async start(userId: string) {
    const account = await this.prisma.externalAccount.findFirst({ where: { userId, platform: 'CODEFORCES' }, select: { remoteUsername: true, remoteUserId: true } });
    if (!(account?.remoteUsername || account?.remoteUserId || '').trim()) throw new BadRequestException('请先绑定 Codeforces 账号');
    const jobId = `cf-${userId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== 'completed' && state !== 'failed') return this.status(userId);
      try { await existing.remove(); }
      catch (error) {
        // Another tab may already have replaced the finished job and started it.
        const current = await this.queue.getJob(jobId);
        if (current && !['completed', 'failed'].includes(await current.getState())) return this.status(userId);
        if (current) throw error;
      }
    }
    await this.queue.add('sync', { userId }, { jobId });
    return { state: 'waiting', progress: null, result: null };
  }

  async status(userId: string) {
    const job = await this.queue.getJob(`cf-${userId}`);
    if (!job) return { state: 'idle', progress: null, result: null };
    const state = await job.getState();
    return {
      state: state === 'waiting-children' || state === 'prioritized' ? 'waiting' : state,
      progress: typeof job.progress === 'object' ? job.progress : null,
      result: state === 'completed' ? job.returnvalue : null,
      ...(state === 'failed' ? { error: 'Codeforces 同步失败，请稍后重试；已有通过记录不会丢失。' } : {}),
    };
  }
}

@Processor(CF_ACCEPTED_QUEUE, { concurrency: 1 })
export class CfAcceptedSyncProcessor extends WorkerHost {
  constructor(private readonly sync: CfAcceptedSyncService) { super(); }
  async process(job: Job<{ userId: string }>) {
    // Global concurrency plus a start gap also rate-limits consecutive short jobs.
    await new Promise(resolve => setTimeout(resolve, 2100));
    return this.sync.syncUserAccepted(job.data.userId, data => job.updateProgress(data));
  }
}
