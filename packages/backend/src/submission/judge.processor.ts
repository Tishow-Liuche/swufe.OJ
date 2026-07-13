import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NativeJudgeService } from '../judge/native-judge.service';

interface JudgeJob {
  submissionId: string; problemId: string; language: string;
  sourceCode: string; timeLimit: number; memoryLimit: number;
}

@Processor('judge')
export class JudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(JudgeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private judge: NativeJudgeService,
  ) { super(); }

  async process(job: Job<JudgeJob>) {
    const data = job.data;
    this.logger.log(`Judging submission ${data.submissionId}`);

    try {
      // 加载题目版本的真实测试用例
      const version = await this.prisma.problemVersion.findFirst({
        where: { problemId: data.problemId, isCurrent: true },
        include: { testCases: { orderBy: { order: 'asc' } } },
      });
      if (!version || version.testCases.length === 0) {
        await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', '题目未配置测试数据');
        return { status: 'SYSTEM_ERROR' };
      }

      // 编译
      await this.prisma.submission.update({ where: { id: data.submissionId }, data: { status: 'COMPILING' } });
      const compileResult = await this.judge.compile(data.language, data.sourceCode);
      if (!compileResult.success) {
        await this.prisma.submission.update({
          where: { id: data.submissionId },
          data: { status: 'COMPILE_ERROR', compileMessage: compileResult.message, judgedAt: new Date() },
        });
        await this.finishTask(data.submissionId);
        return { status: 'COMPILE_ERROR' };
      }

      // 运行所有测试点
      await this.prisma.submission.update({ where: { id: data.submissionId }, data: { status: 'RUNNING' } });
      let finalStatus = 'ACCEPTED';
      let maxTime = 0;
      let maxMemory = 0;
      let totalScore = 0;
      const totalCases = version.testCases.length;

      for (const tc of version.testCases) {
        const result = await this.judge.run(
          data.language, tc.input, data.timeLimit, data.memoryLimit,
          compileResult.fileId, data.sourceCode,
        );

        maxTime = Math.max(maxTime, result.timeUsed);
        maxMemory = Math.max(maxMemory, result.memoryUsed);

        // 判定测试点状态
        let caseStatus = result.status;
        if (caseStatus === 'ACCEPTED' && !this.compareOutput(result.output, tc.expectedOutput)) {
          caseStatus = 'WRONG_ANSWER';
        }

        await this.prisma.submissionCase.create({
          data: {
            submissionId: data.submissionId, caseIndex: tc.order,
            status: caseStatus, timeUsed: result.timeUsed,
            memoryUsed: result.memoryUsed,
            input: tc.input, expectedOutput: tc.expectedOutput, actualOutput: result.output,
          },
        });

        // 计算分数
        if (caseStatus === 'ACCEPTED') totalScore += tc.score;
        if (caseStatus !== 'ACCEPTED' && finalStatus === 'ACCEPTED') finalStatus = caseStatus;
      }

      // 最终得分
      const totalPossible = version.testCases.reduce((sum, tc) => sum + tc.score, 0);
      const finalScore = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

      if (compileResult.fileId) this.judge.deleteFile(compileResult.fileId).catch(() => {});

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: {
          status: finalStatus, score: finalScore,
          timeUsed: maxTime, memoryUsed: maxMemory, judgedAt: new Date(),
        },
      });
      await this.finishTask(data.submissionId);
      this.logger.log(`Submission ${data.submissionId}: ${finalStatus} (${finalScore}分)`);
      return { status: finalStatus, score: finalScore };
    } catch (error: any) {
      this.logger.error(`Judge error ${data.submissionId}: ${error.message}`);
      await this.failSubmission(data.submissionId, 'SYSTEM_ERROR', error.message?.slice(0, 500));
      throw error;
    }
  }

  private compareOutput(actual: string, expected: string): boolean {
    return actual.trim().replace(/\r\n/g, '\n') === expected.trim().replace(/\r\n/g, '\n');
  }

  private async failSubmission(id: string, status: string, msg: string) {
    await this.prisma.submission.update({
      where: { id }, data: { status, compileMessage: msg, judgedAt: new Date() },
    });
    await this.finishTask(id);
  }

  private async finishTask(id: string) {
    await this.prisma.judgeTask.update({ where: { submissionId: id }, data: { finishedAt: new Date() } }).catch(() => {});
  }
}
