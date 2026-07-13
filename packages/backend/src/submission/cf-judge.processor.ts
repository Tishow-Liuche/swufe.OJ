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
    const d = job.data;
    this.logger.log(`[CF] Judging #${d.submissionId}: CF ${d.contestId}${d.problemIndex}`);

    await this.prisma.submission.update({ where: { id: d.submissionId }, data: { status: 'QUEUING' } });

    // Step 1: Login to CF
    this.logger.log('[CF] Logging in...');
    const loginOk = await this.cf.login();
    if (!loginOk) {
      await this.fail(d.submissionId, 'CF 登录失败，请检查 .env 中 CF_HANDLE / CF_PASSWORD 是否正确');
      return { status: 'REMOTE_ERROR' };
    }

    await this.prisma.submission.update({ where: { id: d.submissionId }, data: { status: 'SUBMITTING' } });

    // Step 2: Submit code
    this.logger.log('[CF] Submitting code...');
    const submitResult = await this.cf.submit(d.contestId, d.problemIndex, d.language, d.sourceCode);

    if (submitResult.error || !submitResult.submissionId) {
      const errMsg = submitResult.error || 'CF 提交未返回 Submission ID';
      this.logger.error('[CF] Submit failed: ' + errMsg);
      await this.fail(d.submissionId, errMsg);
      return { status: 'REMOTE_ERROR' };
    }

    const sid = submitResult.submissionId;
    this.logger.log(`[CF] Submitted! SID: ${sid}`);

    // Save submission ID
    await this.prisma.remoteJudgeJob.upsert({
      where: { submissionId: d.submissionId },
      create: {
        submissionId: d.submissionId,
        platform: 'CODEFORCES',
        remoteProblemId: `${d.contestId}${d.problemIndex}`,
        remoteSubmissionId: String(sid),
      },
      update: { remoteSubmissionId: String(sid) },
    });

    await this.prisma.submission.update({ where: { id: d.submissionId }, data: { status: 'JUDGING' } });

    // Step 3: Poll CF API for verdict
    this.logger.log(`[CF] Polling verdict for SID ${sid}...`);
    for (let i = 0; i < 40; i++) {
      await this.sleep(2500);
      try {
        const subs = await this.cf.queryResult('Tishow__Liuche');
        const match = subs.find((s: any) => s.id === sid);
        if (match && match.verdict && match.verdict !== 'TESTING') {
          const unified = this.cf.mapVerdict(match.verdict);
          const score = unified === 'ACCEPTED' ? 100 : 0;
          this.logger.log(`[CF] Verdict: ${unified} (${match.timeConsumedMillis}ms, ${Math.round((match.memoryConsumedBytes || 0) / 1024)}KB)`);

          await this.prisma.submissionCase.create({
            data: {
              submissionId: d.submissionId, caseIndex: 1, status: unified,
              timeUsed: match.timeConsumedMillis || 0,
              memoryUsed: match.memoryConsumedBytes ? Math.round(match.memoryConsumedBytes / 1024) : 0,
            },
          });

          await this.prisma.submission.update({
            where: { id: d.submissionId },
            data: {
              status: unified, score,
              timeUsed: match.timeConsumedMillis || 0,
              memoryUsed: match.memoryConsumedBytes ? Math.round(match.memoryConsumedBytes / 1024) : 0,
              judgedAt: new Date(),
            },
          });

          await this.prisma.remoteJudgeJob.update({
            where: { submissionId: d.submissionId },
            data: { rawStatus: match.verdict, finishedAt: new Date(), queryCount: i + 1 },
          });

          this.logger.log(`[CF] ✅ Done: ${unified} (${score}pts)`);
          return { status: unified, score, time: match.timeConsumedMillis, memory: match.memoryConsumedBytes };
        }
      } catch (e: any) { /* retry */ }
      if (i % 10 === 9) this.logger.log(`[CF] Still polling (${i + 1}/40)...`);
    }

    // Timeout — CF might still be judging
    this.logger.warn(`[CF] Poll timeout for SID ${sid}`);
    return { status: 'JUDGING' };
  }

  private async fail(id: string, msg: string) {
    await this.prisma.submission.update({
      where: { id }, data: { status: 'REMOTE_ERROR', compileMessage: msg, judgedAt: new Date() },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
