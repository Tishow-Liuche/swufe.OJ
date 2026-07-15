import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LuoguSubmitResult {
  submissionId: string;
  status: string;
  mode: 'LUOGU';
  luoguSubmitUrl: string;
  message: string;
}

export const LUOGU_LANGUAGE_LABELS: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  python: 'Python 3',
  java: 'Java',
};

@Injectable()
export class LuoguSubmissionService {
  private readonly log = new Logger(LuoguSubmissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTask(
    userId: string,
    problemId: string,
    language: string,
    sourceCode: string,
  ): Promise<LuoguSubmitResult> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        sourceInfo: true,
        versions: { where: { isCurrent: true } },
      },
    });

    if (!problem || problem.status !== 'PUBLISHED') {
      throw new NotFoundException('Problem not found or not published');
    }

    const remoteProblemId = problem.sourceInfo?.remoteProblemId;
    if (!remoteProblemId) {
      throw new NotFoundException('Problem has no remote Luogu problem ID configured');
    }

    const problemVersion = problem.versions[0];
    if (!problemVersion) {
      throw new NotFoundException('Problem version not found');
    }

    if (!LUOGU_LANGUAGE_LABELS[language]) {
      throw new NotFoundException(
        `Language "${language}" is not supported for Luogu submissions. ` +
        `Supported: ${Object.keys(LUOGU_LANGUAGE_LABELS).join(', ')}`,
      );
    }

    const submission = await this.prisma.submission.create({
      data: {
        problemId,
        problemVersionId: problemVersion.id,
        userId,
        language,
        sourceCode,
        status: 'QUEUING',
      },
    });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
    await this.prisma.remoteSubmissionTask.create({
      data: {
        submissionId: submission.id,
        userId,
        platformCode: 'LUOGU',
        externalAccountId: problem.sourceInfo?.id ?? '',
        remoteProblemId,
        language,
        sourceCode,
        status: 'PENDING',
        expiresAt,
        maximumAttempts: 1,
      },
    });

    await this.prisma.remoteJudgeJob.create({
      data: {
        submissionId: submission.id,
        platform: 'LUOGU',
        remoteProblemId,
        maxQueries: 120,
      },
    });

    const luoguSubmitUrl = `https://www.luogu.com.cn/problem/${encodeURIComponent(remoteProblemId)}#submit`;

    this.log.log(
      `Luogu task created sub=${submission.id} pid=${remoteProblemId} lang=${language} user=${userId}`,
    );

    return {
      submissionId: submission.id,
      status: 'QUEUING',
      mode: 'LUOGU',
      luoguSubmitUrl,
      message: [
        `Open ${luoguSubmitUrl}`,
        `Select language: ${LUOGU_LANGUAGE_LABELS[language]}`,
        `The helper script will submit and report the result back to OJ.`,
      ].join('\n'),
    };
  }
}
