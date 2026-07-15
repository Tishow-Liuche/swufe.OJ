import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class HelperService {
  constructor(private prisma: PrismaService) {}

  // ===== 第三方平台 =====
  async getPlatforms() {
    return this.prisma.externalPlatform.findMany();
  }

  async seedPlatforms() {
    const platforms = [
      { code: 'LUOGU', name: '洛谷', baseUrl: 'https://www.luogu.com.cn', supportsMetadata: true, supportsBrowserSubmission: true },
      { code: 'NOWCODER', name: '牛客', baseUrl: 'https://ac.nowcoder.com', supportsMetadata: true, supportsBrowserSubmission: true },
      { code: 'QOJ', name: 'QOJ', baseUrl: 'https://qoj.ac', supportsMetadata: true, supportsBrowserSubmission: true },
    ];
    for (const p of platforms) {
      await this.prisma.externalPlatform.upsert({
        where: { code: p.code }, create: p, update: p,
      });
    }
    return this.getPlatforms();
  }

  // ===== 账号绑定 =====
  async bindAccount(userId: string, dto: { platform: string; remoteUsername: string }) {
    const existing = await this.prisma.externalAccount.findFirst({
      where: { userId, platform: dto.platform },
    });
    if (existing) throw new ConflictException('该平台已绑定账号');

    return this.prisma.externalAccount.create({
      data: {
        userId, platform: dto.platform, remoteUsername: dto.remoteUsername,
        remoteUserId: dto.remoteUsername, status: 'IDENTITY_ONLY',
      },
    });
  }

  async getAccounts(userId: string) {
    return this.prisma.externalAccount.findMany({ where: { userId } });
  }

  async unbindAccount(accountId: string, userId: string) {
    const account = await this.prisma.externalAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('绑定记录不存在');
    await this.prisma.externalAccount.delete({ where: { id: accountId } });
    return { success: true };
  }

  async helperVerify(accountId: string, userId: string, remoteUsername: string) {
    const account = await this.prisma.externalAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('绑定记录不存在');

    return this.prisma.externalAccount.update({
      where: { id: accountId },
      data: {
        ownershipVerified: true,
        remoteUsername,
        remoteLoginVerifiedAt: new Date(),
        status: 'SUBMISSION_READY',
      },
    });
  }

  // ===== Helper 设备 =====
  async registerDevice(userId: string, dto: { deviceName: string; browserName: string; extensionVersion: string }) {
    return this.prisma.helperDevice.create({
      data: {
        userId, deviceName: dto.deviceName, browserName: dto.browserName,
        extensionVersion: dto.extensionVersion, status: 'ONLINE', lastSeenAt: new Date(),
      },
    });
  }

  async heartbeat(deviceId: string, userId: string) {
    return this.prisma.helperDevice.updateMany({
      where: { id: deviceId, userId },
      data: { status: 'ONLINE', lastSeenAt: new Date() },
    });
  }

  async getDevices(userId: string) {
    return this.prisma.helperDevice.findMany({ where: { userId } });
  }

  async revokeDevice(deviceId: string, userId: string) {
    await this.prisma.helperDevice.updateMany({
      where: { id: deviceId, userId },
      data: { status: 'REVOKED' },
    });
  }

  // ===== 远程提交任务 =====
  async createRemoteTask(submissionId: string, userId: string, data: {
    platformCode: string; externalAccountId: string; remoteProblemId: string;
    language: string; sourceCode: string; remoteContestId?: string; remoteProblemIndex?: string;
  }) {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 600_000); // 10分钟

    return this.prisma.remoteSubmissionTask.create({
      data: {
        submissionId, userId,
        platformCode: data.platformCode, externalAccountId: data.externalAccountId,
        remoteProblemId: data.remoteProblemId, remoteContestId: data.remoteContestId,
        remoteProblemIndex: data.remoteProblemIndex,
        language: data.language, sourceCode: data.sourceCode,
        status: 'PENDING', expiresAt, nonce,
        maximumAttempts: 1,
      },
    });
  }

  /** 获取下一个待处理任务（不自动分配，防止任务丢失） */
  async getNextTask(userId: string, deviceId: string) {
    const now = new Date();
    const task = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'ASSIGNED'] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!task) return null;

    // 仅在首次获取时更新设备信息（不改变状态，由扩展确认后再改）
    if (task.status === 'PENDING') {
      await this.prisma.remoteSubmissionTask.update({
        where: { id: task.id },
        data: {
          assignedHelperDeviceId: deviceId,
          attemptCount: { increment: 1 },
        },
      });
    }

    return {
      taskId: task.id,
      submissionId: task.submissionId,
      platform: task.platformCode,
      remoteProblemId: task.remoteProblemId,
      remoteContestId: task.remoteContestId,
      remoteProblemIndex: task.remoteProblemIndex,
      language: task.language,
      sourceCode: task.sourceCode,
      createdAt: task.createdAt.toISOString(),
      expiresAt: task.expiresAt.toISOString(),
      nonce: task.nonce,
    };
  }

  /** Helper 回执 */
  async submitReceipt(taskId: string, userId: string, data: {
    remoteSubmissionId: string; remoteUsername: string;
    submittedAt: string; remoteLanguage?: string;
  }) {
    const task = await this.prisma.remoteSubmissionTask.findFirst({
      where: { id: taskId, userId },
    });
    if (!task) throw new NotFoundException('任务不存在');

    await this.prisma.remoteSubmissionTask.update({
      where: { id: taskId },
      data: {
        status: 'REMOTE_SUBMITTED',
        remoteSubmissionId: data.remoteSubmissionId,
        updatedAt: new Date(),
      },
    });

    await this.prisma.submission.update({
      where: { id: task.submissionId },
      data: { status: 'JUDGING' },
    });

    await this.prisma.externalAccount.updateMany({
      where: { userId, platform: task.platformCode },
      data: { lastSuccessfulSubmissionAt: new Date(), status: 'SUBMISSION_READY' },
    });

    return { taskId, status: 'REMOTE_SUBMITTED' };
  }

  /** Helper 报告失败 */
  async submitFailure(taskId: string, userId: string, data: { failureCode: string; failureMessage?: string }) {
    await this.prisma.remoteSubmissionTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        failureCode: data.failureCode,
        failureMessage: data.failureMessage,
        updatedAt: new Date(),
      },
    });
    const task = await this.prisma.remoteSubmissionTask.findUnique({ where: { id: taskId } });
    if (task) {
      await this.prisma.submission.update({
        where: { id: task.submissionId },
        data: { status: 'REMOTE_ERROR', compileMessage: data.failureMessage },
      });
    }
    return { taskId, status: 'FAILED' };
  }

  /** 更新评测结果（由服务端轮询或Helper推送） */
  async updateJudgeResult(submissionId: string, data: {
    status: string; score?: number; timeUsed?: number; memoryUsed?: number;
    compileMessage?: string;
  }) {
    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: data.status, score: data.score || 0,
        timeUsed: data.timeUsed, memoryUsed: data.memoryUsed,
        compileMessage: data.compileMessage, judgedAt: new Date(),
      },
    });
  }
}
