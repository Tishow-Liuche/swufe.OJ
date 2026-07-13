import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface RemoteJob {
  submissionId: string;
  problemId: string;
  remoteProblemId: string;
  language: string;
  sourceCode: string;
  platform: string;
}

const LUOGU_LANG: Record<string, string> = {
  cpp: 'cxx/14/gcc', c: 'c/99/gcc', python: 'python3/c', java: 'java/8',
};

const VERDICT_MAP: Record<string, string> = {
  'Accepted': 'ACCEPTED',
  'Wrong Answer': 'WRONG_ANSWER',
  'Time Limit Exceeded': 'TIME_LIMIT_EXCEEDED',
  'Memory Limit Exceeded': 'MEMORY_LIMIT_EXCEEDED',
  'Runtime Error': 'RUNTIME_ERROR',
  'Compile Error': 'COMPILE_ERROR',
  'Output Limit Exceeded': 'OUTPUT_LIMIT_EXCEEDED',
  'Presentation Error': 'PRESENTATION_ERROR',
  'System Error': 'SYSTEM_ERROR',
};

@Processor('remote-judge')
export class RemoteJudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(RemoteJudgeProcessor.name);
  private baseUrl = 'https://open-v1.lgapi.cn';
  private token: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    super();
    this.token = config.get('LUOGU_OPENAPP_TOKEN', '');
  }

  async process(job: Job<RemoteJob>) {
    const data = job.data;
    this.logger.log(`[Remote] Judging #${data.submissionId} → ${data.platform}/${data.remoteProblemId}`);

    // 检查 Token 是否配置
    if (!this.token) {
      await this.fail(data.submissionId, '洛谷 OpenApp Token 未配置。\n请在 .env 中设置 LUOGU_OPENAPP_TOKEN。\n申请地址：https://docs.lgapi.cn/open/');
      return { status: 'REMOTE_ERROR', reason: 'NO_TOKEN' };
    }

    try {
      // 设置提交中状态
      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'QUEUING' },
      });

      // 1. 提交代码到洛谷
      const lang = LUOGU_LANG[data.language] || 'cxx/14/gcc';
      const submitBody = JSON.stringify({
        pid: data.remoteProblemId,
        lang,
        o2: true,
        code: data.sourceCode,
        trackId: data.submissionId,
      });

      const auth = Buffer.from(this.token).toString('base64');
      this.logger.log(`[Remote] Submitting to Luogu: ${data.remoteProblemId} lang=${lang}`);

      const submitResp = await fetch(`${this.baseUrl}/judge/problem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'swufe-oj/1.0',
        },
        body: submitBody,
      });

      if (!submitResp.ok) {
        const err = await submitResp.text();
        throw new Error(`Luogu submit failed: ${submitResp.status} ${err.substring(0, 200)}`);
      }

      const { requestId } = await submitResp.json();
      this.logger.log(`[Remote] Submitted! requestId=${requestId}`);

      await this.prisma.submission.update({
        where: { id: data.submissionId },
        data: { status: 'JUDGING' },
      });

      // 保存 remoteJudgeJob
      await this.prisma.remoteJudgeJob.upsert({
        where: { submissionId: data.submissionId },
        create: { submissionId: data.submissionId, platform: data.platform, remoteProblemId: data.remoteProblemId, remoteSubmissionId: requestId },
        update: { remoteSubmissionId: requestId },
      });

      // 2. 轮询结果（最多 60 次 × 2s = 120s）
      for (let i = 0; i < 60; i++) {
        await this.sleep(2000);
        try {
          const pollResp = await fetch(`${this.baseUrl}/judge/result/${requestId}`, {
            headers: { 'Accept': 'application/json', 'Authorization': `Basic ${auth}`, 'User-Agent': 'swufe-oj/1.0' },
          });

          if (pollResp.status === 404) {
            await this.prisma.remoteJudgeJob.update({
              where: { submissionId: data.submissionId },
              data: { queryCount: i + 1, lastQueryAt: new Date(), rawStatus: 'PENDING' },
            });
            continue;
          }

          if (!pollResp.ok) continue;

          const judgeResult = await pollResp.json();

          if (judgeResult.status === 'COMPLETED' && judgeResult.result) {
            const r = judgeResult.result;
            const verdict = VERDICT_MAP[r.verdict] || 'SYSTEM_ERROR';
            const score = r.score !== undefined ? r.score : (verdict === 'ACCEPTED' ? 100 : 0);
            const time = r.time || 0;
            const memory = r.memory || 0;
            const compileMsg = r.compile?.success === false ? r.compile.message : undefined;

            // 保存 SubmissionCase
            if (r.subtasks) {
              let caseIndex = 0;
              for (const st of r.subtasks) {
                for (const tc of (st.testCases || [])) {
                  caseIndex++;
                  const tcVerdict = VERDICT_MAP[tc.verdict] || tc.verdict || verdict;
                  await this.prisma.submissionCase.create({
                    data: {
                      submissionId: data.submissionId,
                      caseIndex,
                      status: tcVerdict,
                      timeUsed: tc.time || 0,
                      memoryUsed: tc.memory || 0,
                    },
                  });
                }
              }
            } else {
              // 没有详细测试点，创建汇总记录
              await this.prisma.submissionCase.create({
                data: { submissionId: data.submissionId, caseIndex: 1, status: verdict, timeUsed: time, memoryUsed: memory },
              });
            }

            // 更新最终结果
            await this.prisma.submission.update({
              where: { id: data.submissionId },
              data: { status: verdict, score, timeUsed: time, memoryUsed: memory, compileMessage: compileMsg || null, judgedAt: new Date() },
            });

            await this.prisma.remoteJudgeJob.update({
              where: { submissionId: data.submissionId },
              data: { rawStatus: verdict, finishedAt: new Date(), queryCount: i + 1, lastQueryAt: new Date() },
            });

            this.logger.log(`[Remote] Done #${data.submissionId}: ${verdict} (${score}pts, ${time}ms)`);
            return { status: verdict, score, time, memory };
          }

          if (judgeResult.status === 'FAILED') {
            throw new Error('Luogu judge failed: ' + JSON.stringify(judgeResult).substring(0, 200));
          }
        } catch (pollErr: any) {
          this.logger.warn(`[Remote] Poll error: ${pollErr.message}`);
        }
      }

      // 超时
      throw new Error('评测超时（超过 120 秒未返回结果）');
    } catch (error: any) {
      this.logger.error(`[Remote] Error #${data.submissionId}: ${error.message}`);
      await this.fail(data.submissionId, error.message);
      throw error;
    }
  }

  private async fail(id: string, msg: string) {
    await this.prisma.submission.update({
      where: { id },
      data: { status: 'REMOTE_ERROR', compileMessage: msg, judgedAt: new Date() },
    });
    await this.prisma.remoteJudgeJob.update({
      where: { submissionId: id },
      data: { errorMessage: msg.substring(0, 500), finishedAt: new Date() },
    }).catch(() => {});
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
