import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeLuoguStatus, normalizeOptionalMetric } from '../luogu/luogu-task-lease.service';

const LEASE_TTL_MS = 2 * 60 * 1000;
const TERMINAL_STATUSES = new Set([
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'CANCELLED',
  'SYSTEM_ERROR',
  'REMOTE_ERROR',
]);

@Injectable()
export class QojTaskLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(problemId: string) {
    if (!problemId) throw new BadRequestException('problemId required');

    const task = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'QOJ',
        status: { in: ['PENDING', 'PROCESSING'] },
        remoteProblemId: problemId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!task) throw new NotFoundException('No pending QOJ task for problem ' + problemId);

    const token = task.nonce || randomBytes(16).toString('hex');
    if (!task.nonce) {
      await this.prisma.remoteSubmissionTask.update({
        where: { submissionId: task.submissionId },
        data: { nonce: token },
      });
    }

    return {
      submissionId: task.submissionId,
      remoteProblemId: task.remoteProblemId,
      language: task.language,
      sourceCode: task.sourceCode,
      status: task.status,
      token,
    };
  }

  async acquireLease(submissionId: string, token: string, replayLeaseNonce?: string) {
    const task = await this.loadTask(submissionId, token);
    const now = new Date();

    if (task.leaseNonce && task.leaseExpiresAt && task.leaseExpiresAt.getTime() > now.getTime()) {
      if (replayLeaseNonce && replayLeaseNonce === task.leaseNonce) {
        return { submissionId, leaseNonce: task.leaseNonce, leaseExpiresAt: task.leaseExpiresAt };
      }
      return {
        submissionId,
        leaseNonce: task.leaseNonce,
        leaseExpiresAt: task.leaseExpiresAt,
        alreadyLeased: true,
      };
    }

    const leaseNonce = randomBytes(16).toString('hex');
    const leaseExpiresAt = new Date(now.getTime() + LEASE_TTL_MS);
    await this.prisma.remoteSubmissionTask.update({
      where: { submissionId },
      data: { leaseNonce, leaseExpiresAt, helperStage: 'LEASED', status: 'PROCESSING' },
    });
    return { submissionId, leaseNonce, leaseExpiresAt };
  }

  async reportRemoteId(
    submissionId: string,
    token: string,
    leaseNonce: string,
    remoteSubmissionId: string,
  ) {
    const rid = String(remoteSubmissionId || '').trim();
    if (!rid) throw new BadRequestException('remoteSubmissionId required');

    const task = await this.loadTask(submissionId, token);
    if (task.leaseNonce && task.leaseNonce !== leaseNonce) {
      throw new ConflictException('Lease nonce mismatch');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.remoteSubmissionTask.update({
        where: { submissionId },
        data: { remoteSubmissionId: rid, helperStage: 'REMOTE_ID_REPORTED', status: 'PROCESSING' },
      });
      await tx.remoteJudgeJob.update({ where: { submissionId }, data: { remoteSubmissionId: rid } });
      await tx.submission.update({ where: { id: submissionId }, data: { status: 'JUDGING' } });
    });
    return { ok: true, submissionId, remoteSubmissionId: rid, status: 'JUDGING' };
  }

  async reportResult(
    submissionId: string,
    token: string,
    leaseNonce: string,
    data: {
      remoteSubmissionId?: string;
      status: string;
      score?: number;
      timeUsed?: number;
      memoryUsed?: number;
      compileMessage?: string;
      rawStatus?: string;
    },
  ) {
    const task = await this.loadTask(submissionId, token);
    if (task.leaseNonce && task.leaseNonce !== leaseNonce) {
      throw new ConflictException('Lease nonce mismatch');
    }

    const status = normalizeQojStatus(data.status);
    const terminal = TERMINAL_STATUSES.has(status);
    const score = normalizeOptionalMetric(data.score) ?? (status === 'ACCEPTED' ? 100 : 0);
    const timeUsed = normalizeOptionalMetric(data.timeUsed);
    const memoryUsed = normalizeOptionalMetric(data.memoryUsed);
    const remoteSubmissionId =
      String(data.remoteSubmissionId || task.remoteSubmissionId || '').trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: {
          status,
          score,
          timeUsed,
          memoryUsed,
          compileMessage: data.compileMessage || undefined,
          judgedAt: terminal ? new Date() : undefined,
        },
      });
      await tx.submissionCase.deleteMany({ where: { submissionId, caseIndex: 1 } });
      await tx.submissionCase.create({
        data: {
          submissionId,
          caseIndex: 1,
          status,
          timeUsed,
          memoryUsed,
        },
      });
      await tx.remoteJudgeJob.update({
        where: { submissionId },
        data: {
          remoteSubmissionId: remoteSubmissionId || undefined,
          rawStatus: data.rawStatus || data.status,
          finishedAt: terminal ? new Date() : undefined,
        },
      });
      await tx.remoteSubmissionTask.update({
        where: { submissionId },
        data: {
          remoteSubmissionId: remoteSubmissionId || undefined,
          status: terminal ? 'COMPLETED' : 'PROCESSING',
          helperStage: terminal ? 'RESULT_REPORTED' : 'RESULT_POLLING',
        },
      });
    });

    return { ok: true, submissionId, status };
  }

  private async loadTask(submissionId: string, token: string) {
    if (!submissionId) throw new BadRequestException('submissionId required');
    if (!token) throw new BadRequestException('token required');
    const task = await this.prisma.remoteSubmissionTask.findUnique({ where: { submissionId } });
    if (!task || task.platformCode !== 'QOJ') throw new NotFoundException('Task not found');
    if (task.nonce && task.nonce !== token) throw new ConflictException('Task token mismatch');
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      throw new ConflictException('Task is already terminal');
    }
    if (task.expiresAt.getTime() <= Date.now()) throw new ConflictException('Task expired');
    return task;
  }
}

export function normalizeQojStatus(raw: string): string {
  return normalizeLuoguStatus(raw);
}
