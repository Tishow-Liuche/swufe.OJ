import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<JudgeJob>) {
    const data = job.data;

    await this.prisma.submission.update({
      where: { id: data.submissionId },
      data: { status: 'COMPILING' },
    });

    // ============ MVP 阶段：模拟评测 ============
    // TODO: 替换为 go-judge HTTP API 调用
    // 当前返回模拟结果用于验证流程

    const mockVerdict = this.mockJudge(data.sourceCode);
    const status = mockVerdict.status;
    const timeUsed = mockVerdict.timeMs;
    const memoryUsed = mockVerdict.memoryKb;

    // Create test case results
    const caseCount = 5;
    const cases = Array.from({ length: caseCount }, (_, i) => ({
      caseIndex: i + 1,
      status: status === 'ACCEPTED' ? 'ACCEPTED' : status,
      timeUsed: timeUsed,
      memoryUsed: memoryUsed,
    }));

    await this.prisma.submissionCase.createMany({
      data: cases.map((c) => ({
        submissionId: data.submissionId,
        ...c,
      })),
    });

    // Update submission result
    await this.prisma.submission.update({
      where: { id: data.submissionId },
      data: {
        status,
        score: status === 'ACCEPTED' ? 100 : 0,
        timeUsed,
        memoryUsed,
        judgedAt: new Date(),
      },
    });

    // Update judge task
    await this.prisma.judgeTask.update({
      where: { submissionId: data.submissionId },
      data: { finishedAt: new Date() },
    });

    return { status, timeUsed, memoryUsed };
  }

  /** 临时模拟评测结果 —— 后续替换为 go-judge */
  private mockJudge(code: string): { status: string; timeMs: number; memoryKb: number } {
    if (!code || code.trim().length < 5) {
      return { status: 'COMPILE_ERROR', timeMs: 0, memoryKb: 0 };
    }
    return { status: 'ACCEPTED', timeMs: 42, memoryKb: 12288 };
  }
}
