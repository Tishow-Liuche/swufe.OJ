import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LuoguJudgeAdapter } from '../sync/adapters/luogu-judge.adapter';

interface RemoteJudgeJob {
  submissionId: string;
  problemId: string;
  remoteProblemId: string;
  language: string;
  sourceCode: string;
}

@Processor('remote-judge')
export class RemoteJudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(RemoteJudgeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private luogu: LuoguJudgeAdapter,
  ) { super(); }

  async process(job: Job<RemoteJudgeJob>) {
    const data = job.data;
    this.logger.log(`Remote judge #${data.submissionId} for ${data.remoteProblemId}`);

    if (!this.luogu.enabled) {
      await this.failSubmission(data.submissionId, 'REMOTE_ERROR',
        '洛谷 OpenApp Token 未配置。请在 .env 中设置 LUOGU_OPENAPP_TOKEN。\n' +
        '申请地址：https://docs.lgapi.cn/open/');
      return { status: 'REMOTE_ERROR', message: 'OpenApp Token 未配置' };
    }

    try {
      // 提交到洛谷
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'QUEUING' },
      });

      const result = await this.luogu.submit({
        pid: data.remoteProblemId,
        lang: data.language,
        o2: true,
        code: data.sourceCode,
        trackId: data.submissionId,
      });

      // 保存 Remote Judge 任务
      await this.prisma.remoteJudgeJob.upsert({
        where: { submissionId: data.submissionId },
        create: {
          submissionId: data.submissionId,
          platform: 'LUOGU',
          remoteProblemId: data.remoteProblemId,
          remoteSubmissionId: result.requestId,
        },
        update: {
          remoteSubmissionId: result.requestId,
          queryCount: 0,
          nextQueryAt: new Date(),
        },
      });

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'RUNNING' },
      });

      // 轮询结果（最多 60 次，每次 2 秒间隔）
      for (let i = 0; i < 60; i++) {
        await this.delay(2000);
        const judgeResult = await this.luogu.getResult(result.requestId);

        // 更新查询计数
        await this.prisma.remoteJudgeJob.update({
          where: { submissionId: data.submissionId },
          data: {
            queryCount: i + 1,
            lastQueryAt: new Date(),
            nextQueryAt: new Date(Date.now() + 2000),
            rawStatus: judgeResult?.status || 'PENDING',
          },
        });

        if (!judgeResult) {
          // 结果尚未就绪
          continue;
        }

        if (judgeResult.status === 'COMPLETED' && judgeResult.result) {
          const verdict = this.luogu.mapVerdict(judgeResult.result.verdict);
          const score = judgeResult.result.score || 0;
          const timeUsed = judgeResult.result.time || 0;
          const memoryUsed = judgeResult.result.memory || 0;
          const compileMsg = judgeResult.result.compile?.success === false
            ? judgeResult.result.compile.message : undefined;

          await this.prisma.submission.update({
            where: { id: data.submissionId },
            data: {
              status: verdict,
              score,
              timeUsed,
              memoryUsed,
              compileMessage: compileMsg || null,
              judgedAt: new Date(),
            },
          });

          await this.prisma.submissionCase.create({
            data: {
              submissionId: data.submissionId,
              caseIndex: 1,
              status: verdict,
              timeUsed,
              memoryUsed,
            },
          });

          await this.prisma.remoteJudgeJob.update({
            where: { submissionId: data.submissionId },
            data: {
              rawStatus: verdict,
              finishedAt: new Date(),
              errorMessage: compileMsg || null,
            },
          });

          this.logger.log(`Remote judge #${data.submissionId}: ${verdict} (${score}pts)`);
          return { status: verdict, score, timeUsed, memoryUsed };
        }

        if (judgeResult.status === 'FAILED') {
          throw new Error('评测失败：' + JSON.stringify(judgeResult));
        }
      }

      // 超时
      await this.failSubmission(data.submissionId, 'REMOTE_ERROR', '评测超时（超过 2 分钟未返回结果）');
      return { status: 'REMOTE_ERROR' };

    } catch (error: any) {
      this.logger.error(`Remote judge error #${data.submissionId}: ${error.message}`);
      await this.failSubmission(data.submissionId, 'REMOTE_ERROR', error.message);
      throw error;
    }
  }

  private async failSubmission(id: string, status: string, message: string) {
    await this.prisma.submission.update({
      where: { id },
      data: { status, compileMessage: message, judgedAt: new Date() },
    });
    await this.prisma.remoteJudgeJob.update({
      where: { submissionId: id },
      data: { errorMessage: message, finishedAt: new Date() },
    }).catch(() => {});
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
