import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NativeJudgeService } from '../judge/native-judge.service';
import { LearningService } from '../learning/learning.service';

interface JudgeJob {
  submissionId: string;
  problemId: string;
  language: string;
  sourceCode: string;
  timeLimit: number;
  memoryLimit: number;
}

interface CompileResult {
  success: boolean;
  fileId?: string;
  message: string;
}

interface RunResult {
  status: string;
  timeUsed: number;
  memoryUsed: number;
  output: string;
}

@Processor('judge')
export class JudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(JudgeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private judge: NativeJudgeService,
    private learning: LearningService,
  ) {
    super();
  }

  async process(job: Job<JudgeJob>) {
    const data = job.data;
    this.logger.log(`Judging submission ${data.submissionId}`);

    try {
      const version = await this.prisma.problemVersion.findFirst({
        where: { problemId: data.problemId, isCurrent: true },
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
      const compileResult = await this.judge.compile(data.language, data.sourceCode);
      if (!compileResult.success) {
        await this.prisma.submission.update({
          where: { id: data.submissionId },
          data: {
            status: 'COMPILE_ERROR',
            compileMessage: compileResult.message,
            judgedAt: new Date(),
          },
        });
        await this.finishTask(data.submissionId);
        await this.learning.recordSubmissionResult(data.submissionId, 'COMPILE_ERROR');
        return { status: 'COMPILE_ERROR' };
      }

      const checker = version.checker;
      const useSpj = checker?.type === 'SPJ';
      let checkerCompileResult: CompileResult | null = null;
      if (useSpj) {
        checkerCompileResult = await this.judge.compile(
          checker.language || 'python',
          checker.sourceCode || '',
        );
        if (!checkerCompileResult.success) {
          await this.prisma.submission.update({
            where: { id: data.submissionId },
            data: {
              status: 'SYSTEM_ERROR',
              compileMessage: `SPJ 编译失败：${checkerCompileResult.message}`,
              judgedAt: new Date(),
            },
          });
          await this.finishTask(data.submissionId);
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

      for (const tc of version.testCases) {
        const result = await this.judge.run(
          data.language,
          tc.input,
          data.timeLimit,
          data.memoryLimit,
          compileResult.fileId,
          data.sourceCode,
        );

        maxTime = Math.max(maxTime, result.timeUsed);
        maxMemory = Math.max(maxMemory, result.memoryUsed);

        let caseStatus = result.status;
        if (caseStatus === 'ACCEPTED') {
          caseStatus = useSpj && checkerCompileResult
            ? await this.judgeWithSpj(checker, checkerCompileResult, result.output, data)
            : this.compareOutput(result.output, tc.expectedOutput)
              ? 'ACCEPTED'
              : 'WRONG_ANSWER';
        }

        await this.prisma.submissionCase.create({
          data: {
            submissionId: data.submissionId,
            caseIndex: tc.order,
            status: caseStatus,
            timeUsed: result.timeUsed,
            memoryUsed: result.memoryUsed,
            input: tc.input,
            expectedOutput: useSpj ? '[SPJ]' : tc.expectedOutput,
            actualOutput: result.output,
          },
        });

        if (caseStatus === 'ACCEPTED') totalScore += tc.score;
        if (caseStatus !== 'ACCEPTED' && finalStatus === 'ACCEPTED') finalStatus = caseStatus;
      }

      const totalPossible = version.testCases.reduce((sum, tc) => sum + tc.score, 0);
      const finalScore = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

      if (compileResult.fileId) this.judge.deleteFile(compileResult.fileId).catch(() => {});
      if (checkerCompileResult?.fileId) this.judge.deleteFile(checkerCompileResult.fileId).catch(() => {});

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: {
          status: finalStatus,
          score: finalScore,
          timeUsed: maxTime,
          memoryUsed: maxMemory,
          judgedAt: new Date(),
        },
      });
      await this.finishTask(data.submissionId);
      await this.learning.recordSubmissionResult(data.submissionId, finalStatus);
      this.logger.log(`Submission ${data.submissionId}: ${finalStatus} (${finalScore}分)`);
      return { status: finalStatus, score: finalScore };
    } catch (error: any) {
      this.logger.error(`Judge error ${data.submissionId}: ${error.message}`);
      await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', error.message?.slice(0, 500));
      throw error;
    }
  }

  private async judgeWithSpj(
    checker: { language?: string | null; sourceCode?: string | null },
    checkerCompileResult: CompileResult,
    userOutput: string,
    data: JudgeJob,
  ) {
    const checkerResult: RunResult = await this.judge.run(
      checker.language || 'python',
      userOutput,
      data.timeLimit,
      data.memoryLimit,
      checkerCompileResult.fileId,
      checker.sourceCode || '',
    );
    return this.checkerAccepted(checkerResult) ? 'ACCEPTED' : 'WRONG_ANSWER';
  }

  private compareOutput(actual: string, expected: string): boolean {
    const normalize = (value: string) => value.replace(/\r\n/g, '\n').trimEnd();
    return normalize(actual) === normalize(expected);
  }

  private checkerAccepted(result: RunResult): boolean {
    if (result.status !== 'ACCEPTED') return false;
    const answer = String(result.output || '').trim().toLowerCase();
    return ['true', '1', 'yes', 'ac', 'accepted', 'correct'].includes(answer);
  }

  private async failSubmission(id: string, status: string, msg: string) {
    await this.prisma.submission.update({
      where: { id },
      data: { status, compileMessage: msg, judgedAt: new Date() },
    });
    await this.finishTask(id);
  }

  private async finishTask(id: string) {
    await this.prisma.judgeTask
      .update({ where: { submissionId: id }, data: { finishedAt: new Date() } })
      .catch(() => {});
  }
}
