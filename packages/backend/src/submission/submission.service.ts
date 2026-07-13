import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from '../helper/helper.service';
import { HelperGateway } from '../helper/helper.gateway';

@Injectable()
export class SubmissionService {
  constructor(
    private prisma: PrismaService,
    private helper: HelperService,
    private helperGateway: HelperGateway,
    @InjectQueue('judge') private judgeQueue: Queue,
    @InjectQueue('cf-judge') private cfQueue: Queue,
  ) {}

  async submit(userId: string, dto: { problemId: string; language: string; sourceCode: string }) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { versions: { where: { isCurrent: true } }, sourceInfo: true },
    });
    if (!problem || problem.status !== 'PUBLISHED')
      throw new NotFoundException('题目不存在或未发布');
    const cv = problem.versions[0];
    if (!cv) throw new NotFoundException('题目版本不存在');

    const submission = await this.prisma.submission.create({
      data: { problemId: dto.problemId, problemVersionId: cv.id, userId,
        language: dto.language, sourceCode: dto.sourceCode, status: 'PENDING' },
    });

    const platform = problem.sourceInfo?.platform || 'LOCAL';

    if (platform === 'CODEFORCES') {
      // ===== CF：优先浏览器扩展 → 降级为服务器端 =====
      const remotePid = problem.sourceInfo?.remoteProblemId || '';
      const parts = remotePid.match(/(\d+)([A-Z]\d?)/);
      if (!parts) throw new NotFoundException('CF 题目编号格式错误: ' + remotePid);

      // 检查是否有在线 Helper 设备
      const devices = await this.prisma.helperDevice.findMany({
        where: { userId, status: 'ONLINE' },
      });

      if (devices.length > 0) {
        // ★ 通过浏览器扩展提交（绕过 Cloudflare）
        const task = await this.helper.createRemoteTask(submission.id, userId, {
          platformCode: 'CODEFORCES',
          externalAccountId: problem.sourceInfo?.id || '',
          remoteProblemId: remotePid,
          language: dto.language,
          sourceCode: dto.sourceCode,
        });

        this.helperGateway.pushTask(userId, {
          taskId: task.id,
          submissionId: submission.id,
          platform: 'CODEFORCES',
          remoteProblemId: remotePid,
          language: dto.language,
          sourceCode: dto.sourceCode,
        });
        await this.prisma.submission.update({ where: { id: submission.id }, data: { status: 'QUEUING' } });
        return { id: submission.id, status: 'QUEUING', mode: 'CODEFORCES_HELPER' };
      } else {
        // 降级：服务器端代理（需 Linux 环境）
        const contestId = parseInt(parts[1]);
        const problemIndex = parts[2];
        await this.cfQueue.add('cf-judge', {
          submissionId: submission.id, problemId: dto.problemId, contestId, problemIndex,
          language: dto.language, sourceCode: dto.sourceCode,
        }, { priority: 1 });
        await this.prisma.submission.update({ where: { id: submission.id }, data: { status: 'QUEUING' } });
        return { id: submission.id, status: 'QUEUING', mode: 'CODEFORCES_SERVER' };
      }
    } else {
      // ===== 本地评测（原创+洛谷） =====
      const tc = await this.prisma.problemTestCase.count({ where: { problemVersionId: cv.id } });
      if (tc === 0) throw new NotFoundException('该题目尚未配置测试数据');

      await this.prisma.judgeTask.create({ data: { submissionId: submission.id } });
      await this.judgeQueue.add('local-judge', {
        submissionId: submission.id, problemId: dto.problemId,
        language: dto.language, sourceCode: dto.sourceCode,
        timeLimit: problem.timeLimit, memoryLimit: problem.memoryLimit,
      }, { priority: 1 });
      await this.prisma.submission.update({ where: { id: submission.id }, data: { status: 'QUEUING' } });
      return { id: submission.id, status: 'QUEUING', mode: 'LOCAL' };
    }
  }

  /** 回填第三方评测结果（无需 JWT，验证 owner） */
  async fillExternalResultUnsafe(submissionId: string, userId: string, data: {
    status: string; score?: number; timeUsed?: number; memoryUsed?: number; remoteSubmissionId?: string;
  }) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('提交不存在');
    // 宽松验证：有 userId 则校验，无则不校验（Helper 场景）
    if (userId && sub.userId !== userId) throw new NotFoundException('提交不属于该用户');

    await this.prisma.submissionCase.create({
      data: { submissionId, caseIndex: 1, status: data.status,
        timeUsed: data.timeUsed || 0, memoryUsed: data.memoryUsed || 0 },
    });
    if (data.remoteSubmissionId) {
      await this.prisma.remoteJudgeJob.upsert({
        where: { submissionId },
        create: { submissionId, platform: 'CODEFORCES', remoteProblemId: sub.problemId,
          remoteSubmissionId: data.remoteSubmissionId },
        update: { remoteSubmissionId: data.remoteSubmissionId, finishedAt: new Date() },
      });
    }
    return this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: data.status, score: data.score || 0,
        timeUsed: data.timeUsed, memoryUsed: data.memoryUsed, judgedAt: new Date() },
    });
  }

  async fillExternalResult(submissionId: string, userId: string, data: {
    status: string; score?: number; timeUsed?: number; memoryUsed?: number; remoteSubmissionId?: string;
  }) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('提交不存在');

    await this.prisma.submissionCase.create({
      data: { submissionId, caseIndex: 1, status: data.status,
        timeUsed: data.timeUsed || 0, memoryUsed: data.memoryUsed || 0 },
    });
    if (data.remoteSubmissionId) {
      await this.prisma.remoteJudgeJob.upsert({
        where: { submissionId },
        create: { submissionId, platform: 'CODEFORCES', remoteProblemId: sub.problemId,
          remoteSubmissionId: data.remoteSubmissionId },
        update: { remoteSubmissionId: data.remoteSubmissionId, finishedAt: new Date() },
      });
    }
    return this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: data.status, score: data.score || 0,
        timeUsed: data.timeUsed, memoryUsed: data.memoryUsed, judgedAt: new Date() },
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: { cases: { orderBy: { caseIndex: 'asc' } },
        problem: { select: { id: true, title: true, timeLimit: true, memoryLimit: true, source: true } },
        user: { select: { id: true, username: true } }, remoteJob: true },
    });
    if (!s) throw new NotFoundException('提交不存在');
    return s;
  }

  async findAll(q: any) {
    const { userId, problemId, status, page = 1, pageSize = 20 } = q;
    const where: any = {};
    if (userId) where.userId = userId;
    if (problemId) where.problemId = problemId;
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({ where,
        select: { id: true, status: true, language: true, score: true, timeUsed: true,
          memoryUsed: true, createdAt: true,
          problem: { select: { id: true, title: true, source: true } },
          user: { select: { id: true, username: true } } },
        skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.submission.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async rejudge(id: string) {
    const sub = await this.prisma.submission.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('提交不存在');
    await this.prisma.submissionCase.deleteMany({ where: { submissionId: id } });
    await this.prisma.submission.update({ where: { id },
      data: { status: 'PENDING', score: 0, timeUsed: null, memoryUsed: null, judgedAt: null } });
    await this.prisma.judgeTask.upsert({ where: { submissionId: id },
      create: { submissionId: id }, update: { retryCount: 0, startedAt: null, finishedAt: null } });
    const problem = await this.prisma.problem.findUnique({ where: { id: sub.problemId },
      select: { timeLimit: true, memoryLimit: true } });
    await this.judgeQueue.add('local-judge', {
      submissionId: id, problemId: sub.problemId, language: sub.language,
      sourceCode: sub.sourceCode, timeLimit: problem?.timeLimit || 1000,
      memoryLimit: problem?.memoryLimit || 256 }, { priority: 2 });
    return { id, status: 'QUEUING' };
  }
}
