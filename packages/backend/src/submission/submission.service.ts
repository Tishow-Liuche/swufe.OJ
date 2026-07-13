import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubmissionService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('judge') private judgeQueue: Queue,
  ) {}

  async submit(userId: string, dto: { problemId: string; language: string; sourceCode: string }) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { versions: { where: { isCurrent: true } }, sourceInfo: true },
    });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或未发布');
    const cv = problem.versions[0];
    if (!cv) throw new NotFoundException('题目版本不存在');

    const submission = await this.prisma.submission.create({
      data: { problemId: dto.problemId, problemVersionId: cv.id, userId,
        language: dto.language, sourceCode: dto.sourceCode, status: 'PENDING' },
    });

    if (problem.source === 'LOCAL') {
      // ===== 原创题：本地评测 =====
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
    } else {
      // ===== 第三方题：需在第三方平台提交后回填结果 =====
      const pid = problem.sourceInfo?.remoteProblemId || '';
      const platform = problem.sourceInfo?.platform || 'LUOGU';

      // 构造洛谷提交链接
      let submitUrl = '';
      if (platform === 'LUOGU') submitUrl = `https://www.luogu.com.cn/problem/${pid}`;
      else if (platform === 'CODEFORCES') submitUrl = `https://codeforces.com/problemset/submit`;
      else if (platform === 'NOWCODER') submitUrl = `https://ac.nowcoder.com/acm/problem/${pid}`;

      await this.prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'PENDING' },
      });

      return {
        id: submission.id,
        status: 'PENDING',
        mode: 'EXTERNAL',
        submitUrl,
        remoteProblemId: pid,
        platform,
        instruction: `请在 ${platform} 上提交代码后，点击"回填结果"按钮输入评测结果`,
      };
    }
  }

  /** 回填第三方评测结果 */
  async fillExternalResult(submissionId: string, userId: string, data: {
    status: string; score?: number; timeUsed?: number; memoryUsed?: number;
    remoteSubmissionId?: string;
  }) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('提交不存在');

    // 创建一条 SubmissionCase 记录
    await this.prisma.submissionCase.create({
      data: {
        submissionId,
        caseIndex: 1,
        status: data.status,
        timeUsed: data.timeUsed || 0,
        memoryUsed: data.memoryUsed || 0,
      },
    });

    // 更新 RemoteJudgeJob
    if (data.remoteSubmissionId) {
      await this.prisma.remoteJudgeJob.upsert({
        where: { submissionId },
        create: {
          submissionId, platform: 'LUOGU',
          remoteProblemId: sub.problemId,
          remoteSubmissionId: data.remoteSubmissionId,
        },
        update: {
          remoteSubmissionId: data.remoteSubmissionId,
          finishedAt: new Date(),
        },
      });
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: data.status,
        score: data.score || 0,
        timeUsed: data.timeUsed,
        memoryUsed: data.memoryUsed,
        judgedAt: new Date(),
      },
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        cases: { orderBy: { caseIndex: 'asc' } },
        problem: { select: { id: true, title: true, timeLimit: true, memoryLimit: true, source: true } },
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
