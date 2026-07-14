import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CfSubmissionService } from '../codeforces/cf-submission.service';
import { LuoguSubmissionService } from '../luogu/luogu-submission.service';

@Injectable()
export class SubmissionService {
  private readonly log = new Logger(SubmissionService.name);

  constructor(
    private prisma: PrismaService,
    private cfSubmission: CfSubmissionService,
    private luoguSubmission: LuoguSubmissionService,
    @InjectQueue('judge') private judgeQueue: Queue,
  ) {}

  async submit(userId: string, dto: { problemId: string; language: string; sourceCode: string }) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { versions: { where: { isCurrent: true } }, sourceInfo: true },
    });
    if (!problem || problem.status !== 'PUBLISHED')
      throw new NotFoundException('Problem not found or not published');

    // Codeforces remote judge path — no local test data needed
    const platform = problem.sourceInfo?.platform;
    if (platform === 'ATCODER') {
      throw new BadRequestException(
        'AtCoder 当前仅支持元数据与原题跳转，请在 AtCoder 原站完成提交',
      );
    }
    if (platform === 'CODEFORCES') {
      this.log.log(`CF route: problem=${dto.problemId} user=${userId}`);
      return this.cfSubmission.createTask(userId, dto.problemId, dto.language, dto.sourceCode);
    }
    if (platform === 'LUOGU') {
      this.log.log(`Luogu route: problem=${dto.problemId} user=${userId}`);
      return this.luoguSubmission.createTask(userId, dto.problemId, dto.language, dto.sourceCode);
    }

    // Local judge path
    const cv = problem.versions[0];
    if (!cv) throw new NotFoundException('Problem version not found');
    const submission = await this.prisma.submission.create({
      data: { problemId: dto.problemId, problemVersionId: cv.id, userId,
        language: dto.language, sourceCode: dto.sourceCode, status: 'PENDING' },
    });
    const tc = await this.prisma.problemTestCase.count({ where: { problemVersionId: cv.id } });
    if (tc === 0) throw new NotFoundException('No test data');
    await this.prisma.judgeTask.create({ data: { submissionId: submission.id } });
    await this.judgeQueue.add('local-judge', {
      submissionId: submission.id, problemId: dto.problemId,
      language: dto.language, sourceCode: dto.sourceCode,
      timeLimit: problem.timeLimit, memoryLimit: problem.memoryLimit,
    }, { priority: 1 });
    await this.prisma.submission.update({ where: { id: submission.id }, data: { status: 'QUEUING' } });
    return { id: submission.id, status: 'QUEUING', mode: 'LOCAL' };
  }

  async findOne(id: string) {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: { cases: { orderBy: { caseIndex: 'asc' } },
        problem: { select: { id: true, title: true, timeLimit: true, memoryLimit: true, source: true } },
        user: { select: { id: true, username: true } }, remoteJob: true },
    });
    if (!s) throw new NotFoundException('Submission not found');
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
    if (!sub) throw new NotFoundException('Submission not found');
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
