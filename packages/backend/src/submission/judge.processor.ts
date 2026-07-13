import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NativeJudgeService } from '../judge/native-judge.service';

interface JudgeJob {
  submissionId: string;
  problemId: string;
  language: string;
  sourceCode: string;
  timeLimit: number;
  memoryLimit: number;
}

@Processor('judge')
export class JudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(JudgeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private judge: NativeJudgeService,
  ) {
    super();
  }

  async process(job: Job<JudgeJob>) {
    const data = job.data;
    this.logger.log(`Judging submission ${data.submissionId}`);

    try {
      // Mark as compiling
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'COMPILING' },
      });

      // Step 1: Compile
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
        await this.finishJudgeTask(data.submissionId);
        return { status: 'COMPILE_ERROR', message: compileResult.message };
      }

      // Mark as running
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'RUNNING' },
      });

      // Step 2: Run test cases
      const testCases = this.getTestCases(data.language, data.timeLimit);
      let finalStatus = 'ACCEPTED';
      let maxTime = 0;
      let maxMemory = 0;
      let totalScore = 0;

      for (const testCase of testCases) {
        const result = await this.judge.run(
          data.language,
          testCase.input,
          data.timeLimit,
          data.memoryLimit,
          compileResult.fileId,
          data.sourceCode,
        );

        maxTime = Math.max(maxTime, result.timeUsed);
        maxMemory = Math.max(maxMemory, result.memoryUsed);

        // Create test case result
        await this.prisma.submissionCase.create({
          data: {
            submissionId: data.submissionId,
            caseIndex: testCase.index,
            status: result.status,
            timeUsed: result.timeUsed,
            memoryUsed: result.memoryUsed,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            actualOutput: result.output,
          },
        });

        // Check correctness
        if (result.status !== 'ACCEPTED') {
          finalStatus = result.status;
        } else if (!this.compareOutput(result.output, testCase.expectedOutput)) {
          finalStatus = 'WRONG_ANSWER';
        }

        // Calculate score
        if (finalStatus === 'ACCEPTED' || result.status === 'ACCEPTED') {
          totalScore += Math.floor(100 / testCases.length);
        }

        // Stop on first failure for non-group scoring
        if (finalStatus !== 'ACCEPTED') break;
      }

      // Clean up compiled binary from go-judge cache
      if (compileResult.fileId) {
        this.judge.deleteFile(compileResult.fileId).catch(() => {});
      }

      // Update final result
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: {
          status: finalStatus,
          score: finalStatus === 'ACCEPTED' ? 100 : totalScore,
          timeUsed: maxTime,
          memoryUsed: maxMemory,
          judgedAt: new Date(),
        },
      });

      await this.finishJudgeTask(data.submissionId);

      this.logger.log(`Submission ${data.submissionId} judged: ${finalStatus}`);
      return { status: finalStatus, timeUsed: maxTime, memoryUsed: maxMemory };
    } catch (error: any) {
      this.logger.error(`Judge error for ${data.submissionId}: ${error.message}`);

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: {
          status: 'SYSTEM_ERROR',
          compileMessage: error.message,
          judgedAt: new Date(),
        },
      });
      await this.finishJudgeTask(data.submissionId);
      throw error;
    }
  }

  /** Generate test cases from problem requirements */
  private getTestCases(language: string, timeLimit: number): Array<{
    index: number;
    input: string;
    expectedOutput: string;
  }> {
    // MVP: Generate simple test cases
    // TODO: Load real test data from MinIO based on problem ID
    return [
      { index: 1, input: '1 2\n', expectedOutput: '3\n' },
      { index: 2, input: '10 20\n', expectedOutput: '30\n' },
      { index: 3, input: '-5 8\n', expectedOutput: '3\n' },
    ];
  }

  /** Compare actual output with expected output (trim whitespace) */
  private compareOutput(actual: string, expected: string): boolean {
    const normActual = actual.trim().replace(/\r\n/g, '\n');
    const normExpected = expected.trim().replace(/\r\n/g, '\n');
    return normActual === normExpected;
  }

  private async finishJudgeTask(submissionId: string) {
    await this.prisma.judgeTask.update({
      where: { submissionId },
      data: { finishedAt: new Date() },
    });
  }
}
