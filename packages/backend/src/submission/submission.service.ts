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
  ) {}

  async submit(userId: string, dto: {
    problemId: string; language: string; sourceCode: string;
    externalAccountId?: string;
  }) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { versions: { where: { isCurrent: true } }, sourceInfo: true },
    });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或未发布');
    const cv = problem.versions[0];
    if (!cv) throw new NotFoundException('题目版本不存在');

    const submission = await this.prisma.submission.create({
      data: {
        problemId: dto.problemId, problemVersionId: cv.id,
        userId, language: dto.language, sourceCode: dto.sourceCode,
        status: 'PENDING',
      },
    });

    if (problem.source === 'LOCAL') {
      // ===== 本地评测 =====
      const tc = await this.prisma.problemTestCase.count({ where: { problemVersionId: cv.id } });
      if (tc === 0) throw new NotFoundException('该题目尚未配置测试数据');

      await this.prisma.judgeTask.create({ data: { submissionId: submission.id } });
      await this.judgeQueue.add('local-judge', {
        submissionId: submission.id, problemId: dto.problemId,
        language: dto.language, sourceCode: dto.sourceCode,
        timeLimit: problem.timeLimit, memoryLimit: problem.memoryLimit,
      }, { priority: 1 });
    } else {
      // ===== Remote Judge：通过 Helper 系统 =====
      const remotePid = problem.sourceInfo?.remoteProblemId;
      const platform = problem.sourceInfo?.platform || 'LUOGU';
      if (!remotePid) throw new NotFoundException('该题目未关联第三方编号');

      // 获取目标平台
      const pf = await this.prisma.externalPlatform.findFirst({ where: { code: platform.toUpperCase() } });
      if (!pf || !pf.enabled) throw new NotFoundException('该第三方平台暂未开放');

      // 查找用户已绑定的账号
      let accountId = dto.externalAccountId;
      if (!accountId) {
        const accounts = await this.prisma.externalAccount.findMany({
          where: { userId, platform: platform.toUpperCase() },
        });
        if (accounts.length === 0) throw new NotFoundException(
          `请先在个人中心绑定 ${pf.name} 账号后再提交。`
        );
        accountId = accounts[0].id;
      }

      // 检查 Helper 设备是否在线
      const devices = await this.prisma.helperDevice.findMany({
        where: { userId, status: 'ONLINE' },
      });
      if (devices.length === 0) throw new NotFoundException(
        '浏览器 Helper 扩展未连接。请安装 OJ Helper 扩展并确保其在线。'
      );

      // 创建远程提交任务
      const task = await this.helper.createRemoteTask(submission.id, userId, {
        platformCode: platform.toUpperCase(),
        externalAccountId: accountId,
        remoteProblemId: remotePid,
        language: dto.language,
        sourceCode: dto.sourceCode,
      });

      // 推送给 Helper
      this.helperGateway.pushTask(userId, {
        taskId: task.id,
        submissionId: submission.id,
        platform: platform.toUpperCase(),
        remoteProblemId: remotePid,
        language: dto.language,
        sourceCode: dto.sourceCode,
      });
    }

    await this.prisma.submission.update({
      where: { id: submission.id },
      data: { status: 'QUEUING' },
    });
    return { id: submission.id, status: 'QUEUING', mode: problem.source === 'LOCAL' ? 'LOCAL' : 'HELPER' };
  }

  async findOne(id: string) {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        cases: { orderBy: { caseIndex: 'asc' } },
        problem: { select: { id: true, title: true, timeLimit: true, memoryLimit: true } },
        user: { select: { id: true, username: true } },
        remoteJob: true,
      },
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
      this.prisma.submission.findMany({ where, select: { id: true, status: true, language: true, score: true, timeUsed: true, memoryUsed: true, createdAt: true, problem: { select: { id: true, title: true, source: true } }, user: { select: { id: true, username: true } } }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.submission.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async updateJudgeResult(id: string, data: { status: string; score?: number; timeUsed?: number; memoryUsed?: number; compileMessage?: string }) {
    return this.prisma.submission.update({
      where: { id },
      data: {
        status: data.status, score: data.score || 0,
        timeUsed: data.timeUsed, memoryUsed: data.memoryUsed,
        compileMessage: data.compileMessage, judgedAt: new Date(),
      },
    });
  }

  async rejudge(id: string) {
    const sub = await this.prisma.submission.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('提交不存在');
    await this.prisma.submissionCase.deleteMany({ where: { submissionId: id } });
    await this.prisma.submission.update({ where: { id }, data: { status: 'PENDING', score: 0, timeUsed: null, memoryUsed: null, judgedAt: null } });
    await this.prisma.judgeTask.upsert({ where: { submissionId: id }, create: { submissionId: id }, update: { retryCount: 0, startedAt: null, finishedAt: null } });
    const problem = await this.prisma.problem.findUnique({ where: { id: sub.problemId }, select: { timeLimit: true, memoryLimit: true } });
    await this.judgeQueue.add('local-judge', { submissionId: id, problemId: sub.problemId, language: sub.language, sourceCode: sub.sourceCode, timeLimit: problem?.timeLimit || 1000, memoryLimit: problem?.memoryLimit || 256 }, { priority: 2 });
    return { id, status: 'QUEUING' };
  }
}
