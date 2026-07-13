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
    // Verify problem exists and has test cases
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { versions: { where: { isCurrent: true }, take: 1 } },
    });
    if (!problem || problem.status !== 'PUBLISHED') {
      throw new NotFoundException('题目不存在或未发布');
    }

    const currentVersion = problem.versions[0];
    if (!currentVersion) throw new NotFoundException('题目版本不存在');

    // 检查是否有测试用例
    const testCaseCount = await this.prisma.problemTestCase.count({
      where: { problemVersionId: currentVersion.id },
    });
    if (testCaseCount === 0 && problem.source === 'LOCAL') {
      throw new NotFoundException('题目尚未配置测试数据，无法提交');
    }

    // Create submission record
    const submission = await this.prisma.submission.create({
      data: {
        problemId: dto.problemId,
        problemVersionId: currentVersion?.id,
        userId,
        language: dto.language,
        sourceCode: dto.sourceCode,
        status: 'PENDING',
      },
    });

    // Determine judge type
    if (problem.source === 'LOCAL') {
      // Local judge
      await this.prisma.judgeTask.create({
        data: { submissionId: submission.id },
      });

      await this.judgeQueue.add(
        'local-judge',
        {
          submissionId: submission.id,
          problemId: dto.problemId,
          language: dto.language,
          sourceCode: dto.sourceCode,
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
        },
        { priority: 1 },
      );

      // Update status to QUEUING
      await this.prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'QUEUING' },
      });
    } else {
      // Remote / External: for MVP just mark as not supported yet
      await this.prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'REMOTE_ERROR' },
      });
    }

    return { id: submission.id, status: 'QUEUING' };
  }

  async findOne(id: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        cases: { orderBy: { caseIndex: 'asc' } },
        problem: { select: { id: true, title: true, timeLimit: true, memoryLimit: true } },
        user: { select: { id: true, username: true } },
      },
    });
    if (!submission) throw new NotFoundException('提交不存在');
    return submission;
  }

  async findAll(query: { userId?: string; problemId?: string; status?: string; page?: number; pageSize?: number }) {
    const { userId, problemId, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (problemId) where.problemId = problemId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        select: {
          id: true,
          status: true,
          language: true,
          score: true,
          timeUsed: true,
          memoryUsed: true,
          createdAt: true,
          problem: { select: { id: true, title: true } },
          user: { select: { id: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.submission.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async rejudge(id: string) {
    const sub = await this.prisma.submission.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('提交不存在');

    // 清除旧测试点
    await this.prisma.submissionCase.deleteMany({ where: { submissionId: id } });

    // 重置状态并重新入队
    await this.prisma.submission.update({
      where: { id },
      data: { status: 'PENDING', score: 0, timeUsed: null, memoryUsed: null, judgedAt: null },
    });

    await this.prisma.judgeTask.upsert({
      where: { submissionId: id },
      create: { submissionId: id },
      update: { retryCount: 0, startedAt: null, finishedAt: null },
    });

    const problem = await this.prisma.problem.findUnique({
      where: { id: sub.problemId },
      select: { timeLimit: true, memoryLimit: true },
    });

    await this.judgeQueue.add('local-judge', {
      submissionId: id, problemId: sub.problemId,
      language: sub.language, sourceCode: sub.sourceCode,
      timeLimit: problem?.timeLimit || 1000, memoryLimit: problem?.memoryLimit || 256,
    }, { priority: 2 });

    return { id, status: 'QUEUING' };
  }
}
