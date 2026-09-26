import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CfSubmissionService } from '../codeforces/cf-submission.service';
import { LuoguSubmissionService } from '../luogu/luogu-submission.service';
import { QojSubmissionService } from '../qoj/qoj-submission.service';
import { nicknameFilter } from '../common/submission-search';

@Injectable()
export class SubmissionService {
  private readonly log = new Logger(SubmissionService.name);

  constructor(
    private prisma: PrismaService,
    private cfSubmission: CfSubmissionService,
    private luoguSubmission: LuoguSubmissionService,
    private qojSubmission: QojSubmissionService,
    @InjectQueue('judge') private judgeQueue: Queue,
  ) {}

  async submit(
    userId: string,
    dto: { problemId: string; language: string; sourceCode: string },
    options: { allowContestReserved?: boolean; authorPreviewActor?: { id: string; role?: string } } = {},
  ) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { versions: { where: { isCurrent: true } }, sourceInfo: true },
    });
    const canPreviewReserved = ['CONTEST_RESERVED', 'DRAFT'].includes(problem?.status || '')
      && problem?.source === 'LOCAL'
      && !!options.authorPreviewActor
      && ['ADMIN', 'TEACHER'].includes(options.authorPreviewActor.role || '');
    const canSubmit = problem?.status === 'PUBLISHED'
      || (options.allowContestReserved && problem?.status === 'CONTEST_RESERVED')
      || canPreviewReserved;
    if (!problem || !canSubmit)
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
    if (platform === 'QOJ') {
      this.log.log(`QOJ route: problem=${dto.problemId} user=${userId}`);
      return this.qojSubmission.createTask(userId, dto.problemId, dto.language, dto.sourceCode);
    }

    // Local judge path
    const cv = problem.versions[0];
    if (!cv) throw new NotFoundException('Problem version not found');
    const tc = await this.prisma.problemTestCase.count({ where: { problemVersionId: cv.id } });
    if (tc === 0) throw new NotFoundException('No test data');
    const submission = await this.prisma.$transaction(async (tx) => {
      // Serialize admission across API instances without holding a lock during judging.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`local-submission:${userId}`}, 0))`;
      await this.assertLocalQueueCapacity(userId, tx);
      const created = await tx.submission.create({
        data: { problemId: dto.problemId, problemVersionId: cv.id, userId,
          language: dto.language, sourceCode: dto.sourceCode, status: 'PENDING' },
      });
      await tx.judgeTask.create({ data: { submissionId: created.id } });
      return created;
    });
    // Persist before publishing: a fast worker must never be reset to QUEUING.
    await this.prisma.submission.update({ where: { id: submission.id }, data: { status: 'QUEUING' } });
    try {
      await this.judgeQueue.add('local-judge', {
        submissionId: submission.id, problemId: dto.problemId,
        language: dto.language, sourceCode: dto.sourceCode,
        timeLimit: problem.timeLimit, memoryLimit: problem.memoryLimit, outputLimit: problem.outputLimit,
      }, { priority: 1 });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        const finishedAt = new Date();
        // A lost queue acknowledgement may occur after a worker has picked up the job.
        const failed = await tx.submission.updateMany({
          where: { id: submission.id, status: { in: ['PENDING', 'QUEUING'] } },
          data: { status: 'SYSTEM_ERROR', judgedAt: finishedAt,
            compileMessage: '判题任务入队失败，请稍后重新提交' },
        });
        if (failed.count) {
          await tx.judgeTask.updateMany({
            where: { submissionId: submission.id, finishedAt: null },
            data: { finishedAt },
          });
        }
      });
      throw error;
    }
    return { id: submission.id, status: 'QUEUING', mode: 'LOCAL' };
  }

  private async assertLocalQueueCapacity(userId: string, tx: Prisma.TransactionClient) {
    const activeStatuses = ['PENDING', 'QUEUING', 'COMPILING', 'RUNNING', 'JUDGING'];
    const active = await tx.submission.count({
      where: { userId, status: { in: activeStatuses } },
    });
    const maxPending = this.positiveInteger('JUDGE_MAX_PENDING_PER_USER', 5);
    if (active >= maxPending) {
      throw new HttpException(`最多允许 ${maxPending} 个待完成提交，请等待部分评测完成后再提交`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const cooldownSeconds = this.positiveInteger('JUDGE_SUBMISSION_COOLDOWN_SECONDS', 5);
    const recent = await tx.submission.findFirst({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - cooldownSeconds * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      throw new HttpException(`提交过于频繁，请等待 ${cooldownSeconds} 秒`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const [waiting, prioritized] = await Promise.all([
      this.judgeQueue.getWaitingCount(),
      this.judgeQueue.getPrioritizedCount(),
    ]);
    const maxWaiting = this.positiveInteger('JUDGE_QUEUE_MAX_WAITING', 500);
    if (waiting + prioritized >= maxWaiting) {
      throw new HttpException('判题队列繁忙，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private positiveInteger(name: string, fallback: number) {
    const value = Number.parseInt(process.env[name] || '', 10);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  async findOne(id: string) {
    await this.expireStaleQojHelperTasks();
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: { cases: { orderBy: { caseIndex: 'asc' } },
        problem: { select: { id: true, problemNo: true, title: true, timeLimit: true, memoryLimit: true, source: true } },
        user: { select: { id: true, username: true } }, remoteJob: true },
    });
    if (!s) throw new NotFoundException('Submission not found');
    return s;
  }
  async findAll(q: any) {
    await this.expireStaleQojHelperTasks();
    const { userId, problemId, status } = q;
    const page = Math.max(1, Number.parseInt(String(q.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(q.pageSize ?? '20'), 10) || 20));
    const where: any = { ...nicknameFilter(q.nickname) };
    if (userId) where.userId = userId;
    if (problemId) where.problemId = problemId;
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({ where,
        select: { id: true, status: true, language: true, score: true, timeUsed: true,
          memoryUsed: true, createdAt: true,
          problem: { select: { id: true, problemNo: true, title: true, source: true } },
          user: { select: { id: true, username: true, nickname: true } } },
        skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.submission.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  private async expireStaleQojHelperTasks() {
    const now = new Date();
    const helperPickupDeadline = new Date(now.getTime() - 2 * 60 * 1000);

    const stale = await this.prisma.remoteSubmissionTask.findMany({
      where: {
        platformCode: 'QOJ',
        status: { in: ['PENDING', 'PROCESSING'] },
        OR: [
          {
            status: 'PENDING',
            leaseNonce: null,
            createdAt: { lte: helperPickupDeadline },
          },
          {
            status: 'PROCESSING',
            remoteSubmissionId: null,
            leaseExpiresAt: { lte: now },
          },
          {
            expiresAt: { lte: now },
          },
        ],
      },
      select: { id: true, submissionId: true, helperStage: true, leaseNonce: true },
    });

    if (!stale.length) return;

    const submissionIds = stale.map((task) => task.submissionId);
    await this.prisma.$transaction(async (tx) => {
      await tx.remoteSubmissionTask.updateMany({
        where: { id: { in: stale.map((task) => task.id) } },
        data: {
          status: 'FAILED',
          failureCode: 'QOJ_HELPER_TIMEOUT',
          failureMessage: 'QOJ helper did not create a remote submission in time',
          helperStage: 'FAILED_TIMEOUT',
        },
      });
      await tx.submission.updateMany({
        where: { id: { in: submissionIds }, status: { in: ['QUEUING', 'JUDGING', 'PENDING', 'PROCESSING'] } },
        data: {
          status: 'REMOTE_ERROR',
          score: 0,
          compileMessage: 'QOJ 浏览器助手未在限定时间内完成真实提交；请确认脚本已更新到 v2.5 且 QOJ 已登录。',
          judgedAt: now,
        },
      });
      await tx.remoteJudgeJob.updateMany({
        where: { submissionId: { in: submissionIds }, finishedAt: null },
        data: {
          finishedAt: now,
          rawStatus: 'QOJ_HELPER_TIMEOUT',
          errorMessage: 'QOJ helper did not create a remote submission in time',
        },
      });
    });
    this.log.warn(`Expired ${stale.length} stale QOJ helper task(s)`);
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
      select: { timeLimit: true, memoryLimit: true, outputLimit: true } });
    await this.judgeQueue.add('local-judge', {
      submissionId: id, problemId: sub.problemId, language: sub.language,
      sourceCode: sub.sourceCode, timeLimit: problem?.timeLimit || 1000,
      memoryLimit: problem?.memoryLimit || 256, outputLimit: problem?.outputLimit ?? 64 }, { priority: 2 });
    return { id, status: 'QUEUING' };
  }
}
