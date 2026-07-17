import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const LEASE_TTL_MS = 2 * 60 * 1000;
const OPEN_STATUSES = ['PENDING', 'PROCESSING'];

@Injectable()
export class CfTaskLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(problemId: string) {
    if (!problemId) throw new BadRequestException('problemId required');

    const task = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'CODEFORCES',
        status: { in: OPEN_STATUSES },
        remoteProblemId: problemId,
        remoteSubmissionId: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!task) {
      throw new NotFoundException('No pending CF task for problem ' + problemId);
    }

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

  async acquireLease(
    submissionId: string,
    token: string,
    replayLeaseNonce?: string,
  ) {
    const task = await this.loadTask(submissionId, token);
    const now = new Date();

    if (task.remoteSubmissionId) {
      throw new ConflictException('Task already has a Codeforces submission ID');
    }

    if (
      task.leaseNonce &&
      task.leaseExpiresAt &&
      task.leaseExpiresAt.getTime() > now.getTime()
    ) {
      if (replayLeaseNonce && replayLeaseNonce === task.leaseNonce) {
        return {
          submissionId,
          leaseNonce: task.leaseNonce,
          leaseExpiresAt: task.leaseExpiresAt,
        };
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
      data: {
        leaseNonce,
        leaseExpiresAt,
        helperStage: 'LEASED',
        status: 'PROCESSING',
      },
    });

    return { submissionId, leaseNonce, leaseExpiresAt };
  }

  async bindSid(
    submissionId: string,
    token: string,
    leaseNonce: string,
    cfSubmissionId: string,
  ) {
    const sid = String(cfSubmissionId || '').trim();
    if (!/^\d+$/.test(sid)) {
      throw new BadRequestException('Invalid cfSubmissionId');
    }

    const task = await this.loadTask(submissionId, token);

    if (task.leaseNonce && task.leaseNonce !== leaseNonce) {
      throw new ConflictException('Lease nonce mismatch');
    }

    if (task.remoteSubmissionId) {
      if (task.remoteSubmissionId === sid) {
        return { ok: true, submissionId, cfSubmissionId: sid, status: 'JUDGING' };
      }
      throw new ConflictException('Task already has a different SID');
    }

    const duplicate = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'CODEFORCES',
        remoteSubmissionId: sid,
        submissionId: { not: submissionId },
      },
      select: { submissionId: true },
    });

    if (duplicate) {
      throw new ConflictException('SID is already bound to another task');
    }

    await this.persistSid(submissionId, sid);

    return { ok: true, submissionId, cfSubmissionId: sid, status: 'JUDGING' };
  }

  async bindSidLegacy(submissionId: string, cfSubmissionId: string) {
    const sid = String(cfSubmissionId || '').trim();
    if (!/^\d+$/.test(sid)) {
      throw new BadRequestException('Invalid cfSubmissionId');
    }

    const task = await this.prisma.remoteSubmissionTask.findUnique({
      where: { submissionId },
    });

    if (!task || task.platformCode !== 'CODEFORCES') {
      throw new NotFoundException('Task not found');
    }
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      throw new ConflictException('Task is already terminal');
    }
    if (task.remoteSubmissionId) {
      if (task.remoteSubmissionId === sid) {
        return {
          ok: true,
          submissionId,
          cfSubmissionId: sid,
          status: 'JUDGING',
          legacy: true,
        };
      }
      throw new ConflictException('Task already has a different SID');
    }

    const duplicate = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'CODEFORCES',
        remoteSubmissionId: sid,
        submissionId: { not: submissionId },
      },
      select: { submissionId: true },
    });

    if (duplicate) {
      throw new ConflictException('SID is already bound to another task');
    }

    await this.persistSid(submissionId, sid);

    return {
      ok: true,
      submissionId,
      cfSubmissionId: sid,
      status: 'JUDGING',
      legacy: true,
    };
  }

  private async persistSid(submissionId: string, sid: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.remoteSubmissionTask.update({
        where: { submissionId },
        data: {
          remoteSubmissionId: sid,
          helperStage: 'SID_REPORTED',
          status: 'PROCESSING',
        },
      });
      await tx.remoteJudgeJob.update({
        where: { submissionId },
        data: { remoteSubmissionId: sid },
      });
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: 'JUDGING' },
      });
    });
  }

  private async loadTask(submissionId: string, token: string) {
    if (!submissionId) throw new BadRequestException('submissionId required');
    if (!token) throw new BadRequestException('token required');

    const task = await this.prisma.remoteSubmissionTask.findUnique({
      where: { submissionId },
    });

    if (!task || task.platformCode !== 'CODEFORCES') {
      throw new NotFoundException('Task not found');
    }
    if (task.nonce && task.nonce !== token) {
      throw new ConflictException('Task token mismatch');
    }
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      throw new ConflictException('Task is already terminal');
    }
    if (task.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Task expired');
    }

    return task;
  }
}
