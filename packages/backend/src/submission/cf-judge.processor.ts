import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodeforcesAdapter } from '../codeforces/cf-adapter.service';

interface CFJudgeJob {
  submissionId: string;
  problemId: string;
  contestId: number;
  problemIndex: string;
  language: string;
  sourceCode: string;
}

@Processor('cf-judge')
export class CFJudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(CFJudgeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cf: CodeforcesAdapter,
  ) { super(); }

  async process(job: Job<CFJudgeJob>) {
    const data = job.data;
    this.logger.log(`[CFJudge] #${data.submissionId}: ${data.contestId}${data.problemIndex}`);

    // Set queuing
    await this.prisma.submission.update({
      where: { id: data.submissionId },
      data: { status: 'QUEUING' },
    });

    // 1. Login to CF
    const loggedIn = await this.cf.login();
    if (!loggedIn) {
      await this.fail(data.submissionId, 'Codeforces 登录失败。请检查账号密码是否正确。');
      return { status: 'REMOTE_ERROR' };
    }

    await this.prisma.submission.update({
      where: { id: data.submissionId },
      data: { status: 'SUBMITTING' },
    });

    // 2. Submit code
    const submitResult = await this.cf.submit(
      data.contestId, data.problemIndex, data.language, data.sourceCode,
    );

    if (submitResult.error && !submitResult.submissionId) {
      await this.fail(data.submissionId, 'CF 提交失败: ' + submitResult.error);
      return { status: 'REMOTE_ERROR' };
    }

    if (submitResult.submissionId) {
      // Save submission ID immediately
      await this.prisma.remoteJudgeJob.upsert({
        where: { submissionId: data.submissionId },
        create: {
          submissionId: data.submissionId,
          platform: 'CODEFORCES',
          remoteProblemId: `${data.contestId}${data.problemIndex}`,
          remoteSubmissionId: String(submitResult.submissionId),
          accountId: 'Tishow__Liuche',
        },
        update: {
          remoteSubmissionId: String(submitResult.submissionId),
        },
      });

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'JUDGING' },
      });

      // 3. Poll for results
      for (let attempt = 0; attempt < 30; attempt++) {
        await this.sleep(2500);
        const subs: any[] = await this.cf.querySubmissions('Tishow__Liuche');

        const target = subs.find((s: any) =>
          s.id === submitResult.submissionId
        );

        if (target) {
          const verdict = this.cf.mapVerdict(target.verdict);
          const done = target.verdict && target.verdict !== 'TESTING';

          if (done) {
            // Save case
            await this.prisma.submissionCase.create({
              data: {
                submissionId: data.submissionId,
                caseIndex: 1,
                status: verdict,
                timeUsed: target.timeConsumedMillis || 0,
                memoryUsed: target.memoryConsumedBytes
                  ? Math.round(target.memoryConsumedBytes / 1024)
                  : 0,
              },
            });

            await this.prisma.submission.update({
              where: { id: data.submissionId },
              data: {
                status: verdict,
                score: verdict === 'ACCEPTED' ? 100 : 0,
                timeUsed: target.timeConsumedMillis || 0,
                memoryUsed: target.memoryConsumedBytes
                  ? Math.round(target.memoryConsumedBytes / 1024)
                  : 0,
                judgedAt: new Date(),
              },
            });

            await this.prisma.remoteJudgeJob.update({
              where: { submissionId: data.submissionId },
              data: { rawStatus: target.verdict, finishedAt: new Date(), queryCount: attempt + 1 },
            });

            this.logger.log(`[CFJudge] Done: ${verdict} (${target.timeConsumedMillis}ms)`);
            return { status: verdict };
          }
        }
      }

      // Timeout — still judging
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'JUDGING' },
      });
    } else {
      // No submission ID, try reconciliation
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'JUDGING' },
      });

      // Poll user.status to find recent matching submission
      for (let attempt = 0; attempt < 15; attempt++) {
        await this.sleep(2500);
        const subs = await this.cf.querySubmissions('Tishow__Liuche');
        const match: any = subs.find((s: any) =>
          s.problem?.contestId === data.contestId &&
          s.problem?.index === data.problemIndex &&
          s.verdict !== 'TESTING'
        );

        if (match) {
          const verdict = this.cf.mapVerdict(match.verdict);
          await this.prisma.remoteJudgeJob.upsert({
            where: { submissionId: data.submissionId },
            create: {
              submissionId: data.submissionId,
              platform: 'CODEFORCES',
              remoteProblemId: `${data.contestId}${data.problemIndex}`,
              remoteSubmissionId: String(match.id),
            },
            update: { remoteSubmissionId: String(match.id) },
          });

          await this.prisma.submissionCase.create({
            data: {
              submissionId: data.submissionId, caseIndex: 1,
              status: verdict,
              timeUsed: match.timeConsumedMillis || 0,
              memoryUsed: match.memoryConsumedBytes
                ? Math.round(match.memoryConsumedBytes / 1024) : 0,
            },
          });

          await this.prisma.submission.update({
            where: { id: data.submissionId },
            data: {
              status: verdict,
              score: verdict === 'ACCEPTED' ? 100 : 0,
              timeUsed: match.timeConsumedMillis || 0,
              memoryUsed: match.memoryConsumedBytes
                ? Math.round(match.memoryConsumedBytes / 1024) : 0,
              judgedAt: new Date(),
            },
          });

          this.logger.log(`[CFJudge] Reconciled: ${verdict}`);
          return { status: verdict };
        }
      }
    }

    return { status: 'JUDGING' };
  }

  private async fail(id: string, msg: string) {
    await this.prisma.submission.update({
      where: { id },
      data: { status: 'REMOTE_ERROR', compileMessage: msg, judgedAt: new Date() },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
