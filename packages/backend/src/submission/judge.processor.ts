import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JudgeService, CompileResult, RunResult } from '../judge/judge.service';
import { LearningService } from '../learning/learning.service';
import { AssignmentProgressService } from '../teacher/assignment-progress.service';
import { ContestCacheService } from '../contest/contest-cache.service';

interface JudgeJob {
  submissionId: string;
  problemId: string;
  language: string;
  sourceCode: string;
  timeLimit: number;
  memoryLimit: number;
}

interface ProblemTestCaseForJudge {
  input: string;
  expectedOutput: string;
  isSample?: boolean;
}

const MAX_STORED_OUTPUT_CHARS = 32_768;

const configuredConcurrency = Number.parseInt(process.env.JUDGE_WORKER_CONCURRENCY || '1', 10);
const judgeConcurrency = Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
  ? configuredConcurrency
  : 1;

@Processor('judge', { concurrency: judgeConcurrency })
export class JudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(JudgeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private judge: JudgeService,
    private learning: LearningService,
    @Optional() private assignmentProgress?: AssignmentProgressService,
    @Optional() private contestCache?: ContestCacheService,
  ) {
    super();
  }

  async process(job: Job<JudgeJob>) {
    const data = job.data;
    this.logger.log(`Judging submission ${data.submissionId}`);
    const artifacts = new Set<string>();
    const pendingCases: Prisma.SubmissionCaseCreateManyInput[] = [];
    let lastCaseFlush = Date.now();
    let hasFlushedCases = false;
    const flushCases = async () => {
      if (!pendingCases.length) return;
      const batch = [...pendingCases];
      // One atomic statement avoids transaction round trips over the worker's DB tunnel.
      // Retried batches replace their own indexes; all user data stays parameterized.
      const payload = JSON.stringify(batch.map((row) => ({ ...row, id: randomUUID() })));
      await this.prisma.$executeRaw(Prisma.sql`
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS row(
            "id" text, "submissionId" text, "caseIndex" integer, "status" text,
            "timeUsed" integer, "memoryUsed" integer, "input" text,
            "expectedOutput" text, "actualOutput" text
          )
        ), deleted AS (
          DELETE FROM "SubmissionCase" AS existing USING incoming
          WHERE existing."submissionId" = incoming."submissionId"
            AND existing."caseIndex" = incoming."caseIndex"
          RETURNING existing."id"
        )
        INSERT INTO "SubmissionCase" (
          "id", "submissionId", "caseIndex", "status", "timeUsed", "memoryUsed",
          "input", "expectedOutput", "actualOutput"
        )
        SELECT incoming."id", incoming."submissionId", incoming."caseIndex", incoming."status",
          incoming."timeUsed", incoming."memoryUsed", incoming."input",
          incoming."expectedOutput", incoming."actualOutput"
        FROM incoming CROSS JOIN (SELECT count(*) FROM deleted) AS deletion_complete
      `);
      pendingCases.splice(0, batch.length);
      lastCaseFlush = Date.now();
      hasFlushedCases = true;
    };

    try {
      // Retried/stalled jobs must not expose a previous attempt's unrun tail.
      // Keep normal first attempts free of this additional database round trip.
      if (job.attemptsMade > 0 || job.attemptsStarted > 1) {
        await this.prisma.submissionCase.deleteMany({ where: { submissionId: data.submissionId } });
      }
      const submission = await this.prisma.submission.findUnique({
        where: { id: data.submissionId },
        select: { problemId: true, problemVersionId: true },
      });
      if (!submission || submission.problemId !== data.problemId || submission.problemVersionId === undefined) {
        await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', 'Submission snapshot identity is missing or mismatched');
        return { status: 'SYSTEM_ERROR' };
      }
      if (submission.problemVersionId === null) this.logger.warn(`Legacy submission ${data.submissionId} has no snapshot; using current version`);
      const version = await this.prisma.problemVersion.findFirst({
        where: submission.problemVersionId === null
          ? { problemId: data.problemId, isCurrent: true }
          : { id: submission.problemVersionId, problemId: data.problemId },
        include: { testCases: { orderBy: { order: 'asc' } }, checker: true },
      });
      if (!version || version.testCases.length === 0) {
        await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', '题目未配置测试数据');
        return { status: 'SYSTEM_ERROR' };
      }

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'COMPILING' },
      });
      const limits = { ...data, timeLimit: version.timeLimit ?? data.timeLimit, memoryLimit: version.memoryLimit ?? data.memoryLimit };
      const compileResult = await this.judge.compile(data.language, data.sourceCode);
      if (compileResult.fileId) artifacts.add(compileResult.fileId);
      if (!compileResult.success) {
        const status = compileResult.systemError ? 'SYSTEM_ERROR' : 'COMPILE_ERROR';
        await this.prisma.submission.update({
          where: { id: data.submissionId },
          data: {
            status,
            score: 0,
              compileMessage: this.truncateOutput(compileResult.message),
            judgedAt: new Date(),
          },
        });
        await this.finishTask(data.submissionId);
        await this.learning.recordSubmissionResult(data.submissionId, status);
        return { status };
      }

      const checker = version.checker;
      const useSpj = checker?.type === 'SPJ';
      let checkerCompileResult: CompileResult | null = null;
      if (useSpj) {
        if (!checker.protocol || checker.protocol === 'LEGACY') this.logger.warn(`Submission ${data.submissionId} uses LEGACY SPJ protocol`);
        checkerCompileResult = await this.judge.compile(
          checker.language || 'python',
          checker.sourceCode || '',
        );
        if (checkerCompileResult.fileId) artifacts.add(checkerCompileResult.fileId);
        if (!checkerCompileResult.success) {
          await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', `SPJ compilation failed: ${checkerCompileResult.message}`);
          return { status: 'SYSTEM_ERROR' };
        }
      }

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'RUNNING' },
      });

      let finalStatus = 'ACCEPTED';
      let maxTime = 0;
      let maxMemory = 0;
      let totalScore = 0;
      let systemMessage: string | undefined;

      for (const tc of version.testCases) {
        const result = await this.judge.run(
          data.language,
          tc.input,
          limits.timeLimit,
          limits.memoryLimit,
          compileResult.fileId,
          data.sourceCode,
        );

        maxTime = Math.max(maxTime, result.timeUsed);
        maxMemory = Math.max(maxMemory, result.memoryUsed);

        let caseStatus = result.status;
        if (caseStatus === 'ACCEPTED') {
          if (useSpj && checkerCompileResult) {
            const verdict = await this.judgeWithSpj(checker, checkerCompileResult, result.output, tc, limits);
            caseStatus = verdict.status;
            systemMessage = verdict.message;
          } else caseStatus = this.compareOutput(result.output, tc.expectedOutput)
              ? 'ACCEPTED'
              : 'WRONG_ANSWER';
        }
        if (caseStatus === 'SYSTEM_ERROR') {
          finalStatus = 'SYSTEM_ERROR';
          systemMessage ||= `Sandbox system error: ${result.error || result.stderr || result.sandboxStatus || result.output || 'unknown failure'}`;
        }

        pendingCases.push({
            submissionId: data.submissionId,
            caseIndex: tc.order,
            status: caseStatus,
            timeUsed: result.timeUsed,
            memoryUsed: result.memoryUsed,
            input: tc.isSample ? tc.input : null,
            expectedOutput: useSpj ? '[SPJ]' : tc.isSample ? tc.expectedOutput : null,
            actualOutput: this.truncateOutput(result.output),
        });

        if (caseStatus === 'ACCEPTED') totalScore += tc.score;
        if (caseStatus !== 'ACCEPTED' && finalStatus === 'ACCEPTED') finalStatus = caseStatus;
        if (!hasFlushedCases || pendingCases.length >= 10 || Date.now() - lastCaseFlush >= 1000
          || caseStatus === 'TIME_LIMIT_EXCEEDED') await flushCases();
        // Persist the timeout before stopping; unrun cases earn no score.
        if (caseStatus === 'TIME_LIMIT_EXCEEDED' || caseStatus === 'SYSTEM_ERROR') break;
      }
      await flushCases();

      const totalPossible = version.testCases.reduce((sum, tc) => sum + tc.score, 0);
      const finalScore = finalStatus !== 'SYSTEM_ERROR' && totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

      const judgedAt = new Date();
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: {
          status: finalStatus,
          score: finalScore,
          timeUsed: maxTime,
          memoryUsed: maxMemory,
          compileMessage: systemMessage ? this.truncateOutput(systemMessage) : null,
          judgedAt,
        },
      });
      await this.finishTask(data.submissionId);
      await this.learning.recordSubmissionResult(data.submissionId, finalStatus);
      if (finalStatus === 'ACCEPTED' && this.assignmentProgress) {
        const submission = await this.prisma.submission.findUnique({
          where: { id: data.submissionId },
          select: { userId: true, problemId: true },
        });
        if (submission) {
          await this.assignmentProgress.onLocalAccepted(
            submission.userId,
            submission.problemId,
            judgedAt,
          );
        }
      }
      this.logger.log(`Submission ${data.submissionId}: ${finalStatus} (${finalScore}分)`);
      return { status: finalStatus, score: finalScore };
    } catch (error: any) {
      try {
        await flushCases();
      } catch (flushError: any) {
        this.logger.error(`Failed to persist completed cases ${data.submissionId}: ${flushError.message}`);
      }
      this.logger.error(`Judge error ${data.submissionId}: ${error.message}`);
      await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', error.message?.slice(0, 500));
      throw error;
    } finally {
      for (const fileId of artifacts) this.judge.deleteFile(fileId).catch(() => {});
    }
  }

  private async judgeWithSpj(
    checker: { language?: string | null; sourceCode?: string | null; protocol?: string | null },
    checkerCompileResult: CompileResult,
    userOutput: string,
    testCase: ProblemTestCaseForJudge,
    data: JudgeJob,
  ) {
    const checkerResult: RunResult = await this.judge.runWithFiles(
      checker.language || 'python',
      userOutput,
      Math.min(30_000, Math.max(2000, data.timeLimit)),
      Math.min(1024, Math.max(256, data.memoryLimit)),
      checkerCompileResult.fileId,
      checker.sourceCode || '',
      {
        input: testCase.input,
        output: testCase.expectedOutput || '',
        user_output: userOutput,
      },
    );
    const status = this.checkerVerdict(checkerResult, checker.protocol || 'LEGACY');
    return {
      status,
      message: status === 'SYSTEM_ERROR'
        ? `SPJ system error (${checker.protocol || 'LEGACY'}): status=${checkerResult.sandboxStatus || checkerResult.status}, exit=${checkerResult.exitStatus ?? 'unknown'}, signal=${checkerResult.signal ?? 'none'}; ${checkerResult.error || ''}; stderr=${checkerResult.stderr || ''}; stdout=${checkerResult.output || '[empty]'}`
        : undefined,
    };
  }

  private compareOutput(actual: string, expected: string): boolean {
    return this.normalizeOutput(actual) === this.normalizeOutput(expected);
  }

  private normalizeOutput(output: string): string {
    return String(output ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t\n]+$/g, '');
  }

  private truncateOutput(output: string): string {
    const value = String(output ?? '');
    return value.length <= MAX_STORED_OUTPUT_CHARS
      ? value
      : `${value.slice(0, MAX_STORED_OUTPUT_CHARS)}\n[output truncated]`;
  }

  private checkerVerdict(result: RunResult, protocol: string): string {
    if (!['LEGACY', 'BOOLEAN_STDOUT', 'EXIT_CODE'].includes(protocol)) return 'SYSTEM_ERROR';
    if (result.signal || result.error || (result.sandboxStatus && !['Accepted', 'Nonzero Exit Status'].includes(result.sandboxStatus))) return 'SYSTEM_ERROR';
    if (protocol !== 'BOOLEAN_STDOUT' && [1, 2].includes(result.exitStatus!)
      && result.status === 'RUNTIME_ERROR' && result.sandboxStatus === 'Nonzero Exit Status') return 'WRONG_ANSWER';
    if (result.status !== 'ACCEPTED' || (result.exitStatus !== undefined && result.exitStatus !== 0)) return 'SYSTEM_ERROR';
    if (protocol === 'EXIT_CODE') return result.exitStatus === 0 ? 'ACCEPTED' : 'SYSTEM_ERROR';
    const answer = String(result.output || '').trim().toLowerCase();
    if (!answer && protocol === 'LEGACY') return 'ACCEPTED';
    if (['false', '0', 'no', 'wa', 'wrong', 'wrong_answer', 'incorrect'].includes(answer)) return 'WRONG_ANSWER';
    return ['true', '1', 'yes', 'ac', 'accepted', 'correct'].includes(answer) ? 'ACCEPTED' : 'SYSTEM_ERROR';
  }

  private async failSubmission(id: string, status: string, msg: string) {
    await this.prisma.submission.update({
      where: { id },
      data: { status, score: 0, compileMessage: this.truncateOutput(msg), judgedAt: new Date() },
    });
    await this.finishTask(id);
  }

  private async finishTask(id: string) {
    await this.prisma.judgeTask
      .update({ where: { submissionId: id }, data: { finishedAt: new Date() } })
      .catch(() => {});
    const contestSubmission = await this.prisma.contestSubmission
      .findUnique({ where: { submissionId: id }, select: { contestId: true } })
      .catch(() => null);
    if (contestSubmission?.contestId) {
      await this.contestCache?.invalidateContest(contestSubmission.contestId);
    }
  }
}
